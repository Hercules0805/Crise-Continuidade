import { ABA, CAMPOS_PROCESSO, CAMPOS_PROCESSO_JSON, tryParseJson, tryParseJsonArray } from './config';

/**
 * Documento pronto para o Firestore: id do documento + dados.
 * Campos JSON da planilha viram objetos/arrays nativos.
 */
export interface FsDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface CollectionExport {
  collection: string;
  docs: FsDoc[];
  /** total de linhas de dados lidas da aba (para conferência de contagem) */
  sourceRows: number;
}

function norm(s: unknown): string {
  return String(s ?? '').trim();
}

function slug(s: unknown): string {
  return norm(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/** chave estável para area+processo */
export function processoKey(area: unknown, processo: unknown): string {
  return `${slug(area)}__${slug(processo)}`;
}

/**
 * Converte um valor de data (string, Date ou serial de planilha) em ISO.
 * Retorna null quando vazio ou não parseável — evita "Invalid time value".
 */
export function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  // Serial de data do Google Sheets (número de dias desde 1899-12-30).
  if (typeof value === 'number' && isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ============================================================
// PERGUNTAS  (categoria, pergunta, descricao, ativa)
// ============================================================
export function transformPerguntas(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[1]);
  const docs: FsDoc[] = dataRows.map((r, i) => ({
    id: `perg-${String(i + 1).padStart(3, '0')}-${slug(r[1]) || i}`,
    data: {
      categoria: norm(r[0]),
      pergunta: norm(r[1]),
      descricao: norm(r[2]),
      ativa: r[3] !== false && r[3] !== 'false' && r[3] !== 'FALSE',
      ordem: i + 1,
    },
  }));
  return { collection: 'perguntas', docs, sourceRows: dataRows.length };
}

// ============================================================
// AREAS  (nome, responsavel, email, solucao)
// ============================================================
export function transformAreas(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0]);
  const docs: FsDoc[] = dataRows.map((r) => ({
    id: `area-${slug(r[0])}`,
    data: {
      nome: norm(r[0]),
      responsavel: norm(r[1]),
      email: norm(r[2]),
      solucao: norm(r[3]),
    },
  }));
  return { collection: 'areas', docs, sourceRows: dataRows.length };
}

// ============================================================
// PROCESSOS  (~33 campos, JSON -> nativo)
// ============================================================
export function transformProcessos(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0]);
  const docs: FsDoc[] = dataRows.map((r) => {
    const data: Record<string, unknown> = {};
    CAMPOS_PROCESSO.forEach((campo, idx) => {
      const raw = r[idx];
      if (CAMPOS_PROCESSO_JSON.has(campo)) {
        // impactoJanela pode ser string simples ou JSON; mantemos parse tolerante
        if (campo === 'bcpContatos' || campo === 'bcpRiscos' || campo === 'bcpPreventivas' || campo === 'drpComponentes') {
          data[campo] = tryParseJsonArray(raw);
        } else {
          const parsed = tryParseJson(raw);
          data[campo] = parsed !== null ? parsed : norm(raw);
        }
      } else {
        data[campo] = norm(raw);
      }
    });
    return { id: processoKey(r[0], r[1]), data };
  });
  return { collection: 'processos', docs, sourceRows: dataRows.length };
}

// ============================================================
// RESPOSTAS BIA
// Headers: Timestamp, Respondente, Cargo, Área, Processo, ...perguntas..., Score, Tier
// ============================================================
export function transformRespostas(rows: any[][]): CollectionExport {
  if (rows.length < 2) return { collection: 'respostas_bia', docs: [], sourceRows: 0 };
  const headers = rows[0];
  const areaCol = headers.indexOf('Área');
  const procCol = headers.indexOf('Processo');
  const scoreCol = headers.lastIndexOf('Score');
  const tierCol = headers.lastIndexOf('Tier');

  const dataRows = rows.slice(1).filter((r) => r[areaCol] && r[procCol]);
  const docs: FsDoc[] = dataRows.map((r, i) => {
    const scores: Record<string, number> = {};
    for (let c = areaCol + 2; c < scoreCol; c++) {
      const q = headers[c];
      if (q) scores[q] = Number(r[c]) || 0;
    }
    const timestampIso = toIsoOrNull(r[0]);
    return {
      id: `resp-${String(i + 1).padStart(5, '0')}-${processoKey(r[areaCol], r[procCol])}`,
      data: {
        timestamp: timestampIso,
        respondente: norm(r[1]),
        cargo: norm(r[2]),
        area: norm(r[areaCol]),
        processo: norm(r[procCol]),
        scores,
        score: Number(r[scoreCol]) || 0,
        tier: norm(r[tierCol]),
      },
    };
  });
  return { collection: 'respostas_bia', docs, sourceRows: dataRows.length };
}

// ============================================================
// TOKENS  (Token, Área, Processo, Email, Criado em, Expira em, Usado)
// ============================================================
export function transformTokens(rows: any[][]): CollectionExport {
  if (rows.length < 2) return { collection: 'tokens', docs: [], sourceRows: 0 };
  const dataRows = rows.slice(1).filter((r) => r[0]);
  const docs: FsDoc[] = dataRows.map((r) => {
    const criado = toIsoOrNull(r[4]);
    const expira = toIsoOrNull(r[5]);
    return {
      id: norm(r[0]), // o próprio token (UUID) é o docId
      data: {
        token: norm(r[0]),
        area: norm(r[1]),
        processo: norm(r[2]),
        email: norm(r[3]),
        criadoEm: criado,
        expiraEm: expira,
        usado: r[6] === true || r[6] === 'true' || r[6] === 'TRUE',
      },
    };
  });
  return { collection: 'tokens', docs, sourceRows: dataRows.length };
}

// ============================================================
// CONFIG RESPOSTAS  (categoria, valor, label, cor, background)
// ============================================================
export function transformConfigRespostas(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0] || r[1]);
  const docs: FsDoc[] = dataRows.map((r, i) => ({
    id: `cfgresp-${String(i + 1).padStart(3, '0')}-${slug(r[0])}-${slug(r[1])}`,
    data: {
      categoria: norm(r[0]),
      valor: norm(r[1]),
      label: norm(r[2]),
      cor: norm(r[3]),
      background: norm(r[4]),
      ordem: i + 1,
    },
  }));
  return { collection: 'config_respostas', docs, sourceRows: dataRows.length };
}

// ============================================================
// CONFIG PERFIS  (email, perfil)  -> docId = email
// ============================================================
export function transformConfigPerfis(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0]);
  const docs: FsDoc[] = dataRows.map((r) => ({
    id: norm(r[0]).toLowerCase(),
    data: {
      email: norm(r[0]).toLowerCase(),
      perfil: norm(r[1]).toLowerCase() || 'gestor',
    },
  }));
  return { collection: 'config_perfis', docs, sourceRows: dataRows.length };
}

// ============================================================
// DEPENDENCIAS  (categoria, nome, detalhes, setor, empresa, telefone, email, endereco)
// ============================================================
export function transformDependencias(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0] || r[1]);
  const docs: FsDoc[] = dataRows.map((r, i) => ({
    id: `dep-${String(i + 1).padStart(4, '0')}-${slug(r[1])}`,
    data: {
      categoria: norm(r[0]),
      nome: norm(r[1]),
      detalhes: norm(r[2]),
      setor: norm(r[3]),
      empresa: norm(r[4]),
      telefone: norm(r[5]),
      email: norm(r[6]),
      endereco: norm(r[7]),
    },
  }));
  return { collection: 'dependencias', docs, sourceRows: dataRows.length };
}

// ============================================================
// COMPONENTES  (tipo, nome, descricao, rto, rpo, estrategia, responsavel)
// ============================================================
export function transformComponentes(rows: any[][]): CollectionExport {
  const dataRows = rows.slice(1).filter((r) => r[0] || r[1]);
  const docs: FsDoc[] = dataRows.map((r, i) => ({
    id: `comp-${String(i + 1).padStart(4, '0')}-${slug(r[1])}`,
    data: {
      tipo: norm(r[0]),
      nome: norm(r[1]),
      descricao: norm(r[2]),
      rto: norm(r[3]),
      rpo: norm(r[4]),
      estrategia: norm(r[5]),
      responsavel: norm(r[6]),
    },
  }));
  return { collection: 'componentes', docs, sourceRows: dataRows.length };
}

export const TRANSFORMERS: Array<{ aba: string; fn: (rows: any[][]) => CollectionExport }> = [
  { aba: ABA.PERGUNTAS, fn: transformPerguntas },
  { aba: ABA.AREAS, fn: transformAreas },
  { aba: ABA.PROCESSOS, fn: transformProcessos },
  { aba: ABA.RESPOSTAS, fn: transformRespostas },
  { aba: ABA.TOKENS, fn: transformTokens },
  { aba: ABA.CONFIG_RESPOSTAS, fn: transformConfigRespostas },
  { aba: ABA.CONFIG_PERFIS, fn: transformConfigPerfis },
  { aba: ABA.DEPENDENCIAS, fn: transformDependencias },
  { aba: ABA.COMPONENTES, fn: transformComponentes },
];
