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
  subcategoriasFornecedor: 'subcategorias_fornecedor',
  produtosSoftware: 'produtos_software',
  criticidadeFornecedorPerguntas: 'criticidade_fornecedor_perguntas',
  historicoRisco: 'historico_risco',
  servicos: 'servicos',
  backups: 'backups',
  ferramentasBackup: 'ferramentas_backup',
  vulnerabilidades: 'vulnerabilidades',
  painelVulnerabilidades: 'painel_vulnerabilidades',
  relatoriosExecutivos: 'relatorios_executivos',
  relatoriosExecutivosConteudo: 'relatorios_executivos_conteudo',
  relatoriosCompartilhados: 'relatorios_compartilhados',
  contratos: 'contratos',
  eventosContrato: 'eventos_contrato',
  tiposContrato: 'tipos_contrato',
  indexadoresReajuste: 'indexadores_reajuste',
  statusContrato: 'status_contrato',
  configNotificacoes: 'config_notificacoes',
  notificacoesEmail: 'notificacoes_email',
};

// ------------------------------------------------------------
// Cache simples (mesma semântica do cliente antigo)
// ------------------------------------------------------------
const _cache = {};

// ------------------------------------------------------------
// Sincronizacao de cache entre abas (BroadcastChannel)
// ------------------------------------------------------------
// Cada aba tem seu proprio _cache em memoria; sem isto, salvar numa aba deixa
// outra aba do mesmo navegador com dado velho ate fechar/reabrir. Propaga so
// o NOME DA ACAO invalidada (nunca o dado) -- cada aba busca de novo do jeito
// que ja sabe. So quem ORIGINOU a invalidacao envia mensagem; quem recebe
// invalida local e nunca reenvia, senao duas abas ecoariam pra sempre.
const _canalCache = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bia-cache-sync') : null;

function _invalidateLocal(...actions) {
  actions.forEach((a) => {
    Object.keys(_cache)
      .filter((k) => k.startsWith(a))
      .forEach((k) => delete _cache[k]);
  });
}

if (_canalCache) {
  _canalCache.onmessage = (ev) => {
    const actions = (ev && ev.data && ev.data.actions) || [];
    if (actions.length) _invalidateLocal(...actions);
  };
}

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
    telefone: d.telefone || '',
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
/**
 * Le os perfis (cumulativos) da pessoa. Fonte: `perfis[]` (novo) com fallback
 * ao `perfil` (string legado). Migracao nao-destrutiva do valor antigo
 * 'fornecedores' -> 'seguranca' (o perfil existia para a pessoa de SI avaliar
 * fornecedor). Devolve { perfis: string[], perfil: string, area }.
 */
async function _lerPerfil(email) {
  const emailLower = String(email || '').trim().toLowerCase();
  if (!emailLower) return { perfis: [Perfis.PERFIL_PADRAO], perfil: Perfis.PERFIL_PADRAO, area: null };

  const perfilSnap = await _db.collection(COLLECTION.configPerfis).doc(emailLower).get();
  const perfilData = perfilSnap.exists ? perfilSnap.data() : null;

  // Migra o valor legado 'fornecedores' antes de normalizar (que descartaria
  // um perfil desconhecido). Vale tanto para o array novo quanto para a string.
  const migrar = (v) => (String(v || '').trim().toLowerCase() === 'fornecedores' ? 'seguranca' : v);
  let brutos = [];
  if (perfilData && Array.isArray(perfilData.perfis)) brutos = perfilData.perfis.map(migrar);
  else if (perfilData && perfilData.perfil) brutos = [migrar(perfilData.perfil)];
  const perfis = Perfis.normalizarLista(brutos); // [] impossivel: cai em [gestor]
  const perfil = perfis[0];

  // A area e lida para qualquer perfil (a tela mostra a area de todos). Mas o
  // auto-resolve por e-mail de responsavel de Area e a persistencia dele so
  // fazem sentido para o GESTOR: e a area dele que as rules usam, e gravar a
  // area de um nao-gestor nao muda o poder dele (ver gestorArea nas rules).
  let area = perfilData && perfilData.area ? String(perfilData.area).trim() : null;
  if (!area && Perfis.exigeArea(perfis)) {
    const areas = await _getAll(COLLECTION.areas);
    const match = areas.find((a) => String(a.email || '').trim().toLowerCase() === emailLower);
    if (match) area = String(match.nome).trim();

    // Persistir a area resolvida (as rules do gestor dependem dela). NUNCA
    // gravar `perfil`/`perfis` junto: gravaria por cima do que o admin definiu.
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

  return { perfis, perfil, area: area || null };
}

// ------------------------------------------------------------
// Perfis de acesso (tela de Administracao)
// ------------------------------------------------------------

async function _lerPerfis() {
  const migrar = (v) => (String(v || '').trim().toLowerCase() === 'fornecedores' ? 'seguranca' : v);
  const docs = await _getAll(COLLECTION.configPerfis);
  return docs.map((d) => {
    // Fonte: perfis[] (novo) com fallback ao perfil (string legado); migra o
    // valor antigo 'fornecedores' -> 'seguranca'.
    const brutos = Array.isArray(d.perfis) ? d.perfis.map(migrar) : (d.perfil ? [migrar(d.perfil)] : []);
    const perfis = Perfis.normalizarLista(brutos);
    const gravado = Array.isArray(d.perfis) ? d.perfis.join(', ') : String(d.perfil || '');
    return {
      id: d.id,
      email: String(d.email || d.id || '').toLowerCase(),
      perfis,
      perfil: perfis[0],
      perfilGravado: gravado,
      area: d.area || '',
      atualizadoEm: d.atualizadoEm || '',
      atualizadoPor: d.atualizadoPor || '',
    };
  }).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Cria ou altera os perfis (cumulativos) de uma pessoa.
 *
 * O documento tem o e-mail como id, em minusculas: e assim que as rules acham
 * os perfis de quem esta logado. Grava `perfis` (array) e `perfil` = perfis[0]
 * (compat com o campo string legado e com quem ainda le um valor so).
 */
async function _salvarPerfilAcesso(p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail.');
  if (!email.endsWith(DOMINIO_CORPORATIVO)) {
    throw new Error(`O e-mail tem que ser do domínio ${DOMINIO_CORPORATIVO}.`);
  }
  // Aceita p.perfis (array) ou p.perfil (string, compat).
  const perfis = Perfis.normalizarLista(p.perfis != null ? p.perfis : p.perfil);
  if (!perfis.length || !(p.perfis != null ? p.perfis : [p.perfil]).some((x) => Perfis.conhecido(x))) {
    throw new Error('Selecione ao menos um perfil válido.');
  }

  const precisaArea = Perfis.exigeArea(perfis);
  const area = String(p.area || '').trim();
  if (precisaArea && !area) throw new Error('Gestor precisa de uma área.');

  const dados = {
    email,
    perfis,
    perfil: perfis[0], // compat com o campo string legado
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  };

  // A area agora e gravada para QUALQUER perfil (a tela mostra a area de todo
  // mundo). Isso e seguro porque as rules so concedem PODER de gestor por area
  // a quem TEM o perfil gestor (ver gestorArea() em firestore.rules): um SI com
  // area gravada nao vira gestor daquela area. Quando o campo vem vazio, remove
  // em vez de gravar '' — `area: ''` ainda seria "area vazia", e os riscos
  // corporativos nascem com area vazia.
  dados.area = area ? area : firebase.firestore.FieldValue.delete();

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

// RTO/RPO/MTTR gravados em minutos: numero >= 0, ou null quando nao informado.
function _minutosOuNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function _refsDependencia(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((x) => x && x.id)
    .map((x) => ({ id: String(x.id), nome: x.nome || '', categoria: x.categoria || '' }));
}

async function _lerDependencias() {
  const docs = await _getAll(COLLECTION.dependencias);
  return docs.map((d) => ({
    id: d.id,
    categoria: d.categoria || '',
    nome: d.nome || '',
    // So usado por Fornecedores -- Razao Social e o campo "nome" acima.
    nomeFantasia: d.nomeFantasia || '',
    detalhes: d.detalhes || '',
    setor: d.setor || '',
    // So usado por Pessoas: áreas às quais a pessoa pertence (multi). setor
    // acima segue como a área "principal" (= areas[0]) por compat.
    areas: Array.isArray(d.areas) ? d.areas.filter(Boolean) : [],
    // So usado por Pessoas: id da Pessoa que é o líder imediato (organograma).
    liderImediato: d.liderImediato || '',
    // So usado por Pessoas: Tech Lead / Team Lead, cada funcao com os seus
    // produtos (ids de produtos_software). Marcar a funcao nao obriga a ter produto.
    techLead: d.techLead === true,
    techLeadProdutos: Array.isArray(d.techLeadProdutos) ? d.techLeadProdutos.filter(Boolean) : [],
    teamLead: d.teamLead === true,
    teamLeadProdutos: Array.isArray(d.teamLeadProdutos) ? d.teamLeadProdutos.filter(Boolean) : [],
    empresa: d.empresa || '',
    telefone: d.telefone || '',
    email: d.email || '',
    endereco: d.endereco || '',
    // So usado por Fornecedores: uma empresa pode ter N pessoas associadas.
    // Nas outras 4 categorias este campo nunca e escrito e chega vazio.
    pessoas: Array.isArray(d.pessoas) ? d.pessoas : [],
    // So usado por Fornecedores: canais de suporte (0800, portal, plantao...),
    // {tipo, contato, horario, nivel, sla, observacao}. Entram no DRP.
    canaisSuporte: Array.isArray(d.canaisSuporte) ? d.canaisSuporte : [],
    // Idem: segmento de negocio (catalogo categorias_fornecedor) e o
    // responsavel interno pelo contrato.
    categoriaFornecedor: d.categoriaFornecedor || '',
    // Subcategoria (catalogo subcategorias_fornecedor, filha da Categoria
    // acima) -- mesma convencao de guardar o NOME, nao o id.
    subcategoriaFornecedor: d.subcategoriaFornecedor || '',
    // LEGADO (19/10/2026): o gestor e o setor do fornecedor passaram a vir dos
    // contratos vigentes. Estes campos ficam no banco so ate a migracao
    // (scripts/migrar-gestores-fornecedor-relacionados.js) e nao sao mais
    // editados pela tela.
    gestorContrato: d.gestorContrato || '',
    gestoresContrato: Array.isArray(d.gestoresContrato) ? d.gestoresContrato : [],
    // Areas e pessoas internas que se relacionam com o fornecedor:
    // areasRelacionadas = [nome da area]; pessoasRelacionadas = [{id, nome, papel}].
    areasRelacionadas: Array.isArray(d.areasRelacionadas) ? d.areasRelacionadas.filter(Boolean) : [],
    pessoasRelacionadas: Array.isArray(d.pessoasRelacionadas)
      ? d.pessoasRelacionadas.map((p) => ({ id: p.id != null ? p.id : null, nome: p.nome || '', papel: p.papel || '' }))
      : [],
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
    // Composicao de Servicos (21/10/2026): RTO/RPO/MTTR em minutos (null = nao
    // informado) e as dependencias logo abaixo desta ({id, nome, categoria}).
    // Ver public/servico-composicao.js. O texto rto/rpo acima e legado e so e
    // lido enquanto rtoMin/rpoMin nao existirem.
    rtoMin: _minutosOuNull(d.rtoMin),
    rpoMin: _minutosOuNull(d.rpoMin),
    mttrMin: _minutosOuNull(d.mttrMin),
    componentes: Array.isArray(d.componentes) ? d.componentes : [],
    // Instalações (21/10/2026): tipo e a instalação alternativa (contingência);
    // o endereço é o campo `endereco` acima. Pessoa: a instalação de lotação.
    tipoInstalacao: d.tipoInstalacao || '',
    instalacaoAlternativa: d.instalacaoAlternativa && d.instalacaoAlternativa.id ? { id: String(d.instalacaoAlternativa.id), nome: d.instalacaoAlternativa.nome || '' } : null,
    instalacao: d.instalacao && d.instalacao.id ? { id: String(d.instalacao.id), nome: d.instalacao.nome || '' } : null,
    estrategia: d.estrategia || '',
    responsavel: d.responsavel || '',
    // Aba DRP: listas guiadas (Criterios de Acionamento, Pre-requisitos,
    // Health Check, Runbook, Criterios de Retorno, Limitacoes), a secao
    // Dependencias e o registro de Testes -- mesmo escopo das 7 categorias
    // tecnicas acima.
    drpCriteriosAcionamento: Array.isArray(d.drpCriteriosAcionamento) ? d.drpCriteriosAcionamento : [],
    drpPreRequisitos: Array.isArray(d.drpPreRequisitos) ? d.drpPreRequisitos : [],
    drpHealthCheck: Array.isArray(d.drpHealthCheck) ? d.drpHealthCheck : [],
    drpRunbook: Array.isArray(d.drpRunbook) ? d.drpRunbook : [],
    drpCriteriosRetorno: Array.isArray(d.drpCriteriosRetorno) ? d.drpCriteriosRetorno : [],
    drpLimitacoes: Array.isArray(d.drpLimitacoes) ? d.drpLimitacoes : [],
    // Novas dependências vinculadas (outras dependências das quais esta depende).
    drpDependencias: Array.isArray(d.drpDependencias) ? d.drpDependencias : [],
    // Testes do procedimento -- registro único de controle.
    drpTestes: (d.drpTestes && typeof d.drpTestes === 'object') ? {
      dataUltimoTeste: d.drpTestes.dataUltimoTeste || '',
      frequenciaEsperada: d.drpTestes.frequenciaEsperada || '',
      cenarioTestado: d.drpTestes.cenarioTestado || '',
      resultado: d.drpTestes.resultado || '',
      evidencia: d.drpTestes.evidencia || '',
      pendencias: d.drpTestes.pendencias || '',
    } : { dataUltimoTeste: '', frequenciaEsperada: '', cenarioTestado: '', resultado: '', evidencia: '', pendencias: '' },
    // Estratégias de teste (Parâmetros DRP) e histórico de registros (aba
    // própria). drpTestes acima continua para compat/migração.
    drpEstrategiasTeste: Array.isArray(d.drpEstrategiasTeste) ? d.drpEstrategiasTeste : [],
    drpRegistrosTeste: Array.isArray(d.drpRegistrosTeste) ? d.drpRegistrosTeste : [],
    drpRoteirosTeste: Array.isArray(d.drpRoteirosTeste) ? d.drpRoteirosTeste : [],
    // Plano de Recuperação: template importado + versões do artefato DRP.
    drpTemplate: d.drpTemplate || '',
    drpTemplateNome: d.drpTemplateNome || '',
    drpSalvo: d.drpSalvo || '',
  }));
}

/**
 * Serviços: agrupam dependências técnicas já cadastradas (sempre por id --
 * nunca por nome solto, pra não repetir o bug de "referência fantasma" que
 * levou a fundir Componentes do Serviço em Dependencias em 24/09/2026).
 * Coleção própria: um Serviço é um contêiner, não mais um item técnico igual
 * aos que ele agrupa.
 */
async function _lerServicos() {
  const docs = await _getAll(COLLECTION.servicos);
  return docs.map((s) => ({
    id: s.id,
    nome: s.nome || '',
    descricao: s.descricao || '',
    dependenciaItens: Array.isArray(s.dependenciaItens) ? s.dependenciaItens : [],
    // Pessoas (categoria Pessoas de dependencias) donas do serviço, {id, nome}.
    // DECISAO 21/10/2026: o Stakeholder saiu do Backup e veio pra cá.
    stakeholders: Array.isArray(s.stakeholders) ? s.stakeholders : [],
    // Composicao de Servicos (21/10/2026): limites do servico em minutos e os
    // Processos que ele suporta ({id, nome}) -- o nivel "servico abaixo de
    // processo". Fica no servico (escrita Admin/SI), nao em processos.
    rtoMin: _minutosOuNull(s.rtoMin),
    rpoMin: _minutosOuNull(s.rpoMin),
    mttrMin: _minutosOuNull(s.mttrMin),
    processoIds: Array.isArray(s.processoIds) ? s.processoIds : [],
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const _CAMPOS_SERVICO = ['nome', 'descricao', 'dependenciaItens', 'stakeholders', 'rtoMin', 'rpoMin', 'mttrMin', 'processoIds'];

async function _salvarServico(s) {
  const data = {};
  _CAMPOS_SERVICO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(s, campo) && s[campo] !== undefined) data[campo] = s[campo];
  });
  ['rtoMin', 'rpoMin', 'mttrMin'].forEach((c) => { if (c in data) data[c] = _minutosOuNull(data[c]); });
  if ('processoIds' in data) {
    data.processoIds = (Array.isArray(data.processoIds) ? data.processoIds : [])
      .filter((p) => p && p.id).map((p) => ({ id: String(p.id), nome: p.nome || '' }));
  }
  data.atualizadoEm = new Date().toISOString();
  data.atualizadoPor = (window.USER_EMAIL || '').toLowerCase();

  if (s.id) {
    await _db.collection(COLLECTION.servicos).doc(String(s.id)).set(data, { merge: true });
    return { success: true, id: s.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = data.atualizadoPor;
  const ref = await _db.collection(COLLECTION.servicos).add(data);
  return { success: true, id: ref.id };
}

/**
 * Backup: vinculado a N Serviços, 1 Servidor (Dependência) e 1 Ferramenta
 * (lista ferramentas_backup), com o Modo (o que é copiado) e o Escopo. Jobs ficam como array dentro do próprio documento -- nunca são
 * abertos/buscados sozinhos, não precisam de coleção própria (mesmo espírito
 * de Pessoas Associadas/Gestores do Contrato do Fornecedor).
 *
 * DECISAO 04/10/2026: Servidor era multi-seleção por categoria (servidorItens[]);
 * virou 1 Dependência só, igual Stakeholder -- servidorId/servidorNome.
 * servidorItens continua lido (não gravado mais) só pra abrirDrawerBackup()
 * migrar não-destrutivamente backups antigos que ainda não têm servidorId.
 *
 * DECISAO 21/10/2026: servicoId (1) virou servicoIds[] (N) -- backup antigo só
 * com servicoId é lido como [servicoId], sem regravar nada. stakeholderId/Nome
 * saíram do Backup (agora são do Serviço, ver _lerServicos) e só continuam
 * lidos para o drawer do Serviço migrar quem ainda não tem stakeholders.
 */
async function _lerBackups() {
  const docs = await _getAll(COLLECTION.backups);
  return docs.map((b) => ({
    id: b.id,
    nome: b.nome || '',
    descricao: b.descricao || '',
    servicoIds: Array.isArray(b.servicoIds) ? b.servicoIds.map(String) : (b.servicoId ? [String(b.servicoId)] : []),
    servidorId: b.servidorId || '',
    servidorNome: b.servidorNome || '',
    servidorItens: Array.isArray(b.servidorItens) ? b.servidorItens : [],
    stakeholderId: b.stakeholderId || '',
    stakeholderNome: b.stakeholderNome || '',
    ferramentaId: b.ferramentaId || '',
    ferramentaNome: b.ferramentaNome || '',
    ferramentaOutra: b.ferramentaOutra || '',
    modo: b.modo || '',
    escopo: b.escopo || '',
    jobs: Array.isArray(b.jobs) ? b.jobs : [],
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const _CAMPOS_BACKUP = ['nome', 'descricao', 'servicoIds', 'servidorId', 'servidorNome',
  'ferramentaId', 'ferramentaNome', 'ferramentaOutra', 'modo', 'escopo', 'jobs'];

async function _salvarBackup(b) {
  const data = {};
  _CAMPOS_BACKUP.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(b, campo) && b[campo] !== undefined) data[campo] = b[campo];
  });
  data.atualizadoEm = new Date().toISOString();
  data.atualizadoPor = (window.USER_EMAIL || '').toLowerCase();

  if (b.id) {
    await _db.collection(COLLECTION.backups).doc(String(b.id)).set(data, { merge: true });
    return { success: true, id: b.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = data.atualizadoPor;
  const ref = await _db.collection(COLLECTION.backups).add(data);
  return { success: true, id: ref.id };
}
/**
 * Vulnerabilidades: catálogo de vulnerabilidades reportadas (CVSS/CWE/CVE,
 * status de correção), com score e abertura automática de Risco.
 *
 * A abertura/encerramento do Risco automático NÃO acontece aqui -- roda no
 * servidor (Cloud Function `riscoDeVulnerabilidade`, gatilho em qualquer
 * escrita de `vulnerabilidades/{id}`), mesmo motivo do risco automático de
 * Fornecedor: quem cadastra Vulnerabilidade não tem (nem deveria precisar
 * ter) acesso de escrita a `/riscos`.
 */
async function _lerVulnerabilidades() {
  const docs = await _getAll(COLLECTION.vulnerabilidades);
  return docs.map((v) => ({
    id: v.id,
    codigo: v.codigo || '',
    ticketReport: v.ticketReport || '',
    // Ativo afetado (texto livre; o campo no banco continua se chamando `produto`).
    produto: v.produto || '',
    // Produto de Software do catalogo (id de produtos_software), '' quando nao ha.
    produtoSoftwareId: v.produtoSoftwareId || '',
    // Dependencias afetadas (15/10/2026): [{id, categoria, nome}] do catalogo de
    // Dependencias; substitui o texto livre `produto` (que fica como legado).
    dependenciasAfetadas: Array.isArray(v.dependenciasAfetadas)
      ? v.dependenciasAfetadas.map((d) => ({ id: d.id || null, categoria: d.categoria || '', nome: d.nome || '' }))
      : [],
    versao: v.versao || '',
    nome: v.nome || '',
    cwe: v.cwe || '',
    cve: v.cve || '',
    cvss: v.cvss != null && v.cvss !== '' ? Number(v.cvss) : null,
    severidadeManual: v.severidadeManual || '',
    // Avaliacao guiada da aba Severidade (cvss31.js): vetor CVSS 3.1 (pode
    // ser parcial) e os 2 criterios da matriz "sem CVSS".
    cvssVetor: v.cvssVetor || '',
    severidadeCriterios: {
      impacto: (v.severidadeCriterios && v.severidadeCriterios.impacto) || '',
      facilidade: (v.severidadeCriterios && v.severidadeCriterios.facilidade) || '',
    },
    descricao: v.descricao || '',
    dataDeteccao: v.dataDeteccao || '',
    origemDeteccao: v.origemDeteccao || '',
    // Tipo/Subtipo (lista fixa em app.js, VULNERABILIDADE_TIPOS) e Metodo de
    // Deteccao (15/10/2026). origemDeteccao continua sendo "quem reportou".
    tipo: v.tipo || '',
    subtipo: v.subtipo || '',
    metodoDeteccao: v.metodoDeteccao || '',
    exploitDisponivel: v.exploitDisponivel || '',
    equipeResponsavel: v.equipeResponsavel || '',
    responsavel: v.responsavel || '',
    ticketCorrecao: v.ticketCorrecao || '',
    // "Aberto" foi renomeado para "Pendente" (15/10/2026): documento antigo ainda nao migrado aparece certo.
    statusCorrecao: v.statusCorrecao === 'Aberto' ? 'Pendente' : (v.statusCorrecao || ''),
    dataPrevistaCorrecao: v.dataPrevistaCorrecao || '',
    dataCorrecao: v.dataCorrecao || '',
    evidenciaCorrecao: v.evidenciaCorrecao || '',
    observacoes: v.observacoes || '',
    // Só leitura (Painel de Vulnerabilidades, 19/10/2026): quando saiu do
    // backlog por aceite (gravado pelo servidor, ver functions/painelVulnerabilidades.js)
    // e a última edição, fallback de data para as aceitas/corrigidas antigas.
    dataAceite: v.dataAceite || '',
    atualizadoEm: v.atualizadoEm || '',
  })).sort((a, b) => b.codigo.localeCompare(a.codigo, 'pt-BR'));
}

// Fotos mensais do backlog (uma por 'AAAA-MM'), gravadas pela varredura diária.
// Coleção pequena (12 docs/ano): lê tudo e ordena aqui.
async function _lerFotosPainelVulnerabilidades() {
  const docs = await _getAll(COLLECTION.painelVulnerabilidades);
  return docs.map((d) => Object.assign({}, d, { mes: d.mes || d.id })).sort((a, b) => a.mes.localeCompare(b.mes));
}

const _CAMPOS_VULNERABILIDADE = [
  'codigo', 'ticketReport', 'produto', 'produtoSoftwareId', 'dependenciasAfetadas', 'versao', 'nome', 'cwe', 'cve', 'cvss', 'severidadeManual',
  'cvssVetor', 'severidadeCriterios',
  'descricao', 'dataDeteccao', 'origemDeteccao', 'tipo', 'subtipo', 'metodoDeteccao', 'exploitDisponivel',
  'equipeResponsavel', 'responsavel', 'ticketCorrecao', 'statusCorrecao',
  'dataPrevistaCorrecao', 'dataCorrecao', 'evidenciaCorrecao', 'observacoes',
];

async function _salvarVulnerabilidade(v) {
  const data = {};
  _CAMPOS_VULNERABILIDADE.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(v, campo) && v[campo] !== undefined) data[campo] = v[campo];
  });
  if (Object.prototype.hasOwnProperty.call(data, 'cvss')) {
    data.cvss = data.cvss !== '' && data.cvss != null ? Number(data.cvss) : null;
  }
  data.atualizadoEm = new Date().toISOString();
  data.atualizadoPor = (window.USER_EMAIL || '').toLowerCase();

  if (v.id) {
    await _db.collection(COLLECTION.vulnerabilidades).doc(String(v.id)).set(data, { merge: true });
    return { success: true, id: v.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = data.atualizadoPor;
  const ref = await _db.collection(COLLECTION.vulnerabilidades).add(data);
  return { success: true, id: ref.id };
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
  // Admin e Seguranca da Informacao leem tudo (DECISAO 15/10/2026: a regra do
  // banco so deixava Admin, e SI -- que opera o modulo -- recebia "sem acesso").
  const perfis = window.USER_PERFIS || window.USER_PERFIL;
  const ehAdmin = Perfis.ehAdmin(perfis) || Perfis.ehSeguranca(perfis);
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
    // Produto de Software (20/10/2026): id de produtos_software, '' quando nao ha.
    produtoSoftwareId: d.produtoSoftwareId || '',
    indicadorId: d.indicadorId || null,
    // Vinculo com a vulnerabilidade de origem (gravado pelo servidor). Sem
    // estes dois, a tela de Vulnerabilidades nunca achava o risco aberto.
    vulnerabilidadeId: d.vulnerabilidadeId || null,
    vulnerabilidadeCodigo: d.vulnerabilidadeCodigo || '',
    // Aviso que a automacao deixa para revisao humana (ex.: severidade caiu
    // abaixo do limiar com o risco aberto). So o servidor grava.
    alertaAutomacao: d.alertaAutomacao || '',
    titulo: d.titulo || '',
    descricao: d.descricao || '',
    // Risco antigo tem so `categoria` (string, um valor so) -- cai num array
    // de 1 item, sem precisar de migracao de dado.
    categorias: Array.isArray(d.categorias) ? d.categorias : (d.categoria ? [d.categoria] : []),
    responsavel: d.responsavel || '',
    reportadoPor: d.reportadoPor || '',
    dataIdentificacao: d.dataIdentificacao || '',
    // "Em Análise" foi fundido em "Em Avaliação" (15/10/2026).
    status: d.status === 'Em Análise' ? 'Em Avaliação' : (d.status || 'Identificado'),
    origem: d.origem || 'Manual',
    // Escala NIST 5x5 (15/10/2026): rotulo antigo (Média, Crítico) vira o atual
    // na leitura -- risco nao migrado aparece e calcula certo.
    probabilidade: RiscoConsolidado.normalizarProbabilidade(d.probabilidade) || (d.probabilidade || ''),
    impacto: RiscoConsolidado.normalizarImpacto(d.impacto) || (d.impacto || ''),
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
    justificativaAceite: d.justificativaAceite || '',
    aprovadorAceite: d.aprovadorAceite || '',
    probabilidadeResidual: RiscoConsolidado.normalizarProbabilidade(d.probabilidadeResidual) || '',
    impactoResidual: RiscoConsolidado.normalizarImpacto(d.impactoResidual) || '',
    funcaoCsf: d.funcaoCsf || '',
    fonteAmeaca: d.fonteAmeaca || '',
    eventoAmeaca: d.eventoAmeaca || '',
    condicaoPredisponente: d.condicaoPredisponente || '',
    consequencia: d.consequencia || '',
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

/**
 * Produtos de Software da empresa (Fortes Ponto, Fortes RH...). Catalogo-base:
 * a Pessoa aponta para ele, por ID (Tech Lead / Team Lead de um produto) --
 * renomear um produto nao orfaniza ninguem. Mesmo molde de Categorias de
 * Fornecedor: desativar em vez de excluir, sem versao.
 */
async function _lerProdutosSoftware() {
  const docs = await _getAll(COLLECTION.produtosSoftware);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    ativo: d.ativo !== false,
    ordem: Number(d.ordem) || 0,
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
  })).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const _CAMPOS_PRODUTO_SOFTWARE = ['nome', 'ativo', 'ordem'];

/** Nome comparavel: sem acento, sem maiuscula, sem espaco sobrando. */
function _nomeComparavel(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function _salvarProdutoSoftware(p) {
  const nome = String(p.nome || '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Informe o nome do produto.');
  // Duplicado (mesmo nome sem diferenciar maiuscula/acento) em OUTRO produto.
  const existentes = await _lerProdutosSoftware();
  const igual = existentes.find((x) => _nomeComparavel(x.nome) === _nomeComparavel(nome) && String(x.id) !== String(p.id || ''));
  if (igual) throw new Error(`Já existe um produto chamado "${igual.nome}".`);

  const data = {};
  _CAMPOS_PRODUTO_SOFTWARE.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(p, campo) && p[campo] !== undefined) data[campo] = p[campo];
  });
  data.nome = nome;
  data.atualizadoEm = new Date().toISOString();

  if (p.id) {
    await _db.collection(COLLECTION.produtosSoftware).doc(String(p.id)).set(data, { merge: true });
    return { success: true, id: p.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(COLLECTION.produtosSoftware).add(data);
  return { success: true, id: ref.id };
}

/**
 * Subcategorias do fornecedor -- filhas de uma Categoria (categoriaId),
 * mesmo molde de _lerCategoriasFornecedor/_salvarCategoriaFornecedor acima,
 * só que com o vinculo hierarquico. Ao contrario de Fornecedor->Categoria
 * (que guarda o NOME, uma etiqueta solta), Subcategoria->Categoria guarda o
 * ID -- e um vinculo estrutural entre dois catalogos, nao uma etiqueta num
 * registro de negocio; por id, renomear a Categoria nao orfaniza as
 * Subcategorias dela.
 */
async function _lerSubcategoriasFornecedor() {
  const docs = await _getAll(COLLECTION.subcategoriasFornecedor);
  return docs.map((d) => ({
    id: d.id,
    nome: d.nome || '',
    categoriaId: d.categoriaId || '',
    ativo: d.ativo !== false,
    ordem: Number(d.ordem) || 0,
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
  })).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome));
}

const _CAMPOS_SUBCATEGORIA_FORNECEDOR = ['nome', 'ativo', 'ordem', 'categoriaId'];

async function _salvarSubcategoriaFornecedor(c) {
  const data = {};
  _CAMPOS_SUBCATEGORIA_FORNECEDOR.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(c, campo) && c[campo] !== undefined) data[campo] = c[campo];
  });
  data.atualizadoEm = new Date().toISOString();

  if (c.id) {
    await _db.collection(COLLECTION.subcategoriasFornecedor).doc(String(c.id)).set(data, { merge: true });
    return { success: true, id: c.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(COLLECTION.subcategoriasFornecedor).add(data);
  return { success: true, id: ref.id };
}

/**
 * Perguntas de Criticidade do fornecedor -- cadastraveis desde 08/10/2026
 * (antes eram fixas em fornecedor-criticidade.js). Cada pergunta tem sua
 * propria lista de opcoes (rotulo + score); nao ha "config de respostas"
 * compartilhada entre perguntas (diferente do BIA), porque cada pergunta
 * daqui tem opcoes com texto proprio, nao um conjunto generico reusado.
 */
async function _lerCriticidadeFornecedorPerguntas() {
  const docs = await _getAll(COLLECTION.criticidadeFornecedorPerguntas);
  return docs.map((d) => ({
    id: d.id,
    texto: d.texto || '',
    ativa: d.ativa !== false,
    ordem: Number(d.ordem) || 0,
    opcoes: Array.isArray(d.opcoes) ? d.opcoes.map((o) => ({ rotulo: o.rotulo || '', score: Number(o.score) || 0 })) : [],
    criadoEm: d.criadoEm || '',
    atualizadoEm: d.atualizadoEm || '',
  })).sort((a, b) => (a.ordem - b.ordem) || a.texto.localeCompare(b.texto));
}

const _CAMPOS_CRITICIDADE_FORNECEDOR_PERGUNTA = ['texto', 'ativa', 'ordem', 'opcoes'];

async function _salvarCriticidadeFornecedorPergunta(p) {
  const texto = String(p.texto || '').trim();
  if (!texto) throw new Error('Informe o texto da pergunta.');
  const opcoes = Array.isArray(p.opcoes) ? p.opcoes : [];
  if (!opcoes.length) throw new Error('Cadastre ao menos uma opção de resposta.');
  opcoes.forEach((o) => {
    if (!String(o.rotulo || '').trim()) throw new Error('Toda opção precisa de um rótulo.');
    if (o.score === undefined || o.score === null || isNaN(Number(o.score))) throw new Error('Toda opção precisa de um peso numérico.');
  });

  const data = {};
  _CAMPOS_CRITICIDADE_FORNECEDOR_PERGUNTA.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(p, campo) && p[campo] !== undefined) data[campo] = p[campo];
  });
  data.texto = texto;
  data.opcoes = opcoes.map((o) => ({ rotulo: String(o.rotulo).trim(), score: Number(o.score) }));
  data.atualizadoEm = new Date().toISOString();

  // A versao e so de auditoria (nenhuma tela le o numero devolvido) e custa
  // uma leitura + uma gravacao -- fora do caminho de quem espera o "Salvo!".
  // Falha aqui nao desfaz a pergunta ja gravada; fica registrada no console.
  const subirVersaoEmSegundoPlano = () => _subirVersaoCriticidadeFornecedor()
    .catch((e) => console.warn('Versao da criticidade de fornecedor nao foi atualizada:', e));
  if (p.id) {
    await _db.collection(COLLECTION.criticidadeFornecedorPerguntas).doc(String(p.id)).set(data, { merge: true });
    subirVersaoEmSegundoPlano();
    return { success: true, id: p.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(COLLECTION.criticidadeFornecedorPerguntas).add(data);
  subirVersaoEmSegundoPlano();
  return { success: true, id: ref.id };
}

// Versao de auditoria -- mesmo papel/nivel de simplicidade de
// _subirVersaoCriterios (so grava um numero crescente junto de cada
// avaliacao; nunca e lida de volta pra recalcular uma avaliacao antiga).
async function _versaoCriticidadeFornecedorAtual() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('criticidadeFornecedor').get();
    return snap.exists ? Number((snap.data() || {}).versao) || 1 : 1;
  } catch {
    return 1;
  }
}

async function _subirVersaoCriticidadeFornecedor() {
  const ref = _db.collection(COLLECTION.regua).doc('criticidadeFornecedor');
  const snap = await ref.get();
  const versao = (snap.exists ? Number((snap.data() || {}).versao) || 1 : 1) + 1;
  await ref.set({
    versao,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return versao;
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

// Limiar de CVSS que abre risco de Vulnerabilidade (15/10/2026). Lido tambem
// pelo servidor (functions/vulnerabilidadeContexto.js) -- mesmo documento.
const LIMIAR_CVSS_PADRAO = 7.0;
async function _lerConfigVulnerabilidade() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('vulnerabilidade').get();
    const n = Number(snap.exists ? (snap.data() || {}).limiarCvss : NaN);
    return { limiarCvss: Number.isFinite(n) && n >= 0 && n <= 10 ? n : LIMIAR_CVSS_PADRAO };
  } catch {
    return { limiarCvss: LIMIAR_CVSS_PADRAO };
  }
}

async function _salvarConfigVulnerabilidade(d) {
  const n = Number(d.limiarCvss);
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error('O limiar tem que ser um CVSS de 0 a 10.');
  await _db.collection(COLLECTION.regua).doc('vulnerabilidade').set({
    limiarCvss: n,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return { success: true, limiarCvss: n };
}

// Apetite de risco (CSF 2.0 GV.RM-02): maior nivel aceito sem tratamento.
async function _lerConfigRiscos() {
  try {
    const snap = await _db.collection(COLLECTION.regua).doc('riscos').get();
    const a = RiscoConsolidado.normalizarNivel(snap.exists ? (snap.data() || {}).apetite : '');
    return { apetite: a || RiscoConsolidado.APETITE_PADRAO };
  } catch {
    return { apetite: RiscoConsolidado.APETITE_PADRAO };
  }
}

async function _salvarConfigRiscos(d) {
  if (!RiscoConsolidado.ORDEM_NIVEL.includes(d.apetite)) throw new Error('Apetite inválido.');
  await _db.collection(COLLECTION.regua).doc('riscos').set({
    apetite: d.apetite,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  }, { merge: true });
  return { success: true, apetite: d.apetite };
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

// Relatórios Executivos salvos (20/10/2026). Metadados (lista) e conteúdo em
// coleções separadas; o conteúdo é o RETRATO DOS DADOS em JSON, nunca HTML
// (ver firestore.rules). Edição imutável; só o Admin exclui.
const LIMITE_RELATORIO_EXECUTIVO = 900000;

async function _salvarRelatorioExecutivo(r) {
  const conteudo = String((r && r.conteudo) || '');
  if (!conteudo) throw new Error('Relatório sem conteúdo para salvar.');
  if (conteudo.length >= LIMITE_RELATORIO_EXECUTIVO) throw new Error('Este relatório é grande demais para ser salvo no sistema. Use Imprimir / PDF.');
  const por = (window.USER_EMAIL || '').toLowerCase();
  const agora = new Date().toISOString();
  const ref = _db.collection(COLLECTION.relatoriosExecutivos).doc();
  const lote = _db.batch();
  lote.set(ref, {
    tipo: r.tipo,
    titulo: String(r.titulo || ''),
    geradoEm: String(r.geradoEm || agora),
    geradoPor: por,
    salvoEm: agora,
    meses: Number(r.meses) || null,
    comIA: !!r.comIA,
    resumo: Array.isArray(r.resumo) ? r.resumo.slice(0, 2).map(String) : [],
    // Versão do retrato também nos metadados: a lista sabe se a edição recorta
    // por área (compartilhar com gestor) sem baixar o conteúdo.
    versao: Number(r.versao) || 1,
    // Escopo do relatório (filtros, 20/10/2026) e áreas com risco nele.
    escopo: String(r.escopo || 'Empresa inteira'),
    areasEscopo: Array.isArray(r.areasEscopo) ? r.areasEscopo.map(String) : null,
  });
  lote.set(_db.collection(COLLECTION.relatoriosExecutivosConteudo).doc(ref.id), {
    tipo: r.tipo, geradoPor: por, versao: Number(r.versao) || 1, conteudo,
  });
  await lote.commit();
  return { success: true, id: ref.id, salvoEm: agora };
}

async function _lerRelatoriosExecutivos() {
  const docs = await _getAll(COLLECTION.relatoriosExecutivos);
  return docs.sort((a, b) => String(b.geradoEm || '').localeCompare(String(a.geradoEm || '')));
}

async function _lerConteudoRelatorioExecutivo(id) {
  const snap = await _db.collection(COLLECTION.relatoriosExecutivosConteudo).doc(String(id)).get();
  if (!snap.exists) throw new Error('O conteúdo deste relatório não foi encontrado.');
  return Object.assign({ id: snap.id }, snap.data());
}

async function _excluirRelatorioExecutivo(id) {
  // Os compartilhamentos da edição são revogados no mesmo lote: o gestor não
  // fica com acesso a uma edição que a equipe apagou.
  const compartilhados = await _db.collection(COLLECTION.relatoriosCompartilhados).where('edicaoId', '==', String(id)).get();
  const lote = _db.batch();
  const agora = new Date().toISOString();
  const por = (window.USER_EMAIL || '').toLowerCase();
  compartilhados.docs.forEach((d) => {
    if ((d.data() || {}).revogado !== true) lote.update(d.ref, { revogado: true, revogadoEm: agora, revogadoPor: por });
  });
  lote.delete(_db.collection(COLLECTION.relatoriosExecutivos).doc(String(id)));
  lote.delete(_db.collection(COLLECTION.relatoriosExecutivosConteudo).doc(String(id)));
  await lote.commit();
  return { success: true };
}

// Compartilhamento com gestores (20/10/2026): um documento por destinatário,
// com o retrato JÁ RECORTADO (no de Riscos, só a área dele). O aviso por
// e-mail sai do servidor (gatilho avisoDeRelatorioCompartilhado).
async function _compartilharRelatorioExecutivo(c) {
  const destinos = Array.isArray(c && c.destinatarios) ? c.destinatarios : [];
  if (!destinos.length) throw new Error('Escolha ao menos um gestor.');
  const por = (window.USER_EMAIL || '').toLowerCase();
  const agora = new Date().toISOString();
  const lote = _db.batch();
  destinos.forEach((d) => {
    const conteudo = String(d.conteudo || '');
    if (conteudo.length >= LIMITE_RELATORIO_EXECUTIVO) throw new Error('O relatório de ' + d.para + ' é grande demais para compartilhar.');
    lote.set(_db.collection(COLLECTION.relatoriosCompartilhados).doc(), {
      edicaoId: String(c.edicaoId), tipo: c.tipo, titulo: String(c.titulo || ''), geradoEm: String(c.geradoEm || ''),
      para: String(d.para || '').toLowerCase(), area: String(d.area || ''), mensagem: String(c.mensagem || '').slice(0, 1000),
      compartilhadoPor: por, compartilhadoEm: agora, revogado: false, abertoEm: null, conteudo,
    });
  });
  await lote.commit();
  return { success: true, total: destinos.length };
}

/** Compartilhamentos de uma edição, sem o conteúdo (para o modal de quem compartilha). */
async function _lerCompartilhamentosDaEdicao(edicaoId) {
  const snap = await _db.collection(COLLECTION.relatoriosCompartilhados).where('edicaoId', '==', String(edicaoId)).get();
  return snap.docs.map((d) => {
    const x = Object.assign({ id: d.id }, d.data());
    delete x.conteudo;
    return x;
  }).sort((a, b) => String(b.compartilhadoEm || '').localeCompare(String(a.compartilhadoEm || '')));
}

/** Os compartilhados com quem está logado. As regras exigem os dois filtros. */
async function _lerRelatoriosCompartilhadosComigo() {
  const eu = (window.USER_EMAIL || '').toLowerCase();
  const snap = await _db.collection(COLLECTION.relatoriosCompartilhados).where('para', '==', eu).where('revogado', '==', false).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => String(b.compartilhadoEm || '').localeCompare(String(a.compartilhadoEm || '')));
}

async function _revogarCompartilhamento(id) {
  await _db.collection(COLLECTION.relatoriosCompartilhados).doc(String(id)).update({
    revogado: true, revogadoEm: new Date().toISOString(), revogadoPor: (window.USER_EMAIL || '').toLowerCase(),
  });
  return { success: true };
}

async function _marcarCompartilhamentoAberto(id) {
  await _db.collection(COLLECTION.relatoriosCompartilhados).doc(String(id)).update({ abertoEm: new Date().toISOString() });
  return { success: true };
}

// Retratos diários desde `diaISO` (Relatório Executivo de Riscos: 6 ou 12
// meses, além dos 120 dias do Monitor). Admin e Segurança (firestore.rules).
async function _lerHistoricoRiscoDesde(diaISO) {
  const snap = await _db.collection(COLLECTION.historicoRisco)
    .where('dia', '>=', String(diaISO || '').slice(0, 10))
    .orderBy('dia', 'asc')
    .get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
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
        // Score maximo possivel NA EPOCA desta avaliacao -- perguntas de
        // criticidade sao cadastraveis agora; sem congelar isto aqui, uma
        // avaliacao antiga mudaria de faixa sozinha se o total de perguntas
        // mudar depois (ver fornecedor-criticidade.js).
        scoreMaximoCriticidade: Number(d.scoreMaximoCriticidade) || 0,
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

  // As leituras nao dependem uma da outra -- em paralelo, nao em serie.
  const [catalogo, criteriosVersao, perguntasCriticidade, criticidadeVersao] = await Promise.all([
    _lerCriteriosFornecedor(), _versaoCriteriosAtual(),
    _lerCriticidadeFornecedorPerguntas(), _versaoCriticidadeFornecedorAtual(),
  ]);
  const setAplicaveis = new Set(idsAplicaveis);
  const criteriosAplicaveis = catalogo.filter((c) => setAplicaveis.has(String(c.id)));
  const calc = FornecedorScore.calcular(criteriosAplicaveis, a.respostas || {});
  // Criticidade e uma aba da MESMA avaliacao, nao uma colecao separada. Assim
  // como a nota, o score vem calculado aqui — nunca aceito do que a tela
  // mandar — pela mesma razao que o score do risco e recalculado no servidor.
  // So as perguntas ATIVAS no momento entram na conta.
  const perguntasCriticidadeAtivas = perguntasCriticidade.filter((p) => p.ativa);
  const calcCrit = FornecedorCriticidade.calcular(perguntasCriticidadeAtivas, a.respostasCriticidade || {});
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
    // Congela o maximo da epoca junto do score -- ver nota em
    // _lerAvaliacoesFornecedor sobre por que isto nao pode ser recalculado
    // depois a partir das perguntas atuais.
    scoreMaximoCriticidade: calcCrit.scoreMaximo,
    completaCriticidade: calcCrit.completa,
    criticidadeVersao: criticidadeVersao,
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
    nota: calc.nota, completa: calc.completa,
    scoreCriticidade: calcCrit.score, scoreMaximoCriticidade: calcCrit.scoreMaximo, completaCriticidade: calcCrit.completa,
  };
}

// Última resposta por area||processo -> score/tier/avaliado/respostas
async function _lerRespostasIndexadas() {
  const docs = await _getAll(COLLECTION.respostas);
  docs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const porChave = {};
  const porId = {};
  docs.forEach((r) => {
    const resumo = {
      score: Number(r.score) || 0,
      tier: r.tier || '',
      avaliado: true,
      respostas: r.scores || {},
      timestamp: r.timestamp,
      respondente: r.respondente,
    };
    const key = `${r.area}||${r.processo}`;
    if (!porChave[key]) porChave[key] = resumo;
    if (r.processoId && !porId[String(r.processoId)]) porId[String(r.processoId)] = resumo;
  });
  return { porChave, porId };
}

/**
 * Chaves area||processo das respostas do BIA deste processo: a atual e as de
 * antes de renomear (nomesAnteriores). Mesma regra de
 * historicoRisco.chavesBiaDoProcesso (functions/).
 */
function _chavesBiaDoProcesso(p) {
  const chaves = [`${p.area || ''}||${p.processo || ''}`];
  (Array.isArray(p.nomesAnteriores) ? p.nomesAnteriores : []).forEach((c) => {
    if (typeof c === 'string' && c.includes('||') && !chaves.includes(c)) chaves.push(c);
  });
  return chaves;
}

/** Resposta mais recente do processo: por processoId ou por qualquer chave (nome atual ou antigo). */
function _respostaDoProcesso(d, respIdx) {
  const candidatas = _chavesBiaDoProcesso(d).map((c) => respIdx.porChave[c]);
  candidatas.push(respIdx.porId[String(d.id)]);
  return candidatas.filter(Boolean).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
}

/** bcpContatos ja foi gravado como array e como string JSON (pagina do PCN, ate 21/10/2026). */
function _listaContatos(valor) {
  let v = valor;
  if (typeof v === 'string') {
    try { v = v.trim() ? JSON.parse(v) : []; } catch (e) { v = []; }
  }
  return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').map(String) : [];
}

async function _lerProcessos() {
  const [docs, respIdx] = await Promise.all([_getAll(COLLECTION.processos), _lerRespostasIndexadas()]);
  return docs.map((d) => {
    const resp = _respostaDoProcesso(d, respIdx);
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
      // MTD e o campo do formulario; mtpd e o nome antigo (Apps Script), so
      // lido como reserva para processo que nunca foi salvo pelo drawer.
      mtd: d.mtd || d.mtpd || '',
      biaHomologada: d.biaHomologada || '',
      tier: d.tier || '',
      bcpStatus: d.bcpStatus || '',
      descricaoFuncional: d.descricaoFuncional || '',
      bcpContatos: _listaContatos(d.bcpContatos),
      drpStatus: d.drpStatus || '',
      // Campos do Apps Script sem tela desde a migracao (bcpObjetivo,
      // bcpRiscos, drpProcedimentos, workaround...) sairam da leitura e da
      // gravacao em 21/10/2026. O que ja esta no Firestore fica intocado.
      bcpPlanoBProvedores: d.bcpPlanoBProvedores || '',
      bcpSlas: d.bcpSlas || '',
      bcpPapeisCrise: d.bcpPapeisCrise || '',
      nomesAnteriores: Array.isArray(d.nomesAnteriores) ? d.nomesAnteriores : [],
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
    telefone: a.telefone || '',
    // solucao saiu da tela de Áreas, mas continua gravado quando enviado
    // (compat com dados antigos); não é mais editado pela UI.
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
    nomeFantasia: d.nomeFantasia || '',
    detalhes: d.detalhes || '',
    setor: d.setor || '',
    areas: Array.isArray(d.areas) ? d.areas.filter(Boolean) : [],
    // Perfil de Sistema (RBAC) como atributo da Pessoa -- espelho de
    // config_perfis/{email}, gravado por conveniencia de exibicao/edicao na
    // ficha dela. Quem realmente concede poder no sistema continua sendo
    // config_perfis (ver Perfis.podeGerenciarPerfis e firestore.rules).
    perfis: Array.isArray(d.perfis) ? d.perfis.filter(Boolean) : [],
    liderImediato: d.liderImediato || '',
    empresa: d.empresa || '',
    telefone: d.telefone || '',
    email: d.email || '',
    endereco: d.endereco || '',
    pessoas: Array.isArray(d.pessoas) ? d.pessoas : [],
    categoriaFornecedor: d.categoriaFornecedor || '',
    subcategoriaFornecedor: d.subcategoriaFornecedor || '',
    gestorContrato: d.gestorContrato || '',
    // Gestores do Contrato como lista de snapshots de Pessoa (nova UI). O
    // gestorContrato (string) acima é mantido espelhando o 1º, por compat.
    gestoresContrato: Array.isArray(d.gestoresContrato) ? d.gestoresContrato.map((g) => ({
      id: g.id != null ? g.id : null,
      nome: g.nome || '',
      cargo: g.cargo || '',
      telefone: g.telefone || '',
      email: g.email || '',
      area: g.area || '',
    })) : [],
    tic: d.tic !== false,
    cnpj: d.cnpj || '',
    // So usado pelas 7 categorias tecnicas -- ver _lerDependencias.
    rto: d.rto || '',
    rpo: d.rpo || '',
    estrategia: d.estrategia || '',
    responsavel: d.responsavel || '',
    drpCriteriosAcionamento: Array.isArray(d.drpCriteriosAcionamento) ? d.drpCriteriosAcionamento : [],
    drpPreRequisitos: Array.isArray(d.drpPreRequisitos) ? d.drpPreRequisitos : [],
    drpHealthCheck: Array.isArray(d.drpHealthCheck) ? d.drpHealthCheck : [],
    drpRunbook: Array.isArray(d.drpRunbook) ? d.drpRunbook : [],
    drpCriteriosRetorno: Array.isArray(d.drpCriteriosRetorno) ? d.drpCriteriosRetorno : [],
    drpLimitacoes: Array.isArray(d.drpLimitacoes) ? d.drpLimitacoes : [],
    drpDependencias: Array.isArray(d.drpDependencias) ? d.drpDependencias : [],
    drpTestes: (d.drpTestes && typeof d.drpTestes === 'object') ? {
      dataUltimoTeste: d.drpTestes.dataUltimoTeste || '',
      frequenciaEsperada: d.drpTestes.frequenciaEsperada || '',
      cenarioTestado: d.drpTestes.cenarioTestado || '',
      resultado: d.drpTestes.resultado || '',
      evidencia: d.drpTestes.evidencia || '',
      pendencias: d.drpTestes.pendencias || '',
    } : { dataUltimoTeste: '', frequenciaEsperada: '', cenarioTestado: '', resultado: '', evidencia: '', pendencias: '' },
    // Estratégias de teste (lista) e histórico de registros de teste (lista).
    drpEstrategiasTeste: Array.isArray(d.drpEstrategiasTeste) ? d.drpEstrategiasTeste.map((e) => ({
      cenario: e.cenario || '',
      frequencia: e.frequencia || '',
    })) : [],
    drpRegistrosTeste: Array.isArray(d.drpRegistrosTeste) ? d.drpRegistrosTeste.map((r) => ({
      data: r.data || '',
      resultado: r.resultado || '',
      evidencia: r.evidencia || '',
      pendencias: r.pendencias || '',
    })) : [],
    // Roteiros de Teste: metadado (categoria/versao/data/autor, sem html) só
    // repassado tal e qual -- quem grava de verdade é salvarRoteiroTeste/
    // excluirRoteiroTeste (Cloud Function), nunca o Salvar deste drawer (mesmo
    // tratamento de drpSalvo, logo abaixo).
    drpRoteirosTeste: Array.isArray(d.drpRoteirosTeste) ? d.drpRoteirosTeste : [],
    // Aba "Plano de Recuperação": template DRP importado (Markdown) e versões
    // do artefato DRP gerado (drpSalvo, mesmo formato de versões do pcnSalvo).
    drpTemplate: d.drpTemplate || '',
    drpTemplateNome: d.drpTemplateNome || '',
    drpSalvo: d.drpSalvo || '',
  };
  // Canais de suporte so entram quando vierem no payload: os campos acima sao
  // regravados sempre (ausente vira vazio), e so o drawer de Fornecedor manda
  // este -- qualquer outra tela que grave a dependencia apagaria os canais.
  // Lideranca da Pessoa (Tech Lead/Team Lead): mesma regra -- so o drawer de
  // Pessoa manda estes campos; Fornecedor/Dependencia regravam o documento e
  // nao podem zerar a lideranca de ninguem.
  if (typeof d.techLead === 'boolean' || typeof d.teamLead === 'boolean') {
    data.techLead = d.techLead === true;
    data.techLeadProdutos = data.techLead && Array.isArray(d.techLeadProdutos) ? [...new Set(d.techLeadProdutos.map(String).filter(Boolean))] : [];
    data.teamLead = d.teamLead === true;
    data.teamLeadProdutos = data.teamLead && Array.isArray(d.teamLeadProdutos) ? [...new Set(d.teamLeadProdutos.map(String).filter(Boolean))] : [];
  }
  // Gestor e setor do FORNECEDOR vem dos contratos (19/10/2026): a tela de
  // fornecedor nao envia mais esses campos, e o que nao vem no payload nao pode
  // ser zerado -- senao salvar o fornecedor apagaria o dado antigo antes da
  // migracao. gestorContrato/gestoresContrato so existem em fornecedor; o setor
  // tambem e da Pessoa (area principal) e das outras categorias, que seguem
  // gravando como antes.
  if (d.gestorContrato === undefined && d.gestoresContrato === undefined) {
    delete data.gestorContrato;
    delete data.gestoresContrato;
  }
  if (d.setor === undefined && ['Fornecedores', 'Fornecedor'].includes(d.categoria)) delete data.setor;
  if (Array.isArray(d.areasRelacionadas)) {
    data.areasRelacionadas = [...new Set(d.areasRelacionadas.map((a) => String(a || '').trim()).filter(Boolean))];
  }
  if (Array.isArray(d.pessoasRelacionadas)) {
    data.pessoasRelacionadas = d.pessoasRelacionadas
      .filter((p) => p && (p.id != null || String(p.nome || '').trim()))
      .map((p) => ({ id: p.id != null ? p.id : null, nome: String(p.nome || '').trim(), papel: String(p.papel || '').trim() }));
  }
  // Composicao de Servicos (21/10/2026): mesma regra dos canais -- so o drawer
  // de Dependencia tecnica manda estes campos; Fornecedor/Pessoa/DRP regravam
  // o documento e nao podem zerar a hierarquia nem os parametros.
  ['rtoMin', 'rpoMin', 'mttrMin'].forEach((c) => {
    if (d[c] !== undefined) data[c] = _minutosOuNull(d[c]);
  });
  if (Array.isArray(d.componentes)) {
    data.componentes = _refsDependencia(d.componentes).filter((x) => x.id !== String(d.id || ''));
  }
  // Instalações (21/10/2026): mesma regra -- so grava o que vier no payload.
  const _refOuNull = (r) => (r && r.id ? { id: String(r.id), nome: String(r.nome || '') } : null);
  if (d.tipoInstalacao !== undefined) data.tipoInstalacao = String(d.tipoInstalacao || '');
  if (d.instalacaoAlternativa !== undefined) {
    const alt = _refOuNull(d.instalacaoAlternativa);
    data.instalacaoAlternativa = alt && alt.id !== String(d.id || '') ? alt : null;
  }
  if (d.instalacao !== undefined) data.instalacao = _refOuNull(d.instalacao);
  if (Array.isArray(d.canaisSuporte)) {
    data.canaisSuporte = d.canaisSuporte.map((c) => ({
      tipo: String(c.tipo || ''),
      contato: String(c.contato || ''),
      horario: String(c.horario || ''),
      nivel: String(c.nivel || ''),
      sla: String(c.sla || ''),
      observacao: String(c.observacao || ''),
    }));
  }
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
  'reportadoPor', 'dataIdentificacao', 'status', 'origem',
  'probabilidade', 'impacto', 'impactoFinanceiro', 'impactoFinanceiroDescricao', 'score', 'prioridade',
  'estrategiaTratamento', 'estrategiaDescricao', 'planoAcao', 'kris', 'impactoFinanceiroComponentes',
  'dataUltimaReavaliacao', 'proximaReavaliacao', 'historicoReavaliacao',
  'dataEncerramento', 'justificativaEncerramento',
  // Governanca NIST (15/10/2026): aceite, risco residual e funcao do CSF 2.0.
  'justificativaAceite', 'aprovadorAceite', 'probabilidadeResidual', 'impactoResidual', 'funcaoCsf',
  // Declaracao de risco estruturada (NIST SP 800-30).
  'fonteAmeaca', 'eventoAmeaca', 'condicaoPredisponente', 'consequencia',
  // Produto de Software (20/10/2026): herdado da vulnerabilidade ou escolhido aqui.
  'produtoSoftwareId',
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
  'area', 'processo', 'descricao', 'dependencia', 'dependenciaItens', 'rto', 'rpo', 'mtd', 'biaHomologada', 'tier',
  'bcpStatus', 'descricaoFuncional', 'bcpContatos', 'drpStatus',
  'bcpPlanoBProvedores', 'bcpSlas', 'bcpPapeisCrise', 'pcnSalvo', 'tierManual', 'tierManualPor', 'tierManualEm',
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

  if (Object.prototype.hasOwnProperty.call(data, 'bcpContatos')) data.bcpContatos = _listaContatos(data.bcpContatos);

  let docId = await _acharProcessoId(p);
  if (!docId) {
    docId = _processoKey(p.area, p.processo);
  }
  const ref = _db.collection(COLLECTION.processos).doc(docId);

  // Le o documento atual quando o payload pode muda-lo de um jeito que
  // depende do que ja esta la: tier fixado a mao (quem e quando) e troca de
  // nome/area (nomesAnteriores). Sem nada disso, nao vale a ida e volta.
  let paraGravar = data;
  const mexeNoTier = Object.prototype.hasOwnProperty.call(data, 'tierManual');
  const mexeNoNome = p.id && (Object.prototype.hasOwnProperty.call(data, 'area') || Object.prototype.hasOwnProperty.call(data, 'processo'));
  if (mexeNoTier || mexeNoNome) {
    const snap = await ref.get();
    const atual = snap.exists ? snap.data() : null;
    if (mexeNoTier) paraGravar = _marcarTierManual(data, atual);
    // Renomear: respostas_bia e historico (a regra nao deixa reescrever) e
    // fica com o nome antigo. Guardar a chave antiga mantem o score do BIA.
    if (atual && atual.area && atual.processo) {
      const chaveAntiga = `${atual.area}||${atual.processo}`;
      const chaveNova = `${data.area !== undefined ? data.area : atual.area}||${data.processo !== undefined ? data.processo : atual.processo}`;
      if (chaveAntiga !== chaveNova) {
        paraGravar = { ...paraGravar, nomesAnteriores: firebase.firestore.FieldValue.arrayUnion(chaveAntiga) };
      }
    }
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
      // Liga a resposta ao processo mesmo depois de renomear (as antigas so
      // tem area+nome -- ver _chavesBiaDoProcesso).
      ...(resp.processoId ? { processoId: String(resp.processoId) } : {}),
      scores,
      score,
      tier,
      // Qual regua pontuou esta resposta. Sem isso, mudar os pesos reescreve o
      // significado de todo o historico em silencio.
      reguaVersao,
    });

    // Atualizar tier no processo. O RTO so e preenchido quando esta vazio:
    // ele pertence ao gestor, e a avaliacao nao apaga a escolha dele.
    const docId = await _acharProcessoId({ id: resp.processoId, area: resp.area, processo: resp.processo });
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
// Contratos (15/10/2026)
// ------------------------------------------------------------
// Contrato vinculado a um fornecedor (/dependencias, por id + nome de copia,
// mesmo molde de riscos.fornecedor). Tipo, indexador e status apontam por ID
// para listas configuraveis -- renomear "SaaS" nao orfaniza contrato nenhum.
// A area e o NOME (como dependencias.setor), porque e por ela que a regra
// deixa o gestor ler os contratos da propria area.
//
// Mesma posse de Fornecedores. Quem nao gerencia (gestor) so le, e so a
// propria area: a consulta TEM que filtrar por area, senao a regra recusa.

function _gerenciaContratos() {
  return Perfis.podeEditarContratos(window.USER_PERFIS || window.USER_PERFIL);
}

function _numOuNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function _lerContratos() {
  let docs;
  if (_gerenciaContratos()) {
    docs = await _getAll(COLLECTION.contratos);
  } else {
    const area = window.USER_AREA;
    if (!area) return [];
    docs = await _getPorCampo(COLLECTION.contratos, 'area', area);
  }
  return docs.map((c) => ({
    id: c.id,
    codigo: c.codigo || '',
    numero: c.numero || '',
    objeto: c.objeto || '',
    fornecedorId: c.fornecedorId || '',
    fornecedorNome: c.fornecedorNome || '',
    tipoId: c.tipoId || '',
    indexadorId: c.indexadorId || '',
    statusId: c.statusId || '',
    area: c.area || '',
    gestor: c.gestor && c.gestor.nome ? { id: c.gestor.id || null, nome: c.gestor.nome } : null,
    mesReajuste: _numOuNull(c.mesReajuste),
    renovacaoAutomatica: c.renovacaoAutomatica === true,
    cancelamentoQualquerMomento: c.cancelamentoQualquerMomento === true,
    avisoCancelamentoDias: _numOuNull(c.avisoCancelamentoDias),
    dataInicio: c.dataInicio || '',
    dataUltimaRenovacao: c.dataUltimaRenovacao || '',
    dataFim: c.dataFim || '',
    vigenciaMeses: _numOuNull(c.vigenciaMeses),
    rateado: c.rateado === true,
    valorGlobal: _numOuNull(c.valorGlobal),
    valorMensal: _numOuNull(c.valorMensal),
    documentos: Array.isArray(c.documentos)
      ? c.documentos.filter((d) => d && d.url).map((d) => ({ titulo: d.titulo || '', url: d.url }))
      : [],
    observacoes: c.observacoes || '',
    // SLA (15/10/2026): tempos em minutos. Sempre o objeto inteiro (normalizado).
    sla: ContratoCiclo.normalizarSla(c.sla),
    // O que o contrato cobre: e por aqui que o DRP de cada dependencia acha o SLA.
    dependenciasCobertas: Array.isArray(c.dependenciasCobertas)
      ? c.dependenciasCobertas.map((d) => ({ id: d.id || null, categoria: d.categoria || '', nome: d.nome || '' }))
      : [],
    // Gravados SO pela varredura diaria (varreduraDiariaContratos).
    alertas: Array.isArray(c.alertas) ? c.alertas : [],
    alertasAtualizadosEm: c.alertasAtualizadosEm || '',
    criadoEm: c.criadoEm || '',
    atualizadoEm: c.atualizadoEm || '',
  })).sort((a, b) => b.codigo.localeCompare(a.codigo, 'pt-BR'));
}

const _CAMPOS_CONTRATO = [
  'codigo', 'numero', 'objeto', 'fornecedorId', 'fornecedorNome', 'tipoId', 'indexadorId', 'statusId',
  'area', 'gestor', 'mesReajuste', 'renovacaoAutomatica', 'cancelamentoQualquerMomento', 'avisoCancelamentoDias',
  'dataInicio', 'dataUltimaRenovacao', 'dataFim', 'vigenciaMeses', 'rateado', 'valorGlobal', 'valorMensal',
  'documentos', 'observacoes', 'sla', 'dependenciasCobertas', 'dependenciasCobertasIds',
];
const _NUMERICOS_CONTRATO = ['mesReajuste', 'avisoCancelamentoDias', 'vigenciaMeses', 'valorGlobal', 'valorMensal'];

async function _salvarContrato(c) {
  const data = {};
  _CAMPOS_CONTRATO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(c, campo) && c[campo] !== undefined) data[campo] = c[campo];
  });
  _NUMERICOS_CONTRATO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) data[campo] = _numOuNull(data[campo]);
  });
  if (Object.prototype.hasOwnProperty.call(data, 'sla')) data.sla = ContratoCiclo.normalizarSla(data.sla);
  // Lista de ids derivada, para o servidor achar o contrato pelo DRP da dependencia.
  if (Object.prototype.hasOwnProperty.call(data, 'dependenciasCobertas')) {
    data.dependenciasCobertas = (Array.isArray(data.dependenciasCobertas) ? data.dependenciasCobertas : [])
      .filter((d) => d && d.id)
      .map((d) => ({ id: String(d.id), categoria: d.categoria || '', nome: d.nome || '' }));
    data.dependenciasCobertasIds = data.dependenciasCobertas.map((d) => d.id);
  }
  data.atualizadoEm = new Date().toISOString();
  data.atualizadoPor = (window.USER_EMAIL || '').toLowerCase();

  if (c.id) {
    const ref = _db.collection(COLLECTION.contratos).doc(String(c.id));
    const antes = await ref.get();
    const areaAntes = antes.exists ? (antes.data().area || '') : '';
    await ref.set(data, { merge: true });
    // Eventos guardam copia da area (a regra do gestor le por ela). Mudou a
    // area do contrato, regrava a copia -- senao o gestor novo nao ve a
    // linha do tempo e o antigo continua vendo.
    if (Object.prototype.hasOwnProperty.call(data, 'area') && data.area !== areaAntes) {
      const evs = await _db.collection(COLLECTION.eventosContrato).where('contratoId', '==', String(c.id)).get();
      if (!evs.empty) {
        const lote = _db.batch();
        evs.docs.forEach((d) => lote.set(d.ref, { area: data.area }, { merge: true }));
        await lote.commit();
      }
    }
    return { success: true, id: c.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = data.atualizadoPor;
  const ref = await _db.collection(COLLECTION.contratos).add(data);
  return { success: true, id: ref.id };
}

/** Apaga o contrato E a linha do tempo dele (evento orfao nao aparece em lugar nenhum). */
async function _excluirContrato(b) {
  const id = String(b.id);
  const evs = await _db.collection(COLLECTION.eventosContrato).where('contratoId', '==', id).get();
  const lote = _db.batch();
  evs.docs.forEach((d) => lote.delete(d.ref));
  lote.delete(_db.collection(COLLECTION.contratos).doc(id));
  await lote.commit();
  return { success: true, eventosExcluidos: evs.size };
}

async function _lerEventosContrato(params) {
  const contratoId = String((params && params.contratoId) || '');
  if (!contratoId) return [];
  let q = _db.collection(COLLECTION.eventosContrato).where('contratoId', '==', contratoId);
  if (!_gerenciaContratos()) {
    if (!window.USER_AREA) return [];
    q = q.where('area', '==', window.USER_AREA);
  }
  const snap = await q.get();
  return snap.docs.map((d) => {
    const e = d.data();
    return {
      id: d.id,
      contratoId: e.contratoId || '',
      data: e.data || '',
      tipo: e.tipo || '',
      descricao: e.descricao || '',
      valorMensalAnterior: _numOuNull(e.valorMensalAnterior),
      valorMensalNovo: _numOuNull(e.valorMensalNovo),
      dataFimNova: e.dataFimNova || '',
      automatico: e.automatico === true,
      registradoPor: e.registradoPor || '',
      registradoEm: e.registradoEm || '',
    };
  }).sort((a, b) => (b.data.localeCompare(a.data)) || (b.registradoEm.localeCompare(a.registradoEm)));
}

const _CAMPOS_EVENTO_CONTRATO = ['contratoId', 'area', 'data', 'tipo', 'descricao', 'valorMensalAnterior', 'valorMensalNovo', 'dataFimNova'];
// O que um evento pode mudar no contrato (Renovacao -> datas; Reajuste -> valor).
const _CAMPOS_CONTRATO_POR_EVENTO = ['dataUltimaRenovacao', 'dataFim', 'vigenciaMeses', 'valorMensal', 'valorGlobal', 'statusId'];

/**
 * Grava o evento e, se vier `atualizarContrato`, aplica no contrato no mesmo
 * lote -- o evento "Reajuste aplicado" e o novo valor mensal nao podem ficar
 * um sem o outro.
 */
async function _salvarEventoContrato(e) {
  if (!e.contratoId) throw new Error('Evento sem contrato.');
  const data = {};
  _CAMPOS_EVENTO_CONTRATO.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(e, campo) && e[campo] !== undefined) data[campo] = e[campo];
  });
  ['valorMensalAnterior', 'valorMensalNovo'].forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) data[campo] = _numOuNull(data[campo]);
  });
  const agora = new Date().toISOString();
  const email = (window.USER_EMAIL || '').toLowerCase();
  const lote = _db.batch();
  const ref = e.id
    ? _db.collection(COLLECTION.eventosContrato).doc(String(e.id))
    : _db.collection(COLLECTION.eventosContrato).doc();
  if (!e.id) {
    data.registradoEm = agora;
    data.registradoPor = email;
    data.automatico = false;
  }
  data.atualizadoEm = agora;
  lote.set(ref, data, { merge: true });

  const patch = {};
  if (e.atualizarContrato) {
    _CAMPOS_CONTRATO_POR_EVENTO.forEach((campo) => {
      if (Object.prototype.hasOwnProperty.call(e.atualizarContrato, campo)) patch[campo] = e.atualizarContrato[campo];
    });
    ['vigenciaMeses', 'valorMensal', 'valorGlobal'].forEach((campo) => {
      if (Object.prototype.hasOwnProperty.call(patch, campo)) patch[campo] = _numOuNull(patch[campo]);
    });
  }
  if (Object.keys(patch).length) {
    patch.atualizadoEm = agora;
    patch.atualizadoPor = email;
    lote.set(_db.collection(COLLECTION.contratos).doc(String(e.contratoId)), patch, { merge: true });
  }
  await lote.commit();
  return { success: true, id: ref.id, contratoAtualizado: Object.keys(patch).length > 0 };
}

/**
 * Listas configuraveis do contrato (tipo, indexador, status). Mesmo molde de
 * Categorias de Fornecedor: {nome, ativo, ordem}, desativar em vez de excluir
 * quando ja esta em uso. Status tem ainda a `situacao` (pre|vigente|encerrado),
 * que e o que a regra do ciclo de vida le -- nunca o nome.
 */
async function _lerListaContrato(colecao, extras) {
  const docs = await _getAll(colecao);
  return docs.map((d) => {
    const item = {
      id: d.id,
      nome: d.nome || '',
      ativo: d.ativo !== false,
      ordem: Number(d.ordem) || 0,
      criadoEm: d.criadoEm || '',
      atualizadoEm: d.atualizadoEm || '',
    };
    (extras || []).forEach((campo) => { item[campo] = d[campo] || ''; });
    return item;
  }).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function _salvarListaContrato(colecao, extras, c) {
  const nome = String(c.nome || '').trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Informe o nome.');
  const existentes = await _lerListaContrato(colecao, extras);
  const igual = existentes.find((x) => _nomeComparavel(x.nome) === _nomeComparavel(nome) && String(x.id) !== String(c.id || ''));
  if (igual) throw new Error(`Já existe "${igual.nome}".`);

  const data = { nome };
  ['ativo', 'ordem'].concat(extras || []).forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(c, campo) && c[campo] !== undefined) data[campo] = c[campo];
  });
  data.atualizadoEm = new Date().toISOString();
  if (c.id) {
    await _db.collection(colecao).doc(String(c.id)).set(data, { merge: true });
    return { success: true, id: c.id };
  }
  data.criadoEm = data.atualizadoEm;
  data.criadoPor = (window.USER_EMAIL || '').toLowerCase();
  if (data.ordem === undefined) data.ordem = Date.now();
  const ref = await _db.collection(colecao).add(data);
  return { success: true, id: ref.id };
}

// ------------------------------------------------------------
// Alertas por e-mail (16/10/2026) -- so o Admin (firestore.rules)
// ------------------------------------------------------------
// A configuracao fica em config_notificacoes/contratos; a fila de saida
// (notificacoes_email) so o servidor grava -- aqui e so leitura do log.
// O padrao do modo e "desligado": nada e enfileirado ate o Admin escolher.

const _CONFIG_NOTIFICACOES_PADRAO = {
  modo: 'desligado',
  remetenteNome: 'GRC360 · Contratos',
  responderPara: '',
  grupos: { prazos: true, renovacaoReajuste: true, resumoMensal: true },
  destinatarios: { gestor: true, area: true, operadores: true },
  // SMTP (16/10/2026: SendGrid). Usuario e senha ficam nos segredos do Firebase.
  servidor: { provedor: 'sendgrid', host: '', porta: null, remetenteEmail: '' },
};
const _PROVEDORES_SMTP = ['sendgrid', 'gmail', 'outro'];

/** Mesma normalizacao de functions/notificacoes.js normalizarConfig (servidor). */
function _servidorNotificacoes(sv) {
  const s = sv || {};
  const provedor = _PROVEDORES_SMTP.includes(s.provedor) ? s.provedor : 'sendgrid';
  const porta = Number(s.porta);
  const remetente = String(s.remetenteEmail || '').trim().toLowerCase();
  return {
    provedor,
    host: provedor === 'outro' ? String(s.host || '').trim() : '',
    porta: provedor === 'outro' && Number.isInteger(porta) && porta > 0 && porta < 65536 ? porta : null,
    remetenteEmail: remetente.endsWith(DOMINIO_CORPORATIVO) ? remetente : '',
  };
}

async function _lerConfigNotificacoes() {
  const snap = await _db.collection(COLLECTION.configNotificacoes).doc('contratos').get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const p = _CONFIG_NOTIFICACOES_PADRAO;
  const bools = (obj, padrao) => Object.fromEntries(Object.keys(padrao).map((k) => [k, typeof (obj || {})[k] === 'boolean' ? obj[k] : padrao[k]]));
  return {
    modo: ['desligado', 'simulacao', 'ativo'].includes(d.modo) ? d.modo : p.modo,
    remetenteNome: d.remetenteNome || p.remetenteNome,
    responderPara: d.responderPara || '',
    grupos: bools(d.grupos, p.grupos),
    destinatarios: bools(d.destinatarios, p.destinatarios),
    servidor: _servidorNotificacoes(d.servidor),
    atualizadoEm: d.atualizadoEm || '',
    atualizadoPor: d.atualizadoPor || '',
  };
}

async function _salvarConfigNotificacoes(c) {
  const resp = String(c.responderPara || '').trim().toLowerCase();
  if (resp && !resp.endsWith(DOMINIO_CORPORATIVO)) throw new Error('"Responder para" precisa ser um e-mail ' + DOMINIO_CORPORATIVO + '.');
  const p = _CONFIG_NOTIFICACOES_PADRAO;
  const sv = c.servidor || {};
  const remetente = String(sv.remetenteEmail || '').trim().toLowerCase();
  if (remetente && !remetente.endsWith(DOMINIO_CORPORATIVO)) throw new Error('O e-mail do remetente precisa ser ' + DOMINIO_CORPORATIVO + '.');
  if (sv.provedor === 'outro' && !String(sv.host || '').trim()) throw new Error('Informe o host do servidor SMTP.');
  const data = {
    modo: ['desligado', 'simulacao', 'ativo'].includes(c.modo) ? c.modo : 'desligado',
    remetenteNome: String(c.remetenteNome || '').trim() || p.remetenteNome,
    responderPara: resp,
    grupos: Object.fromEntries(Object.keys(p.grupos).map((k) => [k, !!(c.grupos || {})[k]])),
    destinatarios: Object.fromEntries(Object.keys(p.destinatarios).map((k) => [k, !!(c.destinatarios || {})[k]])),
    servidor: _servidorNotificacoes(sv),
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: (window.USER_EMAIL || '').toLowerCase(),
  };
  await _db.collection(COLLECTION.configNotificacoes).doc('contratos').set(data, { merge: true });
  return { success: true };
}

/** Log: os 100 e-mails mais recentes da fila (com o conteudo, para a previa). */
async function _lerNotificacoesEmail() {
  const snap = await _db.collection(COLLECTION.notificacoesEmail).orderBy('criadoEm', 'desc').limit(100).get();
  return snap.docs.map((d) => {
    const n = d.data() || {};
    return {
      id: d.id,
      tipo: n.tipo || '',
      evento: n.evento || '',
      grupo: n.grupo || '',
      contratoId: n.contratoId || '',
      contratoCodigo: n.contratoCodigo || '',
      para: n.para || '',
      motivos: Array.isArray(n.motivos) ? n.motivos : [],
      assunto: n.assunto || '',
      html: n.html || '',
      texto: n.texto || '',
      status: n.status || '',
      tentativas: Number(n.tentativas) || 0,
      erro: n.erro || '',
      criadoEm: n.criadoEm || '',
      enviadoEm: n.enviadoEm || '',
      processadoEm: n.processadoEm || '',
    };
  });
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
  getProdutosSoftware: () => _lerProdutosSoftware(),
  getSubcategoriasFornecedor: () => _lerSubcategoriasFornecedor(),
  getCriticidadeFornecedorPerguntas: () => _lerCriticidadeFornecedorPerguntas(),
  getAvaliacoesFornecedor: () => _lerAvaliacoesFornecedor(),
  getHistoricoRisco: () => _lerHistoricoRisco(),
  getHistoricoRiscoDesde: (params) => _lerHistoricoRiscoDesde(params.dia),
  getRelatoriosExecutivos: () => _lerRelatoriosExecutivos(),
  getConfigFornecedor: () => _lerConfigFornecedor(),
  getConfigVulnerabilidade: () => _lerConfigVulnerabilidade(),
  getConfigRiscos: () => _lerConfigRiscos(),
  getPerfis: () => _lerPerfis(),
  getServicos: () => _lerServicos(),
  getBackups: () => _lerBackups(),
  getFerramentasBackup: () => _lerListaContrato(COLLECTION.ferramentasBackup),
  getVulnerabilidades: () => _lerVulnerabilidades(),
  getFotosPainelVulnerabilidades: () => _lerFotosPainelVulnerabilidades(),
  getContratos: () => _lerContratos(),
  getEventosContrato: (params) => _lerEventosContrato(params),
  getTiposContrato: () => _lerListaContrato(COLLECTION.tiposContrato),
  getIndexadoresReajuste: () => _lerListaContrato(COLLECTION.indexadoresReajuste),
  getStatusContrato: () => _lerListaContrato(COLLECTION.statusContrato, ['situacao']),
  getConfigNotificacoes: () => _lerConfigNotificacoes(),
  getNotificacoesEmail: () => _lerNotificacoesEmail(),
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
  salvarProdutoSoftware: (b) => _salvarProdutoSoftware(b),
  excluirProdutoSoftware: (b) => _db.collection(COLLECTION.produtosSoftware).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarCategoriaFornecedor: (b) => _salvarCategoriaFornecedor(b),
  excluirCategoriaFornecedor: (b) => _db.collection(COLLECTION.categoriasFornecedor).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarSubcategoriaFornecedor: (b) => _salvarSubcategoriaFornecedor(b),
  excluirSubcategoriaFornecedor: (b) => _db.collection(COLLECTION.subcategoriasFornecedor).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarCriticidadeFornecedorPergunta: (b) => _salvarCriticidadeFornecedorPergunta(b),
  excluirCriticidadeFornecedorPergunta: (b) => _db.collection(COLLECTION.criticidadeFornecedorPerguntas).doc(String(b.id)).delete()
    .then(() => _subirVersaoCriticidadeFornecedor()).then((versao) => ({ success: true, criticidadeVersao: versao })),
  salvarServico: (b) => _salvarServico(b),
  excluirServico: (b) => _db.collection(COLLECTION.servicos).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarBackup: (b) => _salvarBackup(b),
  excluirBackup: (b) => _db.collection(COLLECTION.backups).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarFerramentaBackup: (b) => _salvarListaContrato(COLLECTION.ferramentasBackup, [], b),
  excluirFerramentaBackup: (b) => _db.collection(COLLECTION.ferramentasBackup).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarVulnerabilidade: (b) => _salvarVulnerabilidade(b),
  excluirVulnerabilidade: (b) => _db.collection(COLLECTION.vulnerabilidades).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarAvaliacaoFornecedor: (b) => _salvarAvaliacaoFornecedor(b),
  salvarConfigFornecedor: (b) => _salvarConfigFornecedor(b),
  salvarConfigVulnerabilidade: (b) => _salvarConfigVulnerabilidade(b),
  salvarConfigRiscos: (b) => _salvarConfigRiscos(b),
  salvarPerfilAcesso: (b) => _salvarPerfilAcesso(b),
  excluirPerfilAcesso: (b) => _db.collection(COLLECTION.configPerfis).doc(String(b.email || '').toLowerCase()).delete()
    .then(() => ({ success: true })),
  excluirIndicadorSeguranca: (b) => _db.collection(COLLECTION.indicadoresSeguranca).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarContrato: (b) => _salvarContrato(b),
  excluirContrato: (b) => _excluirContrato(b),
  salvarEventoContrato: (b) => _salvarEventoContrato(b),
  excluirEventoContrato: (b) => _db.collection(COLLECTION.eventosContrato).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarTipoContrato: (b) => _salvarListaContrato(COLLECTION.tiposContrato, [], b),
  excluirTipoContrato: (b) => _db.collection(COLLECTION.tiposContrato).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarIndexadorReajuste: (b) => _salvarListaContrato(COLLECTION.indexadoresReajuste, [], b),
  excluirIndexadorReajuste: (b) => _db.collection(COLLECTION.indexadoresReajuste).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarStatusContrato: (b) => _salvarListaContrato(COLLECTION.statusContrato, ['situacao'], b),
  excluirStatusContrato: (b) => _db.collection(COLLECTION.statusContrato).doc(String(b.id)).delete().then(() => ({ success: true })),
  salvarConfigNotificacoes: (b) => _salvarConfigNotificacoes(b),
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
    // undefined/null fora: URLSearchParams os viraria o texto "undefined".
    const limpos = Object.fromEntries(Object.entries(dados || {}).filter(([, v]) => v !== undefined && v !== null));
    const qs = new URLSearchParams({ action: acao, ...limpos });
    url += '?' + qs.toString();
  } else {
    // text/plain evita o preflight extra; o servidor faz o parse do JSON.
    opcoes.headers['Content-Type'] = 'text/plain';
    opcoes.body = JSON.stringify({ action: acao, ...(dados || {}) });
  }

  let res;
  try {
    res = await fetch(url, opcoes);
  } catch (e) {
    // fetch so rejeita sem resposta nenhuma (rede caiu, ou a plataforma cortou
    // a conexao por tempo) -- "Failed to fetch" nao diz nada a quem le.
    throw new Error('Não foi possível falar com o servidor (a conexão caiu ou a operação demorou demais). Tente de novo.');
  }
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
      const r = await _appApi('GET', 'getLevantamentoPCN', { id: params.id, area: params.area, processo: params.processo });
      _cache[cacheKey] = r;
      return r;
    }

    // obterDRP: sem cache -- o conteudo muda a cada nova versao salva, e essa
    // acao so roda quando o usuario pede pra abrir um DRP (nao e chamada com
    // frequencia a ponto de precisar de cache). O perfil e conferido no
    // servidor (ver appLogic.js); sem o perfil certo, o fetch rejeita.
    if (action === 'obterDRP') {
      return _appApi('GET', 'obterDRP', { id: params.id });
    }
    // obterRoteiroTeste: mesmo motivo de obterDRP acima -- sem cache, conteudo
    // muda a cada geracao e o perfil e conferido no servidor.
    // SLAs dos contratos que cobrem a dependencia (aba DRP). Sem cache e pelo
    // servidor: quem opera DRP (TI) nao le `contratos` direto, e o servidor
    // so devolve os campos de SLA.
    if (action === 'getSlasDependencia') {
      return _appApi('GET', 'obterSlasDependencia', { id: params.id });
    }
    if (action === 'obterRoteiroTeste') {
      return _appApi('GET', 'obterRoteiroTeste', { id: params.id });
    }
    // Leituras residuais restantes vão ao Apps Script.
    const data = await LegacyAPI.get(action, params);
    _cache[cacheKey] = data;
    return data;
  },

  invalidate(...actions) {
    _invalidateLocal(...actions);
    if (_canalCache) {
      try { _canalCache.postMessage({ actions }); } catch (e) { /* aba fechando, etc -- silencioso */ }
    }
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
      return _appApi('POST', 'salvarPCN', { id: body.id, area: body.area, processo: body.processo, html: body.pcnHtml });
    }
    if (action === 'excluirPCN') {
      return _appApi('POST', 'excluirPCN', { id: body.id, area: body.area, processo: body.processo });
    }
    if (action === 'gerarPCN') {
      return _appApi('POST', 'gerarPCN', { id: body.id });
    }
    if (action === 'gerarDRP') {
      return _appApi('POST', 'gerarDRP', { id: body.id, template: body.template });
    }
    if (action === 'salvarDRP') {
      return _appApi('POST', 'salvarDRP', { id: body.id, html: body.html, bloqueadas: body.bloqueadas || [] });
    }
    if (action === 'excluirDRP') {
      return _appApi('POST', 'excluirDRP', { id: body.id });
    }
    if (action === 'gerarRoteiroTeste') {
      return _appApi('POST', 'gerarRoteiroTeste', { id: body.id, categoria: body.categoria });
    }
    // Resumo executivo por IA dos relatorios de Vulnerabilidades/Riscos (so
    // agregados; perfil Admin/Seguranca conferido no servidor).
    if (action === 'gerarResumoExecutivo') {
      return _appApi('POST', 'gerarResumoExecutivo', { tipo: body.tipo, indicadores: body.indicadores });
    }
    // Linha do tempo do Relatório de Riscos (empresa + escopo filtrado),
    // reconstruída no servidor do livro de medições.
    if (action === 'serieRiscoPorEscopo') {
      return _appApi('POST', 'serieRiscoPorEscopo', { meses: body.meses, riscoIds: body.riscoIds === undefined ? null : body.riscoIds });
    }
    if (action === 'salvarRoteiroTeste') {
      return _appApi('POST', 'salvarRoteiroTeste', { id: body.id, categoria: body.categoria, html: body.html });
    }
    if (action === 'excluirRoteiroTeste') {
      return _appApi('POST', 'excluirRoteiroTeste', { id: body.id, categoria: body.categoria });
    }
    // E-mail de teste pela conta SMTP configurada (so Admin, conferido no servidor).
    if (action === 'enviarEmailTeste') {
      return _appApi('POST', 'enviarEmailTeste', {});
    }
    if (action === 'importarVulnerabilidadeParaRisco') {
      return _appApi('POST', 'importarVulnerabilidadeParaRisco', { id: body.id });
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
  getProdutosSoftware: () => API.get('getProdutosSoftware'),
  salvarProdutoSoftware: (p) => API.post('salvarProdutoSoftware', p)
    .then((r) => { API.invalidate('getProdutosSoftware'); return r; }),
  excluirProdutoSoftware: (id) => API.post('excluirProdutoSoftware', { id })
    .then((r) => { API.invalidate('getProdutosSoftware'); return r; }),
  getSubcategoriasFornecedor: () => API.get('getSubcategoriasFornecedor'),
  getCriticidadeFornecedorPerguntas: () => API.get('getCriticidadeFornecedorPerguntas'),
  getAvaliacoesFornecedor: () => API.get('getAvaliacoesFornecedor'),
  getHistoricoRisco: () => API.get('getHistoricoRisco'),
  getHistoricoRiscoDesde: (dia) => API.get('getHistoricoRiscoDesde', { dia }),
  getRelatoriosExecutivos: () => API.get('getRelatoriosExecutivos'),
  // Conteúdo de uma edição salva: imutável, mas lido direto (sem o cache de API.get).
  getConteudoRelatorioExecutivo: (id) => _lerConteudoRelatorioExecutivo(id),
  salvarRelatorioExecutivo: (r) => _salvarRelatorioExecutivo(r)
    .then((x) => { API.invalidate('getRelatoriosExecutivos'); return x; }),
  excluirRelatorioExecutivo: (id) => _excluirRelatorioExecutivo(id)
    .then((x) => { API.invalidate('getRelatoriosExecutivos'); return x; }),
  // Compartilhamentos: lidos sempre direto (status de abertura/revogação muda fora desta aba).
  compartilharRelatorioExecutivo: (c) => _compartilharRelatorioExecutivo(c),
  getCompartilhamentosDaEdicao: (edicaoId) => _lerCompartilhamentosDaEdicao(edicaoId),
  getRelatoriosCompartilhadosComigo: () => _lerRelatoriosCompartilhadosComigo(),
  revogarCompartilhamento: (id) => _revogarCompartilhamento(id),
  marcarCompartilhamentoAberto: (id) => _marcarCompartilhamentoAberto(id),
  getConfigFornecedor: () => API.get('getConfigFornecedor'),
  getConfigVulnerabilidade: () => API.get('getConfigVulnerabilidade'),
  getConfigRiscos: () => API.get('getConfigRiscos'),
  getPerfis: () => API.get('getPerfis'),
  salvarPerfilAcesso: (p) => API.post('salvarPerfilAcesso', p)
    .then((r) => { API.invalidate('getPerfis'); return r; }),
  excluirPerfilAcesso: (email) => API.post('excluirPerfilAcesso', { email })
    .then((r) => { API.invalidate('getPerfis'); return r; }),
  salvarConfigFornecedor: (c) => API.post('salvarConfigFornecedor', c)
    .then((r) => { API.invalidate('getConfigFornecedor'); return r; }),
  salvarConfigVulnerabilidade: (c) => API.post('salvarConfigVulnerabilidade', c)
    .then((r) => { API.invalidate('getConfigVulnerabilidade'); return r; }),
  salvarConfigRiscos: (c) => API.post('salvarConfigRiscos', c)
    .then((r) => { API.invalidate('getConfigRiscos'); return r; }),
  salvarCriterioFornecedor: (c) => API.post('salvarCriterioFornecedor', c)
    .then((r) => { API.invalidate('getCriteriosFornecedor'); return r; }),
  excluirCriterioFornecedor: (id) => API.post('excluirCriterioFornecedor', { id })
    .then((r) => { API.invalidate('getCriteriosFornecedor'); return r; }),
  salvarCategoriaFornecedor: (c) => API.post('salvarCategoriaFornecedor', c)
    .then((r) => { API.invalidate('getCategoriasFornecedor'); return r; }),
  excluirCategoriaFornecedor: (id) => API.post('excluirCategoriaFornecedor', { id })
    .then((r) => { API.invalidate('getCategoriasFornecedor'); return r; }),
  salvarSubcategoriaFornecedor: (c) => API.post('salvarSubcategoriaFornecedor', c)
    .then((r) => { API.invalidate('getSubcategoriasFornecedor'); return r; }),
  excluirSubcategoriaFornecedor: (id) => API.post('excluirSubcategoriaFornecedor', { id })
    .then((r) => { API.invalidate('getSubcategoriasFornecedor'); return r; }),
  salvarCriticidadeFornecedorPergunta: (p) => API.post('salvarCriticidadeFornecedorPergunta', p)
    .then((r) => { API.invalidate('getCriticidadeFornecedorPerguntas'); return r; }),
  excluirCriticidadeFornecedorPergunta: (id) => API.post('excluirCriticidadeFornecedorPergunta', { id })
    .then((r) => { API.invalidate('getCriticidadeFornecedorPerguntas'); return r; }),
  getServicos: () => API.get('getServicos'),
  salvarServico: (s) => API.post('salvarServico', s)
    .then((r) => { API.invalidate('getServicos'); return r; }),
  excluirServico: (id) => API.post('excluirServico', { id })
    .then((r) => { API.invalidate('getServicos'); return r; }),
  getBackups: () => API.get('getBackups'),
  salvarBackup: (b) => API.post('salvarBackup', b)
    .then((r) => { API.invalidate('getBackups'); return r; }),
  excluirBackup: (id) => API.post('excluirBackup', { id })
    .then((r) => { API.invalidate('getBackups'); return r; }),
  getFerramentasBackup: () => API.get('getFerramentasBackup'),
  salvarFerramentaBackup: (t) => API.post('salvarFerramentaBackup', t)
    .then((r) => { API.invalidate('getFerramentasBackup'); return r; }),
  excluirFerramentaBackup: (id) => API.post('excluirFerramentaBackup', { id })
    .then((r) => { API.invalidate('getFerramentasBackup'); return r; }),
  getVulnerabilidades: () => API.get('getVulnerabilidades'),
  getFotosPainelVulnerabilidades: () => API.get('getFotosPainelVulnerabilidades'),
  salvarVulnerabilidade: (v) => API.post('salvarVulnerabilidade', v)
    .then((r) => { API.invalidate('getVulnerabilidades'); return r; }),
  excluirVulnerabilidade: (id) => API.post('excluirVulnerabilidade', { id })
    .then((r) => { API.invalidate('getVulnerabilidades'); return r; }),
  salvarAvaliacaoFornecedor: (a) => API.post('salvarAvaliacaoFornecedor', a)
    .then((r) => { API.invalidate('getAvaliacoesFornecedor'); return r; }),
  salvarIndicadorSeguranca: (ind) => API.post('salvarIndicadorSeguranca', ind),
  lancarResultados: (indicadorId, entradas, arquivo) => _lancarResultados(indicadorId, entradas, arquivo)
    .then((r) => { API.invalidate('getIndicadoresSeguranca'); return r; }),
  removerLancamento: (indicadorId, mes) => _removerLancamento(indicadorId, mes)
    .then((r) => { API.invalidate('getIndicadoresSeguranca'); return r; }),
  excluirIndicadorSeguranca: (id) => API.post('excluirIndicadorSeguranca', { id }),
  getContratos: () => API.get('getContratos'),
  getSlasDependencia: (id) => API.get('getSlasDependencia', { id }),
  getConfigNotificacoes: () => API.get('getConfigNotificacoes'),
  salvarConfigNotificacoes: (c) => API.post('salvarConfigNotificacoes', c)
    .then((r) => { API.invalidate('getConfigNotificacoes'); return r; }),
  // Log sempre fresco: a fila muda pelo servidor, sem passar por esta aba.
  getNotificacoesEmail: () => { API.invalidate('getNotificacoesEmail'); return API.get('getNotificacoesEmail'); },
  enviarEmailTeste: () => API.post('enviarEmailTeste', {}),
  salvarContrato: (c) => API.post('salvarContrato', c)
    .then((r) => { API.invalidate('getContratos', 'getEventosContrato'); return r; }),
  excluirContrato: (id) => API.post('excluirContrato', { id })
    .then((r) => { API.invalidate('getContratos', 'getEventosContrato'); return r; }),
  getEventosContrato: (contratoId) => API.get('getEventosContrato', { contratoId }),
  salvarEventoContrato: (e) => API.post('salvarEventoContrato', e)
    .then((r) => { API.invalidate('getEventosContrato', 'getContratos'); return r; }),
  excluirEventoContrato: (id) => API.post('excluirEventoContrato', { id })
    .then((r) => { API.invalidate('getEventosContrato'); return r; }),
  getTiposContrato: () => API.get('getTiposContrato'),
  salvarTipoContrato: (t) => API.post('salvarTipoContrato', t)
    .then((r) => { API.invalidate('getTiposContrato'); return r; }),
  excluirTipoContrato: (id) => API.post('excluirTipoContrato', { id })
    .then((r) => { API.invalidate('getTiposContrato'); return r; }),
  getIndexadoresReajuste: () => API.get('getIndexadoresReajuste'),
  salvarIndexadorReajuste: (t) => API.post('salvarIndexadorReajuste', t)
    .then((r) => { API.invalidate('getIndexadoresReajuste'); return r; }),
  excluirIndexadorReajuste: (id) => API.post('excluirIndexadorReajuste', { id })
    .then((r) => { API.invalidate('getIndexadoresReajuste'); return r; }),
  getStatusContrato: () => API.get('getStatusContrato'),
  salvarStatusContrato: (t) => API.post('salvarStatusContrato', t)
    .then((r) => { API.invalidate('getStatusContrato'); return r; }),
  excluirStatusContrato: (id) => API.post('excluirStatusContrato', { id })
    .then((r) => { API.invalidate('getStatusContrato'); return r; }),
};

window.API = API;
