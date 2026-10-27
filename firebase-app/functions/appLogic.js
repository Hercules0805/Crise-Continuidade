/**
 * Acoes que exigem usuario logado do dominio corporativo.
 *
 * Substituem as que rodavam no Apps Script e pararam quando o acesso anonimo
 * dele foi fechado (19/09/2026): geracao de link de avaliacao, PCN e
 * levantamento. Aqui a autorizacao NAO vem da posse de um token de uso unico,
 * como em tokenLogic.js — vem da identidade do chamador, verificada pelo
 * Firebase Auth em index.js antes de qualquer handler rodar.
 *
 * O que NAO foi trazido, de proposito: o envio por e-mail. O Apps Script tinha
 * o Gmail de graca; aqui exigiria a API do Gmail com delegacao no Workspace ou
 * um servico externo de envio — decisao de infraestrutura ainda em aberto. Ate
 * la, so o modo "link" existe, e quem convida cola o link no proprio e-mail.
 *
 * Recebe o Firestore por parametro para poder ser testado com um mock.
 */

const { calcularTier, calcularRTO } = require('./tokenLogic');
const vulnerabilidadeRisco = require('./vulnerabilidadeRisco');
const vulnerabilidadeContexto = require('./vulnerabilidadeContexto');
const drpSecoes = require('./drpSecoes');
const contratoCiclo = require('./contratoCiclo');
const notificacoes = require('./notificacoes');
const transporteEmail = require('./transporteEmail');
const historicoRisco = require('./historicoRisco');
const retratoRisco = require('./retratoRisco');
const cadeiaDependencias = require('./cadeiaDependencias');
const threatIntel = require('./threatIntel');
const threatIntelServico = require('./threatIntelServico');

const COLLECTION = {
  processos: 'processos',
  tokens: 'tokens',
  respostas: 'respostas_bia',
  dependencias: 'dependencias',
  configPerfis: 'config_perfis',
  drpConteudo: 'drp_conteudo',
  roteiroConteudo: 'roteiro_conteudo',
  riscos: 'riscos',
  vulnerabilidades: 'vulnerabilidades',
  contratos: 'contratos',
  servicos: 'servicos',
  statusContrato: 'status_contrato',
};

/**
 * Perfis que podem operar o DRP gerado (gerar/salvar/excluir/abrir o
 * conteudo). Mirror de Perfis.podeOperarDRP (public/perfis.js) -- resolvido
 * aqui no servidor porque as Cloud Functions usam o Admin SDK, que ignora as
 * firestore.rules, e por isso precisam da propria checagem de perfil.
 * ANTES desta funcao, gerarDRP/salvarDRP/excluirDRP so conferiam dominio
 * (autenticar() em index.js), nunca perfil -- qualquer conta do dominio podia
 * gerar/sobrescrever/apagar o DRP de qualquer dependencia chamando a Cloud
 * Function direto, mesmo sem o botao aparecer na tela pra ela.
 */
const PERFIS_DRP = ['admin', 'seguranca', 'ti'];

/**
 * Le config_perfis do usuario: { perfis: [...normalizados], area }. Sem
 * documento, nenhum perfil (o servidor nao aplica o PERFIL_PADRAO do cliente).
 */
async function _perfilDoUsuario(db, email) {
  const snap = await db.collection(COLLECTION.configPerfis).doc(String(email || '').toLowerCase()).get();
  const d = snap.exists ? snap.data() : null;
  const brutos = d && Array.isArray(d.perfis) ? d.perfis : (d && d.perfil ? [d.perfil] : []);
  return {
    perfis: brutos.map((p) => String(p || '').trim().toLowerCase()),
    area: d && d.area ? String(d.area) : '',
  };
}

async function temAlgumPerfil(db, email, lista) {
  const { perfis } = await _perfilDoUsuario(db, email);
  return perfis.some((p) => lista.includes(p));
}

async function podeOperarDRP(db, email) {
  return temAlgumPerfil(db, email, PERFIS_DRP);
}

/**
 * Ler o DRP gerado e os roteiros de teste (obterDRP/obterRoteiroTeste): quem
 * opera o DRP mais o Operador de Processos, que monitora o DRP sem editar
 * (DECISAO 23/10/2026). Mirror de Perfis.podeVerConteudoDRP.
 */
const PERFIS_DRP_LEITURA = [...PERFIS_DRP, 'operador_processos'];

/**
 * Gerar/salvar/excluir o PCN e a edicao inline da pagina do PCN. Mirror de
 * Perfis.podeGerarPCN. ANTES (ate 23/10/2026) essas acoes so conferiam o
 * dominio -- qualquer conta podia apagar o PCN de qualquer processo chamando
 * a Cloud Function direto.
 */
const PERFIS_PCN = ['admin', 'seguranca', 'operador_processos'];

/**
 * Gerar link de questionario (avaliacao, BIA, area, levantamento): quem edita
 * processos de todas as areas; o gestor, so para a propria area.
 */
const PERFIS_LINK = ['admin', 'seguranca', 'operador_processos'];

async function _exigirPerfil(db, email, lista, msg) {
  if (!(await temAlgumPerfil(db, email, lista))) throw new AppError(msg);
}

/**
 * Perfis que podem operar Vulnerabilidades (criar/editar/excluir pela tela,
 * e importar manualmente para o Registro de Riscos). Mesma posse de
 * `/vulnerabilidades` em firestore.rules (`isAdmin() || isSeguranca()`) --
 * mais restrito que PERFIS_DRP porque TI nao opera Vulnerabilidades (nem
 * enxerga a tela, ver perfis.js TELAS[PERFIL.TI]).
 */
const PERFIS_VULNERABILIDADE = ['admin', 'seguranca'];

async function podeOperarVulnerabilidade(db, email) {
  return temAlgumPerfil(db, email, PERFIS_VULNERABILIDADE);
}

/** Mesmo recorte de Perfis.podeEditarRiscos (perfis.js, client-side). */
const PERFIS_RISCO = ['admin', 'seguranca'];

async function podeOperarRiscos(db, email) {
  return temAlgumPerfil(db, email, PERFIS_RISCO);
}

class AppError extends Error {}

/** Mesma geracao de slug e chave de processo de tokenLogic.js e api.js. */
function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
function processoKey(area, processo) {
  return `${slug(area)}__${slug(processo)}`;
}

/**
 * Prefixo por tipo de formulario, igual ao que o Apps Script gravava.
 *
 * 'drp' saiu (23/09/2026): "Componentes do Serviço" se fundiu em
 * Dependencias, e o link de BIA (bia-dependencias.html) ja cobre as 7
 * categorias tecnicas -- um link separado de DRP ficou redundante. Tokens
 * '_DRP_' ja emitidos e ainda nao usados simplesmente param de validar
 * (validarTokenDRP nao existe mais em tokenLogic.js).
 */
const PREFIXO = {
  avaliacao: '',
  area: '_AREA_',
  bia: '_BIA_',
  levantamento: '_LEV_',
};

/** Validade em dias, igual a do Apps Script. */
const VALIDADE_DIAS = {
  avaliacao: 7,
  area: 7,
  bia: 14,
  levantamento: 30,
};

const PAGINA = {
  avaliacao: 'avaliar.html',
  area: 'avaliar-area.html',
  bia: 'bia-dependencias.html',
  levantamento: 'pcn-levantamento.html',
};

function exigir(valor, nome) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new AppError(`Campo obrigatório ausente: ${nome}.`);
  }
  return String(valor).trim();
}

/**
 * Gera um link de formulario externo.
 *
 * Devolve { success, token, link }. NAO envia e-mail: o envio ficou de fora
 * enquanto a decisao de infraestrutura nao sai.
 */
async function gerarLink(db, data, ctx) {
  const tipo = exigir(data.tipo, 'tipo');
  if (!Object.prototype.hasOwnProperty.call(PREFIXO, tipo)) {
    throw new AppError(`Tipo de link desconhecido: ${tipo}.`);
  }
  const area = exigir(data.area, 'area');
  const processo = tipo === 'area' ? '' : exigir(data.processo, 'processo');

  const quem = await _perfilDoUsuario(db, ctx.email);
  const corporativo = quem.perfis.some((p) => PERFIS_LINK.includes(p));
  const gestorDaArea = quem.perfis.includes('gestor') && quem.area !== '' && quem.area === area;
  if (!corporativo && !gestorDaArea) throw new AppError('Seu perfil não pode gerar links de questionário para esta área.');

  // O campo `processo` do token carrega o prefixo — convencao herdada do Apps
  // Script e que tokenLogic.js usa para saber de que formulario o token e.
  const processoToken = tipo === 'area' ? '_AREA_' : PREFIXO[tipo] + processo;

  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_DIAS[tipo] * 24 * 60 * 60 * 1000);
  const token = ctx.novoUuid();

  await db.collection(COLLECTION.tokens).doc(token).set({
    token,
    area,
    processo: processoToken,
    email: data.email ? String(data.email).trim() : '',
    criadoEm: agora.toISOString(),
    expiraEm: expira.toISOString(),
    usado: false,
    criadoPor: ctx.email,
  });

  const link = `${ctx.baseUrl}/${PAGINA[tipo]}?token=${encodeURIComponent(token)}`;
  return { success: true, token, link, expiraEm: expira.toISOString() };
}

/**
 * Documento do processo: por id quando vier, senao por area+processo.
 *
 * O id do documento e a chave de quando o processo foi CRIADO
 * (processoKey(area, nome)). Depois de renomear, processoKey(area, nome novo)
 * nao acha mais nada -- era o que fazia "Processo não encontrado" no PCN de
 * processo renomeado (21/10/2026). Por isso o id vem primeiro; sem id, tenta
 * a chave e depois a busca por campos (docId legado ou processo renomeado).
 * Devolve { ref, snap } ou null quando nao existe.
 */
async function _acharProcesso(db, data) {
  const col = db.collection(COLLECTION.processos);
  const id = data.id === undefined || data.id === null ? '' : String(data.id).trim();
  if (id) {
    const ref = col.doc(id);
    const snap = await ref.get();
    return snap.exists ? { ref, snap } : null;
  }
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');
  const ref = col.doc(processoKey(area, processo));
  const snap = await ref.get();
  if (snap.exists) return { ref, snap };
  const q = await col.where('area', '==', area).where('processo', '==', processo).get();
  if (!q.docs.length) return null;
  const refAchado = col.doc(q.docs[0].id);
  return { ref: refAchado, snap: await refAchado.get() };
}

async function _exigirProcesso(db, data) {
  const achado = await _acharProcesso(db, data);
  if (!achado) throw new AppError('Processo não encontrado.');
  return achado;
}

/**
 * bcpContatos ja foi gravado de dois jeitos: array de ids (drawer do
 * Processo) e string JSON (pagina do PCN, ate 21/10/2026). Le os dois.
 */
function listaDeContatos(valor) {
  let v = valor;
  if (typeof v === 'string') {
    try { v = v.trim() ? JSON.parse(v) : []; } catch { v = []; }
  }
  return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').map(String) : [];
}

/** Le o levantamento de PCN gravado no processo. */
async function getLevantamentoPCN(db, data) {
  const achado = await _acharProcesso(db, data);
  if (!achado) return { success: true, levantamento: null };
  const d = achado.snap.data() || {};
  return { success: true, levantamento: d.levantamentoPCN || null };
}

/**
 * Historico do PCN limitado como o do DRP: as versoes moram (com o HTML) num
 * campo do proprio processo, e o Firestore recusa documento acima de 1 MiB.
 */
const MAX_VERSOES_PCN = 5;

/**
 * Grava uma nova versao do PCN, preservando as anteriores (ate MAX_VERSOES_PCN).
 * Salvar uma versao nova conta como revisao do plano (pcnRevisao.ultimaEm).
 */
async function salvarPCN(db, data, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_PCN, 'Seu perfil não pode alterar o PCN.');
  const html = exigir(data.html, 'html');
  const { ref, snap } = await _exigirProcesso(db, data);

  const atual = snap.data() || {};
  let versoes = [];
  try {
    versoes = atual.pcnSalvo ? JSON.parse(atual.pcnSalvo) : [];
  } catch {
    versoes = [];
  }
  if (!Array.isArray(versoes)) versoes = [];

  // Numera a partir da ultima versao (com o corte, length + 1 recomecaria).
  const ultimaVersao = versoes.length ? Number(versoes[versoes.length - 1].versao) || versoes.length : 0;
  const agora = new Date().toISOString();
  versoes.push({
    versao: ultimaVersao + 1,
    data: agora,
    autor: ctx.email,
    html,
  });
  versoes = versoes.slice(-MAX_VERSOES_PCN);

  await ref.set({
    pcnSalvo: JSON.stringify(versoes),
    pcnRevisao: { ...(atual.pcnRevisao || {}), ultimaEm: agora, revisadoPor: ctx.email },
  }, { merge: true });
  return { success: true, versao: ultimaVersao + 1, totalVersoes: versoes.length };
}

/** Apaga todas as versoes do PCN do processo. */
async function excluirPCN(db, data, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_PCN, 'Seu perfil não pode excluir o PCN.');
  const { ref } = await _exigirProcesso(db, data);
  await ref.set({ pcnSalvo: '' }, { merge: true });
  return { success: true };
}

/**
 * Score/tier de um processo: nao fica no doc, so a resposta mais recente tem.
 * Mesma regra de historicoRisco.resolverProcessosComBia: resposta com
 * processoId deste processo, ou com area+nome atual, ou com um nome antigo
 * (nomesAnteriores, gravado ao renomear).
 */
async function _scoreDoProcesso(db, p, id) {
  const col = db.collection(COLLECTION.respostas);
  const consultas = historicoRisco.chavesBiaDoProcesso(p).map((chave) => {
    const [area, processo] = chave.split('||');
    return col.where('area', '==', area).where('processo', '==', processo).get();
  });
  if (id) consultas.push(col.where('processoId', '==', String(id)).get());
  const snaps = await Promise.all(consultas);
  const docs = snaps.flatMap((s) => s.docs.map((d) => d.data()))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return docs[0] ? Number(docs[0].score) || 0 : 0;
}

/**
 * Processos que dependem de uma dependencia -- mirror server-side de
 * _processosVinculadosADependencia (public/app.js), mesmo criterio: casa por
 * dependenciaItens[].id quando existe, senao por nome (com categoria como
 * desempate quando o item legado ja tiver uma gravada).
 */
function _processosLigadosADependencia(depId, depNome, depCategoria, processos, rede) {
  // Com a rede (servicos + catalogo), pela cadeia inteira -- direto, por um
  // item acima nos componentes ou por um Servico que usa a dependencia
  // (cadeiaDependencias.js, a mesma regra do app). `_origem` diz por onde.
  if (rede) {
    return cadeiaDependencias.processosQueDependemDe(String(depId), { processos, servicos: rede.servicos, dependencias: rede.dependencias })
      .map((x) => ({ ...x.processo, _origem: x.origens.join('; ') }));
  }
  return (processos || []).filter((p) => Array.isArray(p.dependenciaItens) && p.dependenciaItens.some((item) =>
    item.id ? item.id === depId : (item.nome === depNome && (!item.categoria || item.categoria === depCategoria))
  ));
}

/** Servicos (para a cadeia); falha de leitura vira lista vazia -- fica so o vinculo direto. */
async function _lerServicos(db) {
  try {
    const snap = await db.collection(COLLECTION.servicos).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    return [];
  }
}

/**
 * Tier de um processo pra exibir no prompt do DRP: prioriza o score real (ja
 * avaliado) sobre o tier manual, e só cai em "Pendente" quando nao ha nem um
 * nem outro. calcularTier(score) sozinho (tokenLogic.js, usado por gerarPCN)
 * nao cobre isso -- ele sempre deriva de score, nunca olha tierManual nem
 * devolve "Pendente" -- e descreveria como "Suporte" um processo critico que
 * so ainda nao foi formalmente avaliado.
 */
function _tierProcessoServidor(score, tierManual) {
  if (Number(score) > 0) return calcularTier(score);
  if (tierManual) return tierManual;
  return 'Pendente';
}

/**
 * Gera um PCN completo via Gemini a partir dos dados do processo.
 *
 * Portado de bia-app/Code.gs (gerarPCN) quando o acesso anonimo do Apps
 * Script fechou (19/09/2026) e esse botao parou de funcionar. Prompt e
 * contrato de retorno identicos ao original — o app.js que consome isso
 * (gerarPCNProcesso/_buildPCNPage) nao mudou.
 */
// Limite da chamada a IA, abaixo dos 300 s da Function appApi (index.js):
// estourar aqui vira uma mensagem clara, em vez de a plataforma cortar a
// conexao e o navegador so mostrar "Failed to fetch".
const LIMITE_IA_MS = 240000;

function _erroChamadaIA(err, rotulo) {
  if (err instanceof AppError) return err;
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new AppError('A IA demorou mais de 4 minutos para responder. Tente gerar de novo.');
  }
  return new AppError('Erro ao gerar ' + rotulo + ': ' + (err && err.message));
}

const CATEGORIAS_INSTALACAO = ['Instalações', 'Instalação'];

/**
 * Instalações do processo para o PCN: as de dependenciaItens (por id, ou por
 * nome no processo legado), com tipo, endereço, pessoas lotadas (Pessoas com
 * `instalacao.id` apontando para ela) e a instalação alternativa resolvida.
 */
function _instalacoesDoProcessoPCN(p, dependencias) {
  const porId = new Map(dependencias.map((d) => [String(d.id), d]));
  const ehInst = (d) => d && CATEGORIAS_INSTALACAO.includes(d.categoria);
  let refs = Array.isArray(p.dependenciaItens) && p.dependenciaItens.length
    ? p.dependenciaItens.filter((it) => CATEGORIAS_INSTALACAO.includes(it.categoria)).map((it) => (it.id ? porId.get(String(it.id)) : dependencias.find((d) => ehInst(d) && d.nome === it.nome)) || { nome: it.nome, categoria: it.categoria })
    : String(p.dependencia || '').split(',').map((s) => s.trim()).filter(Boolean).map((nome) => dependencias.find((d) => ehInst(d) && d.nome === nome)).filter(Boolean);
  const vistos = new Set();
  refs = refs.filter((d) => { const k = d.id || d.nome; if (vistos.has(k)) return false; vistos.add(k); return true; });
  return refs.map((d) => {
    const altRef = d.instalacaoAlternativa && d.instalacaoAlternativa.id ? porId.get(String(d.instalacaoAlternativa.id)) : null;
    return {
      nome: d.nome || '',
      tipo: d.tipoInstalacao || '',
      endereco: d.endereco || '',
      pessoasLotadas: d.id ? dependencias.filter((x) => (x.categoria === 'Pessoas' || x.categoria === 'Pessoa') && x.instalacao && String(x.instalacao.id) === String(d.id)).length : 0,
      alternativa: altRef ? { nome: altRef.nome || '', tipo: altRef.tipoInstalacao || '', endereco: altRef.endereco || '' } : null,
    };
  });
}

async function gerarPCN(db, data, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_PCN, 'Seu perfil não pode gerar o PCN.');
  const id = exigir(data.id, 'id');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const snap = await db.collection(COLLECTION.processos).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');
  const p = snap.data() || {};

  const score = await _scoreDoProcesso(db, p, snap.id);
  const tier = calcularTier(score);

  const depsSnap = await db.collection(COLLECTION.dependencias).get();
  const dependencias = depsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Processo ja migrado (dependenciaItens): busca pelo id real, sem depender
  // do nome bater com o catalogo (evita a mesma ambiguidade que motivou
  // vincular por id em primeiro lugar). Processo legado: mesma busca por nome
  // de sempre. rto/rpo/estrategia/responsavel (antes so em Componentes,
  // fundido em Dependencias) entram na mesma linha -- sem secao separada.
  let depsDetalhadas;
  if (Array.isArray(p.dependenciaItens) && p.dependenciaItens.length) {
    depsDetalhadas = p.dependenciaItens.map((item) => {
      const dep = item.id ? dependencias.find((d) => d.id === item.id) : null;
      return dep
        ? { nome: dep.nome, categoria: item.categoria || dep.categoria, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes, rto: dep.rto, rpo: dep.rpo, estrategia: dep.estrategia, responsavel: dep.responsavel }
        : { nome: item.nome, categoria: item.categoria };
    });
  } else {
    const depsNomes = (p.dependencia || '').split(',').map((s) => s.trim()).filter(Boolean);
    depsDetalhadas = depsNomes.map((nome) => {
      const dep = dependencias.find((d) => d.nome === nome);
      return dep ? { nome: dep.nome, categoria: dep.categoria, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes, rto: dep.rto, rpo: dep.rpo, estrategia: dep.estrategia, responsavel: dep.responsavel } : { nome };
    });
  }

  // Processo -> Servico -> componentes (21/10/2026): o tecnico granular vem
  // pela composicao dos Servicos do processo. Os itens 'Serviços' viram secao
  // propria; o que eles usam (e os componentes abaixo) entra em Dependencias
  // Criticas com a origem, para a tabela de Estrategia Tecnica cobrir a cadeia.
  const servicos = await _lerServicos(db);
  const procComId = { ...p, id: snap.id };
  const servicosDoProc = cadeiaDependencias.servicosDoProcesso(procComId, servicos);
  depsDetalhadas = depsDetalhadas.filter((d) => !cadeiaDependencias.ehServico(d));
  const jaListados = new Set(depsDetalhadas.map((d) => String(d.nome || '').toLowerCase()));
  cadeiaDependencias.cadeiaDoProcesso({ processo: procComId, servicos, dependencias }).forEach((it) => {
    if (!it.dep || it.direta || jaListados.has(it.nome.toLowerCase())) return;
    const dep = it.dep;
    jaListados.add(it.nome.toLowerCase());
    depsDetalhadas.push({ nome: dep.nome, categoria: dep.categoria, empresa: dep.empresa, papel: dep.detalhes, rto: dep.rto, rpo: dep.rpo, estrategia: dep.estrategia, responsavel: dep.responsavel, origem: it.origens.join('; ') });
  });

  // Instalações (21/10/2026): o "P" de Premises dos 4 Ps do BIA. Para cada
  // instalação do processo: tipo, endereço, quantas pessoas estão lotadas nela
  // e a instalação alternativa (contingência) -- ou a ausência dela.
  const instalacoesPCN = _instalacoesDoProcessoPCN(p, dependencias);

  const contatosIds = listaDeContatos(p.bcpContatos);
  const contatosDetalhados = contatosIds.map((cid) => {
    const dep = dependencias.find((d) => d.id === cid);
    return dep ? { nome: dep.nome, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes } : null;
  }).filter(Boolean);

  let planoBData = {};
  try { planoBData = p.bcpPlanoBProvedores ? JSON.parse(p.bcpPlanoBProvedores) : {}; } catch { planoBData = {}; }
  let slasData = {};
  try { slasData = p.bcpSlas ? JSON.parse(p.bcpSlas) : {}; } catch { slasData = {}; }
  let papeisCrise = {};
  try { papeisCrise = p.bcpPapeisCrise ? JSON.parse(p.bcpPapeisCrise) : {}; } catch { papeisCrise = {}; }

  const prompt = `Você é o "Fortes Resiliente", um arquiteto sênior de Continuidade de Negócios e Resiliência Organizacional, com profundo conhecimento das normas ISO 22301, ISO 27031 e NIST SP 800-34.

Com base nos dados coletados abaixo, gere um Plano de Continuidade de Negócios (PCN) COMPLETO, técnico e executável, seguindo EXATAMENTE a estrutura do template abaixo.

REGRA CRÍTICA: NÃO anonimize, mascare ou oculte NENHUM dado fornecido. Telefones, e-mails, nomes de pessoas, empresas e qualquer informação pessoal devem ser reproduzidos EXATAMENTE como fornecidos. Este é um documento interno corporativo e todos os dados são autorizados para uso. Nunca substitua dados reais por "[REDACTED]", "XXX", asteriscos ou qualquer forma de mascaramento.

Onde houver dados disponíveis, preencha com informações reais. Onde não houver dados suficientes, faça inferências técnicas inteligentes baseadas no contexto do processo e preencha com recomendações profissionais (nunca deixe campos com "[Inserir...]" — sempre preencha com conteúdo real ou recomendado).

---
## DADOS COLETADOS DO PROCESSO

**Processo:** ${p.processo}
**Área:** ${p.area}
**Descrição Funcional:** ${p.descricaoFuncional || 'Não informada'}
**Score de Criticidade:** ${score} (${tier})
**RTO Esperado:** ${p.rto || 'Não definido'}
**RPO Esperado:** ${p.rpo || 'Não definido'}
**MTD (Máximo Downtime Tolerável):** ${p.mtd || 'Não definido'}
**Descrição do Impacto:** ${p.descricao || 'Não informada'}

### Dependências Críticas
${depsDetalhadas.length ? depsDetalhadas.map((d) => `- **${d.categoria || 'Outros'}:** ${d.nome}${d.empresa ? ' (' + d.empresa + ')' : ''}${d.papel ? ' — ' + d.papel : ''}${d.estrategia ? ' | Estratégia: ' + d.estrategia : ''}${d.rto ? ' | RTO: ' + d.rto : ''}${d.rpo ? ' | RPO: ' + d.rpo : ''}${d.responsavel ? ' | Responsável: ' + d.responsavel : ''}${d.origem ? ' | Ligação: ' + d.origem : ''}`).join('\n') : 'Nenhuma dependência mapeada.'}

### Serviços que suportam o processo (a tecnologia acima vem da composição deles)
${servicosDoProc.length ? servicosDoProc.map((s) => `- **${s.nome}**${s.descricao ? ' — ' + s.descricao : ''}${Number.isFinite(s.rtoMin) ? ' | RTO do serviço: ' + s.rtoMin + ' min' : ''}`).join('\n') : 'Nenhum serviço vinculado.'}

### Instalações (4 Ps do BIA — locais físicos do processo)
${instalacoesPCN.length ? instalacoesPCN.map((i) => `- **${i.nome}**${i.tipo ? ' (' + i.tipo + ')' : ''}${i.endereco ? ' — ' + i.endereco : ''} | Pessoas lotadas: ${i.pessoasLotadas} | ${i.alternativa ? 'Instalação alternativa (contingência): ' + i.alternativa.nome + (i.alternativa.tipo ? ' (' + i.alternativa.tipo + ')' : '') + (i.alternativa.endereco ? ' — ' + i.alternativa.endereco : '') : 'SEM instalação alternativa definida'}`).join('\n') : 'Nenhuma instalação mapeada.'}

### Equipe de Crise (Contatos)
${contatosDetalhados.length ? contatosDetalhados.map((d) => {
    const papel = papeisCrise[d.nome] || papeisCrise[String(contatosIds[contatosDetalhados.indexOf(d)])] || d.papel || '';
    return `- **${d.nome}** | Papel: ${papel || 'Não definido'} | Setor: ${d.setor || '-'} | Empresa: ${d.empresa || '-'} | Tel: ${d.telefone || '-'} | Email: ${d.email || '-'}`;
  }).join('\n') : 'Nenhum contato definido.'}

### Plano B de Provedores (Contingência)
${Object.keys(planoBData).length ? Object.entries(planoBData).map(([dep, cont]) => `- **${dep}:** ${cont}`).join('\n') : 'Não definido.'}

### SLAs de Fornecedores
${Object.keys(slasData).length ? Object.entries(slasData).map(([dep, sla]) => `- **${dep}:** ${sla}`).join('\n') : 'Não definido.'}

---
## TEMPLATE OBRIGATÓRIO DO PCN (siga esta estrutura exata)

# PROCESSO: [Nome do Processo]

## PARTE 1: ANÁLISE DE IMPACTO DE NEGÓCIOS (BIA)
1. Identificação do Processo (Nome, Área, Dono, Descrição Funcional)
2. Classificação de Criticidade — OBRIGATÓRIO usar EXATAMENTE estes 3 tiers com estes nomes (NÃO INVENTE OUTROS):
   - [ ] Tier 1 - Crítico: Impacto severo e imediato (score >= 12)
   - [ ] Tier 2 - Essencial: Tolera curto período de indisponibilidade (score 6-11)
   - [ ] Tier 3 - Suporte: Baixo impacto imediato (score < 6)
   Marcar com [x] o tier correto baseado no score ${score}. NÃO USE 4 tiers. NÃO USE nomes como "Importante" ou "Tolerável". São APENAS 3 tiers.
3. Matriz de Impacto da Indisponibilidade (tabela: Dimensão × Janelas 1h/4h/24h para Operacional, Reputacional, Financeiro, Legal)
4. Mapeamento de Dependências Críticas pelos 4 Ps do BIA (tabela: P × Recursos — Pessoas; Instalações; Processos e Tecnologia (processos internos, sistemas, infraestrutura, servidores, bancos de dados, APIs); Fornecedores)
5. Objetivos de Recuperação RTO e RPO (tabela: Recurso × RTO × RPO)

## PARTE 2: PLANO DE CONTINUIDADE DE NEGÓCIOS (BCP)
1. Escopo e Objetivo
2. Informações de Contato e Matriz de Responsabilidade (tabela: Nome, Papel na Crise, Setor, Telefone, E-mail)
3. Avaliação de Riscos (tabela: Evento, Probabilidade, Impacto, Estratégia de Mitigação)
4. Medidas Preventivas / Controles Existentes (tabela: Controle × Descrição)
5. Estratégia Operacional em Contingência (tabela: Atividade Afetada × Alternativa Operacional — inclua o local de contingência de cada instalação)
6. Estrutura de Governança da Crise (tabela: Papel × Responsabilidade)
7. Critérios de Ativação do BCP (lista de condições)
8. Fluxo Prioritário de Recuperação (tabela: Ordem × Recurso × RTO × RPO)
9. Plano de Comunicação da Crise (Interna, Externa, Canais, Frequência)
10. Cronograma de Testes, Exercícios e Manutenção (tabela: Atividade × Escopo × Frequência)

## PARTE 3: PLANO DE RECUPERAÇÃO DE DESASTRES (DRP)
1. Objetivo e Escopo Técnico
2. Estratégia Técnica de Recuperação (tabela: Recurso/Dependência × Estratégia × RTO × RPO × Responsável — uma linha para cada dependência crítica de categoria técnica do processo, listadas na seção "Dependências Críticas" acima)
3. Checklists de Verificação e Diagnóstico (Health Check — lista com checkboxes)
4. Fase Executiva de Recuperação / Runbook de Restore (8 passos sequenciais detalhados)
5. Critérios de Retorno à Normalidade e Reconstituição (lista com checkboxes)
6. Limitações Conhecidas da Estratégia

## PARTE 4: ANEXOS
- Modelo de Teste de Integração/API (tabela: Tipo de Teste × O que valida × Frequência)

---
## INSTRUÇÕES DE FORMATAÇÃO

- Gere o PCN em formato HTML bem estruturado e formatado para impressão.
- Use tabelas HTML com bordas para todas as matrizes.
- Use headings (h1, h2, h3) para as seções.
- Use listas (ul/ol) para itens sequenciais.
- Use checkboxes (☐ ou ☑) para checklists.
- NÃO inclua tags <html>, <head> ou <body> — retorne apenas o conteúdo interno.
- NÃO inclua texto introdutório, explicações ou comentários fora do HTML. Comece DIRETAMENTE com a primeira tag HTML (<h1> ou <div>).
- NÃO use code fences. Retorne HTML puro sem marcação markdown.
- NÃO use sintaxe markdown como **negrito** ou *itálico*. Use SOMENTE tags HTML: <strong> para negrito, <em> para itálico.
- Linguagem: Português do Brasil, técnica e direta.
- Preencha TODAS as seções com conteúdo real ou recomendações técnicas baseadas no contexto.

## REGRAS ESPECÍFICAS

- MATRIZ DE RESPONSABILIDADE: Se houver contatos fornecidos na seção "Equipe de Crise (Contatos)" acima, use os dados reais (nome, telefone, e-mail, setor) EXATAMENTE como fornecidos. Complete o "Papel na Crise" com sugestões adequadas ao contexto. Se NÃO houver contatos fornecidos, preencha apenas "Papel na Crise" e "Setor" com sugestões funcionais (ex: "Coordenador de Crise", "Líder Técnico"), deixando "Nome", "Telefone" e "E-mail" EM BRANCO — NÃO invente dados pessoais fictícios.
- INSTALAÇÕES (4 Ps): use as instalações listadas em "Instalações" na linha "Instalações" do Mapeamento de Dependências. Na Estratégia Operacional em Contingência, indique para cada instalação a instalação alternativa informada como local de contingência, com o tipo e o endereço EXATAMENTE como fornecidos, e dimensione a realocação pelo número de pessoas lotadas. Se a instalação estiver "SEM instalação alternativa definida", registre essa ausência como risco na Matriz de Riscos e recomende definir um local alternativo — NÃO invente nome nem endereço de local alternativo.
- MATRIZ DE RISCOS: Analise CADA evento de risco individualmente e atribua Probabilidade (Muito alta, Alta, Moderada, Baixa ou Muito baixa) e Impacto (Muito alto, Alto, Moderado, Baixo ou Muito baixo) — escala NIST SP 800-30 de forma REALISTA e DIFERENCIADA — NÃO use o mesmo valor para todos os riscos. Considere o contexto do processo, setor e dependências para variar as classificações. Por exemplo: falha de energia pode ser "Baixa" probabilidade mas "Crítico" impacto; erro humano pode ser "Alta" probabilidade mas "Moderado" impacto.
- ESTRATÉGIA TÉCNICA DE RECUPERAÇÃO (Parte 3, item 2): monte uma linha por dependência crítica listada em "Dependências Críticas" que seja de categoria técnica (API, Banco de Dados, Infraestrutura, Portais Web, Segurança, Servidor, Sistemas, Outros — NÃO inclua Fornecedores/Pessoas/Instalações nesta tabela). Colunas: Recurso/Dependência, Estratégia, RTO, RPO, Responsável. Onde a dependência já tiver Estratégia/RTO/RPO/Responsável informados acima, use ESSES VALORES EXATOS, palavra por palavra — não invente, não reformule. Onde faltar algum desses dados, infira um valor tecnicamente razoável a partir da categoria e do contexto do processo, do mesmo jeito que já faz pros demais campos sem dado informado.`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + ctx.geminiApiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let body;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIMITE_IA_MS),
    });
    body = await response.json();
    if (!response.ok) {
      throw new AppError('Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + response.status));
    }
  } catch (err) {
    throw _erroChamadaIA(err, 'PCN');
  }

  const content = body.candidates && body.candidates[0] && body.candidates[0].content;
  const pcnHtml = content && content.parts && content.parts[0] && content.parts[0].text;
  if (!pcnHtml) throw new AppError('Resposta vazia do Gemini.');

  return { success: true, pcn: pcnHtml, processo: p.processo, area: p.area, tier, score };
}

// ============================================================
// DRP por Dependência (aba "Plano de Recuperação").
//
// Mesmo mecanismo do PCN, mas a entidade e uma Dependencia (nao um processo):
// o artefato e gerado pelo Gemini a partir de um TEMPLATE (importado pelo
// usuario em Markdown, ou o padrao abaixo) + os Parametros DRP daquela
// dependencia, e versionado no proprio doc da dependencia (campo drpSalvo,
// mesmo formato de versoes do pcnSalvo).
// ============================================================

// Template padrao, usado quando a dependencia nao tem drpTemplate importado.
// Baseado na PARTE 3 (DRP) do template de PCN.
const TEMPLATE_DRP_PADRAO = `# PLANO DE RECUPERAÇÃO DE DESASTRES (DRP): [Nome da Dependência]

## 1. Objetivo e Escopo Técnico
- Objetivo do plano e componentes técnicos cobertos.

## 2. Estratégia de Contingência
- Modelo adotado (Backup & Restore / Cold Site / Warm Standby / Active-Passive / Active-Active), RTO, RPO e responsável.

## 3. Critérios de Acionamento do DRP
- Condições que disparam a ativação do plano.

## 4. Pré-requisitos
- O que precisa estar disponível/validado antes de iniciar a recuperação.

## 5. Checklist de Verificação e Diagnóstico (Health Check)
- Lista de verificações com checkboxes.

## 6. Fase Executiva de Recuperação (Runbook de Restore)
- Passos sequenciais numerados.

## 7. Critérios de Retorno à Normalidade
- Lista com checkboxes.

## 8. Limitações Conhecidas da Estratégia
- Restrições e riscos residuais.

## 9. Dependências
- Outras dependências das quais esta depende para se recuperar.

## 10. Testes do Procedimento
- Estratégia (tipo/cenário e frequência) e registro do último teste (data, resultado, evidência, pendências).

## 11. Impactos Operacionais nos Processos
- Processos de negócio que dependem deste recurso e o impacto operacional de sua indisponibilidade.`;

/**
 * Gera um DRP completo via Gemini a partir do template + os Parametros DRP de
 * UMA dependencia. Espelha gerarPCN (mesmo boilerplate/contrato de saida HTML),
 * so muda a entidade de origem e o prompt.
 */
// ============================================================
// SLAs CONTRATADOS (15/10/2026)
// ------------------------------------------------------------
// O DRP de uma dependencia passa a trazer os SLAs dos contratos VIGENTES que
// a cobrem -- o contrato declara as "Dependencias cobertas"
// (dependenciasCobertasIds) -- ou que sao do proprio fornecedor (a dependencia
// e um Fornecedor, ou um fornecedor esta em drpDependencias).
//
// CONFIDENCIAL: quem opera DRP (inclui TI) nao le `contratos` pelas regras,
// porque contrato tem valor. Daqui so sai o que e SLA -- codigo, objeto,
// fornecedor, fim e o objeto `sla`. Nunca valorMensal/valorGlobal.
// ============================================================
const CATEGORIAS_FORNECEDOR_DRP = ['Fornecedores', 'Fornecedor'];
const CHAVE_SECAO_SLA = 'slas contratados com fornecedores';
const ROTULO_PERIODO_SLA = { mensal: 'mês', trimestral: 'trimestre', anual: 'ano' };

function _escHtml(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _dataBRServidor(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'não informado';
}

/**
 * Contratos vigentes ligados a esta dependencia, so com os campos de SLA, e a
 * comparacao do que o fornecedor garante com o RTO/RPO exigido (da propria
 * dependencia e dos processos do BIA que dependem dela).
 */
/** Contratos VIGENTES (a situacao do status define), com o documento inteiro. Uma leitura por geracao. */
async function _contratosVigentes(db) {
  const [contSnap, statusSnap] = await Promise.all([
    db.collection(COLLECTION.contratos).get(),
    db.collection(COLLECTION.statusContrato).get(),
  ]);
  const listaStatus = statusSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  return contSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((c) => contratoCiclo.situacaoDoStatus(c.statusId, listaStatus) === contratoCiclo.SITUACAO.VIGENTE);
}

/** Acha uma dependencia do catalogo por id (ou, sem id, por nome). */
function _acharNoCatalogo(catalogo, item) {
  if (item && item.id) { const byId = (catalogo || []).find((d) => String(d.id) === String(item.id)); if (byId) return byId; }
  return (catalogo || []).find((d) => (d.nome || '') === (item && item.nome));
}

/**
 * Fornecedores ligados a esta dependencia: ela mesma (se for fornecedor) e os
 * que estao em drpDependencias. Devolve [{ id, ...fornecedor }] sem repetir.
 */
function _fornecedoresDaDependencia(depId, dep, catalogo) {
  const lista = [];
  const ja = new Set();
  const add = (d, id) => {
    // Fornecedor inativo (27/10/2026) nao entra nos contatos nem nos SLAs do DRP.
    if (!d || !CATEGORIAS_FORNECEDOR_DRP.includes(d.categoria) || d.ativo === false || ja.has(String(id))) return;
    ja.add(String(id));
    lista.push({ ...d, id });
  };
  add(dep, depId);
  (Array.isArray(dep.drpDependencias) ? dep.drpDependencias : []).forEach((item) => {
    const d = _acharNoCatalogo(catalogo, item);
    if (d) add(d, d.id);
  });
  return lista;
}

/** Contratos vigentes que cobrem a dependencia, ou que sao de um fornecedor ligado a ela. [{ c, cobre }] */
function _contratosDaDependencia(vigentes, depId, dep, catalogo) {
  const fornecedoresIds = new Set(_fornecedoresDaDependencia(depId, dep, catalogo).map((f) => String(f.id)));
  return (vigentes || [])
    .map((c) => ({
      c,
      cobre: (Array.isArray(c.dependenciasCobertasIds) ? c.dependenciasCobertasIds : []).map(String).includes(String(depId)),
      viaFornecedor: fornecedoresIds.has(String(c.fornecedorId || '')),
    }))
    .filter((x) => x.cobre || x.viaFornecedor)
    .sort((a, b) => String(a.c.codigo || '').localeCompare(String(b.c.codigo || '')));
}

async function _slasDaDependencia(db, depId, dep, catalogo, processosLigados, vigentes) {
  const lista = vigentes || await _contratosVigentes(db);

  const alvos = [{ origem: `Dependência ${dep.nome || ''}`.trim(), tipo: 'dependencia', rto: dep.rto, rpo: dep.rpo }]
    .concat((processosLigados || []).map((p) => ({
      origem: `Processo ${p.processo || ''}${p.area ? ' (' + p.area + ')' : ''}`.trim(), tipo: 'processo', rto: p.rto, rpo: p.rpo,
    })));

  const contratos = _contratosDaDependencia(lista, depId, dep, catalogo)
    .map(({ c, cobre }) => {
      const sla = contratoCiclo.normalizarSla(c.sla);
      const temSla = contratoCiclo.temSla(sla);
      return {
        codigo: c.codigo || '',
        objeto: c.objeto || '',
        fornecedorNome: c.fornecedorNome || '',
        dataFim: c.dataFim || '',
        viaCobertura: cobre,
        temSla,
        sla,
        incompatibilidades: temSla ? contratoCiclo.compararSlaComRto(sla, alvos) : [],
      };
    });
  return { contratos };
}

function _resumoAtendimentoSla(sla) {
  const fmt = contratoCiclo.formatarDuracao;
  return sla.atendimento
    .filter((a) => a.respostaMin !== null)
    .map((a) => `${a.severidade}: primeira resposta em ${fmt(a.respostaMin)}`)
    .join('; ');
}

function _disponibilidadeSla(sla) {
  if (sla.disponibilidadePct === null) return '';
  const parada = contratoCiclo.indisponibilidadePermitida(sla.disponibilidadePct, sla.disponibilidadePeriodo);
  const periodo = ROTULO_PERIODO_SLA[sla.disponibilidadePeriodo] || 'mês';
  return `${String(sla.disponibilidadePct).replace('.', ',')}% por ${periodo}`
    + (parada !== null ? ` (até ${contratoCiclo.formatarDuracao(parada) || '0 min'} de parada por ${periodo})` : '');
}

function _coberturaSla(sla) {
  return sla.cobertura === 'Outro' ? (sla.coberturaDetalhe || 'Outro') : (sla.cobertura || '');
}

/** Bloco do prompt: os SLAs como dados (a IA cita, nao inventa). */
function _slasTextoPrompt(slas) {
  if (!slas) return 'Não foi possível consultar os contratos.';
  if (!slas.contratos.length) return 'Nenhum contrato vigente cobre esta dependência.';
  const fmt = contratoCiclo.formatarDuracao;
  return slas.contratos.map((c) => {
    const s = c.sla;
    const partes = [`- ${c.codigo} — ${c.objeto} | Fornecedor: ${c.fornecedorNome || 'não informado'} | Vigente até ${_dataBRServidor(c.dataFim)}`];
    if (!c.temSla) return partes[0] + ' | SLA não cadastrado no contrato.';
    if (_coberturaSla(s)) partes.push(`Cobertura do atendimento: ${_coberturaSla(s)}`);
    const atend = _resumoAtendimentoSla(s);
    if (atend) partes.push(`Atendimento: ${atend}`);
    if (_disponibilidadeSla(s)) partes.push(`Disponibilidade: ${_disponibilidadeSla(s)}`);
    partes.push(`RTO garantido: ${fmt(s.rtoMin) || 'não garantido'}`);
    partes.push(`RPO garantido: ${fmt(s.rpoMin) || 'não garantido'}`);
    if (s.janelaManutencao) partes.push(`Janela de manutenção: ${s.janelaManutencao}`);
    if (s.penalidade) partes.push(`Penalidade/crédito: ${s.penalidade}`);
    let linha = partes.join(' | ');
    if (c.incompatibilidades.length) {
      linha += '\n  Incompatibilidades SLA × RTO: ' + c.incompatibilidades.map((i) => i.rotulo).join('; ');
    }
    return linha;
  }).join('\n');
}

/** Secao montada pelo sistema (sempre regravada com o dado atual do contrato). */
function _htmlSecaoSlas(slas) {
  const fmt = contratoCiclo.formatarDuracao;
  const th = 'style="border:1px solid #ccc;padding:6px 8px;background:#f5f5f5;text-align:left;"';
  const td = 'style="border:1px solid #ccc;padding:6px 8px;"';
  const tabela = 'style="border-collapse:collapse;width:100%;margin:6px 0 12px;"';
  let corpo;
  if (!slas) {
    corpo = '<p>Não foi possível consultar os contratos ao gerar este documento.</p>';
  } else if (!slas.contratos.length) {
    corpo = '<p>Nenhum contrato vigente cobre esta dependência. Sem SLA contratado, o tempo de recuperação depende só dos recursos internos.</p>';
  } else {
    corpo = slas.contratos.map((c) => {
      const s = c.sla;
      const titulo = `<h3>${_escHtml(c.codigo)} — ${_escHtml(c.objeto)}</h3>`
        + `<p>Fornecedor: <strong>${_escHtml(c.fornecedorNome || 'não informado')}</strong> · Vigente até ${_escHtml(_dataBRServidor(c.dataFim))}`
        + `${c.viaCobertura ? '' : ' · vinculado pelo fornecedor'}</p>`;
      if (!c.temSla) return titulo + '<p><em>SLA não cadastrado no contrato.</em></p>';
      const linhas = [
        ['Cobertura do atendimento', _coberturaSla(s)],
        ['Disponibilidade', _disponibilidadeSla(s)],
        ['RTO garantido', fmt(s.rtoMin) || 'Não garantido'],
        ['RPO garantido', fmt(s.rpoMin) || 'Não garantido'],
        ['Janela de manutenção', s.janelaManutencao],
        ['Penalidade / crédito', s.penalidade],
      ].filter(([, v]) => v);
      const resumo = `<table ${tabela}><tbody>${linhas.map(([k, v]) => `<tr><th ${th}>${_escHtml(k)}</th><td ${td}>${_escHtml(v)}</td></tr>`).join('')}</tbody></table>`;
      const atend = s.atendimento.filter((a) => a.respostaMin !== null);
      const tabAtend = atend.length
        ? `<table ${tabela}><thead><tr><th ${th}>Severidade</th><th ${th}>Primeira resposta</th></tr></thead><tbody>`
          + atend.map((a) => `<tr><td ${td}>${_escHtml(a.severidade)}</td><td ${td}>${_escHtml(fmt(a.respostaMin))}</td></tr>`).join('')
          + '</tbody></table>'
        : '';
      const incomp = c.incompatibilidades.length
        ? `<p><strong>⚠️ Incompatibilidades com o RTO/RPO exigido:</strong></p><ul>${c.incompatibilidades.map((i) => `<li>${_escHtml(i.rotulo)}</li>`).join('')}</ul>`
        : '<p>✅ O SLA contratado atende ao RTO/RPO exigido pela dependência e pelos processos ligados a ela.</p>';
      return titulo + resumo + tabAtend + incomp;
    }).join('');
  }
  return `<h2>SLAs Contratados com Fornecedores</h2>\n`
    + '<p><em>Seção mantida pelo sistema a partir dos contratos vigentes; é atualizada a cada geração.</em></p>\n'
    + corpo + '\n';
}

/** Leitura para a aba DRP da dependencia: os mesmos SLAs que entram no DRP. */
async function obterSlasDependencia(db, query, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode acessar o DRP.');
  const id = exigir(query.id, 'id');
  const snap = await db.collection(COLLECTION.dependencias).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');
  const dep = snap.data() || {};
  const [catSnap, procSnap] = await Promise.all([
    db.collection(COLLECTION.dependencias).get(),
    db.collection(COLLECTION.processos).get(),
  ]);
  const catalogo = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const processos = procSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const servicos = await _lerServicos(db);
  const ligados = _processosLigadosADependencia(String(id), dep.nome, dep.categoria, processos, { servicos, dependencias: catalogo });
  const slas = await _slasDaDependencia(db, String(id), dep, catalogo, ligados);
  return { success: true, ...slas };
}

async function gerarDRP(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const snap = await db.collection(COLLECTION.dependencias).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');
  const dep = snap.data() || {};

  const template = String(data.template || dep.drpTemplate || TEMPLATE_DRP_PADRAO);

  const lista = (arr) => (Array.isArray(arr) && arr.length)
    ? arr.map((x, i) => `${i + 1}. ${x}`).join('\n')
    : 'Não informado.';
  const t = (dep.drpTestes && typeof dep.drpTestes === 'object') ? dep.drpTestes : {};
  const deps = Array.isArray(dep.drpDependencias) ? dep.drpDependencias : [];

  // ---- Contatos reais para a seção "Contatos de Contingência" ----
  // Antes, o prompt não mandava nenhum contato, então a IA inventava a coluna
  // Canal/Informação. Aqui reunimos contatos de TODAS as fontes disponíveis:
  // a própria dependência, a Área responsável (email/telefone) e cada
  // dependência vinculada (telefone/email + pessoas/contatos + gestores do
  // contrato, quando for fornecedor).
  const contatos = [];
  const _pushContato = (c) => {
    if (!c) return;
    const temAlgo = c.telefone || c.email;
    if (!temAlgo) return; // só entra quem tem canal real (telefone/e-mail)
    contatos.push({
      nome: c.nome || '',
      origem: c.origem || '',
      finalidade: c.finalidade || '',
      telefone: c.telefone || '',
      email: c.email || '',
    });
  };

  // Catálogo de dependências (uma leitura) para resolver as vinculadas.
  let catalogo = [];
  try {
    const catSnap = await db.collection(COLLECTION.dependencias).get();
    catalogo = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) { catalogo = []; }
  const acharDep = (item) => {
    if (item && item.id) { const byId = catalogo.find((d) => String(d.id) === String(item.id)); if (byId) return byId; }
    return catalogo.find((d) => (d.nome || '') === (item && item.nome));
  };

  // Contato da própria dependência (ex.: fornecedor com telefone/e-mail).
  _pushContato({ nome: dep.nome, origem: dep.categoria, finalidade: 'Contato direto desta dependência', telefone: dep.telefone, email: dep.email });
  (Array.isArray(dep.pessoas) ? dep.pessoas : []).forEach((p) =>
    _pushContato({ nome: p.nome, origem: dep.nome, finalidade: p.cargo || 'Contato', telefone: p.telefone, email: p.email }));

  // Área responsável -> email/telefone (que vêm da Pessoa responsável).
  if (dep.responsavel) {
    try {
      const areasSnap = await db.collection('areas').get();
      const area = areasSnap.docs.map((d) => d.data() || {}).find((a) => (a.nome || '') === dep.responsavel);
      if (area) _pushContato({ nome: area.responsavel || area.nome, origem: area.nome || dep.responsavel, finalidade: 'Área responsável', telefone: area.telefone, email: area.email });
    } catch (e) { /* área é best-effort */ }
  }

  // Dependências vinculadas -> contato próprio + pessoas + gestores.
  deps.forEach((item) => {
    const d = acharDep(item);
    if (!d) return;
    _pushContato({ nome: d.nome, origem: d.categoria, finalidade: 'Dependência vinculada', telefone: d.telefone, email: d.email });
    (Array.isArray(d.pessoas) ? d.pessoas : []).forEach((p) =>
      _pushContato({ nome: p.nome, origem: d.nome, finalidade: p.cargo || 'Contato', telefone: p.telefone, email: p.email }));
  });

  // Gestores dos contratos VIGENTES e pessoas relacionadas ao fornecedor
  // (19/10/2026). O gestor do contrato nao e mais digitado no fornecedor: vem do
  // contrato, e telefone/e-mail/cargo vem do cadastro da Pessoa. So contrato
  // vigente (o encerrado nao tem gestor a acionar). So contato -- nunca valor.
  let contratosVigentes;
  try {
    contratosVigentes = await _contratosVigentes(db);
  } catch (e) {
    console.error('gerarDRP: contratos nao carregaram; DRP segue sem os gestores dos contratos', e);
  }
  const pessoaDoCadastro = (pid) => (pid != null ? catalogo.find((x) => String(x.id) === String(pid) && x.categoria === 'Pessoas') : null);
  _contratosDaDependencia(contratosVigentes, String(id), dep, catalogo).forEach(({ c }) => {
    const p = pessoaDoCadastro(c.gestor && c.gestor.id);
    if (!p) return;
    _pushContato({
      nome: p.nome, origem: c.area || c.fornecedorNome || dep.nome,
      finalidade: `Gestor do contrato ${c.codigo || ''}`.trim() + (p.detalhes ? ' — ' + p.detalhes : ''),
      telefone: p.telefone, email: p.email,
    });
  });
  _fornecedoresDaDependencia(String(id), dep, catalogo).forEach((f) => {
    (Array.isArray(f.pessoasRelacionadas) ? f.pessoasRelacionadas : []).forEach((r) => {
      const p = pessoaDoCadastro(r.id);
      if (!p) return;
      _pushContato({
        nome: p.nome, origem: f.nome,
        finalidade: (r.papel || 'Pessoa relacionada') + (p.detalhes ? ' — ' + p.detalhes : ''),
        telefone: p.telefone, email: p.email,
      });
    });
  });

  // Deduplica por nome+telefone+email.
  const vistos = new Set();
  const contatosUnicos = contatos.filter((c) => {
    const chave = `${c.nome}|${c.telefone}|${c.email}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  const contatosTexto = contatosUnicos.length
    ? contatosUnicos.map((c) => `- ${c.nome || 'Contato'}${c.origem ? ' (' + c.origem + ')' : ''}${c.finalidade ? ' — ' + c.finalidade : ''} | Telefone: ${c.telefone || '—'} | E-mail: ${c.email || '—'}`).join('\n')
    : 'Nenhum contato com telefone/e-mail cadastrado na base para esta dependência.';

  // ---- Canais de suporte dos fornecedores (cadastro do Fornecedor) ----
  // Da própria dependência e das vinculadas. Ordenados por nível (N1 antes de
  // N2...) dentro de cada fornecedor, que é a ordem de escalonamento.
  const ORDEM_NIVEL = { N1: 1, N2: 2, N3: 3, 'Emergência': 4 };
  const canais = [];
  const _pushCanais = (d) => {
    if (!d || !Array.isArray(d.canaisSuporte)) return;
    d.canaisSuporte
      .filter((c) => c && c.contato)
      .slice()
      .sort((a, b) => (ORDEM_NIVEL[a.nivel] || 9) - (ORDEM_NIVEL[b.nivel] || 9))
      .forEach((c) => canais.push(`- ${d.nome || 'Fornecedor'} — ${c.tipo || 'Canal'} | Contato: ${c.contato}`
        + ` | Horário: ${c.horario || 'não informado'} | Nível: ${c.nivel || 'não informado'}`
        + ` | SLA: ${c.sla || 'não informado'}${c.observacao ? ' | Obs.: ' + c.observacao : ''}`));
  };
  _pushCanais(dep);
  const _depsVistas = new Set([String(id)]);
  deps.forEach((item) => {
    const d = acharDep(item);
    if (!d || _depsVistas.has(String(d.id))) return;
    _depsVistas.add(String(d.id));
    _pushCanais(d);
  });
  const canaisTexto = canais.length
    ? canais.join('\n')
    : 'Nenhum canal de suporte cadastrado para os fornecedores vinculados.';

  // ---- Processos de Negócio impactados (seção "Impactos Operacionais nos Processos") ----
  let processosLigados = [];
  try {
    const procSnap = await db.collection(COLLECTION.processos).get();
    const todosProcessos = procSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const servicos = await _lerServicos(db);
    processosLigados = _processosLigadosADependencia(String(id), dep.nome, dep.categoria, todosProcessos, catalogo.length ? { servicos, dependencias: catalogo } : null);
  } catch (e) { processosLigados = []; }

  const processosComTier = await Promise.all(processosLigados.map(async (p) => {
    const score = await _scoreDoProcesso(db, p, p.id);
    return { ...p, tier: _tierProcessoServidor(score, p.tierManual) };
  }));
  // SLAs dos contratos vigentes (secao propria + contexto do prompt). Falha
  // na leitura nao derruba o DRP: a secao diz que nao deu para consultar.
  let slas = null;
  try {
    slas = await _slasDaDependencia(db, String(id), dep, catalogo, processosLigados, contratosVigentes);
  } catch (e) {
    console.error('gerarDRP: falha ao ler os SLAs dos contratos', e);
  }
  const slasTexto = _slasTextoPrompt(slas);

  const processosImpactadosTexto = processosComTier.length
    ? processosComTier.map((p) => `- ${p.processo} (${p.area || 'Área não informada'}) — ${p.tier}${p._origem ? ' | Ligação: ' + p._origem : ''}${p.descricao ? ' | Impacto: ' + p.descricao : ''}`).join('\n')
    : 'Nenhum processo de negócio vinculado a esta dependência na base.';

  // Estratégias de teste (lista nova) com fallback ao drpTestes antigo.
  let estrategiasTeste = Array.isArray(dep.drpEstrategiasTeste) ? dep.drpEstrategiasTeste : [];
  if (!estrategiasTeste.length && (t.cenarioTestado || t.frequenciaEsperada)) {
    estrategiasTeste = [{ cenario: t.cenarioTestado || '', frequencia: t.frequenciaEsperada || '' }];
  }
  const estrategiasTexto = estrategiasTeste.length
    ? estrategiasTeste.map((e, i) => `${i + 1}. Cenário: ${e.cenario || 'Não informado'} | Frequência: ${e.frequencia || 'Não informada'}`).join('\n')
    : 'Não informado.';

  // Histórico de registros de teste (lista nova) com fallback ao drpTestes antigo.
  let registrosTeste = Array.isArray(dep.drpRegistrosTeste) ? dep.drpRegistrosTeste : [];
  if (!registrosTeste.length && (t.dataUltimoTeste || t.resultado || t.evidencia || t.pendencias)) {
    registrosTeste = [{ data: t.dataUltimoTeste || '', resultado: t.resultado || '', evidencia: t.evidencia || '', pendencias: t.pendencias || '' }];
  }
  const registrosTexto = registrosTeste.length
    ? registrosTeste.map((r) => `- Data: ${r.data || 'Não informada'} | Resultado: ${r.resultado || 'Não informado'} | Evidência: ${r.evidencia || 'Não informada'} | Pendências: ${r.pendencias || 'Não informadas'}`).join('\n')
    : 'Nenhum registro de teste.';

  // Cadeado por secao: a ultima versao diz quais secoes o humano ajustou.
  // Sem try/catch de proposito -- falhar a leitura e seguir sem o cadeado
  // apagaria justamente o ajuste humano.
  const conteudoSnap = await db.collection(COLLECTION.drpConteudo).doc(String(id)).get();
  const versoesAnteriores = conteudoSnap.exists && Array.isArray((conteudoSnap.data() || {}).versoes)
    ? conteudoSnap.data().versoes : [];
  const ultima = versoesAnteriores[versoesAnteriores.length - 1];
  const travadasAnteriores = (ultima && ultima.html && Array.isArray(ultima.bloqueadas)) ? ultima.bloqueadas : [];
  const secoesTravadas = travadasAnteriores.length ? drpSecoes.secoesBloqueadas(ultima.html, travadasAnteriores) : [];

  // Contexto (opcao A): as secoes travadas vao no prompt para a IA escrever
  // as outras coerentes com elas. A preservacao em si nao depende disto --
  // e garantida pela mescla depois da resposta (opcao B).
  const blocoSecoesTravadas = secoesTravadas.length ? `
---
## SEÇÕES JÁ REVISADAS POR UMA PESSOA (serão mantidas como estão)

As seções abaixo foram ajustadas manualmente e entram no documento final exatamente como estão — o sistema as insere, você não precisa reescrevê-las.
${secoesTravadas.map((s) => s.html).join('\n\n')}
` : '';
  const regraSecoesTravadas = secoesTravadas.length ? `
- SEÇÕES JÁ REVISADAS: para cada seção listada em "SEÇÕES JÁ REVISADAS POR UMA PESSOA", escreva apenas o título <h2> exatamente igual ao de lá, seguido de <p>(seção mantida)</p> — não reescreva o conteúdo. Nas DEMAIS seções, use as revisadas como referência: mantenha coerência com elas (termos, passos, responsáveis, decisões) e não as contradiga. Exceção: se um dado dos parâmetros acima (RTO, RPO, responsável, contatos, processos) divergir do que está numa seção revisada, use nas demais seções o dado dos parâmetros, que é o atual.` : '';

  const prompt = `Você é o "Fortes Resiliente", um arquiteto sênior de Continuidade de Negócios e Resiliência Organizacional, com profundo conhecimento das normas ISO 22301, ISO 27031 e NIST SP 800-34.

Com base nos dados coletados abaixo, gere um Plano de Recuperação de Desastres (DRP) COMPLETO, técnico e executável para a dependência informada, seguindo EXATAMENTE a estrutura do TEMPLATE fornecido.

REGRA CRÍTICA: NÃO anonimize, mascare ou oculte NENHUM dado fornecido. Reproduza nomes, responsáveis e valores EXATAMENTE como fornecidos. Este é um documento interno corporativo. Nunca use "[REDACTED]", "XXX" ou máscaras.

Onde houver dados disponíveis, preencha com informações reais. Onde não houver dados suficientes, faça inferências técnicas inteligentes com base no contexto da dependência (nunca deixe "[Inserir...]" — sempre preencha com conteúdo real ou recomendado).

---
## DADOS COLETADOS DA DEPENDÊNCIA

**Dependência:** ${dep.nome || 'Não informada'}
**Categoria:** ${dep.categoria || 'Não informada'}
**Papel / Função:** ${dep.detalhes || 'Não informado'}
**RTO:** ${dep.rto || 'Não definido'}
**RPO:** ${dep.rpo || 'Não definido'}
**Estratégia de Contingência:** ${dep.estrategia || 'Não definida'}
**Responsável:** ${dep.responsavel || 'Não definido'}

### Critérios de Acionamento do DRP
${lista(dep.drpCriteriosAcionamento)}

### Pré-requisitos
${lista(dep.drpPreRequisitos)}

### Checklist de Verificação e Diagnóstico (Health Check)
${lista(dep.drpHealthCheck)}

### Fase Executiva de Recuperação (Runbook de Restore)
${lista(dep.drpRunbook)}

### Critérios de Retorno à Normalidade
${lista(dep.drpCriteriosRetorno)}

### Limitações Conhecidas da Estratégia
${lista(dep.drpLimitacoes)}

### Dependências
${deps.length ? deps.map((x) => `- ${x.categoria || 'Outros'}: ${x.nome}`).join('\n') : 'Não informado.'}

### Testes do Procedimento — Estratégias de Teste
${estrategiasTexto}

### Testes do Procedimento — Histórico de Registros
${registrosTexto}

### Contatos disponíveis (dados reais da base)
${contatosTexto}

### Canais de suporte dos fornecedores (dados reais da base)
${canaisTexto}

### Processos de Negócio impactados (dados reais da base)
${processosImpactadosTexto}

### SLAs contratados com fornecedores (dados reais dos contratos vigentes)
${slasTexto}
${blocoSecoesTravadas}
---
## TEMPLATE OBRIGATÓRIO DO DRP (siga esta estrutura exata)

${template}

---
## INSTRUÇÕES DE FORMATAÇÃO

- Gere o DRP em formato HTML bem estruturado e formatado para impressão.
- Use tabelas HTML com bordas para as matrizes.
- Use headings (h1, h2, h3) para as seções.
- Use listas (ul/ol) para itens sequenciais e checkboxes (☐ ou ☑) para checklists.
- NÃO inclua tags <html>, <head> ou <body> — retorne apenas o conteúdo interno.
- NÃO inclua texto introdutório, explicações ou comentários fora do HTML. Comece DIRETAMENTE com a primeira tag HTML (<h1> ou <div>).
- NÃO use code fences. Retorne HTML puro sem marcação markdown.
- NÃO use sintaxe markdown como **negrito** ou *itálico*. Use SOMENTE tags HTML: <strong> para negrito, <em> para itálico.
- Linguagem: Português do Brasil, técnica e direta.
- Onde a dependência já tiver dados (RTO/RPO/Estratégia/Responsável/listas), use ESSES VALORES EXATOS; onde faltar, infira valores tecnicamente razoáveis a partir da categoria e do contexto.
- CONTATOS DE CONTINGÊNCIA: se o template tiver uma seção/tabela de contatos (colunas como Contato, Organização/Área, Finalidade, Canal, Informação), preencha com os itens de "Contatos disponíveis (dados reais da base)" acima. A coluna "Canal" deve conter os dados REAIS de contato (telefone e/ou e-mail exatamente como fornecidos), NÃO rótulos genéricos como "Telefone" ou "Portal". NÃO invente contatos, telefones ou e-mails: use somente os que estão na lista. Se a lista disser que não há contatos cadastrados, deixe a tabela com uma única linha indicando "Contato não cadastrado na base" em vez de inventar nomes/canais.
- CANAIS DE SUPORTE DOS FORNECEDORES: inclua também, na mesma seção/tabela de contatos de contingência, cada item de "Canais de suporte dos fornecedores (dados reais da base)" — fornecedor, tipo do canal e o contato EXATAMENTE como fornecido (número, e-mail ou link), com horário, nível e SLA quando informados. Apresente-os na ordem de escalonamento (N1, N2, N3, Emergência). NÃO invente canais, números ou links que não estejam na lista; se ela disser que não há canal cadastrado, não acrescente nenhum.
- IMPACTOS OPERACIONAIS NOS PROCESSOS: a seção "Impactos Operacionais nos Processos" (ou equivalente no template) deve usar EXCLUSIVAMENTE os itens de "Processos de Negócio impactados (dados reais da base)" acima — processo, área e tier exatamente como fornecidos, descrevendo o impacto operacional de cada um com base na descrição de impacto fornecida (quando houver) e no tier (quanto mais crítico, mais grave o impacto a destacar). NÃO invente processos que não estejam na lista. Se a lista disser que não há processo vinculado, deixe a seção indicando isso claramente, sem inventar exemplos.
- SLAs CONTRATADOS: use EXCLUSIVAMENTE os valores de "SLAs contratados com fornecedores" acima, exatamente como fornecidos — não invente SLA, RTO, RPO, disponibilidade ou penalidade. Na seção de Estratégia de Contingência (RTO/RPO), cite o RTO/RPO garantido pelo fornecedor ao lado do RTO/RPO da dependência. Na seção de Limitações, inclua cada item de "Incompatibilidades SLA × RTO", literalmente, como limitação conhecida. NÃO crie uma seção chamada "SLAs Contratados com Fornecedores": o sistema a insere no documento.${regraSecoesTravadas}`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + ctx.geminiApiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let body;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIMITE_IA_MS),
    });
    body = await response.json();
    if (!response.ok) {
      throw new AppError('Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + response.status));
    }
  } catch (err) {
    throw _erroChamadaIA(err, 'DRP');
  }

  const content = body.candidates && body.candidates[0] && body.candidates[0].content;
  const drpBruto = content && content.parts && content.parts[0] && content.parts[0].text;
  if (!drpBruto) throw new AppError('Resposta vazia do Gemini.');

  // Mesma limpeza que o cliente ja fazia (texto antes do primeiro '<', code
  // fences) -- precisa vir antes da mescla, senao a cerca vira parte do
  // cabecalho/ultima secao.
  let drpHtml = drpBruto.substring(Math.max(0, drpBruto.indexOf('<')))
    .replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

  // Secoes travadas voltam identicas, por codigo -- inclusive se a IA
  // ignorar a instrucao e reescrever ou omitir alguma.
  let bloqueadas = [];
  if (travadasAnteriores.length) {
    const mescla = drpSecoes.mesclarBloqueadas(drpHtml, ultima.html, travadasAnteriores);
    drpHtml = mescla.html;
    bloqueadas = mescla.bloqueadas;
  }

  // Secao dos SLAs: montada pelo sistema e sempre regravada com o contrato
  // atual (mesmo que alguem a tenha travado) -- o contrato e a fonte da
  // verdade. Entra logo depois de "Dependencias"; sem ela, no fim.
  drpHtml = drpSecoes.substituirOuInserirSecao(drpHtml, CHAVE_SECAO_SLA, _htmlSecaoSlas(slas),
    (sec) => sec.chave === '9' || /depend/.test(sec.chave));
  bloqueadas = bloqueadas.filter((k) => k !== CHAVE_SECAO_SLA);

  return { success: true, drp: drpHtml, bloqueadas, nome: dep.nome || '', categoria: dep.categoria || '' };
}

/**
 * Grava uma nova versao do DRP. O HTML de verdade vai pra drp_conteudo
 * (colecao fechada, so Cloud Function le/escreve); dependencias.drpSalvo
 * guarda so o metadado (versao/data/autor, sem html) -- e tudo que a lista de
 * DRPs (renderDRPLista/renderDRPResumo) precisa pra mostrar contagem e data.
 */
const MAX_VERSOES_DRP = 5;

async function salvarDRP(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  const html = exigir(data.html, 'html');
  const depRef = db.collection(COLLECTION.dependencias).doc(String(id));
  const depSnap = await depRef.get();
  if (!depSnap.exists) throw new AppError('Dependência não encontrada.');

  const conteudoRef = db.collection(COLLECTION.drpConteudo).doc(String(id));
  const conteudoSnap = await conteudoRef.get();
  let versoes = [];
  if (conteudoSnap.exists && Array.isArray((conteudoSnap.data() || {}).versoes)) {
    versoes = conteudoSnap.data().versoes;
  }

  // Chaves das secoes travadas por cadeado (drpSecoes.js); so strings curtas.
  const bloqueadas = Array.isArray(data.bloqueadas)
    ? [...new Set(data.bloqueadas.map((k) => String(k).trim()).filter((k) => k && k.length <= 120))].slice(0, 50)
    : [];

  // Numera a partir da ultima versao, nao do tamanho da lista: com o corte
  // abaixo, versoes.length + 1 faria a numeracao recomecar.
  const ultimaVersao = versoes.length ? Number(versoes[versoes.length - 1].versao) || versoes.length : 0;
  versoes.push({
    versao: ultimaVersao + 1,
    data: new Date().toISOString(),
    autor: ctx.email,
    html,
    bloqueadas,
  });
  // Historico limitado: todas as versoes moram num documento so, e o
  // Firestore recusa documento acima de 1 MiB (um DRP chegou a 950 KB com 19).
  versoes = versoes.slice(-MAX_VERSOES_DRP);

  await conteudoRef.set({ versoes });
  const metadados = versoes.map((v) => ({ versao: v.versao, data: v.data, autor: v.autor }));
  // Salvar uma versao nova conta como revisao do DRP (drpRevisao.ultimaEm).
  const ultima = versoes[versoes.length - 1];
  await depRef.set({
    drpSalvo: JSON.stringify(metadados),
    drpRevisao: { ...((depSnap.data() || {}).drpRevisao || {}), ultimaEm: ultima.data, revisadoPor: ctx.email },
  }, { merge: true });

  return { success: true, versao: ultimaVersao + 1, totalVersoes: versoes.length };
}

/** Apaga todas as versoes do DRP da dependencia (metadado + conteudo). */
async function excluirDRP(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  const depRef = db.collection(COLLECTION.dependencias).doc(String(id));
  const snap = await depRef.get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');
  await depRef.set({ drpSalvo: '' }, { merge: true });
  await db.collection(COLLECTION.drpConteudo).doc(String(id)).delete();
  return { success: true };
}

/**
 * Unico jeito de ler o HTML de um DRP gerado -- confere o perfil no servidor
 * antes de devolver qualquer coisa. drp_conteudo e colecao fechada pra
 * qualquer leitura/escrita direta de cliente (ver firestore.rules); so esta
 * Cloud Function, com Admin SDK, le de la.
 */
async function obterDRP(db, query, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_DRP_LEITURA, 'Seu perfil não pode acessar o DRP.');
  const id = exigir(query.id, 'id');
  const snap = await db.collection(COLLECTION.drpConteudo).doc(String(id)).get();
  const versoes = snap.exists && Array.isArray((snap.data() || {}).versoes) ? snap.data().versoes : [];
  return { success: true, versoes };
}

// ============================================================
// Roteiro de Teste (aba "Gestão de Testes" da Dependência).
//
// Não existe uma secao "Plano de Teste" separada no DRP -- a equivalente e a
// "10. Testes do Procedimento", que so lista estrategia+frequencia+historico
// (rasa demais pra ser um roteiro executavel). Por isso o Roteiro de Teste e
// um documento NOVO, gerado por uma chamada de IA dedicada que usa o DRP ja
// gerado como contexto/base, elaborando um passo a passo pra UM tipo de teste
// especifico (categoria = um dos cenarios ja previstos em
// dep.drpEstrategiasTeste). Mesmo mecanismo de versionamento do DRP
// (roteiro_conteudo, colecao fechada, so Cloud Function le/escreve), so que
// cada versao carrega tambem a `categoria` -- um array so guarda o historico
// de TODOS os tipos de teste desta dependencia, gerar de novo pra um tipo
// acrescenta versao, nunca sobrescreve.
// ============================================================

async function gerarRoteiroTeste(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  const categoria = exigir(data.categoria, 'categoria');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const snap = await db.collection(COLLECTION.dependencias).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');
  const dep = snap.data() || {};
  if (!dep.drpSalvo) throw new AppError('Gere o DRP (aba Plano de Recuperação) antes de gerar um roteiro de teste.');

  const conteudoSnap = await db.collection(COLLECTION.drpConteudo).doc(String(id)).get();
  const versoesDRP = conteudoSnap.exists && Array.isArray((conteudoSnap.data() || {}).versoes) ? conteudoSnap.data().versoes : [];
  const drpHtml = versoesDRP.length ? versoesDRP[versoesDRP.length - 1].html : '';
  if (!drpHtml) throw new AppError('Conteúdo do DRP não encontrado.');

  const estrategiasTeste = Array.isArray(dep.drpEstrategiasTeste) ? dep.drpEstrategiasTeste : [];
  const estrategia = estrategiasTeste.find((e) => (e.cenario || '') === categoria);
  const frequencia = estrategia ? (estrategia.frequencia || 'Não definida') : 'Não definida';

  const lista = (arr) => (Array.isArray(arr) && arr.length)
    ? arr.map((x, i) => `${i + 1}. ${x}`).join('\n')
    : 'Não informado.';

  const prompt = `Você é o "Fortes Resiliente", um arquiteto sênior de Continuidade de Negócios e Resiliência Organizacional, com profundo conhecimento das normas ISO 22301, ISO 27031 e NIST SP 800-34.

Com base no DRP (Plano de Recuperação de Desastres) já gerado para a dependência abaixo e nos dados operacionais fornecidos, elabore um ROTEIRO DE TESTE completo e executável para o tipo de teste "${categoria}" (frequência prevista: ${frequencia}).

REGRA CRÍTICA: NÃO anonimize, mascare ou oculte NENHUM dado fornecido. Reproduza nomes, responsáveis e valores EXATAMENTE como fornecidos. Este é um documento interno corporativo.

Onde houver dados disponíveis, preencha com informações reais. Onde não houver dados suficientes, faça inferências técnicas inteligentes com base no contexto da dependência e do DRP abaixo (nunca deixe "[Inserir...]" — sempre preencha com conteúdo real ou recomendado).

---
## DADOS DA DEPENDÊNCIA

**Dependência:** ${dep.nome || 'Não informada'}
**Categoria:** ${dep.categoria || 'Não informada'}
**RTO:** ${dep.rto || 'Não definido'}
**RPO:** ${dep.rpo || 'Não definido'}
**Tipo de Teste a elaborar:** ${categoria}
**Frequência prevista:** ${frequencia}

### Checklist de Verificação e Diagnóstico (Health Check)
${lista(dep.drpHealthCheck)}

### Fase Executiva de Recuperação (Runbook de Restore)
${lista(dep.drpRunbook)}

### Critérios de Retorno à Normalidade
${lista(dep.drpCriteriosRetorno)}

---
## DRP JÁ GERADO PARA ESTA DEPENDÊNCIA (use como base, em especial a seção "Testes do Procedimento")

${drpHtml}

---
## ESTRUTURA OBRIGATÓRIA DO ROTEIRO DE TESTE

1. Objetivo do Teste
2. Participantes e Papéis
3. Pré-requisitos
4. Passo a Passo de Execução (numerado, detalhado, executável)
5. Critérios de Sucesso / Encerramento
6. Registro do Resultado (lembrete: registrar o resultado na aba "Gestão de Testes" do sistema após a execução)

---
## INSTRUÇÕES DE FORMATAÇÃO

- Gere o roteiro em formato HTML bem estruturado e formatado para impressão.
- Use headings (h1, h2, h3) para as seções e listas (ul/ol) para os passos.
- NÃO inclua tags <html>, <head> ou <body> — retorne apenas o conteúdo interno.
- NÃO inclua texto introdutório, explicações ou comentários fora do HTML. Comece DIRETAMENTE com a primeira tag HTML (<h1> ou <div>).
- NÃO use code fences. Retorne HTML puro sem marcação markdown.
- NÃO use sintaxe markdown como **negrito** ou *itálico*. Use SOMENTE tags HTML: <strong> para negrito, <em> para itálico.
- Linguagem: Português do Brasil, técnica e direta.`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + ctx.geminiApiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let body;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIMITE_IA_MS),
    });
    body = await response.json();
    if (!response.ok) {
      throw new AppError('Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + response.status));
    }
  } catch (err) {
    throw _erroChamadaIA(err, 'Roteiro de Teste');
  }

  const content = body.candidates && body.candidates[0] && body.candidates[0].content;
  const roteiroHtml = content && content.parts && content.parts[0] && content.parts[0].text;
  if (!roteiroHtml) throw new AppError('Resposta vazia do Gemini.');

  return { success: true, html: roteiroHtml, categoria, nome: dep.nome || '' };
}

/**
 * Grava uma nova versao do Roteiro de Teste. Mesma receita de salvarDRP: o
 * HTML vai pra roteiro_conteudo (colecao fechada), e dependencias.drpRoteirosTeste
 * guarda so o metadado (categoria/versao/data/autor, sem html) -- e tudo que a
 * tabela "Roteiros de Teste" precisa pra mostrar a lista.
 */
async function salvarRoteiroTeste(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  const categoria = exigir(data.categoria, 'categoria');
  const html = exigir(data.html, 'html');
  const depRef = db.collection(COLLECTION.dependencias).doc(String(id));
  const depSnap = await depRef.get();
  if (!depSnap.exists) throw new AppError('Dependência não encontrada.');

  const conteudoRef = db.collection(COLLECTION.roteiroConteudo).doc(String(id));
  const conteudoSnap = await conteudoRef.get();
  let versoes = [];
  if (conteudoSnap.exists && Array.isArray((conteudoSnap.data() || {}).versoes)) {
    versoes = conteudoSnap.data().versoes;
  }

  versoes.push({
    categoria,
    versao: versoes.length + 1,
    data: new Date().toISOString(),
    autor: ctx.email,
    html,
  });

  await conteudoRef.set({ versoes });
  const metadados = versoes.map((v) => ({ categoria: v.categoria, versao: v.versao, data: v.data, autor: v.autor }));
  await depRef.set({ drpRoteirosTeste: metadados }, { merge: true });

  return { success: true, versao: versoes.length, totalVersoes: versoes.length };
}

/**
 * Unico jeito de ler o HTML de Roteiros de Teste gerados -- confere o perfil
 * no servidor antes de devolver qualquer coisa (mesmo criterio de obterDRP).
 * Devolve TODAS as categorias; o cliente filtra pela que quer abrir.
 */
async function obterRoteiroTeste(db, query, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_DRP_LEITURA, 'Seu perfil não pode acessar o DRP.');
  const id = exigir(query.id, 'id');
  const snap = await db.collection(COLLECTION.roteiroConteudo).doc(String(id)).get();
  const versoes = snap.exists && Array.isArray((snap.data() || {}).versoes) ? snap.data().versoes : [];
  return { success: true, versoes };
}

/** Apaga todas as versoes de Roteiro de Teste de UMA categoria (as demais categorias desta dependencia continuam intactas). */
async function excluirRoteiroTeste(db, data, ctx) {
  if (!(await podeOperarDRP(db, ctx.email))) throw new AppError('Seu perfil não pode operar o DRP.');
  const id = exigir(data.id, 'id');
  const categoria = exigir(data.categoria, 'categoria');
  const depRef = db.collection(COLLECTION.dependencias).doc(String(id));
  const snap = await depRef.get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');

  const conteudoRef = db.collection(COLLECTION.roteiroConteudo).doc(String(id));
  const conteudoSnap = await conteudoRef.get();
  const versoes = (conteudoSnap.exists && Array.isArray((conteudoSnap.data() || {}).versoes))
    ? conteudoSnap.data().versoes.filter((v) => v.categoria !== categoria)
    : [];

  await conteudoRef.set({ versoes });
  const metadados = versoes.map((v) => ({ categoria: v.categoria, versao: v.versao, data: v.data, autor: v.autor }));
  await depRef.set({ drpRoteirosTeste: metadados }, { merge: true });

  return { success: true };
}

/**
 * Importa MANUALMENTE uma Vulnerabilidade para o Registro de Riscos --
 * disparada por um botão na tela, sem checar limiar de CVSS nem Status da
 * Correção (ao contrário do gatilho automático `riscoDeVulnerabilidade`,
 * index.js): é uma decisão explícita de quem está olhando o cadastro, por
 * isso ignora as duas condições que normalmente bloqueiam a abertura
 * automática (severidade abaixo do limiar, ou já Corrigida/Aceita).
 *
 * Mesma razão de sempre pra rodar no servidor: quem opera Vulnerabilidade
 * não tem -- nem deveria precisar ter -- acesso de escrita a /riscos
 * (firestore.rules: `match /riscos/{id} { allow write: if isAdmin(); }`).
 *
 * Ainda assim NÃO duplica: se já existe um risco automático aberto pra esta
 * vulnerabilidade, devolve `jaExiste` em vez de criar um segundo.
 */
async function importarVulnerabilidadeParaRisco(db, data, ctx) {
  if (!(await podeOperarVulnerabilidade(db, ctx.email))) throw new AppError('Seu perfil não pode operar Vulnerabilidades.');
  const id = exigir(data.id, 'id');

  const snap = await db.collection(COLLECTION.vulnerabilidades).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Vulnerabilidade não encontrada.');
  const vulnerabilidade = Object.assign({ id }, snap.data());

  const riscosSnap = await db.collection(COLLECTION.riscos).where('vulnerabilidadeId', '==', id).get();
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const abertos = vulnerabilidadeRisco.riscosAbertosDaVulnerabilidade(riscos, id);
  if (abertos.length) return { success: true, jaExiste: true };

  // Mesmo contexto do gatilho (produto, processos afetados pela cadeia do BIA),
  // para o risco importado nascer igual ao automatico.
  const contexto = await vulnerabilidadeContexto.contextoDaVulnerabilidade(db, vulnerabilidade);
  const risco = vulnerabilidadeRisco.construirRisco(vulnerabilidade, {
    manual: true, produtoNome: contexto.produtoNome, processosAfetados: contexto.processosAfetados,
  });
  const agora = new Date().toISOString();
  const novoId = ctx.novoUuid();
  await db.collection(COLLECTION.riscos).doc(novoId).set(Object.assign({}, risco, {
    criadoEm: agora,
    atualizadoEm: agora,
    criadoPor: ctx.email,
  }));
  return { success: true, id: novoId };
}

/**
 * Exporta UM risco pra Gestao de Riscos a partir de um registro exibido no
 * visualizador do DRP ou do PCN (drp-live.js/pcn-live.js) -- essas paginas
 * abrem em janela separada, sem SDK do Firestore, e so tem fetch cru +
 * token; por isso precisam de uma Cloud Function (igual
 * importarVulnerabilidadeParaRisco acima), ja que `/riscos/{id}` so aceita
 * escrita de isAdmin() no firestore.rules. Payload generico o bastante pra
 * servir as duas origens: PCN manda area/processo/processoId/probabilidade/
 * impacto/estrategiaDescricao (a tabela de riscos ja tem esses dados);
 * DRP manda so titulo/descricao (+ probabilidade/impacto escolhidos na hora
 * pelo usuario), porque a secao de Limitacoes nao tem essa classificacao
 * pronta. Sem checagem de duplicata -- nem o picker de import em lote de
 * PCN/DRP tem.
 */
async function exportarRiscoDocumento(db, data, ctx) {
  if (!(await podeOperarRiscos(db, ctx.email))) throw new AppError('Seu perfil não pode operar Riscos.');
  const titulo = exigir(data.titulo, 'titulo');

  const risco = {
    area: data.area || '',
    processoId: data.processoId || '',
    processo: data.processo || '',
    titulo,
    descricao: data.descricao || titulo,
    categoria: '',
    responsavel: '',
    dataIdentificacao: new Date().toISOString().slice(0, 10),
    status: 'Identificado',
    origem: data.origem || 'Importado de documento',
    probabilidade: data.probabilidade || '',
    impacto: data.impacto || '',
    estrategiaTratamento: '',
    estrategiaDescricao: data.estrategiaDescricao || '',
    planoAcao: [],
    kris: [],
  };

  const agora = new Date().toISOString();
  const novoId = ctx.novoUuid();
  await db.collection(COLLECTION.riscos).doc(novoId).set(Object.assign({}, risco, {
    criadoEm: agora,
    atualizadoEm: agora,
    criadoPor: ctx.email,
  }));
  return { success: true, id: novoId };
}


/**
 * Dados que a pagina do PCN usa para a edicao inline (pcn-live.js).
 *
 * Substitui tres chamadas que iam ao Apps Script: getProcessos, getDependencias
 * e getComponentes. Devolve so o processo pedido, e nao a colecao inteira —
 * a pagina do PCN nao precisa do resto e nao deve receber.
 *
 * `componentes` saiu do retorno (23/09/2026): "Componentes do Serviço" se
 * fundiu em Dependencias -- pcn-live.js agora le so `dependencias`.
 */
async function dadosPCN(db, data) {
  const { snap } = await _exigirProcesso(db, data);
  const p = { id: snap.id, ...(snap.data() || {}) };
  p.bcpContatos = listaDeContatos(p.bcpContatos);

  const depsSnap = await db.collection('dependencias').get();
  // Fornecedor inativo (27/10/2026) nao e oferecido no levantamento do PCN.
  const dependencias = depsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((d) => !CATEGORIAS_FORNECEDOR_DRP.includes(d.categoria) || d.ativo !== false);

  return { success: true, processo: p, dependencias };
}

/**
 * Grava os campos que a edicao inline do PCN altera.
 *
 * Allowlist proposital: a pagina do PCN so pode mexer nestes campos. Sem isso,
 * um `salvarProcesso` generico aberto a partir dali deixaria a pagina reescrever
 * area, tier, RTO e qualquer outra coisa do processo.
 */
const CAMPOS_EDITAVEIS_PCN = ['bcpContatos', 'bcpPapeisCrise'];

async function salvarCamposPCN(db, data, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_PCN, 'Seu perfil não pode alterar o PCN.');
  const { ref } = await _exigirProcesso(db, data);

  const patch = {};
  CAMPOS_EDITAVEIS_PCN.forEach((campo) => {
    if (data[campo] !== undefined) patch[campo] = data[campo];
  });
  // Sempre array de ids, como o drawer do Processo grava.
  if (patch.bcpContatos !== undefined) patch.bcpContatos = listaDeContatos(patch.bcpContatos);
  const recusados = Object.keys(data).filter(
    (k) => !['action', 'id', 'area', 'processo', ...CAMPOS_EDITAVEIS_PCN].includes(k)
  );
  if (!Object.keys(patch).length) throw new AppError('Nenhum campo editável informado.');

  patch.atualizadoEm = new Date().toISOString();
  patch.atualizadoPor = ctx.email;
  await ref.set(patch, { merge: true });
  return { success: true, gravados: Object.keys(patch), recusados };
}

/**
 * Grava RTO/RPO/Estrategia/Responsavel de UMA dependencia, a partir da
 * tabela "Estrategia Tecnica de Recuperacao" de um PCN ja gerado.
 *
 * Diferente de salvarCamposPCN (que so mexe no processo): aqui o alvo e um
 * doc do catalogo de Dependencias, identificado pelo id que dependenciaItens
 * ja carrega -- a pagina do PCN (sem SDK do Firestore, so fetch autenticado)
 * chega nele por aqui. Mesmo padrao de allowlist: so estes 4 campos, nunca
 * categoria/nome/contato da dependencia.
 */
const CAMPOS_DRP_DEPENDENCIA = ['estrategia', 'rto', 'rpo', 'responsavel'];

async function salvarDrpDependencia(db, data, ctx) {
  // Parametro de DRP da dependencia: so quem opera o DRP (o Operador de
  // Processos edita o PCN, mas le o DRP -- DECISAO 23/10/2026).
  await _exigirPerfil(db, ctx.email, PERFIS_DRP, 'Seu perfil não pode alterar parâmetros do DRP da dependência.');
  const dependenciaId = exigir(data.dependenciaId, 'dependenciaId');
  const ref = db.collection(COLLECTION.dependencias).doc(dependenciaId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Dependência não encontrada.');

  const patch = {};
  CAMPOS_DRP_DEPENDENCIA.forEach((campo) => {
    if (data[campo] !== undefined) patch[campo] = String(data[campo] || '').trim();
  });
  if (!Object.keys(patch).length) throw new AppError('Nenhum campo informado.');
  // Composicao de Servicos (21/10/2026): o texto vindo do PCN tambem atualiza
  // rtoMin/rpoMin (minutos), que e o que a conta do caminho critico le. Texto
  // ilegivel ou vazio zera o numero -- melhor "nao informado" que um valor velho.
  ['rto', 'rpo'].forEach((campo) => {
    if (patch[campo] === undefined) return;
    const horas = contratoCiclo.horasDoRto(patch[campo]);
    patch[campo + 'Min'] = horas === null ? null : Math.round(horas * 60);
  });

  patch.atualizadoEm = new Date().toISOString();
  patch.atualizadoPor = ctx.email;
  await ref.set(patch, { merge: true });
  return { success: true, dependenciaId, gravados: Object.keys(patch) };
}

// ============================================================
// E-mail de teste (16/10/2026): valida a conta SMTP antes de ligar o modo
// ativo dos alertas de contrato. So o Admin; vai para o proprio usuario
// logado, independente do modo configurado.
// ============================================================
async function enviarEmailTeste(db, data, ctx) {
  if (!(await temAlgumPerfil(db, ctx.email, ['admin']))) {
    throw new AppError('Só o Administrador pode enviar o e-mail de teste.');
  }
  const cfgSnap = await db.collection('config_notificacoes').doc('contratos').get();
  const config = notificacoes.normalizarConfig(cfgSnap.exists ? cfgSnap.data() : null);
  const fabrica = ctx.criarEnviador || transporteEmail.criarEnviador;
  const enviar = fabrica(Object.assign({}, ctx.smtp || {}, { servidor: config.servidor }));
  const url = notificacoes.linkContrato('', ctx.baseUrl).replace(/\?contrato=$/, '');
  try {
    await enviar({
      de: config.remetenteNome,
      para: ctx.email,
      responderPara: config.responderPara,
      assunto: '[Contratos] E-mail de teste do BIA',
      texto: `Este é um e-mail de teste dos alertas de contratos do BIA.\n\n`
        + `Se ele chegou, a conta de envio está configurada. Modo atual: ${config.modo}.\n\n${url}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2a2623;"><p><strong>E-mail de teste dos alertas de contratos do BIA.</strong></p>`
        + `<p>Se ele chegou, a conta de envio está configurada. Modo atual: <strong>${config.modo}</strong>.</p>`
        + `<p><a href="${url}" style="color:#d60014;">Abrir a tela de Contratos</a></p></div>`,
    });
  } catch (err) {
    throw new AppError('Falha no envio: ' + ((err && err.message) || 'erro desconhecido'));
  }
  return { success: true, para: ctx.email };
}

// ============================================================
// Resumo executivo por IA dos relatorios de Vulnerabilidades e de Riscos
// (20/10/2026). O navegador ja calculou os numeros (vulnerabilidade-painel.js
// / risco-relatorio.js) e manda SO os agregados e os itens de topo -- nunca o
// documento inteiro. A IA devolve TEXTO PURO (JSON com paragrafos e
// recomendacoes); a tela escapa tudo, nada de HTML vindo da IA.
// ============================================================
const LIMITE_INDICADORES_IA = 20000;
const TIPOS_RESUMO_EXECUTIVO = {
  vulnerabilidades: {
    pode: podeOperarVulnerabilidade,
    titulo: 'Relatório Executivo de Vulnerabilidades',
    referencia: 'NIST SP 800-40 (gestão de correções) e SP 800-55 (medidas), CSF 2.0 ID.RA',
  },
  riscos: {
    pode: podeOperarRiscos,
    titulo: 'Relatório Executivo de Riscos',
    referencia: 'NIST SP 800-30 (matriz 5x5), SP 800-39 (enquadrar, avaliar, responder, monitorar) e CSF 2.0 GV.RM (apetite de risco)',
  },
};

function _promptResumoExecutivo(tipo, indicadores) {
  const t = TIPOS_RESUMO_EXECUTIVO[tipo];
  return `Você é um analista sênior de riscos de segurança da informação e escreve para a diretoria da Fortes Tecnologia.

Escreva o RESUMO EXECUTIVO do "${t.titulo}", seguindo ${t.referencia}.

REGRAS:
- Use SOMENTE os números e itens do JSON abaixo. Não invente valores, datas, nomes ou causas que não estejam nele.
- Se um número não estiver no JSON, não fale dele.
- O campo "escopo" diz o que o relatório cobre. Se não for "Empresa inteira", deixe claro já na primeira frase que a análise vale só para esse recorte (por exemplo, um produto, uma área ou um responsável) e não generalize para a empresa.
- Linguagem: português do Brasil, executiva, direta, sem jargão desnecessário. Frases curtas.
- Interprete: diga se a situação melhora ou piora, onde está a maior exposição e o que preocupa.
- Recomendações: ações concretas e priorizadas, cada uma ligada a um número do JSON.
- Texto puro: sem markdown, sem HTML, sem emojis.

FORMATO DA RESPOSTA (JSON):
{"paragrafos": ["primeiro parágrafo (situação atual)", "segundo parágrafo (tendência e pontos de atenção)"], "recomendacoes": ["até 3 recomendações"]}

DADOS DO RELATÓRIO (JSON):
${JSON.stringify(indicadores)}`;
}

/** Lista de strings nao vazias, no maximo `max`, cada uma limitada (defesa contra resposta fora do formato). */
function _textosResumo(v, max) {
  return (Array.isArray(v) ? v : [])
    .map((x) => String(x == null ? '' : x).trim())
    .filter(Boolean)
    .slice(0, max)
    .map((x) => x.slice(0, 1500));
}

/**
 * Chamada ao Gemini que devolve JSON (resumo executivo, analise de Threat
 * Intelligence): temperatura baixa, sem "thinking", resposta em
 * application/json. Lanca AppError com mensagem legivel em qualquer falha.
 */
async function _chamarGeminiJson(apiKey, prompt, rotulo, cfg) {
  if (!apiKey) throw new AppError('API Key do Gemini não configurada.');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: Object.assign({
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    }, cfg || {}),
  };

  let body;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LIMITE_IA_MS),
    });
    body = await response.json();
    if (!response.ok) {
      throw new AppError('Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + response.status));
    }
  } catch (err) {
    throw _erroChamadaIA(err, rotulo);
  }

  const content = body.candidates && body.candidates[0] && body.candidates[0].content;
  const texto = content && content.parts && content.parts[0] && content.parts[0].text;
  if (!texto) throw new AppError('Resposta vazia do Gemini.');
  try {
    return JSON.parse(String(texto).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    throw new AppError('A IA respondeu fora do formato esperado. Tente de novo.');
  }
}

async function gerarResumoExecutivo(db, data, ctx) {
  const tipo = String(data.tipo || '');
  const def = TIPOS_RESUMO_EXECUTIVO[tipo];
  if (!def) throw new AppError('Tipo de relatório inválido.');
  if (!(await def.pode(db, ctx.email))) throw new AppError('Seu perfil não pode gerar este relatório.');
  const indicadores = data.indicadores;
  if (!indicadores || typeof indicadores !== 'object' || Array.isArray(indicadores)) throw new AppError('Indicadores do relatório ausentes.');
  if (JSON.stringify(indicadores).length > LIMITE_INDICADORES_IA) throw new AppError('Dados do relatório grandes demais para o resumo.');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const json = await _chamarGeminiJson(ctx.geminiApiKey, _promptResumoExecutivo(tipo, indicadores), 'o resumo executivo');
  const paragrafos = _textosResumo(json && json.paragrafos, 3);
  if (!paragrafos.length) throw new AppError('A IA respondeu fora do formato esperado. Tente de novo.');
  return { success: true, tipo, paragrafos, recomendacoes: _textosResumo(json.recomendacoes, 3) };
}

// ============================================================
// Sugestao da "Descricao do Impacto para Indisponibilidade" (27/10/2026): a IA
// escreve um rascunho a partir do que o sistema ja sabe do processo; a tela
// mostra para revisao e so grava se a pessoa usar o texto. Quem edita o
// processo pode pedir: Admin, Seguranca, Operador de Processos e o Gestor da
// propria area (mesmo recorte de Perfis.podeEditarProcessos).
// ============================================================

/** Ultima resposta de BIA do processo (documento inteiro), pelas mesmas chaves de _scoreDoProcesso. */
async function _ultimaRespostaBia(db, p, id) {
  const col = db.collection(COLLECTION.respostas);
  const consultas = historicoRisco.chavesBiaDoProcesso(p).map((chave) => {
    const [area, processo] = chave.split('||');
    return col.where('area', '==', area).where('processo', '==', processo).get();
  });
  if (id) consultas.push(col.where('processoId', '==', String(id)).get());
  const snaps = await Promise.all(consultas);
  const docs = snaps.flatMap((s) => s.docs.map((d) => d.data()))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return docs[0] || null;
}

/** Notas do questionario por dimensao (categoria da pergunta): { categoria: [{ pergunta, nota }] }, so as respondidas. */
async function _impactoPorDimensao(db, resposta) {
  if (!resposta || !resposta.scores) return {};
  const snap = await db.collection('perguntas').get();
  const categoriaDe = {};
  snap.docs.forEach((d) => { const q = d.data() || {}; if (q.pergunta) categoriaDe[q.pergunta] = q.categoria || 'Geral'; });
  const saida = {};
  Object.keys(resposta.scores).forEach((pergunta) => {
    const nota = Number(resposta.scores[pergunta]) || 0;
    if (!nota) return;
    const cat = categoriaDe[pergunta] || 'Geral';
    (saida[cat] = saida[cat] || []).push({ pergunta, nota });
  });
  return saida;
}

function _promptImpactoProcesso(dados) {
  return `Você é um analista de continuidade de negócios (ISO 22301) da Fortes Tecnologia e ajuda o dono de um processo a preencher o BIA.

Escreva a "Descrição do Impacto para Indisponibilidade" do processo abaixo: o que acontece se ele parar.

REGRAS:
- Use SOMENTE os dados do JSON. Não invente clientes, valores em R$, prazos legais, sistemas ou pessoas que não estejam nele.
- Quando faltar dado para uma dimensão, não fale dela.
- Cubra, quando houver base nos dados: clientes, financeiro, operação (outros processos e serviços afetados), reputação e legal/regulatório. As notas do questionário (1 a 4, quanto maior pior) dizem quais dimensões pesam mais.
- Considere o RTO/MTD: diga o que piora com o tempo parado.
- De 3 a 6 frases, português do Brasil, direto, na voz do processo ("Sem este processo, ...").
- Texto puro: sem markdown, sem listas, sem HTML, sem emojis.

FORMATO DA RESPOSTA (JSON):
{"texto": "a descrição"}

DADOS DO PROCESSO (JSON):
${JSON.stringify(dados)}`;
}

async function sugerirImpactoProcesso(db, data, ctx) {
  const id = exigir(data.id, 'id');
  const snap = await db.collection(COLLECTION.processos).doc(id).get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');
  const p = { id: snap.id, ...(snap.data() || {}) };

  const { perfis, area } = await _perfilDoUsuario(db, ctx.email);
  const pode = perfis.some((x) => PERFIS_PCN.includes(x)) || (perfis.includes('gestor') && area && area === p.area);
  if (!pode) throw new AppError('Seu perfil não pode editar este processo.');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const [resposta, depsSnap, servicos, riscosSnap] = await Promise.all([
    _ultimaRespostaBia(db, p, p.id),
    db.collection(COLLECTION.dependencias).get(),
    _lerServicos(db),
    db.collection(COLLECTION.riscos).where('processoId', '==', p.id).get().catch(() => ({ docs: [] })),
  ]);
  const dependencias = depsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const score = resposta ? Number(resposta.score) || 0 : 0;
  let levantamento = {};
  try { levantamento = typeof p.levantamentoPCN === 'string' ? JSON.parse(p.levantamentoPCN || '{}') : (p.levantamentoPCN || {}); } catch { levantamento = {}; }
  const lev = {};
  ['escopo', 'entrega', 'semSistema', 'contingencia', 'controlesManuais', 'funcoes', 'comunicacao'].forEach((k) => { if (levantamento[k]) lev[k] = String(levantamento[k]).slice(0, 600); });
  const itens = Array.isArray(p.dependenciaItens) ? p.dependenciaItens : [];
  const porCategoria = (cats) => itens.filter((it) => cats.includes(it.categoria)).map((it) => it.nome).filter(Boolean);

  const dados = {
    processo: p.processo || '',
    area: p.area || '',
    descricaoFuncional: String(p.descricaoFuncional || '').slice(0, 1500),
    descricaoAtual: String(p.descricao || '').slice(0, 1500),
    tier: _tierProcessoServidor(score, p.tierManual),
    score,
    rto: p.rto || '', rpo: p.rpo || '', mtd: p.mtd || '',
    impactoPorDimensao: await _impactoPorDimensao(db, resposta),
    servicos: cadeiaDependencias.servicosDoProcesso(p, servicos).map((s) => ({ nome: s.nome, descricao: String(s.descricao || '').slice(0, 300) })),
    dependenciasTecnicas: cadeiaDependencias.cadeiaDoProcesso({ processo: p, servicos, dependencias })
      .filter((it) => it.dep && !['Fornecedores', 'Fornecedor', 'Instalações', 'Instalação'].includes(it.categoria)).slice(0, 25)
      .map((it) => `${it.categoria}: ${it.nome}`),
    fornecedores: porCategoria(['Fornecedores', 'Fornecedor']),
    pessoasChave: porCategoria(['Pessoas', 'Pessoa']).length,
    instalacoes: _instalacoesDoProcessoPCN(p, dependencias).map((i) => i.nome),
    processosInternos: porCategoria(['Processos Internos', 'Processo Interno']),
    levantamentoPCN: lev,
    riscos: riscosSnap.docs.map((d) => d.data() || {}).filter((r) => r.status !== 'Encerrado').slice(0, 10).map((r) => r.titulo).filter(Boolean),
  };

  const json = await _chamarGeminiJson(ctx.geminiApiKey, _promptImpactoProcesso(dados), 'a sugestão de impacto', { maxOutputTokens: 1024 });
  const texto = String((json && json.texto) || '').trim().slice(0, 2000);
  if (!texto) throw new AppError('A IA respondeu fora do formato esperado. Tente de novo.');
  return { success: true, texto };
}

// ============================================================
// Linha do tempo do Relatorio Executivo de Riscos (20/10/2026): a carga no fim
// de cada mes, reconstruida do livro de medicoes com a mesma conta do retrato
// diario -- para a empresa e, quando o relatorio e filtrado, so para os riscos
// do escopo (historico_risco so guarda empresa e areas). Le `medicoes`, que o
// cliente da Seguranca nao le: por isso roda aqui, com o mesmo perfil do
// relatorio.
// ============================================================
const LIMITE_IDS_SERIE = 5000;

async function serieRiscoPorEscopo(db, data, ctx) {
  if (!(await podeOperarRiscos(db, ctx.email))) throw new AppError('Seu perfil não pode gerar este relatório.');
  const meses = [6, 12].includes(Number(data.meses)) ? Number(data.meses) : 12;
  let ids = null;
  if (data.riscoIds !== null && data.riscoIds !== undefined) {
    if (!Array.isArray(data.riscoIds)) throw new AppError('Lista de riscos inválida.');
    if (data.riscoIds.length > LIMITE_IDS_SERIE) throw new AppError('Escopo grande demais para a linha do tempo.');
    ids = data.riscoIds.map(String);
  }
  const insumos = await retratoRisco.montarInsumos(db);
  const agoraISO = new Date().toISOString();
  const mesAtual = retratoRisco.chaveDoDia(agoraISO).slice(0, 7);
  const empresa = historicoRisco.serieMensal(insumos, { meses, mesAtual, agoraISO });
  const escopo = ids ? historicoRisco.serieMensal(insumos, { meses, mesAtual, agoraISO, idsFiltro: ids }) : null;
  return { success: true, meses, mesAtual, empresa, escopo };
}

// ============================================================
// Threat Intelligence (26/10/2026) -- ver threatIntel.js (regra) e
// threatIntelServico.js (leitura/gravacao). Tudo aqui so confere o perfil e
// liga a IA; as colecoes intel_* e inventario_software sao write:false nas
// regras, so o servidor grava.
// ============================================================
const PERFIS_INTEL = ['admin', 'seguranca'];

async function _exigirIntel(db, ctx) {
  await _exigirPerfil(db, ctx.email, PERFIS_INTEL, 'Seu perfil não pode operar Threat Intelligence.');
}

/** deps do servico: IA (Gemini JSON), fetch e o erro de negocio. */
function _depsIntel(ctx) {
  return {
    Erro: AppError,
    fetch: (...args) => fetch(...args),
    chamarIA: (prompt) => _chamarGeminiJson(ctx.geminiApiKey, prompt, 'a análise da notícia'),
  };
}

async function registrarNoticiaIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  const titulo = String(data.titulo || '').trim();
  const texto = String(data.texto || '').trim();
  if (!titulo) throw new AppError('Informe o título da notícia.');
  if (texto.length < 40) throw new AppError('Cole o texto da notícia (pelo menos algumas frases).');
  const noticia = threatIntel.noticiaManual({ titulo, texto, url: data.url, fonte: data.fonte });
  const id = threatIntel.idNoticia(noticia);
  const existente = await db.collection(threatIntel.COLECAO.noticias).doc(id).get();
  if (existente.exists) throw new AppError('Esta notícia já foi registrada.');
  const [nova] = await threatIntelServico.registrarNoticias(db, [noticia], { coletadoPor: ctx.email });
  const r = await threatIntelServico.analisarNoticia(db, nova.id, nova.noticia, _depsIntel(ctx));
  return { success: true, id: nova.id, status: r.status, acoes: r.acoes.length, erro: r.erro || '' };
}

async function reanalisarNoticiaIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  const id = exigir(data.id, 'id');
  const snap = await db.collection(threatIntel.COLECAO.noticias).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Notícia não encontrada.');
  const r = await threatIntelServico.analisarNoticia(db, String(id), snap.data(), _depsIntel(ctx));
  return { success: true, status: r.status, acoes: r.acoes.length, erro: r.erro || '' };
}

/** "Coletar agora" da tela: mesma coleta do agendamento, com teto menor de IA (a requisicao tem 5 min). */
async function coletarThreatIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  const r = await threatIntelServico.executarColeta(db, _depsIntel(ctx), { limite: 10 });
  delete r.acaoIds;
  return Object.assign({ success: true }, r);
}

async function aprovarAcaoIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.aprovarAcao(db, data, ctx, _depsIntel(ctx));
}

async function descartarAcaoIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.descartarAcao(db, data, ctx, _depsIntel(ctx));
}

async function reabrirAcaoIntel(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.reabrirAcao(db, data, ctx, _depsIntel(ctx));
}

async function iniciarImportacaoInventario(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.iniciarImportacao(db, data, ctx);
}

async function enviarLoteInventario(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.enviarLote(db, data, ctx, _depsIntel(ctx));
}

async function concluirImportacaoInventario(db, data, ctx) {
  await _exigirIntel(db, ctx);
  return threatIntelServico.concluirImportacao(db, data, ctx, _depsIntel(ctx));
}

const READ_ACTIONS = {
  getLevantamentoPCN,
  dadosPCN,
  obterDRP,
  obterSlasDependencia,
  obterRoteiroTeste,
};

const WRITE_ACTIONS = {
  sugerirImpactoProcesso,
  gerarLink,
  salvarPCN,
  excluirPCN,
  salvarCamposPCN,
  salvarDrpDependencia,
  gerarPCN,
  gerarDRP,
  salvarDRP,
  excluirDRP,
  gerarRoteiroTeste,
  salvarRoteiroTeste,
  excluirRoteiroTeste,
  importarVulnerabilidadeParaRisco,
  exportarRiscoDocumento,
  enviarEmailTeste,
  gerarResumoExecutivo,
  serieRiscoPorEscopo,
  registrarNoticiaIntel,
  reanalisarNoticiaIntel,
  coletarThreatIntel,
  aprovarAcaoIntel,
  descartarAcaoIntel,
  reabrirAcaoIntel,
  iniciarImportacaoInventario,
  enviarLoteInventario,
  concluirImportacaoInventario,
};

module.exports = {
  AppError,
  CAMPOS_EDITAVEIS_PCN,
  CAMPOS_DRP_DEPENDENCIA,
  READ_ACTIONS,
  WRITE_ACTIONS,
  PREFIXO,
  VALIDADE_DIAS,
  PAGINA,
  PERFIS_PCN,
  PERFIS_DRP_LEITURA,
  PERFIS_INTEL,
  MAX_VERSOES_PCN,
  temAlgumPerfil,
  processoKey,
  listaDeContatos,
  slug,
  _chamarGeminiJson,
};
