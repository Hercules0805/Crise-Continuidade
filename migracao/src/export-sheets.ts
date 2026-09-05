import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { env } from './config';
import { SheetsClient } from './sheets';
import { TRANSFORMERS, CollectionExport } from './transform';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OUT_DIR = path.resolve(__dirname, '../export');

async function main(): Promise<void> {
  const spreadsheetId = env('SPREADSHEET_ID');
  const credentialsPath = path.resolve(env('GOOGLE_CREDENTIALS_PATH'));

  console.log('=== Export Sheets -> JSON ===');
  console.log(`Planilha: ${spreadsheetId}`);
  console.log(`Credenciais: ${credentialsPath}`);
  console.log(`Saída: ${OUT_DIR}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new SheetsClient(spreadsheetId, credentialsPath);
  const manifest: Array<{ collection: string; sourceRows: number; docs: number }> = [];
  const results: Record<string, CollectionExport> = {};

  for (const t of TRANSFORMERS) {
    let rows: any[][] = [];
    try {
      rows = await client.readTab(t.aba);
    } catch (err: any) {
      console.warn(`  [${t.aba}] aba ausente ou ilegível: ${err.message}. Pulando.`);
      results[t.fn([]).collection] = { collection: t.fn([]).collection, docs: [], sourceRows: 0 };
      continue;
    }
    results[t.fn(rows).collection] = t.fn(rows);
  }

  // Enriquecimento: preencher config_perfis[*].area para gestores, casando o
  // e-mail do perfil com o e-mail do responsável da área. As Security Rules do
  // gestor dependem desse campo. Admins não recebem área.
  enrichConfigPerfisComArea(results);

  for (const result of Object.values(results)) {
    writeCollection(result);
    manifest.push({ collection: result.collection, sourceRows: result.sourceRows, docs: result.docs.length });
    const flag = result.sourceRows === result.docs.length ? 'OK' : 'CONFERIR';
    console.log(`  [${result.collection}]: ${result.docs.length} docs (linhas: ${result.sourceRows}) [${flag}]`);
  }

  fs.writeFileSync(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nManifest salvo em ${path.join(OUT_DIR, '_manifest.json')}`);
  console.log('Export concluído.');
}

function writeCollection(result: CollectionExport): void {
  const file = path.join(OUT_DIR, `${result.collection}.json`);
  fs.writeFileSync(file, JSON.stringify(result.docs, null, 2), 'utf8');
}

function enrichConfigPerfisComArea(results: Record<string, CollectionExport>): void {
  const perfis = results['config_perfis'];
  const areas = results['areas'];
  if (!perfis || !areas) return;

  // email do responsável -> nome da área
  const emailToArea = new Map<string, string>();
  for (const a of areas.docs) {
    const email = String((a.data as any).email || '').trim().toLowerCase();
    const nome = String((a.data as any).nome || '').trim();
    if (email && nome) emailToArea.set(email, nome);
  }

  let preenchidos = 0;
  for (const p of perfis.docs) {
    const d = p.data as any;
    if (d.perfil === 'admin') continue;
    if (d.area) continue;
    const area = emailToArea.get(String(d.email || '').trim().toLowerCase());
    if (area) {
      d.area = area;
      preenchidos++;
    }
  }

  // Criar doc de perfil para responsáveis de área que ainda não têm perfil,
  // garantindo que todo gestor tenha config_perfis.area (exigido pelas rules).
  const existentes = new Set(perfis.docs.map((p) => p.id));
  let criados = 0;
  for (const [email, area] of emailToArea.entries()) {
    if (existentes.has(email)) continue;
    perfis.docs.push({ id: email, data: { email, perfil: 'gestor', area } });
    existentes.add(email);
    criados++;
  }
  perfis.sourceRows += criados;

  if (preenchidos > 0) console.log(`  [config_perfis] área preenchida para ${preenchidos} perfil(is) existente(s).`);
  if (criados > 0) console.log(`  [config_perfis] ${criados} perfil(is) de gestor criado(s) a partir das áreas.`);
}

main().catch((err) => {
  console.error('Falha no export:', err.message);
  console.error(err.stack);
  process.exit(1);
});
