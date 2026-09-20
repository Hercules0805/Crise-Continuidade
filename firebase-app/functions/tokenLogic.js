// ============================================================
// Lógica de negócio dos tokens externos (sem login).
//
// Recebe uma instância de Firestore (db) para permitir testes com o emulador
// ou um mock. Espelha o comportamento dos handlers de token do Apps Script
// (Code.gs), porém escrevendo no Firestore.
//
// Tipos de token (campo `processo` no doc do token guarda o prefixo):
//   _AREA_         -> avaliação de área inteira        (avaliar-area.html)
//   (sem prefixo)  -> avaliação de um processo         (avaliar.html)
//   _BIA_<proc>    -> mapeamento de dependências       (bia-dependencias.html)
//   _DRP_<proc>    -> mapeamento de componentes        (drp-componentes.html)
//   _LEV_<proc>    -> levantamento PCN                 (pcn-levantamento.html)
// ============================================================

const COLLECTION = {
  perguntas: 'perguntas',
  areas: 'areas',
  processos: 'processos',
  respostas: 'respostas_bia',
  tokens: 'tokens',
  dependencias: 'dependencias',
  componentes: 'componentes',
};

class TokenError extends Error {}

function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
function processoKey(area, processo) {
  return `${slug(area)}__${slug(processo)}`;
}

function calcularTier(score) {
  if (score >= 12) return 'Tier 1 (Crítico)';
  if (score >= 6) return 'Tier 2 (Essencial)';
  return 'Tier 3 (Suporte)';
}
function calcularRTO(tier) {
  if (tier === 'Tier 1 (Crítico)') return '< 4 horas';
  if (tier === 'Tier 2 (Essencial)') return '4h a 24 horas';
  return '> 24 horas';
}

function parseMaybeJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Carrega e valida o token. Lança TokenError com mensagem amigável.
async function _carregarToken(db, token, prefixoEsperado) {
  if (!token) throw new TokenError('Token não informado.');
  const snap = await db.collection(COLLECTION.tokens).doc(String(token)).get();
  if (!snap.exists) throw new TokenError('Token inválido.');
  const t = snap.data();

  const proc = String(t.processo || '');
  if (prefixoEsperado === '_AREA_') {
    if (proc !== '_AREA_') throw new TokenError('Token inválido.');
  } else if (prefixoEsperado === '') {
    // Avaliação de processo: sem prefixo especial
    if (proc.startsWith('_AREA_') || proc.startsWith('_BIA_') || proc.startsWith('_DRP_') || proc.startsWith('_LEV_')) {
      throw new TokenError('Token inválido.');
    }
  } else if (!proc.startsWith(prefixoEsperado)) {
    throw new TokenError('Token inválido.');
  }

  if (t.usado === true) throw new TokenError('Este link já foi utilizado.');
  if (t.expiraEm && new Date() > new Date(t.expiraEm)) throw new TokenError('Este link expirou.');
  return { ref: snap.ref, data: t };
}

async function _acharProcessoId(db, area, processo) {
  const chave = processoKey(area, processo);
  const byKey = await db.collection(COLLECTION.processos).doc(chave).get();
  if (byKey.exists) return chave;
  const q = await db
    .collection(COLLECTION.processos)
    .where('area', '==', area)
    .where('processo', '==', processo)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0].id;
  return null;
}

async function _perguntasAtivas(db) {
  const snap = await db.collection(COLLECTION.perguntas).get();
  return snap.docs
    .map((d) => d.data())
    .filter((p) => p.ativa !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

// ------------------------------------------------------------
// VALIDAÇÃO (leitura) — usada pelas páginas públicas ao abrir
// ------------------------------------------------------------
async function validarToken(db, token) {
  const { data } = await _carregarToken(db, token, '');
  const perguntas = (await _perguntasAtivas(db)).map((p) => ({
    categoria: p.categoria || '',
    pergunta: p.pergunta || '',
    descricao: p.descricao || '',
  }));
  return { area: data.area, processo: data.processo, perguntas };
}

async function validarTokenArea(db, token) {
  const { data } = await _carregarToken(db, token, '_AREA_');
  const area = data.area;
  const procSnap = await db.collection(COLLECTION.processos).where('area', '==', area).get();
  const processos = procSnap.docs.map((d) => {
    const p = d.data();
    return { area: p.area, processo: p.processo, descricao: p.descricao || '' };
  });
  const perguntas = (await _perguntasAtivas(db)).map((p) => ({
    categoria: p.categoria || '',
    pergunta: p.pergunta || '',
    descricao: p.descricao || '',
  }));
  return { area, processos, perguntas };
}

async function validarTokenBIA(db, token) {
  const { data } = await _carregarToken(db, token, '_BIA_');
  const area = data.area;
  const processo = String(data.processo).replace('_BIA_', '');
  const procId = await _acharProcessoId(db, area, processo);
  const procSnap = procId ? await db.collection(COLLECTION.processos).doc(procId).get() : null;
  const p = procSnap && procSnap.exists ? procSnap.data() : {};

  const depSnap = await db.collection(COLLECTION.dependencias).get();
  const catalogoPorCategoria = {};
  depSnap.docs.forEach((d) => {
    const c = d.data();
    const cat = (c.categoria || 'Outros').toLowerCase().replace(/[^a-záéíóúãõç]/g, '');
    const key = cat === 'fornecedor' ? 'fornecedores' : cat === 'pessoa' ? 'pessoas' : cat === 'sistema' ? 'sistemas' : cat;
    if (!catalogoPorCategoria[key]) catalogoPorCategoria[key] = [];
    catalogoPorCategoria[key].push(c.nome);
  });

  return {
    area,
    processo,
    dependencias: p.dependencia || '',
    catalogo: catalogoPorCategoria,
    descricao: p.descricao || '',
    rto: p.rto || '',
    rpo: p.rpo || '',
    mtd: p.mtd || '',
  };
}

async function validarTokenDRP(db, token) {
  const { data } = await _carregarToken(db, token, '_DRP_');
  const area = data.area;
  const processo = String(data.processo).replace('_DRP_', '');
  const compSnap = await db.collection(COLLECTION.componentes).get();
  const catalogoPorTipo = {};
  compSnap.docs.forEach((d) => {
    const c = d.data();
    const tipo = c.tipo || 'Outros';
    if (!catalogoPorTipo[tipo]) catalogoPorTipo[tipo] = [];
    catalogoPorTipo[tipo].push(c.nome);
  });
  return { area, processo, catalogo: catalogoPorTipo };
}

async function validarTokenLevantamento(db, token) {
  const { data } = await _carregarToken(db, token, '_LEV_');
  const area = data.area;
  const processo = String(data.processo).replace('_LEV_', '');
  const areasSnap = await db.collection(COLLECTION.areas).where('nome', '==', area).limit(1).get();
  const responsavel = areasSnap.empty ? '' : (areasSnap.docs[0].data().responsavel || '');
  return { area, processo, responsavel };
}

// Config de respostas (cores/labels) para as páginas públicas de avaliação.
// Leitura pública inofensiva (só rótulos/cores do questionário).
async function getConfigRespostas(db) {
  const snap = await db.collection('config_respostas').get();
  const docs = snap.docs.map((d) => d.data()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const config = {};
  docs.forEach((d) => {
    const cat = d.categoria;
    if (!config[cat]) config[cat] = [];
    config[cat].push({ valor: String(d.valor), label: d.label, cor: d.cor, background: d.background });
  });
  return config;
}

// ------------------------------------------------------------
// GRAVAÇÃO (escrita) — marca o token como usado ao final
// ------------------------------------------------------------
async function _atualizarTierProcesso(db, area, processo, tier, rto) {
  const procId = await _acharProcessoId(db, area, processo);
  if (procId) {
    await db.collection(COLLECTION.processos).doc(procId).set({ tier, rto }, { merge: true });
  }
}

async function _gravarResposta(db, { area, processo, scores, respondente, cargo }) {
  const perguntas = await _perguntasAtivas(db);
  const scoreMap = {};
  let score = 0;
  perguntas.forEach((perg) => {
    const v = Number(scores?.[perg.pergunta]) || 0;
    scoreMap[perg.pergunta] = v;
    score += v;
  });
  const tier = calcularTier(score);
  const rto = calcularRTO(tier);
  await db.collection(COLLECTION.respostas).add({
    timestamp: new Date().toISOString(),
    respondente: respondente || '',
    cargo: cargo || '',
    area,
    processo,
    scores: scoreMap,
    score,
    tier,
  });
  await _atualizarTierProcesso(db, area, processo, tier, rto);
  return { score, tier };
}

async function salvarRespostasToken(db, data) {
  const { ref, data: t } = await _carregarToken(db, data.token, '');
  const scores = parseMaybeJson(data.scores, {});
  await _gravarResposta(db, {
    area: t.area,
    processo: t.processo,
    scores,
    respondente: data.nome || data.token,
    cargo: data.cargo,
  });
  await ref.set({ usado: true }, { merge: true });
  return { success: true };
}

async function salvarRespostasArea(db, data) {
  const { ref, data: t } = await _carregarToken(db, data.token, '_AREA_');
  const respostas = parseMaybeJson(data.respostas, []);

  // A area vem SEMPRE do token, nunca do corpo da requisicao. Sem isso, um link
  // legitimo de uma area consegue gravar respostas -- e, por tabela, reescrever
  // o tier e o RTO -- de processos de qualquer outra area da empresa.
  const area = t.area;

  // O processo tambem e conferido: so e aceito se pertencer a area do token,
  // que e exatamente o conjunto que validarTokenArea entregou para a pagina.
  const procSnap = await db.collection(COLLECTION.processos).where('area', '==', area).get();
  const processosDaArea = new Set(procSnap.docs.map((d) => slug(d.data().processo)));

  let total = 0;
  const ignorados = [];
  for (const resp of respostas) {
    const processo = String((resp && resp.processo) || '').trim();
    if (!processo || !processosDaArea.has(slug(processo))) {
      ignorados.push(processo);
      continue;
    }
    await _gravarResposta(db, {
      area,
      processo,
      scores: (resp && resp.scores) || {},
      respondente: data.nome || '',
      cargo: data.cargo || '',
    });
    total += 1;
  }

  if (ignorados.length) {
    console.warn('salvarRespostasArea: processos fora da area do token, ignorados', { area, ignorados });
  }
  // So queima o token se alguma resposta foi de fato gravada, para que um envio
  // integralmente recusado possa ser refeito pelo gestor.
  if (total > 0) await ref.set({ usado: true }, { merge: true });
  return { success: true, total, ignorados: ignorados.length };
}

async function salvarDependenciasBIA(db, data) {
  const { ref, data: t } = await _carregarToken(db, data.token, '_BIA_');
  const area = t.area;
  const processo = String(t.processo).replace('_BIA_', '');

  const grupos = {
    Fornecedores: parseMaybeJson(data.fornecedores, []),
    Infraestrutura: parseMaybeJson(data.infraestrutura, []),
    Pessoas: parseMaybeJson(data.pessoas, []),
    Sistemas: parseMaybeJson(data.sistemas, []),
    'Processos Internos': parseMaybeJson(data.processos, []),
  };
  const todasDeps = [...new Set(Object.values(grupos).flat())];

  // Criar no catálogo as dependências que ainda não existem (por nome).
  const depSnap = await db.collection(COLLECTION.dependencias).get();
  const existentes = new Set(depSnap.docs.map((d) => String(d.data().nome || '').toLowerCase()));
  for (const [categoria, nomes] of Object.entries(grupos)) {
    for (const nome of nomes) {
      if (!existentes.has(String(nome).toLowerCase())) {
        await db.collection(COLLECTION.dependencias).add({
          categoria, nome, detalhes: '', setor: '', empresa: '', telefone: '', email: '', endereco: '',
        });
        existentes.add(String(nome).toLowerCase());
      }
    }
  }

  // Atualizar o processo (só campos presentes).
  const procId = await _acharProcessoId(db, area, processo);
  if (procId) {
    const patch = {};
    if (todasDeps.length) patch.dependencia = todasDeps.join(', ');
    if (data.impacto) patch.descricao = data.impacto;
    if (data.rto) patch.rto = data.rto;
    if (data.rpo) patch.rpo = data.rpo;
    if (data.mtd) patch.mtd = data.mtd;
    if (Object.keys(patch).length) {
      await db.collection(COLLECTION.processos).doc(procId).set(patch, { merge: true });
    }
  }

  await ref.set({ usado: true }, { merge: true });
  return { success: true, area, processo, observacoes: data.observacoes || '' };
}

async function salvarComponentesDRP(db, data) {
  const { ref, data: t } = await _carregarToken(db, data.token, '_DRP_');
  const area = t.area;
  const processo = String(t.processo).replace('_DRP_', '');
  const componentes = parseMaybeJson(data.componentes, []);

  const procId = await _acharProcessoId(db, area, processo);
  if (procId) {
    await db.collection(COLLECTION.processos).doc(procId).set({ drpComponentes: componentes }, { merge: true });
  }
  await ref.set({ usado: true }, { merge: true });
  return { success: true, area, processo };
}

async function salvarLevantamentoPCN(db, data) {
  const { ref, data: t } = await _carregarToken(db, data.token, '_LEV_');
  const area = t.area;
  const processo = String(t.processo).replace('_LEV_', '');

  const levantamento = { data: new Date().toISOString() };
  const campos = [
    'gestor', 'substituto', 'escopo', 'entrega', 'ativacao', 'ativacaoOutro', 'semSistema', 'contingencia',
    'controlesManuais', 'docsContingencia', 'funcoes', 'substitutos', 'docExecucao', 'sistemas', 'bancos',
    'integracoes', 'infra', 'infraOutro', 'fornecedores', 'comunicacao', 'modeloComunicacao', 'recuperacao',
    'reconciliacao', 'reconciliacaoDesc', 'posRecuperacao', 'docs', 'docsLocal',
  ];
  campos.forEach((c) => { levantamento[c] = data[c] !== undefined ? data[c] : ''; });

  const procId = await _acharProcessoId(db, area, processo);
  if (procId) {
    await db.collection(COLLECTION.processos).doc(procId).set(
      { levantamentoPCN: JSON.stringify(levantamento) },
      { merge: true }
    );
  }
  await ref.set({ usado: true }, { merge: true });
  return { success: true, area, processo, gestor: data.gestor || '' };
}

// Mapa de ações públicas -> handler(db, params/data)
const READ_ACTIONS = {
  validarToken,
  validarTokenArea,
  validarTokenBIA,
  validarTokenDRP,
  validarTokenLevantamento,
  getConfigRespostas,
};

const WRITE_ACTIONS = {
  salvarRespostasToken,
  salvarRespostasArea,
  salvarDependenciasBIA,
  salvarComponentesDRP,
  salvarLevantamentoPCN,
};

module.exports = {
  TokenError,
  COLLECTION,
  slug,
  processoKey,
  calcularTier,
  calcularRTO,
  parseMaybeJson,
  READ_ACTIONS,
  WRITE_ACTIONS,
  // exportados para teste
  _carregarToken,
  _acharProcessoId,
};
