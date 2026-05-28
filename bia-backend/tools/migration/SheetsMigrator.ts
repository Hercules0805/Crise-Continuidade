import { google, sheets_v4 } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { DataSource, Repository } from 'typeorm';
import {
  AreaEntity,
  ProcessoEntity,
  PerguntaEntity,
  RespostaBiaEntity,
  TokenEntity,
  DependenciaEntity,
  ConfigRespostaEntity,
  ConfigPerfilEntity,
} from '../../src/infrastructure/database/entities';

// Tab names matching the Google Sheets structure
const TAB_PERGUNTAS = 'Perguntas';
const TAB_AREAS = 'Áreas';
const TAB_PROCESSOS = 'Processos';
const TAB_RESPOSTAS = 'Respostas BIA';
const TAB_TOKENS = 'Tokens';
const TAB_CONFIG_RESPOSTAS = 'Config Respostas';
const TAB_CONFIG_PERFIS = 'Config Perfis';
const TAB_DEPENDENCIAS = 'Dependências';

export interface MigrationError {
  row: number;
  error: string;
}

export interface MigrationReport {
  table: string;
  total: number;
  success: number;
  errors: MigrationError[];
}

export class SheetsMigrator {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private dataSource: DataSource;

  // Lookup maps for FK resolution
  private areaNameToId: Map<string, string> = new Map();
  private processoKeyToId: Map<string, string> = new Map();

  constructor(spreadsheetId: string, credentialsPath: string, dataSource: DataSource) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.dataSource = dataSource;
  }

  async migrate(): Promise<MigrationReport[]> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }

    const reports: MigrationReport[] = [];

    // Migrate in order (respecting FK dependencies):
    // 1. Areas (no dependencies)
    // 2. Processos (depends on Areas)
    // 3. Perguntas (no dependencies)
    // 4. Respostas BIA (depends on Processos)
    // 5. Tokens (depends on Areas, Processos)
    // 6. Dependencias (no dependencies)
    // 7. Config Respostas (no dependencies)
    // 8. Config Perfis (no dependencies)

    console.log('Starting migration...\n');

    reports.push(await this.migrateAreas());
    reports.push(await this.migrateProcessos());
    reports.push(await this.migratePerguntas());
    reports.push(await this.migrateRespostasBia());
    reports.push(await this.migrateTokens());
    reports.push(await this.migrateDependencias());
    reports.push(await this.migrateConfigRespostas());
    reports.push(await this.migrateConfigPerfis());

    console.log('\n=== Migration Complete ===');
    this.printReport(reports);

    return reports;
  }

  private async readTab(tabName: string): Promise<any[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: tabName,
    });

    return (response.data.values as any[][]) || [];
  }

  private emptyToNull(value: string | undefined | null): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return value;
  }

  private parseJson(value: string | undefined | null): any {
    if (!value || value === '') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private parseJsonArray(value: string | undefined | null): any[] {
    if (!value || value === '') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // ============================================================
  // AREAS
  // ============================================================
  private async migrateAreas(): Promise<MigrationReport> {
    console.log('Migrating Areas...');
    const report: MigrationReport = { table: 'areas', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(AreaEntity);

    const rows = await this.readTab(TAB_AREAS);
    const dataRows = rows.slice(1).filter(r => r[0]); // Skip header, filter empty
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2; // 1-indexed + header

      try {
        const nome = row[0]?.trim();
        if (!nome) continue;

        // Upsert by nome (natural key)
        let entity = await repo.findOne({ where: { nome } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.nome = nome;
        entity.responsavel = row[1]?.trim() || '';
        entity.email = row[2]?.trim() || '';
        entity.solucao = row[3]?.trim() || '';

        await repo.save(entity);
        this.areaNameToId.set(nome, entity.id);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Areas] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Areas: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // PROCESSOS
  // ============================================================
  private async migrateProcessos(): Promise<MigrationReport> {
    console.log('Migrating Processos...');
    const report: MigrationReport = { table: 'processos', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(ProcessoEntity);
    const areaRepo = this.dataSource.getRepository(AreaEntity);

    const rows = await this.readTab(TAB_PROCESSOS);
    const dataRows = rows.slice(1).filter(r => r[0]); // Skip header, filter empty
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const areaName = row[0]?.trim();
        const processoName = row[1]?.trim();

        if (!areaName || !processoName) {
          report.errors.push({ row: rowNumber, error: 'Missing area or processo name' });
          continue;
        }

        // Resolve area_id from area name
        let areaId = this.areaNameToId.get(areaName);
        if (!areaId) {
          const area = await areaRepo.findOne({ where: { nome: areaName } });
          if (!area) {
            report.errors.push({ row: rowNumber, error: `Area not found: ${areaName}` });
            continue;
          }
          areaId = area.id;
          this.areaNameToId.set(areaName, areaId);
        }

        // Upsert by area_id + processo (natural key)
        let entity = await repo.findOne({ where: { area_id: areaId, processo: processoName } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.area_id = areaId;
        entity.processo = processoName;
        entity.descricao = row[2]?.trim() || '';
        entity.dependencia = row[3]?.trim() || '';
        entity.rto = row[4]?.trim() || '';
        entity.rpo = row[5]?.trim() || '';
        entity.mtpd = row[6]?.trim() || '';
        entity.biaHomologada = row[7]?.trim() || '';
        entity.tier = row[8]?.trim() || '';
        entity.bcpStatus = row[9]?.trim() || '';
        entity.descricaoFuncional = row[10]?.trim() || '';
        entity.impactoIndisponibilidade = this.parseJson(row[11]) || {};
        entity.bcpObjetivo = row[12]?.trim() || '';
        entity.bcpEscopo = row[13]?.trim() || '';
        entity.bcpContatos = this.parseJsonArray(row[14]);
        entity.bcpRiscos = this.parseJsonArray(row[15]);
        entity.bcpPreventivas = this.parseJsonArray(row[16]);
        entity.drpStatus = row[17]?.trim() || '';
        entity.drpObjetivo = row[18]?.trim() || '';
        entity.drpEscopo = row[19]?.trim() || '';
        entity.drpProcedimentos = row[20]?.trim() || '';
        entity.drpCriterios = row[21]?.trim() || '';

        await repo.save(entity);
        // Store lookup key for respostas migration
        this.processoKeyToId.set(`${areaName}||${processoName}`, entity.id);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Processos] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Processos: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // PERGUNTAS
  // ============================================================
  private async migratePerguntas(): Promise<MigrationReport> {
    console.log('Migrating Perguntas...');
    const report: MigrationReport = { table: 'perguntas', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(PerguntaEntity);

    const rows = await this.readTab(TAB_PERGUNTAS);
    const dataRows = rows.slice(1).filter(r => r[1]); // Skip header, filter rows without pergunta
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const categoria = row[0]?.trim() || '';
        const pergunta = row[1]?.trim();

        if (!pergunta) {
          report.errors.push({ row: rowNumber, error: 'Missing pergunta text' });
          continue;
        }

        // Upsert by pergunta text (natural key)
        let entity = await repo.findOne({ where: { pergunta } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.categoria = categoria;
        entity.pergunta = pergunta;
        entity.descricao = row[2]?.trim() || '';
        entity.ativa = row[3] !== false && row[3] !== 'false' && row[3] !== 'FALSE';
        entity.ordem = i + 1; // Use row order as display order

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Perguntas] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Perguntas: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // RESPOSTAS BIA
  // ============================================================
  private async migrateRespostasBia(): Promise<MigrationReport> {
    console.log('Migrating Respostas BIA...');
    const report: MigrationReport = { table: 'respostas_bia', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(RespostaBiaEntity);
    const processoRepo = this.dataSource.getRepository(ProcessoEntity);

    const rows = await this.readTab(TAB_RESPOSTAS);
    if (rows.length < 2) {
      console.log('  Respostas BIA: No data found');
      return report;
    }

    const headers = rows[0];
    // Headers: Timestamp, Respondente, Cargo, Área, Processo, ...perguntas..., Score, Tier
    const areaCol = headers.indexOf('Área');
    const procCol = headers.indexOf('Processo');
    const scoreCol = headers.lastIndexOf('Score');
    const tierCol = headers.lastIndexOf('Tier');

    const dataRows = rows.slice(1).filter(r => r[areaCol] && r[procCol]);
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const areaName = row[areaCol]?.trim();
        const processoName = row[procCol]?.trim();

        if (!areaName || !processoName) {
          report.errors.push({ row: rowNumber, error: 'Missing area or processo' });
          continue;
        }

        // Resolve processo_id
        const key = `${areaName}||${processoName}`;
        let processoId = this.processoKeyToId.get(key);
        if (!processoId) {
          const areaId = this.areaNameToId.get(areaName);
          if (areaId) {
            const processo = await processoRepo.findOne({
              where: { area_id: areaId, processo: processoName },
            });
            if (processo) {
              processoId = processo.id;
              this.processoKeyToId.set(key, processoId);
            }
          }
        }

        if (!processoId) {
          report.errors.push({ row: rowNumber, error: `Processo not found: ${areaName} / ${processoName}` });
          continue;
        }

        // Build scores map from question columns
        const scores: Record<string, number> = {};
        for (let c = areaCol + 2; c < scoreCol; c++) {
          const questionName = headers[c];
          if (questionName) {
            scores[questionName] = Number(row[c]) || 0;
          }
        }

        const scoreTotal = Number(row[scoreCol]) || 0;
        const tier = row[tierCol]?.trim() || '';
        const respondente = row[1]?.trim() || '';
        const cargo = row[2]?.trim() || '';
        const timestamp = row[0];

        // For respostas, we use respondente + processo_id + timestamp as natural key
        // Since timestamps from sheets may not be unique, we use upsert logic
        // based on respondente + processo_id + score_total (approximate match)
        let entity = await repo.findOne({
          where: { processo_id: processoId, respondente, score_total: scoreTotal },
        });

        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.processo_id = processoId;
        entity.respondente = respondente;
        entity.cargo = cargo;
        entity.scores = scores;
        entity.score_total = scoreTotal;
        entity.tier = tier;

        // Preserve original timestamp if available
        if (timestamp && !entity.created_at) {
          entity.created_at = new Date(timestamp);
        }

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Respostas BIA] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Respostas BIA: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // TOKENS
  // ============================================================
  private async migrateTokens(): Promise<MigrationReport> {
    console.log('Migrating Tokens...');
    const report: MigrationReport = { table: 'tokens', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(TokenEntity);
    const areaRepo = this.dataSource.getRepository(AreaEntity);
    const processoRepo = this.dataSource.getRepository(ProcessoEntity);

    const rows = await this.readTab(TAB_TOKENS);
    if (rows.length < 2) {
      console.log('  Tokens: No data found');
      return report;
    }

    // Headers: Token, Área, Processo, Email, Criado em, Expira em, Usado
    const dataRows = rows.slice(1).filter(r => r[0]);
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const tokenValue = row[0]?.trim();
        const areaName = row[1]?.trim();
        const processoName = row[2]?.trim();
        const email = row[3]?.trim() || '';
        const createdAt = row[4];
        const expiresAt = row[5];
        const usado = row[6] === true || row[6] === 'true' || row[6] === 'TRUE';

        if (!tokenValue || !areaName) {
          report.errors.push({ row: rowNumber, error: 'Missing token or area' });
          continue;
        }

        // Resolve area_id
        let areaId = this.areaNameToId.get(areaName);
        if (!areaId) {
          const area = await areaRepo.findOne({ where: { nome: areaName } });
          if (!area) {
            report.errors.push({ row: rowNumber, error: `Area not found: ${areaName}` });
            continue;
          }
          areaId = area.id;
          this.areaNameToId.set(areaName, areaId);
        }

        // Determine tipo and resolve processo_id
        const isAreaToken = processoName === '_AREA_' || !processoName;
        let processoId: string | null = null;

        if (!isAreaToken) {
          const key = `${areaName}||${processoName}`;
          processoId = this.processoKeyToId.get(key) || null;
          if (!processoId) {
            const processo = await processoRepo.findOne({
              where: { area_id: areaId, processo: processoName },
            });
            if (processo) {
              processoId = processo.id;
              this.processoKeyToId.set(key, processoId);
            }
          }
        }

        // Upsert by token value (the token UUID is the natural key)
        // We use the original token value as the id
        let entity = await repo.findOne({ where: { id: tokenValue } });
        if (!entity) {
          entity = repo.create();
          entity.id = tokenValue; // Preserve original token UUID
        }

        entity.area_id = areaId;
        entity.processo_id = processoId;
        entity.email = email;
        entity.tipo = isAreaToken ? 'area' : 'processo';
        entity.usado = usado;
        entity.expires_at = new Date(expiresAt);

        if (createdAt && !entity.created_at) {
          entity.created_at = new Date(createdAt);
        }

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Tokens] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Tokens: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // DEPENDENCIAS
  // ============================================================
  private async migrateDependencias(): Promise<MigrationReport> {
    console.log('Migrating Dependências...');
    const report: MigrationReport = { table: 'dependencias', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(DependenciaEntity);

    const rows = await this.readTab(TAB_DEPENDENCIAS);
    if (rows.length < 2) {
      console.log('  Dependências: No data found');
      return report;
    }

    const dataRows = rows.slice(1).filter(r => r[0] || r[1]);
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const categoria = row[0]?.trim() || '';
        const nome = row[1]?.trim() || '';

        if (!nome) {
          report.errors.push({ row: rowNumber, error: 'Missing nome' });
          continue;
        }

        // Upsert by categoria + nome (natural key)
        let entity = await repo.findOne({ where: { categoria, nome } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.categoria = categoria;
        entity.nome = nome;
        entity.detalhes = row[2]?.trim() || '';
        entity.setor = row[3]?.trim() || '';
        entity.empresa = row[4]?.trim() || '';
        entity.telefone = row[5]?.trim() || '';
        entity.email = row[6]?.trim() || '';

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Dependências] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Dependências: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // CONFIG RESPOSTAS
  // ============================================================
  private async migrateConfigRespostas(): Promise<MigrationReport> {
    console.log('Migrating Config Respostas...');
    const report: MigrationReport = { table: 'config_respostas', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(ConfigRespostaEntity);

    const rows = await this.readTab(TAB_CONFIG_RESPOSTAS);
    if (rows.length < 2) {
      console.log('  Config Respostas: No data found');
      return report;
    }

    const dataRows = rows.slice(1).filter(r => r[0] || r[1]);
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const categoria = row[0]?.trim() || '';
        const valor = row[1]?.trim() || '';
        const label = row[2]?.trim() || '';

        if (!categoria || !valor) {
          report.errors.push({ row: rowNumber, error: 'Missing categoria or valor' });
          continue;
        }

        // Upsert by categoria + valor (natural key)
        let entity = await repo.findOne({ where: { categoria, valor } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.categoria = categoria;
        entity.valor = valor;
        entity.label = label;
        entity.cor = row[3]?.trim() || '';
        entity.background = row[4]?.trim() || '';

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Config Respostas] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Config Respostas: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // CONFIG PERFIS
  // ============================================================
  private async migrateConfigPerfis(): Promise<MigrationReport> {
    console.log('Migrating Config Perfis...');
    const report: MigrationReport = { table: 'config_perfis', total: 0, success: 0, errors: [] };
    const repo = this.dataSource.getRepository(ConfigPerfilEntity);

    const rows = await this.readTab(TAB_CONFIG_PERFIS);
    if (rows.length < 2) {
      console.log('  Config Perfis: No data found');
      return report;
    }

    const dataRows = rows.slice(1).filter(r => r[0]);
    report.total = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = i + 2;

      try {
        const email = row[0]?.trim();

        if (!email) {
          report.errors.push({ row: rowNumber, error: 'Missing email' });
          continue;
        }

        // Upsert by email (natural key - unique column)
        let entity = await repo.findOne({ where: { email } });
        if (!entity) {
          entity = repo.create({ id: uuidv4() });
        }

        entity.email = email;
        entity.nome = row[1]?.trim() || '';
        entity.area = row[2]?.trim() || '';
        entity.admin = row[3] === true || row[3] === 'true' || row[3] === 'TRUE' || row[3] === 'sim' || row[3] === 'SIM';

        await repo.save(entity);
        report.success++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, error: err.message });
        console.error(`  [Config Perfis] Row ${rowNumber}: ${err.message}`);
      }
    }

    console.log(`  Config Perfis: ${report.success}/${report.total} migrated`);
    return report;
  }

  // ============================================================
  // REPORT
  // ============================================================
  private printReport(reports: MigrationReport[]): void {
    console.log('\n┌─────────────────────┬───────┬─────────┬────────┐');
    console.log('│ Table               │ Total │ Success │ Errors │');
    console.log('├─────────────────────┼───────┼─────────┼────────┤');

    for (const report of reports) {
      const table = report.table.padEnd(19);
      const total = String(report.total).padStart(5);
      const success = String(report.success).padStart(7);
      const errors = String(report.errors.length).padStart(6);
      console.log(`│ ${table} │${total} │${success} │${errors} │`);
    }

    console.log('└─────────────────────┴───────┴─────────┴────────┘');

    const totalRecords = reports.reduce((sum, r) => sum + r.total, 0);
    const totalSuccess = reports.reduce((sum, r) => sum + r.success, 0);
    const totalErrors = reports.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`\nTotal: ${totalRecords} records, ${totalSuccess} successful, ${totalErrors} errors`);

    if (totalErrors > 0) {
      console.log('\n--- Error Details ---');
      for (const report of reports) {
        if (report.errors.length > 0) {
          console.log(`\n[${report.table}]`);
          for (const err of report.errors) {
            console.log(`  Row ${err.row}: ${err.error}`);
          }
        }
      }
    }
  }
}
