// ============================================================
// API CLIENT - Firestore (SDK no navegador)
//
// Substitui o acesso ao Google Apps Script/Sheets pela leitura/escrita direta
// no Firestore do projeto bia-forte-2025. Mantém EXATAMENTE a mesma interface
// pública (objeto API) que o app.js e as telas já consomem, de modo que o
// restante do front não precise mudar.
//
// Ações de dados  -> Firestore.
// Ações residuais (PCN/Drive, e-mail, Gemini, tokens externos) -> Apps Script
// via o cliente legado (api-legacy.js), mantido para essas rotas.
// ============================================================

// ------------------------------------------------------------
// Firestore
// ------------------------------------------------------------
if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
}
const _db = firebase.firestore();

// Dominio das contas que acessam o sistema. Usado na validacao do perfil.
const DOMINIO_CORPORATIVO = '@fortestecnologia.com.br';

const COLLECTION = {
  perguntas: 'perguntas',
  areas: 'areas',
  processos: 'processos',
  respostas: 'respostas_bia',
  tokens: 'tokens',
  configRespostas: 'config_respostas',
  regua: 'config_regua',
  configPerfis: 'config_perfis',
  dependencias: 'dependencias',
  riscos: 'riscos',
  indicadoresSeguranca: 'indicadores_seguranca',
  lancamentos: 'lancamentos_indicadores',
  criteriosFornecedor: 'criterios_fornecedor',
  avaliacoesFornecedor: 'avaliacoes_fornecedor',
  categoriasFornecedor: 'categorias_fornecedor',
  historicoRisco: 'historico_risco',
};

// ------------------------------------------------------------
// Cache simples (mesma semântica do cliente antigo)
// ------------------------------------------------------------
const _cache = {};

// ------------------------------------------------------------
// Helpers de domínio (espelham bia-app/Code.gs)
// ------------------------------------------------------------
// A regra de criticidade mora em criticidade.js (carregado antes deste arquivo
// em index.html). Nao reescreva os limiares aqui: era exatamente essa copia,
// multiplicada por ~20, que fazia telas diferentes rotularem o mesmo processo
// de tres jeitos.
const _calcularTier = (score) => Criticidade.tierPorScore(score);
const _calcularRTO = (tier) => Criticidade.rtoSugerido(tier);

function _norm(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// docId estável para processos (mesma regra do ETL em migracao/src/transform.ts)
function _slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
function _processoKey(area, processo) {
  return `${_slug(area)}__${_slug(processo)}`;
}

/** Consulta filtrada por um campo. Necessaria quando a regra e por documento. */
async function _getPorCampo(collection, campo, valor) {
  const snap = await _db.collection(collection).where(campo, '==', valor).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function _getAll(collection) {
  const snap = await _db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ------------------------------------------------------------
// Leitura das coleções -> mesmo shape que o front espera
// ------------------------------------------------------------
async function _lerPerguntas() {
  const docs = await _getAll(COLLECTION.perguntas);
  return docs
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map((d) => ({
      id: d.id,
      categoria: d.categoria || '',
      pergunta: d.pergunta || '',
      descricao: d.descricao || '',
      ativa: d.ativa !== false,
    }));
}

async function _lerAreas() {
  const docs = await _getAll(COLLECTION.areas);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    responsavel: d.responsavel || '',
    email: d.email || '',
    solucao: d.solucao || '',
  }));
}

// Resolve perfil (admin/gestor) e área do usuário.
// - perfil: doc config_perfis/{emailLower}; default 'gestor' se ausente.
// - área do gestor: área cujo campo email casa com o do usuário (mesma regra
//   do getPerfil antigo). Persiste o campo `area` em config_perfis para que as
//   Security Rules (que leem config_perfis.area) autorizem o gestor.
/**
 * Perfil de acesso da pessoa logada.
 *
 * DOIS CUIDADOS AQUI, e o segundo era um defeito de verdade:
 *
 *   1. Quem nao esta cadastrado cai no MENOR acesso, e perfil desconhecido
 *      tambem (Perfis.normalizar). Um erro de digitacao no console do Firebase
 *      nao pode promover ninguem.
 *
 *   2. A resolucao de area pelo e-mail responsavel gravava
 *      `{ perfil: 'gestor', area }` de volta no documento. Com dois perfis isso
 *      passava; com tres, uma pessoa de outro perfil que tambem fosse
 *      responsavel por uma area seria REBAIXADA a gestor em silencio, no
 *      primeiro login. Agora essa gravacao so acontece para quem ja e gestor, e
 *      ela nunca escreve o campo perfil.
 */
async function _lerPerfil(email) {
  const emailLower = String(email || '').trim().toLowerCase();
  if (!emailLower) return { perfil: Perfis.PERFIL_PADRAO, area: null };

  const perfilSnap = await _db.collection(COLLECTION.configPerfis).doc(emailLower).get();
  const perfilData = perfilSnap.exists ? perfilSnap.data() : null;
  const perfil = Perfis.normalizar(perfilData && perfilData.perfil);

  // Somente o perfil de gestor esta amarrado a uma area.
  if (!Perfis.exigeArea(perfil)) return { perfil, area: null };

  let area = perfilData && perfilData.area ? String(perfilData.area).trim() : null;
  if (!area) {
    const areas = await _getAll(COLLECTION.areas);
    const match = areas.find((a) => String(a.email || '').trim().toLowerCase() === emailLower);
    if (match) area = String(match.nome).trim();

    // Persistir a area resolvida (as rules do gestor dependem dela). NUNCA
    // gravar `perfil` junto: ver cuidado 2 acima.
    if (area) {
      try {
        await _db.collection(COLLECTION.configPerfis).doc(emailLower).set(
          { email: emailLower, area },
          { merge: true }
        );
      } catch (e) {
        // Sem permissao de escrita (rules) nao e fatal para a leitura do perfil.
        console.warn('Não foi possível persistir área do perfil:', e.message);
      }
    }
  }

  return { perfil, area: area || null };
}

// ------------------------------------------------------------
// Perfis de acesso (tela de Administracao)
// ------------------------------------------------------------

async function _lerPerfis() {
  const docs = await _getAll(COLLECTION.configPerfis);
  return docs.map((d) => ({
    id: d.id,
    email: String(d.email || d.id || '').toLowerCase(),
    perfil: Perfis.normalizar(d.perfil),
    perfilGravado: String(d.perfil || ''),
    area: d.area || '',
    atualizadoEm: d.atualizadoEm || '',
    atualizadoPor: d.atualizadoPor || '',
  })).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Cria ou altera o perfil de uma pessoa.
 *
 * O documento tem o e-mail como id, em minusculas: e assim que as rules acham
 * o perfil de quem esta logado. Gravar com outra grafia faria a pessoa entrar
 * como gestor sem ninguem entender por que.
 */
async function _salvarPerfilAcesso(p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail.');
  if (!email.endsWith(DOMINIO_CORPORATIVO)) {
    throw new Error(`O e-mail tem que ser do domínio ${DOMINIO_CORPORATIVO}.`);
  }
  if (!Perfis.conhecido(p.perfil)) throw new Error('Perfil inválido.');

  const perfil = Perfis.normalizar(p.perfil);
  const precisaArea = Perfis.exigeArea(perfil);
  const area = precisaArea ? String(p.area || '').trim() : '';
  if (precisaArea && !area) throw new Error('Gestor precisa de uma área.');

  const dados = {
    email,
    perfil,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  };

  // Perfil que nao usa area tem o campo REMOVIDO, nao gravado em branco.
  // Gravar `area: ''` fazia a pessoa valer como gestor da "area vazia" — e os
  // riscos corporativos nascem com area vazia. A regra do banco tambem foi
  // corrigida; as duas guardas existem de proposito.
  dados.area = precisaArea ? area : firebase.firestore.FieldValue.delete();

  await _db.collection(COLLECTION.configPerfis).doc(email).set(dados, { merge: true });
  return { success: true, id: email };
}

async function _lerConfigRespostas() {
  const docs = await _getAll(COLLECTION.configRespostas);
  docs.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const config = {};
  docs.forEach((d) => {
    const cat = d.categoria;
    if (!config[cat]) config[cat] = [];
    config[cat].push({
      // rowIndex mantido para compatibilidade com o front (que usa como chave de edição)
      rowIndex: d.id,
      id: d.id,
      valor: String(d.valor),
      label: d.label,
      cor: d.cor,
      background: d.background,
    });
  });
  return config;
}

async function _lerDependencias() {
  const docs = await _getAll(COLLECTION.dependencias);
  return docs.map((d) => ({
    id: d.id,
    categoria: d.categoria || '',
    nome: d.nome || '',
    detalhes: d.detalhes || '',
    setor: d.setor || '',
    empresa: d.empresa || '',
    telefone: d.telefone || '',
    email: d.email || '',
    endereco: d.endereco || '',
    // So usado por Fornecedores: uma empresa pode ter N pessoas associadas.
    // Nas outras 4 categorias este campo nunca e escrito e chega vazio.
    pessoas: Array.isArray(d.pessoas) ? d.pessoas : [],
    // Idem: segmento de negocio (catalogo categorias_fornecedor) e o
    // responsavel interno pelo contrato.
    categoriaFornecedor: d.categoriaFornecedor || '',
    gestorContrato: d.gestorContrato || '',
    cnpj: d.cnpj || '',
    // Quais controles do catalogo de conformidade valem para este fornecedor.
    // null = nunca customizado (ausencia, nao "nenhum") — a tela comeca sem
    // nada marcado nesse caso. [] so acontece se alguem explicitamente
    // desmarcou tudo.
    criteriosAplicaveis: Array.isArray(d.criteriosAplicaveis) ? d.criteriosAplicaveis : null,
    // So usado por Fornecedores: e do tipo TIC? Ausencia do campo (fornecedor
    // antigo, de antes deste campo existir) conta como TIC -- marcado por
    // padrao, decisao do usuario.
    tic: d.tic !== false,
    // So usado pelas 7 categorias tecnicas (API, Banco de Dados,
    // Infraestrutura, Seguranca, Servidor, Sistema, Outros) -- vieram do
    // antigo catalogo de Componentes, fundido aqui. Nas outras categorias
    // (Fornecedores/Pessoas) esses campos nunca sao escritos.
    rto: d.rto || '',
    rpo: d.rpo || '',
    estrategia: d.estrategia || '',
    responsavel: d.responsavel || '',
  }));
}
// _lerComponentes/_salvarComponente/COLLECTION.componentes foram removidos: o
// catalogo de Componentes do Servico se fundiu em Dependencias (ver
// scripts/migrar-componentes-para-dependencias.js) -- Sistemas, Servidores,
// Bancos de Dados etc. agora sao categorias de Dependencia, nao uma colecao
// a parte. Os documentos antigos de "componentes" ficam intocados no
// Firestore, so pararam de ser lidos por este arquivo.

/**
 * Le os riscos respeitando o recorte por area.
 *
 * As Security Rules passaram a permitir ao gestor ler apenas os riscos da
 * propria area. Com regra por documento, uma consulta SEM filtro falha INTEIRA
 * — nao devolve menos. Por isso o filtro precisa ir na consulta, e nao depois,
 * no navegador, como era antes.
 *
 * Admin continua lendo tudo. Gestor sem area definida no perfil nao consegue
 * ler nada: em vez de devolver lista vazia (que a tela mostraria como "nenhum
 * risco cadastrado"), lanca — quem chama avisa que o acesso nao esta
 * configurado.
 */
async function _lerRiscos() {
  const ehAdmin = Perfis.ehAdmin(window.USER_PERFIL);
  const area = window.USER_AREA;
  if (!ehAdmin && !area) {
    // Mensagem diferente por perfil: o gestor precisa de area, o perfil de
    // fornecedores simplesmente nao tem acesso ao registro de riscos. Dizer
    // "procure a Seguranca da Informacao" para a propria Seguranca da
    // Informacao nao ajuda ninguem.
    throw new Error(Perfis.exigeArea(window.USER_PERFIL)
      ? 'Seu acesso ainda não está vinculado a uma área. Procure a Segurança da Informação.'
      : 'O seu perfil não tem acesso ao registro de riscos.');
  }
  const docs = ehAdmin
    ? await _getAll(COLLECTION.riscos)
    : await _getPorCampo(COLLECTION.riscos, 'area', area);
  return docs.map((d) => ({
    id: d.id,
    area: d.area || '',
    processoId: d.processoId || null,
    processo: d.processo || '',
    fornecedor: d.fornecedor || null,
    fornecedorNome: d.fornecedorNome || '',
    indicadorId: d.indicadorId || null,
    titulo: d.titulo || '',
    descricao: d.descricao || '',
    // Risco antigo tem so `categoria` (string, um valor so) -- cai num array
    // de 1 item, sem precisar de migracao de dado.
    categorias: Array.isArray(d.categorias) ? d.categorias : (d.categoria ? [d.categoria] : []),
    responsavel: d.responsavel || '',
    dataIdentificacao: d.dataIdentificacao || '',
    status: d.status || 'Identificado',
    origem: d.origem || 'Manual',
    probabilidade: d.probabilidade || '',
    impacto: d.impacto || '',
    impactoFinanceiro: d.impactoFinanceiro ?? null,
    impactoFinanceiroDescricao: d.impactoFinanceiroDescricao || '',
    score: d.score ?? null,
    prioridade: d.prioridade || '',
    estrategiaTratamento: d.estrategiaTratamento || '',
    estrategiaDescricao: d.estrategiaDescricao || '',
    planoAcao: d.planoAcao || [],
    impactoFinanceiroComponentes: d.impactoFinanceiroComponentes || [],
    kris: d.kris || [],
    dataUltimaReavaliacao: d.dataUltimaReavaliacao || null,
    proximaReavaliacao: d.proximaReavaliacao || null,
    historicoReavaliacao: d.historicoReavaliacao || '',
    dataEncerramento: d.dataEncerramento || null,
    justificativaEncerramento: d.justificativaEncerramento || '',
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
    criadoPor: d.criadoPor || '',
  }));
}

/**
 * Ate 20/09/2026 o historico mensal vivia numa lista DENTRO do documento do
 * indicador, e cada lancamento regravava a lista inteira a partir da copia em
 * memoria do navegador. Dois administradores lancando ao mesmo tempo — ou um
 * com a tela aberta ha uma hora — faziam os lancamentos do outro sumir, em
 * silencio, com os dois vendo "Resultado lancado".
 *
 * Agora cada mes e um documento proprio em lancamentos_indicadores. Esta funcao
 * monta o array `historico` no MESMO formato que as telas ja esperam, para que
 * o painel, a matriz e a grade continuem funcionando sem mudanca.
 */
async function _lerLancamentosPorIndicador() {
  const snap = await _db.collection(COLLECTION.lancamentos).get();
  const porIndicador = new Map();
  snap.docs.forEach((d) => {
    const l = d.data() || {};
    if (!l.indicadorId || !l.mes) return;
    if (!porIndicador.has(l.indicadorId)) porIndicador.set(l.indicadorId, []);
    porIndicador.get(l.indicadorId).push({
      mes: l.mes,
      desempenho: l.desempenho ?? null,
      importadoEm: l.lancadoEm || '',
      arquivo: l.arquivo || '',
      lancadoPor: l.lancadoPor || '',
    });
  });
  porIndicador.forEach((lista) => lista.sort((a, b) => String(a.mes).localeCompare(String(b.mes))));
  return porIndicador;
}

async function _lerIndicadoresSeguranca() {
  const [docs, lancamentos] = await Promise.all([
    _getAll(COLLECTION.indicadoresSeguranca),
    _lerLancamentosPorIndicador(),
  ]);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    pilar: d.pilar || '',
    tipo: d.tipo || '',
    responsavel: d.responsavel || '',
    metaMinima: d.metaMinima ?? null,
    sentidoMeta: d.sentidoMeta || 'maiorMelhor',
    ativo: d.ativo !== false,
    historico: lancamentos.get(d.id) || [],
    ultimoDesempenho: d.ultimoDesempenho ?? null,
    ultimoMes: d.ultimoMes || null,
    foraDaMeta: !!d.foraDaMeta,
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
    criadoPor: d.criadoPor || '',
  }));
}

// ------------------------------------------------------------
// Fornecedores: criterios e avaliacoes
//
// O fornecedor em si NAO tem cadastro proprio: ele e uma linha de
// /dependencias com categoria Fornecedores, que e onde o processo ja diz de
// quem depende e onde o risco ja aponta. Um segundo cadastro faria o mesmo
// fornecedor existir duas vezes.
// ------------------------------------------------------------

async function _lerCriteriosFornecedor() {
  const docs = await _getAll(COLLECTION.criteriosFornecedor);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    descricao: d.descricao || '',
    peso: Number(d.peso) > 0 ? Number(d.peso) : 1,
    ativo: d.ativo !== false,
    ordem: Number(d.ordem) || 0,
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
  })).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome));
}

const _CAMPOS_CRITERIO_FORNECEDOR = ['nome', 'descricao', 'peso', 'ativo', 'ordem'];

async function _salvarCriterioFornecedor(c) {
  const data = {};
  _CAMPOS_CRITERIO_FORNECEDOR.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(c, campo) && c[campo] !== undefined) data[campo] = c[campo];
  });
  data.atualizadoEm = new Date().toISOString();

  if (c.id) {
    await _db.collection(COLLECTION.criteriosFornecedor).doc(String(c.id)).set(data, { merge: true });
    return { success: true, id: c.id, criteriosVersao: await _subirVersaoCriterios() };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(COLLECTION.criteriosFornecedor).add(data);
  return { success: true, id: ref.id, criteriosVersao: await _subirVersaoCriterios() };
}

/**
 * Categorias de segmento do fornecedor (ex.: "Nuvem, Data Center e
 * Cibersegurança"). Classificacao de negocio, nao entra em calculo nenhum —
 * por isso, ao contrario dos criterios de avaliacao, nao tem versao.
 */
async function _lerCategoriasFornecedor() {
  const docs = await _getAll(COLLECTION.categoriasFornecedor);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    ativo: d.ativo !== false,
    ordem: Number(d.ordem) || 0,
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
  })).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome));
}

const _CAMPOS_CATEGORIA_FORNECEDOR = ['nome', 'ativo', 'ordem'];

async function _salvarCategoriaFornecedor(c) {
  const data = {};
  _CAMPOS_CATEGORIA_FORNECEDOR.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(c, campo) && c[campo] !== undefined) data[campo] = c[campo];
  });
  data.atualizadoEm = new Date().toISOString();

  if (c.id) {
    await _db.collection(COLLECTION.categoriasFornecedor).doc(String(c.id)).set(data, { merge: true });
    return { success: true, id: c.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(COLLECTION.categoriasFornecedor).add(data);
  return { success: true, id: ref.id };
}

// Versao da regua de criterios, no mesmo lugar da regua do BIA mas em outro
// documento. Cada avaliacao grava a versao que a pontuou — sem isso, mudar um
// peso muda as notas passadas e ninguem consegue explicar por que a nota do
// fornecedor mudou sozinha.
async function _versaoCriteriosAtual() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('fornecedor').get();
    return snap.exists ? Number((snap.data() || {}).versao) || 1 : 1;
  } catch {
    return 1;
  }
}

// Limiar de nota que abre risco automatico. Fica no mesmo documento da versao
// dos criterios porque e configuracao da mesma regua.
async function _lerConfigFornecedor() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('fornecedor').get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const lim = Number(d.limiarRisco);
    return {
      versao: Number(d.versao) || 1,
      limiarRisco: Number.isFinite(lim) && lim >= 0 && lim <= 100 ? lim : FornecedorScore.LIMIAR_RISCO_PADRAO,
    };
  } catch {
    return { versao: 1, limiarRisco: FornecedorScore.LIMIAR_RISCO_PADRAO };
  }
}

async function _salvarConfigFornecedor(d) {
  const lim = Number(d.limiarRisco);
  if (!Number.isFinite(lim) || lim < 0 || lim > 100) throw new Error('O limiar tem que ser um número de 0 a 100.');
  await _db.collection(COLLECTION.regua).doc('fornecedor').set({
    limiarRisco: lim,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return { success: true, limiarRisco: lim };
}

async function _subirVersaoCriterios() {
  const ref = _db.collection(COLLECTION.regua).doc('fornecedor');
  const snap = await ref.get();
  const versao = (snap.exists ? Number((snap.data() || {}).versao) || 1 : 1) + 1;
  await ref.set({
    versao,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return versao;
}

/**
 * Avaliacoes de fornecedor, a mais recente de cada um.
 *
 * A colecao e append-only: cada avaliacao e um documento novo. Aqui devolvemos
 * so a ultima por fornecedor, que e o que as telas usam; o historico continua
 * gravado para o grafico de evolucao do fornecedor.
 */
/**
 * Retrato diario do risco consolidado (Fase 5 -- O monitor), do mais antigo
 * para o mais novo -- ordem que o grafico espera.
 *
 * So admin le esta colecao (ver firestore.rules): um documento por dia
 * carrega a carga de TODAS as areas juntas, entao nao ha como recortar por
 * area no banco. Quem chamar isto sem ser admin recebe erro de permissao do
 * Firestore, nao uma lista vazia — ver monitor(), em app.js.
 */
async function _lerHistoricoRisco() {
  const LIMITE_DIAS = 120;
  const snap = await _db.collection(COLLECTION.historicoRisco)
    .orderBy('dia', 'desc')
    .limit(LIMITE_DIAS)
    .get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).reverse();
}

async function _lerAvaliacoesFornecedor() {
  const docs = await _getAll(COLLECTION.avaliacoesFornecedor);
  const ultima = new Map();
  docs.forEach((d) => {
    const fid = String(d.fornecedorId || '');
    if (!fid) return;
    const atual = ultima.get(fid);
    if (!atual || String(d.avaliadoEm || '') > String(atual.avaliadoEm || '')) {
      ultima.set(fid, {
        id: d.id,
        fornecedorId: fid,
        fornecedorNome: d.fornecedorNome || '',
        respostas: d.respostas || {},
        nota: d.nota === null || d.nota === undefined ? null : Number(d.nota),
        completa: !!d.completa,
        criteriosVersao: Number(d.criteriosVersao) || 1,
        // Retrato de quais controles valeram para ESTA avaliacao — nao o
        // catalogo inteiro, so o subconjunto marcado como aplicavel na hora.
        criteriosAplicaveis: Array.isArray(d.criteriosAplicaveis) ? d.criteriosAplicaveis : [],
        // Criticidade: aba separada da conformidade, na mesma avaliacao.
        respostasCriticidade: d.respostasCriticidade || {},
        scoreCriticidade: d.scoreCriticidade === null || d.scoreCriticidade === undefined ? null : Number(d.scoreCriticidade),
        completaCriticidade: !!d.completaCriticidade,
        observacao: d.observacao || '',
        avaliadoEm: d.avaliadoEm || '',
        avaliadoPor: d.avaliadoPor || '',
      });
    }
  });
  return [...ultima.values()];
}

/**
 * Grava uma avaliacao nova. Nunca sobrescreve a anterior.
 *
 * A nota vem calculada aqui, a partir dos criterios do banco — nao da tela.
 * A tela mostra o numero para a pessoa conferir, mas quem grava e esta funcao,
 * pela mesma razao que o score do risco e recalculado no servidor.
 *
 * Os controles considerados sao so os marcados como aplicaveis a este
 * fornecedor (`a.criteriosAplicaveis`, ids do catalogo) — nunca o catalogo
 * inteiro. Sem nenhum controle marcado nao existe avaliacao possivel, por
 * isso essa lista vazia e rejeitada aqui tambem, nao so na tela.
 */
async function _salvarAvaliacaoFornecedor(a) {
  const idsAplicaveis = (Array.isArray(a.criteriosAplicaveis) ? a.criteriosAplicaveis : []).map(String);
  if (!idsAplicaveis.length) throw new Error('Selecione ao menos um controle aplicável a este fornecedor.');

  // As duas leituras nao dependem uma da outra -- em paralelo, nao em serie.
  const [catalogo, criteriosVersao] = await Promise.all([_lerCriteriosFornecedor(), _versaoCriteriosAtual()]);
  const setAplicaveis = new Set(idsAplicaveis);
  const criteriosAplicaveis = catalogo.filter((c) => setAplicaveis.has(String(c.id)));
  const calc = FornecedorScore.calcular(criteriosAplicaveis, a.respostas || {});
  // Criticidade e uma aba da MESMA avaliacao, nao uma colecao separada. Assim
  // como a nota, o score vem calculado aqui — nunca aceito do que a tela
  // mandar — pela mesma razao que o score do risco e recalculado no servidor.
  const calcCrit = FornecedorCriticidade.calcular(a.respostasCriticidade || {});
  const agora = new Date().toISOString();

  const data = {
    fornecedorId: String(a.fornecedorId || ''),
    fornecedorNome: String(a.fornecedorNome || ''),
    respostas: a.respostas || {},
    criteriosAplicaveis: idsAplicaveis,
    nota: calc.nota,
    completa: calc.completa,
    criteriosVersao: criteriosVersao,
    respostasCriticidade: a.respostasCriticidade || {},
    scoreCriticidade: calcCrit.score,
    completaCriticidade: calcCrit.completa,
    observacao: String(a.observacao || ''),
    avaliadoEm: agora,
    avaliadoPor: (window.USER_EMAIL || '').toLowerCase(),
  };
  if (!data.fornecedorId) throw new Error('Avaliação sem fornecedor.');

  // As duas gravacoes nao dependem uma da outra (a segunda nao usa o id que a
  // primeira devolve) -- em paralelo, nao em serie. A segunda vira o padrao
  // deste fornecedor para a proxima avaliacao — a escolha de controles e uma
  // configuracao dele, nao algo que se refaz do zero toda vez.
  const [ref] = await Promise.all([
    _db.collection(COLLECTION.avaliacoesFornecedor).add(data),
    _db.collection(COLLECTION.dependencias).doc(data.fornecedorId).set({ criteriosAplicaveis: idsAplicaveis }, { merge: true }),
  ]);
  return {
    success: true, id: ref.id, dado: data,
    nota: calc.nota, completa: calc.completa, scoreCriticidade: calcCrit.score, completaCriticidade: calcCrit.completa,
  };
}

// Última resposta por area||processo -> score/tier/avaliado/respostas
async function _lerRespostasIndexadas() {
  const docs = await _getAll(COLLECTION.respostas);
  docs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const porChave = {};
  docs.forEach((r) => {
    const key = `${r.area}||${r.processo}`;
    if (!porChave[key]) {
      porChave[key] = {
        score: Number(r.score) || 0,
        tier: r.tier || '',
        avaliado: true,
        respostas: r.scores || {},
        timestamp: r.timestamp,
        respondente: r.respondente,
      };
    }
  });
  return porChave;
}

async function _lerProcessos() {
  const [docs, respIdx] = await Promise.all([_getAll(COLLECTION.processos), _lerRespostasIndexadas()]);
  return docs.map((d) => {
    const key = `${d.area}||${d.processo}`;
    const resp = respIdx[key];
    return {
      id: d.id,
      area: d.area || '',
      processo: d.processo || '',
      descricao: d.descricao || '',
      dependencia: d.dependencia || '',
      // dependencia (string) e mantida por compatibilidade (tokenLogic.js,
      // pcn-live.js, gerarPCN); dependenciaItens e a fonte nova, com categoria
      // explicita e id real do cadastro (Fornecedores/Pessoas/Sistemas/
      // Processos). Processo salvo antes desta mudanca simplesmente nao tem.
      dependenciaItens: Array.isArray(d.dependenciaItens) ? d.dependenciaItens : [],
      rto: d.rto || '',
      rpo: d.rpo || '',
      mtpd: d.mtpd || '',
      biaHomologada: d.biaHomologada || '',
      tier: d.tier || '',
      bcpStatus: d.bcpStatus || '',
      descricaoFuncional: d.descricaoFuncional || '',
      impactoIndisponibilidade: d.impactoIndisponibilidade || null,
      bcpObjetivo: d.bcpObjetivo || '',
      bcpEscopo: d.bcpEscopo || '',
      bcpContatos: d.bcpContatos || [],
      bcpRiscos: d.bcpRiscos || [],
      bcpPreventivas: d.bcpPreventivas || [],
      drpStatus: d.drpStatus || '',
      drpObjetivo: d.drpObjetivo || '',
      drpEscopo: d.drpEscopo || '',
      drpProcedimentos: d.drpProcedimentos || '',
      drpCriterios: d.drpCriterios || '',
      mtd: d.mtd || '',
      workaround: d.workaround || '',
      impactoJanela: d.impactoJanela || '',
      bcpPlanoBProvedores: d.bcpPlanoBProvedores || '',
      bcpSlas: d.bcpSlas || '',
      bcpGatilhos: d.bcpGatilhos || '',
      bcpReconstituicao: d.bcpReconstituicao || '',
      bcpPapeisCrise: d.bcpPapeisCrise || '',
      pcnSalvo: d.pcnSalvo || '',
      tierManual: d.tierManual || '',
      levantamentoPCN: d.levantamentoPCN ? true : false,
      score: resp ? resp.score : 0,
      avaliado: resp ? resp.avaliado : false,
      respostas: resp ? resp.respostas : [],
    };
  });
}

// ------------------------------------------------------------
// Escrita das coleções
// ------------------------------------------------------------
async function _salvarPergunta(p) {
  const data = {
    categoria: p.categoria || '',
    pergunta: p.pergunta || '',
    descricao: p.descricao || '',
    ativa: p.ativa !== false,
  };
  if (p.id) {
    await _db.collection(COLLECTION.perguntas).doc(String(p.id)).set(data, { merge: true });
    return { success: true, id: p.id };
  }
  const ref = await _db.collection(COLLECTION.perguntas).add({ ...data, ordem: Date.now() });
  return { success: true, id: ref.id };
}

async function _salvarArea(a) {
  const data = {
    nome: a.nome || '',
    responsavel: a.responsavel || '',
    email: a.email || '',
    solucao: a.solucao || '',
  };
  if (a.id) {
    await _db.collection(COLLECTION.areas).doc(String(a.id)).set(data, { merge: true });
    return { success: true, id: a.id, dado: data };
  }
  const ref = await _db.collection(COLLECTION.areas).add(data);
  return { success: true, id: ref.id, dado: data };
}


// ------------------------------------------------------------
// Versao da regua de pesos
//
// A regua (config_respostas) define quanto vale cada resposta. Se ela mudar,
// todo o historico muda de significado sem aviso: a curva do risco sobe porque
// a regua mudou, nao porque o risco mudou. Por isso cada avaliacao registra a
// versao da regua que a pontuou, e a versao sobe sozinha a cada edicao.
// ------------------------------------------------------------
async function _versaoReguaAtual() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('atual').get();
    return snap.exists ? Number((snap.data() || {}).versao) || 1 : 1;
  } catch {
    return 1;
  }
}

async function _subirVersaoRegua() {
  const ref = _db.collection(COLLECTION.regua).doc('atual');
  const snap = await ref.get();
  const versao = (snap.exists ? Number((snap.data() || {}).versao) || 1 : 1) + 1;
  await ref.set({
    versao,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return versao;
}

async function _salvarConfigResposta(d) {
  const data = {
    categoria: d.categoria || '',
    valor: String(d.valor ?? ''),
    label: d.label || '',
    cor: d.cor || '',
    background: d.background || '',
  };
  // O front envia rowIndex (que agora é o docId) ao editar.
  const docId = d.rowIndex || d.id;
  if (docId) {
    await _db.collection(COLLECTION.configRespostas).doc(String(docId)).set(data, { merge: true });
    const versao = await _subirVersaoRegua();
    return { success: true, id: docId, reguaVersao: versao };
  }
  const ref = await _db.collection(COLLECTION.configRespostas).add({ ...data, ordem: Date.now() });
  const versao = await _subirVersaoRegua();
  return { success: true, id: ref.id, reguaVersao: versao };
}

async function _salvarDependencia(d) {
  const data = {
    categoria: d.categoria || '',
    nome: d.nome || '',
    detalhes: d.detalhes || '',
    setor: d.setor || '',
    empresa: d.empresa || '',
    telefone: d.telefone || '',
    email: d.email || '',
    endereco: d.endereco || '',
    pessoas: Array.isArray(d.pessoas) ? d.pessoas : [],
    categoriaFornecedor: d.categoriaFornecedor || '',
    gestorContrato: d.gestorContrato || '',
    tic: d.tic !== false,
    cnpj: d.cnpj || '',
    // So usado pelas 7 categorias tecnicas -- ver _lerDependencias.
    rto: d.rto || '',
    rpo: d.rpo || '',
    estrategia: d.estrategia || '',
    responsavel: d.responsavel || '',
  };
  if (d.id) {
    await _db.collection(COLLECTION.dependencias).doc(String(d.id)).set(data, { merge: true });
    return { success: true, id: d.id, dado: data };
  }
  const ref = await _db.collection(COLLECTION.dependencias).add(data);
  return { success: true, id: ref.id, dado: data };
}

const _CAMPOS_INDICADOR = [
  'nome', 'pilar', 'tipo', 'responsavel', 'metaMinima', 'sentidoMeta', 'ativo',
  // 'historico' saiu de proposito: o historico mensal mora em
  // lancamentos_indicadores, um documento por mes. Os tres abaixo continuam
  // aqui, mas sao CACHE de exibicao derivado daquela colecao.
  'ultimoDesempenho', 'ultimoMes', 'foraDaMeta',
];

/** Id estavel: um documento por (indicador, mes). */
function _idLancamento(indicadorId, mes) {
  return `${indicadorId}__${mes}`;
}

/**
 * Grava lancamentos mensais, um documento por mes.
 *
 * E isto que acaba com a perda silenciosa: dois administradores lancando meses
 * diferentes nao se tocam, e lancando o MESMO mes so aquele mes e afetado — nao
 * o historico inteiro, como acontecia quando a lista era regravada por completo.
 */
async function _lancarResultados(indicadorId, entradas, arquivo) {
  if (!indicadorId) throw new Error('Indicador sem id.');
  const agora = new Date().toISOString();
  const quem = (window.USER_EMAIL || '').toLowerCase();
  const lote = _db.batch();
  (entradas || []).forEach((e) => {
    if (!e || !e.mes) return;
    const ref = _db.collection(COLLECTION.lancamentos).doc(_idLancamento(indicadorId, e.mes));
    lote.set(ref, {
      indicadorId,
      mes: e.mes,
      desempenho: e.desempenho ?? null,
      arquivo: arquivo || '',
      lancadoEm: agora,
      lancadoPor: quem,
    }, { merge: true });
  });
  await lote.commit();
  return { success: true, total: (entradas || []).length };
}

async function _removerLancamento(indicadorId, mes) {
  await _db.collection(COLLECTION.lancamentos).doc(_idLancamento(indicadorId, mes)).delete();
  return { success: true };
}

async function _salvarIndicadorSeguranca(ind) {
  const data = {};
  _CAMPOS_INDICADOR.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(ind, campo) && ind[campo] !== undefined) {
      data[campo] = ind[campo];
    }
  });
  data.atualizadoEm = new Date().toISOString();

  if (ind.id) {
    await _db.collection(COLLECTION.indicadoresSeguranca).doc(String(ind.id)).set(data, { merge: true });
    return { success: true, id: ind.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  data.historico = data.historico || [];
  data.ativo = data.ativo !== false;
  const ref = await _db.collection(COLLECTION.indicadoresSeguranca).add(data);
  return { success: true, id: ref.id };
}

// Campos do registro de risco (arrays planoAcao/kris ficam nativos no Firestore,
// sem necessidade de JSON.stringify — diferente de processos, que carrega essa
// convenção da época em que o backend era uma planilha do Sheets).
const _CAMPOS_RISCO = [
  'area', 'processoId', 'processo', 'fornecedor', 'fornecedorNome', 'indicadorId', 'titulo', 'descricao', 'categorias', 'responsavel',
  'dataIdentificacao', 'status', 'origem',
  'probabilidade', 'impacto', 'impactoFinanceiro', 'impactoFinanceiroDescricao', 'score', 'prioridade',
  'estrategiaTratamento', 'estrategiaDescricao', 'planoAcao', 'kris', 'impactoFinanceiroComponentes',
  'dataUltimaReavaliacao', 'proximaReavaliacao', 'historicoReavaliacao',
  'dataEncerramento', 'justificativaEncerramento',
];

// Merge: só grava os campos presentes no payload (mesma semântica de salvarProcesso).
async function _salvarRisco(r) {
  const data = {};
  _CAMPOS_RISCO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(r, campo) && r[campo] !== undefined) {
      data[campo] = r[campo];
    }
  });
  data.atualizadoEm = new Date().toISOString();

  if (r.id) {
    await _db.collection(COLLECTION.riscos).doc(String(r.id)).set(data, { merge: true });
    return { success: true, id: r.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  const ref = await _db.collection(COLLECTION.riscos).add(data);
  return { success: true, id: ref.id };
}

// Campos de processo que guardam JSON (mantidos como objeto/array nativo).
/**
 * Registra quem fixou o tier a mao e quando.
 *
 * tierManual sobrepoe o calculo para processos ainda nao avaliados. E legitimo,
 * mas antes nao ficava registro de quem decidiu nem quando — numa lista que vai
 * para a diretoria, uma criticidade fixada a mao sem autor nao se sustenta.
 */
function _marcarTierManual(dados, anterior) {
  const novo = dados.tierManual || '';
  const velho = (anterior && anterior.tierManual) || '';
  if (novo === velho) return dados;
  return {
    ...dados,
    tierManualPor: novo ? (window.USER_EMAIL || '').toLowerCase() : '',
    tierManualEm: novo ? new Date().toISOString() : '',
  };
}

const _CAMPOS_PROCESSO = [
  'area', 'processo', 'descricao', 'dependencia', 'dependenciaItens', 'rto', 'rpo', 'mtpd', 'biaHomologada', 'tier',
  'bcpStatus', 'descricaoFuncional', 'impactoIndisponibilidade', 'bcpObjetivo', 'bcpEscopo', 'bcpContatos', 'bcpRiscos', 'bcpPreventivas',
  'drpStatus', 'drpObjetivo', 'drpEscopo', 'drpProcedimentos', 'drpCriterios',
  'mtd', 'workaround', 'impactoJanela', 'bcpPlanoBProvedores', 'bcpSlas', 'bcpGatilhos', 'bcpReconstituicao', 'bcpPapeisCrise', 'pcnSalvo', 'tierManual', 'tierManualPor', 'tierManualEm',
];

// Localiza o docId de um processo por id explícito ou por área+processo.
async function _acharProcessoId(p) {
  if (p.id) return String(p.id);
  if (p.area && p.processo) {
    const chave = _processoKey(p.area, p.processo);
    const byKey = await _db.collection(COLLECTION.processos).doc(chave).get();
    if (byKey.exists) return chave;
    // fallback: busca por campos (caso docId legado não siga a convenção)
    const q = await _db
      .collection(COLLECTION.processos)
      .where('area', '==', p.area)
      .where('processo', '==', p.processo)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0].id;
  }
  return null;
}

// Merge: só grava os campos presentes no payload; ausentes preservam o valor
// atual (mesma semântica de salvarProcesso em Code.gs).
async function _salvarProcesso(p) {
  const data = {};
  _CAMPOS_PROCESSO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(p, campo) && p[campo] !== undefined) {
      data[campo] = p[campo];
    }
  });

  let docId = await _acharProcessoId(p);
  if (!docId) {
    docId = _processoKey(p.area, p.processo);
  }
  const ref = _db.collection(COLLECTION.processos).doc(docId);

  // Se o tier foi fixado a mao, registra quem e quando. So le o documento
  // atual quando o campo veio no payload — nao vale um ida e volta a toa.
  let paraGravar = data;
  if (Object.prototype.hasOwnProperty.call(data, 'tierManual')) {
    const atual = await ref.get();
    paraGravar = _marcarTierManual(data, atual.exists ? atual.data() : null);
  }

  await ref.set(paraGravar, { merge: true });
  return { success: true, id: docId };
}

async function _excluirProcesso(payload) {
  const docId = await _acharProcessoId(payload);
  if (!docId) return { error: 'Processo não encontrado.' };
  await _db.collection(COLLECTION.processos).doc(docId).delete();
  return { success: true };
}

// Salvar respostas de avaliação (calcula score/tier e atualiza o processo).
async function _salvarRespostas(payload) {
  const email = (window.USER_EMAIL || '').toLowerCase();
  const perguntas = (await _lerPerguntas()).filter((p) => p.ativa);
  const respostas = payload.respostas || [payload];
  const timestampIso = new Date().toISOString();
  const reguaVersao = await _versaoReguaAtual();

  for (const resp of respostas) {
    const scores = {};
    let score = 0;
    perguntas.forEach((perg) => {
      const v = Number(resp.scores?.[perg.pergunta]) || 0;
      scores[perg.pergunta] = v;
      score += v;
    });
    const tier = _calcularTier(score);
    const rto = _calcularRTO(tier);

    await _db.collection(COLLECTION.respostas).add({
      timestamp: timestampIso,
      respondente: resp.respondente || email,
      cargo: resp.cargo || '',
      area: resp.area,
      processo: resp.processo,
      scores,
      score,
      tier,
      // Qual regua pontuou esta resposta. Sem isso, mudar os pesos reescreve o
      // significado de todo o historico em silencio.
      reguaVersao,
    });

    // Atualizar tier no processo. O RTO so e preenchido quando esta vazio:
    // ele pertence ao gestor, e a avaliacao nao apaga a escolha dele.
    const docId = await _acharProcessoId({ area: resp.area, processo: resp.processo });
    if (docId) {
      const ref = _db.collection(COLLECTION.processos).doc(docId);
      const atual = await ref.get();
      const rtoAtual = atual.exists ? (atual.data() || {}).rto : '';
      const patch = { tier };
      if (!rtoAtual) { patch.rto = rto; patch.rtoOrigem = 'sugerido'; }
      await ref.set(patch, { merge: true });
    }
  }

  return { success: true, total: respostas.length };
}

// ------------------------------------------------------------
// Roteamento de ações
// ------------------------------------------------------------
// Ações de LEITURA atendidas pelo Firestore
const _GET_FIRESTORE = {
  getPerguntas: () => _lerPerguntas(),
  getAreas: () => _lerAreas(),
  getProcessos: () => _lerProcessos(),
  getProcessosPorArea: (params) => _lerProcessos().then((ps) => (params.area ? ps.filter((p) => p.area === params.area) : ps)),
  getConfigRespostas: () => _lerConfigRespostas(),
  getDependencias: () => _lerDependencias(),
  getPerfil: (params) => _lerPerfil(params.email),
  getRiscos: () => _lerRiscos(),
  getRiscosPorProcesso: (params) => _lerRiscos().then((rs) => (params.processoId ? rs.filter((r) => r.processoId === params.processoId) : rs)),
  getRiscosPorArea: (params) => _lerRiscos().then((rs) => (params.area ? rs.filter((r) => r.area === params.area) : rs)),
  getIndicadoresSeguranca: () => _lerIndicadoresSeguranca(),
  getCriteriosFornecedor: () => _lerCriteriosFornecedor(),
  getCategoriasFornecedor: () => _lerCategoriasFornecedor(),
  getAvaliacoesFornecedor: () => _lerAvaliacoesFornecedor(),
  getHistoricoRisco: () => _lerHistoricoRisco(),
  getConfigFornecedor: () => _lerConfigFornecedor(),
  getPerfis: () => _lerPerfis(),
};

// Ações de ESCRITA atendidas pelo Firestore
const _POST_FIRESTORE = {
  salvarPergunta: (b) => _salvarPergunta(b),
  excluirPergunta: (b) => _db.collection(COLLECTION.perguntas).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarArea: (b) => _salvarArea(b),
  excluirArea: (b) => _db.collection(COLLECTION.areas).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarProcesso: (b) => _salvarProcesso(b),
  excluirProcesso: (b) => _excluirProcesso(b),
  salvarRespostas: (b) => _salvarRespostas(b),
  salvarConfigResposta: (b) => _salvarConfigResposta(b),
  excluirConfigResposta: (b) => _db.collection(COLLECTION.configRespostas).doc(String(b.rowIndex || b.id)).delete()
    .then(() => _subirVersaoRegua()).then((versao) => ({ success: true, reguaVersao: versao })),
  salvarDependencia: (b) => _salvarDependencia(b),
  excluirDependencia: (b) => _db.collection(COLLECTION.dependencias).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarRisco: (b) => _salvarRisco(b),
  excluirRisco: (b) => _db.collection(COLLECTION.riscos).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarIndicadorSeguranca: (b) => _salvarIndicadorSeguranca(b),
  salvarCriterioFornecedor: (b) => _salvarCriterioFornecedor(b),
  excluirCriterioFornecedor: (b) => _db.collection(COLLECTION.criteriosFornecedor).doc(String(b.id)).delete()
    .then(() => _subirVersaoCriterios()).then((versao) => ({ success: true, criteriosVersao: versao })),
  salvarCategoriaFornecedor: (b) => _salvarCategoriaFornecedor(b),
  excluirCategoriaFornecedor: (b) => _db.collection(COLLECTION.categoriasFornecedor).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarAvaliacaoFornecedor: (b) => _salvarAvaliacaoFornecedor(b),
  salvarConfigFornecedor: (b) => _salvarConfigFornecedor(b),
  salvarPerfilAcesso: (b) => _salvarPerfilAcesso(b),
  excluirPerfilAcesso: (b) => _db.collection(COLLECTION.configPerfis).doc(String(b.email || '').toLowerCase()).delete()
    .then(() => ({ success: true })),
  excluirIndicadorSeguranca: (b) => _db.collection(COLLECTION.indicadoresSeguranca).doc(String(b.id)).delete().then(() => ({ success: true })),
};

// ------------------------------------------------------------
// Cliente do appApi — ações que exigem usuário logado.
//
// Estas rodavam no Apps Script e pararam quando o acesso anônimo dele foi
// fechado. Agora vão para uma Cloud Function que exige o token de login do
// Firebase. O envio por e-mail NÃO veio junto: depende de uma decisão de
// infraestrutura (API do Gmail com delegação, ou serviço externo). Até lá só
// existe o modo "link", e quem convida cola o link no próprio e-mail.
// ------------------------------------------------------------
async function _appApi(metodo, acao, dados) {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  const idToken = await user.getIdToken();

  const opcoes = {
    method: metodo,
    headers: { Authorization: 'Bearer ' + idToken },
  };
  let url = APP_API_URL;

  if (metodo === 'GET') {
    const qs = new URLSearchParams({ action: acao, ...(dados || {}) });
    url += '?' + qs.toString();
  } else {
    // text/plain evita o preflight extra; o servidor faz o parse do JSON.
    opcoes.headers['Content-Type'] = 'text/plain';
    opcoes.body = JSON.stringify({ action: acao, ...(dados || {}) });
  }

  const res = await fetch(url, opcoes);
  const texto = await res.text();
  if (res.status === 401) throw new Error(_extrairErro(texto) || 'Sessão inválida. Entre novamente.');
  if (!texto || texto.startsWith('<!') || texto.startsWith('<html')) {
    throw new Error('O servidor não retornou confirmação (HTTP ' + res.status + '). Recarregue e confira antes de repetir.');
  }
  let json;
  try { json = JSON.parse(texto); } catch { throw new Error('Resposta inesperada do servidor.'); }
  if (json && json.error) throw new Error(json.error);
  return json;
}

function _extrairErro(texto) {
  try { return (JSON.parse(texto) || {}).error; } catch { return ''; }
}

// Os nomes antigos (gerarTokenBIA etc.) viram um só: gerarLink com o tipo.
// gerarTokenDRP saiu -- "Componentes do Serviço" se fundiu em Dependencias, e
// o link de BIA ja cobre as 7 categorias tecnicas (ver Contexto do plano).
const _TIPO_LINK = {
  gerarToken: 'avaliacao',
  gerarTokenArea: 'area',
  gerarTokenBIA: 'bia',
  gerarTokenLevantamento: 'levantamento',
};

// ------------------------------------------------------------
// API pública (mesma interface do cliente antigo)
// ------------------------------------------------------------
const API = {
  async get(action, params = {}) {
    const cacheKey = action + JSON.stringify(params);
    if (_cache[cacheKey]) return _cache[cacheKey];

    if (_GET_FIRESTORE[action]) {
      const data = await _GET_FIRESTORE[action](params);
      _cache[cacheKey] = data;
      return data;
    }

    if (action === 'getLevantamentoPCN') {
      const r = await _appApi('GET', 'getLevantamentoPCN', { area: params.area, processo: params.processo });
      _cache[cacheKey] = r;
      return r;
    }
    // Leituras residuais restantes vão ao Apps Script.
    const data = await LegacyAPI.get(action, params);
    _cache[cacheKey] = data;
    return data;
  },

  invalidate(...actions) {
    actions.forEach((a) => {
      Object.keys(_cache)
        .filter((k) => k.startsWith(a))
        .forEach((k) => delete _cache[k]);
    });
  },

  async post(action, body, options = {}) {
    if (_POST_FIRESTORE[action]) {
      const result = await _POST_FIRESTORE[action](body);
      // Invalida caches afetados de forma conservadora.
      API.invalidate('getProcessos', 'getAreas', 'getPerguntas', 'getConfigRespostas', 'getDependencias', 'getProcessosPorArea', 'getRiscos', 'getRiscosPorProcesso', 'getRiscosPorArea', 'getIndicadoresSeguranca');
      return result;
    }
    // Ações que exigem login -> Cloud Function appApi.
    if (_TIPO_LINK[action]) {
      return _appApi('POST', 'gerarLink', { tipo: _TIPO_LINK[action], area: body.area, processo: body.processo, email: body.email });
    }
    if (action === 'salvarPCN') {
      return _appApi('POST', 'salvarPCN', { area: body.area, processo: body.processo, html: body.pcnHtml });
    }
    if (action === 'excluirPCN') {
      return _appApi('POST', 'excluirPCN', { area: body.area, processo: body.processo });
    }
    if (action === 'gerarPCN') {
      return _appApi('POST', 'gerarPCN', { id: body.id });
    }
    // Só o envio por e-mail ainda depende do Apps Script.
    return LegacyAPI.post(action, body, options);
  },

  // Endpoints nomeados (mesma assinatura de antes)
  getUsuarioLogado: () => API.get('getUsuarioLogado'),
  getPerfil: (email) => _lerPerfil(email),
  getPerguntas: () => API.get('getPerguntas'),
  getAreas: () => API.get('getAreas'),
  getProcessos: () => API.get('getProcessos'),
  getProcessosPorArea: (area) => API.get('getProcessosPorArea', { area }),
  getResumoRespostas: () => API.get('getResumoRespostas'),
  getConfigRespostas: () => API.get('getConfigRespostas'),
  salvarPergunta: (p) => API.post('salvarPergunta', p),
  excluirPergunta: (id) => API.post('excluirPergunta', { id }),
  salvarArea: (a) => API.post('salvarArea', a),
  excluirArea: (id) => API.post('excluirArea', { id }),
  salvarProcesso: (p) => API.post('salvarProcesso', p),
  excluirProcesso: (id) => API.post('excluirProcesso', { id }),
  salvarRespostas: (respostas) => API.post('salvarRespostas', { respostas }),
  salvarConfigResposta: (d) => API.post('salvarConfigResposta', d),
  excluirConfigResposta: (d) => API.post('excluirConfigResposta', d),
  getDependencias: () => API.get('getDependencias'),
  salvarDependencia: (d) => API.post('salvarDependencia', d),
  excluirDependencia: (id) => API.post('excluirDependencia', { id }),
  getRiscos: () => API.get('getRiscos'),
  getRiscosPorProcesso: (processoId) => API.get('getRiscosPorProcesso', { processoId }),
  getRiscosPorArea: (area) => API.get('getRiscosPorArea', { area }),
  salvarRisco: (r) => API.post('salvarRisco', r),
  excluirRisco: (id) => API.post('excluirRisco', { id }),
  getIndicadoresSeguranca: () => API.get('getIndicadoresSeguranca'),
  getCriteriosFornecedor: () => API.get('getCriteriosFornecedor'),
  getCategoriasFornecedor: () => API.get('getCategoriasFornecedor'),
  getAvaliacoesFornecedor: () => API.get('getAvaliacoesFornecedor'),
  getHistoricoRisco: () => API.get('getHistoricoRisco'),
  getConfigFornecedor: () => API.get('getConfigFornecedor'),
  getPerfis: () => API.get('getPerfis'),
  salvarPerfilAcesso: (p) => API.post('salvarPerfilAcesso', p)
    .then((r) => { API.invalidate('getPerfis'); return r; }),
  excluirPerfilAcesso: (email) => API.post('excluirPerfilAcesso', { email })
    .then((r) => { API.invalidate('getPerfis'); return r; }),
  salvarConfigFornecedor: (c) => API.post('salvarConfigFornecedor', c)
    .then((r) => { API.invalidate('getConfigFornecedor'); return r; }),
  salvarCriterioFornecedor: (c) => API.post('salvarCriterioFornecedor', c)
    .then((r) => { API.invalidate('getCriteriosFornecedor'); return r; }),
  excluirCriterioFornecedor: (id) => API.post('excluirCriterioFornecedor', { id })
    .then((r) => { API.invalidate('getCriteriosFornecedor'); return r; }),
  salvarCategoriaFornecedor: (c) => API.post('salvarCategoriaFornecedor', c)
    .then((r) => { API.invalidate('getCategoriasFornecedor'); return r; }),
  excluirCategoriaFornecedor: (id) => API.post('excluirCategoriaFornecedor', { id })
    .then((r) => { API.invalidate('getCategoriasFornecedor'); return r; }),
  salvarAvaliacaoFornecedor: (a) => API.post('salvarAvaliacaoFornecedor', a)
    .then((r) => { API.invalidate('getAvaliacoesFornecedor'); return r; }),
  salvarIndicadorSeguranca: (ind) => API.post('salvarIndicadorSeguranca', ind),
  lancarResultados: (indicadorId, entradas, arquivo) => _lancarResultados(indicadorId, entradas, arquivo)
    .then((r) => { API.invalidate('getIndicadoresSeguranca'); return r; }),
  removerLancamento: (indicadorId, mes) => _removerLancamento(indicadorId, mes)
    .then((r) => { API.invalidate('getIndicadoresSeguranca'); return r; }),
  excluirIndicadorSeguranca: (id) => API.post('excluirIndicadorSeguranca', { id }),
};

window.API = API;
