/**
 * Configuração compartilhada da migração Sheets -> Firestore.
 *
 * Mapeia as abas da planilha (fonte de verdade atual, ver bia-app/Code.gs)
 * para as coleções do Firestore, e descreve como cada linha vira um documento.
 *
 * Variáveis de ambiente (arquivo .env nesta pasta):
 *   SPREADSHEET_ID          - ID da planilha Google Sheets
 *   GOOGLE_CREDENTIALS_PATH - caminho do JSON da service account (Sheets + Firestore)
 *   FIREBASE_PROJECT_ID     - id do projeto Firebase (padrão: bia-forte-2025)
 *   APPS_SCRIPT_URL         - URL /exec do Apps Script (para backup de PCN)
 */

// Nomes das abas (idênticos aos de bia-app/Code.gs)
export const ABA = {
  PERGUNTAS: 'Perguntas',
  AREAS: 'Áreas',
  PROCESSOS: 'Processos',
  RESPOSTAS: 'Respostas BIA',
  TOKENS: 'Tokens',
  CONFIG_RESPOSTAS: 'Config Respostas',
  CONFIG_PERFIS: 'Config Perfis',
  DEPENDENCIAS: 'Dependências',
  COMPONENTES: 'Componentes',
} as const;

// Ordem dos campos da aba Processos (idêntica a _CAMPOS_PROCESSO em Code.gs).
export const CAMPOS_PROCESSO = [
  'area', 'processo', 'descricao', 'dependencia', 'rto', 'rpo', 'mtpd', 'biaHomologada', 'tier',
  'bcpStatus', 'descricaoFuncional', 'impactoIndisponibilidade', 'bcpObjetivo', 'bcpEscopo', 'bcpContatos', 'bcpRiscos', 'bcpPreventivas',
  'drpStatus', 'drpObjetivo', 'drpEscopo', 'drpProcedimentos', 'drpCriterios', 'drpComponentes',
  'mtd', 'workaround', 'impactoJanela', 'bcpPlanoBProvedores', 'bcpSlas', 'bcpGatilhos', 'bcpReconstituicao', 'bcpPapeisCrise', 'pcnSalvo', 'tierManual',
] as const;

// Campos da aba Processos que guardam JSON (array/objeto) na planilha.
export const CAMPOS_PROCESSO_JSON = new Set<string>([
  'impactoIndisponibilidade', 'bcpContatos', 'bcpRiscos', 'bcpPreventivas', 'drpComponentes', 'impactoJanela',
]);

// Coleções do Firestore
export const COLLECTION = {
  PERGUNTAS: 'perguntas',
  AREAS: 'areas',
  PROCESSOS: 'processos',
  RESPOSTAS: 'respostas_bia',
  TOKENS: 'tokens',
  CONFIG_RESPOSTAS: 'config_respostas',
  CONFIG_PERFIS: 'config_perfis',
  DEPENDENCIAS: 'dependencias',
  COMPONENTES: 'componentes',
} as const;

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v;
}

export function tryParseJson(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function tryParseJsonArray(value: unknown): unknown[] {
  const parsed = tryParseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}
