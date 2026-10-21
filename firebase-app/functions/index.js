// ============================================================
// Cloud Functions do BIA — endpoint público de tokens.
//
// Uma única função HTTPS (tokenApi) atende as páginas públicas (sem login):
//   GET  ?action=validarToken&token=...      -> valida e retorna dados do form
//   POST { action:'salvarRespostasToken', token, ... } -> grava e marca usado
//
// Escreve no Firestore com privilégio de admin (firebase-admin), então as
// Security Rules podem manter tokens/escrita fechados para clientes anônimos.
// A validação do token (existência, não usado, não expirado) é feita aqui.
// ============================================================

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { READ_ACTIONS, WRITE_ACTIONS, TokenError } = require('./tokenLogic');
const { COLECAO: COLECAO_MEDICOES, FONTE, idDaMedicao, medicaoDeRespostaBia, medicaoDeLancamento, medicaoDeRisco, medicaoDeExclusaoRisco, medicaoDeAvaliacaoFornecedor, scoreDeRisco } = require('./medicoes');
const fornecedorRisco = require('./fornecedorRisco');
const vulnerabilidadeRisco = require('./vulnerabilidadeRisco');
const vulnerabilidadeContexto = require('./vulnerabilidadeContexto');
const painelVulnerabilidades = require('./painelVulnerabilidades');
const retratoRisco = require('./retratoRisco');
const contratoCiclo = require('./contratoCiclo');
const notificacoes = require('./notificacoes');
const { criarEnviador } = require('./transporteEmail');
const {
  READ_ACTIONS: APP_READ,
  WRITE_ACTIONS: APP_WRITE,
  AppError,
} = require('./appLogic');

admin.initializeApp();
const db = admin.firestore();

// Chave do Gemini, usada por appLogic.gerarPCN. Valor definido fora do
// codigo com `firebase functions:secrets:set GEMINI_API_KEY`.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Conta SMTP do Google Workspace que envia os alertas por e-mail (16/10/2026).
// `firebase functions:secrets:set SMTP_USUARIO` (o endereco) e `SMTP_SENHA`
// (senha de app). Precisam existir antes do deploy; enquanto a conta nao
// existir, grave "pendente" -- os modos desligado/simulacao nao usam.
const SMTP_USUARIO = defineSecret('SMTP_USUARIO');
const SMTP_SENHA = defineSecret('SMTP_SENHA');

// Origens permitidas (hosting do projeto). '*' também é aceitável aqui porque
// não há credenciais/cookies envolvidos e a autorização vem da posse do token.
const ALLOWED_ORIGINS = [
  'https://bia-forte-2025.web.app',
  'https://bia-forte-2025.firebaseapp.com',
];

// Dominio corporativo. appApi so executa para contas daqui.
const DOMINIO = '@fortestecnologia.com.br';
const BASE_URL = ALLOWED_ORIGINS[0];

function aplicarCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

function parseBody(req) {
  // As páginas públicas enviam JSON como text/plain (mesmo padrão do api client).
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

exports.tokenApi = onRequest({ region: 'us-central1', cors: false }, async (req, res) => {
  aplicarCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    if (req.method === 'GET') {
      const action = req.query.action;
      const handler = READ_ACTIONS[action];
      if (!handler) {
        res.status(200).json({ error: 'Ação de leitura inválida: ' + action });
        return;
      }
      const result = await handler(db, req.query.token);
      res.status(200).json(result);
      return;
    }

    if (req.method === 'POST') {
      const data = parseBody(req);
      const action = data.action;
      const handler = WRITE_ACTIONS[action];
      if (!handler) {
        res.status(200).json({ error: 'Ação de escrita inválida: ' + action });
        return;
      }
      const result = await handler(db, data);
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ error: 'Método não suportado.' });
  } catch (err) {
    if (err instanceof TokenError) {
      // Erros de negócio previsíveis: devolver como { error } (HTTP 200),
      // igual ao contrato do Apps Script antigo.
      res.status(200).json({ error: err.message });
      return;
    }
    logger.error('tokenApi erro inesperado', err);
    res.status(200).json({ error: 'Erro ao processar: ' + err.message });
  }
});

// ============================================================
// appApi — acoes que exigem usuario logado do dominio.
//
// Substitui o que rodava no Apps Script e parou quando o acesso anonimo dele
// foi fechado: gerar link de avaliacao, salvar/excluir PCN, ler levantamento.
//
// Diferenca em relacao a tokenApi: la a autorizacao vem da posse de um token
// de uso unico, e por isso ela atende paginas publicas sem login. Aqui vem da
// identidade — o cliente manda o token de login do Firebase no cabecalho
// Authorization, e nada roda antes de ele ser verificado e o dominio conferido.
// ============================================================

/**
 * Verifica o token de login enviado pelo cliente.
 * Lanca AuthError se ausente, invalido, de outro dominio ou sem e-mail
 * verificado. Devolve o contexto que os handlers recebem.
 */
class AuthError extends Error {}

async function autenticar(req) {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) throw new AuthError('Autenticação ausente.');

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    // Mensagem generica de proposito: nao devolver detalhe do motivo.
    throw new AuthError('Sessão inválida ou expirada. Entre novamente.');
  }

  const email = String(decoded.email || '').toLowerCase();
  if (!email.endsWith(DOMINIO)) throw new AuthError('Acesso restrito ao domínio corporativo.');
  if (decoded.email_verified === false) throw new AuthError('E-mail não verificado.');

  return {
    email,
    uid: decoded.uid,
    baseUrl: BASE_URL,
    novoUuid: () => crypto.randomUUID(),
    geminiApiKey: GEMINI_API_KEY.value(),
    smtp: { usuario: SMTP_USUARIO.value(), senha: SMTP_SENHA.value() },
  };
}

// timeoutSeconds: gerar DRP/PCN/Roteiro pela IA passa de 60 s (padrao) em
// documento grande -- a plataforma cortava a conexao e o navegador so dizia
// "Failed to fetch". A chamada a IA tem limite proprio de 4 min (appLogic.js).
exports.appApi = onRequest({ region: 'us-central1', cors: false, secrets: [GEMINI_API_KEY, SMTP_USUARIO, SMTP_SENHA], timeoutSeconds: 300 }, async (req, res) => {
  aplicarCors(req, res);
  // Este endpoint le o cabecalho Authorization, entao precisa declara-lo.
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const ctx = await autenticar(req);

    if (req.method === 'GET') {
      const handler = APP_READ[req.query.action];
      if (!handler) {
        res.status(200).json({ error: 'Ação de leitura inválida: ' + req.query.action });
        return;
      }
      res.status(200).json(await handler(db, req.query, ctx));
      return;
    }

    if (req.method === 'POST') {
      const data = parseBody(req);
      const handler = APP_WRITE[data.action];
      if (!handler) {
        res.status(200).json({ error: 'Ação de escrita inválida: ' + data.action });
        return;
      }
      res.status(200).json(await handler(db, data, ctx));
      return;
    }

    res.status(405).json({ error: 'Método não suportado.' });
  } catch (err) {
    if (err instanceof AuthError) {
      logger.warn('appApi: acesso negado', { motivo: err.message });
      res.status(401).json({ error: err.message });
      return;
    }
    if (err instanceof AppError) {
      res.status(200).json({ error: err.message });
      return;
    }
    logger.error('appApi erro inesperado', err);
    res.status(200).json({ error: 'Erro ao processar a solicitação.' });
  }
});

// ============================================================
// Livro de medicoes — alimentacao automatica
//
// Toda resposta de BIA gravada vira um ponto na curva de risco, venha ela do
// app (api.js) ou do link externo sem login (tokenLogic.js).
//
// POR QUE UM GATILHO, e nao uma chamada no codigo que grava: duas vezes nesta
// migracao um caminho de escrita escondido passou despercebido porque a busca
// foi feita na camada errada. Um gatilho no banco nao tem como ser esquecido —
// qualquer caminho que crie a resposta gera a medicao.
//
// O id da medicao e derivado do id da resposta. Cloud Functions nao garante
// execucao unica: se o gatilho rodar duas vezes, a segunda sobrescreve a
// primeira em vez de criar um ponto duplicado na curva.
// ============================================================
exports.medicaoDeBia = onDocumentCreated(
  { region: 'us-central1', document: 'respostas_bia/{id}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const medicao = medicaoDeRespostaBia(event.params.id, snap.data());
    if (!medicao) {
      // Resposta sem data, sem score ou sem processo: nao da para posicionar na
      // curva. Registrar um ponto invalido e pior do que nao registrar.
      logger.warn('medicaoDeBia: resposta sem o minimo para virar medicao', { id: event.params.id });
      return;
    }

    try {
      await db.collection(COLECAO_MEDICOES)
        .doc(idDaMedicao(FONTE.BIA, event.params.id))
        .set(medicao, { merge: true });
    } catch (err) {
      // Nao relanca: falhar aqui nao pode derrubar a gravacao da resposta, que
      // ja aconteceu. O reprocessamento cobre o que faltar.
      logger.error('medicaoDeBia: falha ao gravar medicao', { id: event.params.id, erro: err.message });
    }
  }
);

// Lancamento mensal de indicador -> medicao. Mesmo padrao do BIA: gatilho no
// banco, id derivado da origem (reprocessar sobrescreve, nao duplica).
exports.medicaoDeIndicador = onDocumentCreated(
  { region: 'us-central1', document: 'lancamentos_indicadores/{id}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const medicao = medicaoDeLancamento(event.params.id, snap.data());
    if (!medicao) {
      logger.warn('medicaoDeIndicador: lancamento sem o minimo para virar medicao', { id: event.params.id });
      return;
    }

    try {
      await db.collection(COLECAO_MEDICOES)
        .doc(idDaMedicao(FONTE.INDICADOR, event.params.id))
        .set(medicao, { merge: true });
    } catch (err) {
      logger.error('medicaoDeIndicador: falha ao gravar medicao', { id: event.params.id, erro: err.message });
    }
  }
);

// Avaliacao de fornecedor -> medicao.
//
// A colecao e append-only (cada avaliacao e um documento novo), entao o gatilho
// e so na criacao e o id da medicao e o id da avaliacao: um ponto por avaliacao,
// nenhum sobrescrito. E o servidor que grava, nao o navegador — pela mesma razao
// dos outros: um caminho de escrita esquecido nao pode deixar de medir.
exports.medicaoDeFornecedor = onDocumentCreated(
  { region: 'us-central1', document: 'avaliacoes_fornecedor/{id}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const medicao = medicaoDeAvaliacaoFornecedor(event.params.id, snap.data());
    if (!medicao) {
      // Avaliacao sem nota e caso legitimo (tudo "Nao se aplica"): nao e erro,
      // so nao vira ponto na curva.
      logger.info('medicaoDeFornecedor: avaliacao sem nota, nada a medir', { id: event.params.id });
      return;
    }

    try {
      await db.collection(COLECAO_MEDICOES)
        .doc(idDaMedicao(FONTE.FORNECEDOR, event.params.id))
        .set(medicao, { merge: true });
    } catch (err) {
      logger.error('medicaoDeFornecedor: falha ao gravar medicao', { id: event.params.id, erro: err.message });
    }
  }
);

// Avaliacao de fornecedor -> risco automatico.
//
// Roda NO SERVIDOR, e nao na tela, por dois motivos (ver fornecedorRisco.js):
// quem avalia fornecedor nao precisa de acesso ao registro de riscos da empresa,
// e nao existe caminho que grave a avaliacao e esqueca o risco.
exports.riscoDeFornecedor = onDocumentCreated(
  { region: 'us-central1', document: 'avaliacoes_fornecedor/{id}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const avaliacao = snap.data();
    const fornecedorId = String((avaliacao && avaliacao.fornecedorId) || '');
    if (!fornecedorId) return;

    try {
      const [cfgSnap, fornSnap, riscosSnap] = await Promise.all([
        db.collection('config_regua').doc('fornecedor').get(),
        db.collection('dependencias').doc(fornecedorId).get(),
        db.collection('riscos').where('fornecedor', '==', fornecedorId).get(),
      ]);

      const limiar = cfgSnap.exists ? (cfgSnap.data() || {}).limiarRisco : undefined;
      const fornecedor = fornSnap.exists ? Object.assign({ id: fornSnap.id }, fornSnap.data()) : null;
      const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

      const decisao = fornecedorRisco.decidir({ avaliacao, fornecedor, riscos, limiar });

      if (decisao.acao === 'abrir') {
        const agora = new Date().toISOString();
        await db.collection('riscos').add(Object.assign({}, decisao.risco, {
          criadoEm: agora,
          atualizadoEm: agora,
          criadoPor: String(avaliacao.avaliadoPor || ''),
        }));
        logger.info('riscoDeFornecedor: risco aberto', { fornecedorId, nota: avaliacao.nota });
        return;
      }

      if (decisao.acao === 'encerrar') {
        const lote = db.batch();
        decisao.ids.forEach((id) => {
          lote.set(db.collection('riscos').doc(id),
            Object.assign({}, decisao.patch, { atualizadoEm: new Date().toISOString() }),
            { merge: true });
        });
        await lote.commit();
        logger.info('riscoDeFornecedor: risco(s) encerrado(s)', { fornecedorId, ids: decisao.ids });
        return;
      }

      logger.info('riscoDeFornecedor: nada a fazer', { fornecedorId, motivo: decisao.motivo });
    } catch (err) {
      logger.error('riscoDeFornecedor: falha ao tratar o risco automatico', { fornecedorId, erro: err.message });
    }
  }
);

// Vulnerabilidade -> risco automatico.
//
// Mesma razao de riscoDeFornecedor (acima) pra rodar no servidor: quem
// cadastra Vulnerabilidade nao tem acesso de escrita a /riscos, e nao pode
// existir caminho que grave a vulnerabilidade e esqueca o risco.
//
// DIFERENCA do Fornecedor: onDocumentWritten, nao onDocumentCreated -- uma
// Vulnerabilidade e UM documento so, editado no lugar, entao o gatilho reage a
// criacao, edicao E exclusao.
//
// DECISAO 15/10/2026 (NIST): alem de abrir/encerrar, o gatilho mantem o risco
// ativo sincronizado com a vulnerabilidade (vulnerabilidadeRisco.decidir ->
// 'atualizar'); a exclusao da vulnerabilidade encerra o risco (antes ficava
// orfao); o limiar vem de config_regua/vulnerabilidade.

/**
 * Decide e aplica o risco de UMA vulnerabilidade. Compartilhado pelo gatilho e
 * pela varredura diaria. `dados` = documento (ou o de antes, se excluida).
 */
async function sincronizarRiscoDaVulnerabilidade(id, dados, excluida, cache) {
  const vulnerabilidade = Object.assign({ id }, dados || {});
  const riscosSnap = await db.collection('riscos').where('vulnerabilidadeId', '==', id).get();
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const ctx = excluida
    ? { limiar: undefined, produtoNome: '', processosAfetados: [] }
    : await vulnerabilidadeContexto.contextoDaVulnerabilidade(db, vulnerabilidade, cache);

  const decisao = vulnerabilidadeRisco.decidir({
    vulnerabilidade, excluida, riscos, limiar: ctx.limiar, produtoNome: ctx.produtoNome, processosAfetados: ctx.processosAfetados,
  });
  const agora = new Date().toISOString();

  if (decisao.acao === 'abrir') {
    await db.collection('riscos').add(Object.assign({}, decisao.risco, {
      criadoEm: agora,
      atualizadoEm: agora,
      criadoPor: String((dados && dados.atualizadoPor) || ''),
    }));
  } else if (decisao.acao === 'encerrar' || decisao.acao === 'atualizar') {
    const lote = db.batch();
    const alvos = decisao.acao === 'encerrar'
      ? decisao.ids.map((rid) => ({ id: rid, patch: decisao.patch }))
      : decisao.atualizacoes;
    alvos.forEach((a) => {
      lote.set(db.collection('riscos').doc(a.id), Object.assign({}, a.patch, { atualizadoEm: agora }), { merge: true });
    });
    await lote.commit();
  }
  return decisao;
}

exports.riscoDeVulnerabilidade = onDocumentWritten(
  { region: 'us-central1', document: 'vulnerabilidades/{id}' },
  async (event) => {
    const depois = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    const antes = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const excluida = !depois;
    try {
      // Data de aceite para a tendencia do Painel (painelVulnerabilidades.js).
      // A regravacao dispara este gatilho de novo e E ESSA execucao que
      // sincroniza o risco: sincronizar nas duas ao mesmo tempo poderia abrir
      // o risco em dobro (as duas leriam "sem risco ativo").
      const hojeSP = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      const patchAceite = painelVulnerabilidades.patchDataAceite(depois, hojeSP);
      if (patchAceite) {
        await event.data.after.ref.set(patchAceite, { merge: true });
        logger.info('riscoDeVulnerabilidade: data de aceite ajustada; o risco sincroniza na proxima execucao', { vulnerabilidadeId: event.params.id });
        return;
      }
      const decisao = await sincronizarRiscoDaVulnerabilidade(event.params.id, depois || antes, excluida);
      logger.info(`riscoDeVulnerabilidade: ${decisao.acao}`, { vulnerabilidadeId: event.params.id, motivo: decisao.motivo });
    } catch (err) {
      logger.error('riscoDeVulnerabilidade: falha ao tratar o risco automatico', { vulnerabilidadeId: event.params.id, erro: err.message });
    }
  }
);

// Varredura diaria (05:30, antes do retrato das 06:00): reavalia todas as
// vulnerabilidades ainda nao corrigidas. Pega o que muda sem ninguem editar a
// vulnerabilidade: Data Prevista que venceu (item de correcao -> Atrasado), o
// Tier de um processo afetado que mudou no BIA, o limiar que foi reconfigurado.
// So grava o que de fato muda (decidir devolve 'nada' quando ja esta em dia).
exports.varreduraDiariaVulnerabilidades = onSchedule(
  { region: 'us-central1', schedule: '30 5 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const snap = await db.collection('vulnerabilidades').get();
    const cache = {};
    const contagem = { abrir: 0, atualizar: 0, encerrar: 0, nada: 0, erro: 0 };
    for (const d of snap.docs) {
      if (String((d.data() || {}).statusCorrecao || '') === 'Corrigida') continue;
      try {
        const decisao = await sincronizarRiscoDaVulnerabilidade(d.id, d.data(), false, cache);
        contagem[decisao.acao] = (contagem[decisao.acao] || 0) + 1;
      } catch (err) {
        contagem.erro++;
        logger.error('varreduraDiariaVulnerabilidades: falha', { vulnerabilidadeId: d.id, erro: err.message });
      }
    }
    logger.info('varreduraDiariaVulnerabilidades: concluida', contagem);
    // Foto do backlog para a tendencia do Painel de Vulnerabilidades. Usa a
    // data de Sao Paulo (o agendamento e no fuso dela, 05:30 = 08:30 UTC).
    try {
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      const foto = painelVulnerabilidades.fotoDoMes(snap.docs.map((d) => d.data()), hoje);
      await db.collection(painelVulnerabilidades.COLECAO).doc(foto.mes)
        .set(Object.assign({}, foto, { geradoEm: new Date().toISOString() }));
      logger.info('varreduraDiariaVulnerabilidades: foto do painel gravada', { mes: foto.mes, abertas: foto.abertas });
    } catch (err) {
      logger.error('varreduraDiariaVulnerabilidades: falha ao gravar a foto do painel', { erro: err.message });
    }
  }
);

// ============================================================
// Alertas de contrato por e-mail (16/10/2026) -- ver notificacoes.js.
// Fila de saida: `notificacoes_email`, um documento por e-mail. Quem decide
// (varredura diaria, resumo mensal) so grava na fila; quem envia e o gatilho
// envioDeNotificacaoEmail, que grava o resultado no proprio documento.
// ============================================================

/** Configuracao + o que e preciso para resolver destinatarios (lido uma vez por execucao). */
async function _contextoNotificacao() {
  const cfgSnap = await db.collection('config_notificacoes').doc('contratos').get();
  const config = notificacoes.normalizarConfig(cfgSnap.exists ? cfgSnap.data() : null);
  if (config.modo === notificacoes.MODO.DESLIGADO) return { config };
  const [pessoasSnap, areasSnap, perfisSnap, tiposSnap, indexSnap] = await Promise.all([
    db.collection('dependencias').where('categoria', '==', 'Pessoas').get(),
    db.collection('areas').get(),
    db.collection('config_perfis').get(),
    db.collection('tipos_contrato').get(),
    db.collection('indexadores_reajuste').get(),
  ]);
  const nomes = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, (d.data() || {}).nome || '']));
  return {
    config,
    pessoas: pessoasSnap.docs.map((d) => ({ id: d.id, email: (d.data() || {}).email || '' })),
    areas: areasSnap.docs.map((d) => ({ nome: (d.data() || {}).nome || '', email: (d.data() || {}).email || '' })),
    operadores: notificacoes.emailsDeOperadores(perfisSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
    nomesTipo: nomes(tiposSnap),
    nomesIndexador: nomes(indexSnap),
  };
}

/** Grava na fila com create(): o mesmo evento para o mesmo destinatario nunca entra duas vezes. */
async function _enfileirarEmail(registro) {
  const id = notificacoes.idNaFila(registro.chave, registro.para || '');
  try {
    await db.collection(notificacoes.COLECAO_FILA).doc(id).create(Object.assign({}, registro, {
      status: notificacoes.STATUS.PENDENTE,
      tentativas: 0,
      criadoEm: new Date().toISOString(),
    }));
    return true;
  } catch (err) {
    if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) return false;
    throw err;
  }
}

/** Enfileira os e-mails urgentes de um contrato (um por evento por destinatario). */
async function _enfileirarUrgentes(contrato, eventos, ctxN) {
  let n = 0;
  const destinatarios = notificacoes.resolverDestinatarios(contrato, ctxN);
  const nomes = { tipo: ctxN.nomesTipo[contrato.tipoId] || '' };
  for (const ev of eventos) {
    const base = { tipo: 'urgente', evento: ev.evento, grupo: ev.grupo, chave: ev.chave, contratoId: contrato.id, contratoCodigo: contrato.codigo || '' };
    if (!destinatarios.length) {
      // Fica registrado (status sem_destinatario no gatilho): alguem precisa cadastrar o gestor ou o e-mail da area.
      const m = notificacoes.montarEmailUrgente(contrato, ev, { baseUrl: BASE_URL, nomes });
      if (await _enfileirarEmail(Object.assign({}, base, { para: '', motivos: [], assunto: m.assunto, html: m.html, texto: m.texto }))) n++;
      continue;
    }
    for (const dest of destinatarios) {
      const m = notificacoes.montarEmailUrgente(contrato, ev, { baseUrl: BASE_URL, motivos: dest.motivos, nomes });
      if (await _enfileirarEmail(Object.assign({}, base, { para: dest.email, motivos: dest.motivos, assunto: m.assunto, html: m.html, texto: m.texto }))) n++;
    }
  }
  return n;
}

// Varredura diaria dos contratos (05:00, 15/10/2026). Tres coisas que mudam so
// com o passar do tempo, sem ninguem editar o contrato:
//   1. Renovacao automatica: contrato vigente, com renovacao automatica, cujo
//      fim ja passou ganha o proximo periodo (mesma vigencia) e um evento
//      "Renovação automática" na linha do tempo.
//   2. Alertas (vence em, janela de aviso, reajuste...): recalculados e
//      gravados no contrato, so quando mudaram. A tela calcula os mesmos
//      alertas ao vivo (contrato-ciclo.js).
//   3. E-mails urgentes (16/10/2026): prazos e renovacao executada vao para a
//      fila notificacoes_email -- inclusive em dia em que o contrato nao mudou
//      (a janela de 7 dias, por exemplo, chega sem nada mudar no documento).
//      No fim, falhas de envio com menos de 3 tentativas voltam para a fila.
exports.varreduraDiariaContratos = onSchedule(
  { region: 'us-central1', schedule: '0 5 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const hoje = contratoCiclo.hojeIso();
    const [contratosSnap, statusSnap, ctxN] = await Promise.all([
      db.collection('contratos').get(),
      db.collection('status_contrato').get(),
      _contextoNotificacao().catch((err) => {
        logger.error('varreduraDiariaContratos: configuracao de e-mail nao carregou; segue sem e-mail', { erro: err.message });
        return { config: notificacoes.normalizarConfig({ modo: notificacoes.MODO.DESLIGADO }) };
      }),
    ]);
    const emailLigado = ctxN.config.modo !== notificacoes.MODO.DESLIGADO;
    const listaStatus = statusSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const contagem = { renovados: 0, alertasAtualizados: 0, nada: 0, emails: 0, reenvios: 0, erro: 0 };
    for (const d of contratosSnap.docs) {
      try {
        const c = d.data() || {};
        const situacao = contratoCiclo.situacaoDoStatus(c.statusId, listaStatus);
        const patch = {};
        const lote = db.batch();
        const renovacao = contratoCiclo.renovacaoAutomaticaDevida(c, { hoje, situacao });
        if (renovacao) {
          patch.dataUltimaRenovacao = renovacao.dataUltimaRenovacao;
          patch.dataFim = renovacao.dataFim;
          lote.set(db.collection('eventos_contrato').doc(), {
            contratoId: d.id,
            area: c.area || '',
            data: renovacao.dataUltimaRenovacao,
            tipo: 'Renovação automática',
            descricao: `Renovado automaticamente até ${renovacao.dataFim}` +
              (renovacao.ciclos > 1 ? ` (${renovacao.ciclos} períodos aplicados de uma vez).` : '.'),
            dataFimNova: renovacao.dataFim,
            automatico: true,
            registradoPor: 'automacao:contratos',
            registradoEm: new Date().toISOString(),
          });
          contagem.renovados++;
        }
        const atual = Object.assign({ id: d.id }, c, patch);
        const alertas = contratoCiclo.calcularAlertas(atual, { hoje, situacao });
        if (!contratoCiclo.alertasIguais(alertas, c.alertas)) {
          patch.alertas = alertas;
          contagem.alertasAtualizados++;
        }
        if (Object.keys(patch).length) {
          patch.alertasAtualizadosEm = new Date().toISOString();
          patch.atualizadoPor = 'automacao:contratos';
          lote.set(d.ref, patch, { merge: true });
          await lote.commit();
        } else {
          contagem.nada++;
        }
        // Depois do commit: e-mail de renovacao so sai se a renovacao foi gravada.
        if (emailLigado) {
          const eventos = notificacoes.decidirUrgentes(atual, { hoje, situacao, renovacao })
            .filter((ev) => ctxN.config.grupos[ev.grupo]);
          if (eventos.length) contagem.emails += await _enfileirarUrgentes(atual, eventos, ctxN);
        }
      } catch (err) {
        contagem.erro++;
        logger.error('varreduraDiariaContratos: falha', { contratoId: d.id, erro: err.message });
      }
    }
    if (emailLigado) {
      try {
        const erros = await db.collection(notificacoes.COLECAO_FILA).where('status', '==', notificacoes.STATUS.ERRO).get();
        for (const e of erros.docs) {
          if (!notificacoes.podeReenviar(e.data())) continue;
          await e.ref.set({ status: notificacoes.STATUS.PENDENTE }, { merge: true });
          contagem.reenvios++;
        }
      } catch (err) {
        logger.error('varreduraDiariaContratos: falha ao reenfileirar e-mails com erro', { erro: err.message });
      }
    }
    logger.info('varreduraDiariaContratos: concluida', contagem);
  }
);

// Resumo mensal dos contratos (dia 1, 07:00). Por destinatario, so com os
// contratos dele (gestor, area) -- o operador recebe o geral. Contrato sem
// nada a informar fica de fora; destinatario sem nada nao recebe e-mail.
exports.resumoMensalContratos = onSchedule(
  { region: 'us-central1', schedule: '0 7 1 * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const ctxN = await _contextoNotificacao();
    if (ctxN.config.modo === notificacoes.MODO.DESLIGADO || !ctxN.config.grupos.resumoMensal) {
      logger.info('resumoMensalContratos: desligado na configuracao');
      return;
    }
    const hoje = contratoCiclo.hojeIso();
    const anoMes = hoje.slice(0, 7);
    const anterior = notificacoes.mesAnterior(hoje);
    const [contratosSnap, statusSnap, renovSnap] = await Promise.all([
      db.collection('contratos').get(),
      db.collection('status_contrato').get(),
      db.collection('eventos_contrato').where('tipo', '==', 'Renovação automática').get(),
    ]);
    const listaStatus = statusSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const renovacoes = {};
    renovSnap.docs.forEach((e) => {
      const ev = e.data() || {};
      if (ev.data >= anterior.inicio && ev.data <= anterior.fim) (renovacoes[ev.contratoId] = renovacoes[ev.contratoId] || []).push(ev.data);
    });
    const porDestinatario = new Map();
    contratosSnap.docs.forEach((d) => {
      const c = Object.assign({ id: d.id }, d.data() || {});
      const situacao = contratoCiclo.situacaoDoStatus(c.statusId, listaStatus);
      const itens = notificacoes.itensDoResumo(c, {
        hoje, situacao, config: ctxN.config,
        nomes: { indexador: ctxN.nomesIndexador[c.indexadorId] || '' },
        renovacoesMesAnterior: renovacoes[d.id] || [],
      });
      if (!itens.length) return;
      notificacoes.resolverDestinatarios(c, ctxN).forEach((dest) => {
        if (!porDestinatario.has(dest.email)) porDestinatario.set(dest.email, { motivos: new Set(), entradas: [] });
        const x = porDestinatario.get(dest.email);
        dest.motivos.forEach((m) => x.motivos.add(m));
        x.entradas.push({ contrato: c, itens });
      });
    });
    let n = 0;
    for (const [email, x] of porDestinatario) {
      const motivos = [...x.motivos];
      const m = notificacoes.montarResumoMensal(x.entradas, { mesAno: notificacoes.mesPorExtenso(anoMes), baseUrl: BASE_URL, motivos });
      if (await _enfileirarEmail({
        tipo: 'resumo', evento: 'resumoMensal', grupo: notificacoes.GRUPO.RESUMO, chave: `resumo:${anoMes}`,
        contratoId: '', contratoCodigo: `${x.entradas.length} contrato(s)`, para: email, motivos,
        assunto: m.assunto, html: m.html, texto: m.texto,
      })) n++;
    }
    logger.info('resumoMensalContratos: concluido', { destinatarios: porDestinatario.size, enfileirados: n });
  }
);

// Envio: todo documento da fila em status "pendente" (novo, ou reenfileirado
// pela varredura) passa pelo transporte. Simulacao grava "simulado" sem
// enviar. O resultado vai no proprio documento -- o gatilho dispara de novo
// com o status ja resolvido e para ai (sem laco).
exports.envioDeNotificacaoEmail = onDocumentWritten(
  { region: 'us-central1', document: 'notificacoes_email/{id}', secrets: [SMTP_USUARIO, SMTP_SENHA] },
  async (event) => {
    const depois = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!depois || depois.status !== notificacoes.STATUS.PENDENTE) return;
    try {
      const cfgSnap = await db.collection('config_notificacoes').doc('contratos').get();
      const config = cfgSnap.exists ? cfgSnap.data() : null;
      const servidor = notificacoes.normalizarConfig(config).servidor;
      const enviar = criarEnviador({ usuario: SMTP_USUARIO.value(), senha: SMTP_SENHA.value(), servidor });
      const patch = await notificacoes.processarEnvio(depois, config, enviar);
      if (patch) await event.data.after.ref.set(patch, { merge: true });
      if (patch && patch.status === notificacoes.STATUS.ERRO) {
        logger.warn('envioDeNotificacaoEmail: falha no envio', { id: event.params.id, erro: patch.erro, tentativas: patch.tentativas });
      }
    } catch (err) {
      logger.error('envioDeNotificacaoEmail: erro inesperado', { id: event.params.id, erro: err.message });
    }
  }
);

// Relatorio executivo compartilhado com um gestor (20/10/2026): aviso por
// e-mail com o link para o sistema (sem numeros, sem anexo). Mesma fila e
// mesmo modo (desligado/simulacao/ativo) dos alertas de contrato; chave
// `relatorio:{id}` -- o mesmo compartilhamento nunca gera dois e-mails.
exports.avisoDeRelatorioCompartilhado = onDocumentCreated(
  { region: 'us-central1', document: 'relatorios_compartilhados/{id}' },
  async (event) => {
    const c = event.data ? event.data.data() : null;
    if (!c || c.revogado) return;
    try {
      const cfgSnap = await db.collection('config_notificacoes').doc('contratos').get();
      const config = notificacoes.normalizarConfig(cfgSnap.exists ? cfgSnap.data() : null);
      if (config.modo === notificacoes.MODO.DESLIGADO) {
        logger.info('avisoDeRelatorioCompartilhado: e-mail desligado na configuração', { id: event.params.id });
        return;
      }
      const para = notificacoes.emailCorporativo(c.para) ? String(c.para).toLowerCase() : '';
      const m = notificacoes.montarEmailRelatorioCompartilhado(c, { baseUrl: BASE_URL });
      await _enfileirarEmail({
        tipo: 'relatorio', evento: 'relatorioCompartilhado', chave: `relatorio:${event.params.id}`,
        relatorioCompartilhadoId: event.params.id, para, assunto: m.assunto, html: m.html, texto: m.texto,
      });
    } catch (err) {
      logger.error('avisoDeRelatorioCompartilhado: falha ao enfileirar', { id: event.params.id, erro: err.message });
    }
  }
);

// Risco -> Vulnerabilidade (rastreabilidade nos dois sentidos, 15/10/2026).
// Quando uma PESSOA aceita o risco de uma vulnerabilidade (status -> Aceito),
// a vulnerabilidade passa a "Aceita", com a justificativa nas observacoes --
// a decisao de aceitar (NIST: resposta ao risco) fica registrada nos dois
// lugares. Sem laco: se a vulnerabilidade ja esta Aceita/Corrigida, nada; e a
// sincronizacao de volta encontra o risco ja Aceito e nao muda nada.
// Encerrar o risco a mao NAO marca a vulnerabilidade como corrigida: so a
// correcao prova isso.
exports.vulnerabilidadeDeRiscoAceito = onDocumentWritten(
  { region: 'us-central1', document: 'riscos/{id}' },
  async (event) => {
    const depois = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    const antes = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    if (!depois || depois.origem !== vulnerabilidadeRisco.ORIGEM || !depois.vulnerabilidadeId) return;
    if (depois.status !== 'Aceito' || (antes && antes.status === 'Aceito')) return;
    try {
      const ref = db.collection('vulnerabilidades').doc(String(depois.vulnerabilidadeId));
      const vSnap = await ref.get();
      if (!vSnap.exists) return;
      const v = vSnap.data() || {};
      if (['Aceita', 'Corrigida'].includes(String(v.statusCorrecao || ''))) return;
      const hoje = new Date().toISOString().slice(0, 10);
      const just = String(depois.justificativaAceite || depois.estrategiaDescricao || '').trim();
      const linha = `${hoje} — Risco aceito no Registro de Riscos${just ? `: ${just}` : '.'}`;
      await ref.set({
        statusCorrecao: 'Aceita',
        dataAceite: hoje,
        observacoes: v.observacoes ? `${v.observacoes}\n${linha}` : linha,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: 'automacao:registro-de-riscos',
      }, { merge: true });
      logger.info('vulnerabilidadeDeRiscoAceito: vulnerabilidade marcada como Aceita', { riscoId: event.params.id, vulnerabilidadeId: depois.vulnerabilidadeId });
    } catch (err) {
      logger.error('vulnerabilidadeDeRiscoAceito: falha', { riscoId: event.params.id, erro: err.message });
    }
  }
);

// Risco -> medicao. Diferente dos outros dois, aqui o gatilho e em QUALQUER
// escrita, nao so na criacao: o que interessa e a reavaliacao, que e um update.
//
// O score e RECALCULADO aqui a partir de probabilidade e impacto. Ate agora ele
// era calculado so no navegador e gravado como viesse; um ponto da curva de
// risco nao pode depender do que o cliente mandou.
exports.medicaoDeRisco = onDocumentWritten(
  { region: 'us-central1', document: 'riscos/{id}' },
  async (event) => {
    const depois = event.data && event.data.after && event.data.after.exists
      ? event.data.after.data() : null;
    const antes = event.data.before && event.data.before.exists
      ? event.data.before.data() : null;

    if (!depois) {
      // Risco excluido: os pontos JA GRAVADOS da curva continuam intocados
      // (nao reescreve o passado), mas sem uma medicao de FECHAMENTO agora, a
      // ultima medicao existente (a de antes de excluir) continuaria sendo
      // "a mais recente" para sempre -- o risco ficaria contando no retrato
      // de hoje e de todo dia futuro, mesmo tendo sumido da grade ao vivo na
      // hora. classificacao 'Excluído' (STATUS_FORA em historicoRisco.js)
      // fecha a conta a partir de agora.
      if (antes) {
        const fechamento = medicaoDeExclusaoRisco(event.params.id, antes);
        if (fechamento) {
          try {
            const idPonto = `${event.params.id}__${fechamento.coletadoEm}`;
            await db.collection(COLECAO_MEDICOES)
              .doc(idDaMedicao(FONTE.RISCO, idPonto))
              .set(fechamento, { merge: true });
          } catch (err) {
            logger.error('medicaoDeRisco: falha ao gravar fechamento de exclusao', { id: event.params.id, erro: err.message });
          }
        }
      }
    } else {
      const medicao = medicaoDeRisco(event.params.id, depois, antes);
      if (!medicao) return; // nada relevante mudou, ou escala nao reconhecida

      // Divergencia entre o score gravado pelo cliente e o recalculado aqui: nao
      // corrige o documento (isso e decisao de produto), mas registra, porque e
      // sinal de escala fora do padrao ou de gravacao direta no banco.
      const scoreDoCliente = Number(depois.score);
      if (Number.isFinite(scoreDoCliente) && scoreDoCliente !== medicao.valor) {
        logger.warn('medicaoDeRisco: score do cliente difere do recalculado', {
          id: event.params.id, cliente: scoreDoCliente, servidor: medicao.valor,
        });
      }

      try {
        // Um ponto por reavaliacao: o id inclui o instante, senao a segunda
        // reavaliacao sobrescreveria a primeira e o historico nao existiria.
        const idPonto = `${event.params.id}__${medicao.coletadoEm}`;
        await db.collection(COLECAO_MEDICOES)
          .doc(idDaMedicao(FONTE.RISCO, idPonto))
          .set(medicao, { merge: true });
      } catch (err) {
        logger.error('medicaoDeRisco: falha ao gravar medicao', { id: event.params.id, erro: err.message });
        return;
      }
    }

    // Sem isto, o retrato de "hoje" (historico_risco) so seria recalculado na
    // proxima rodada de retratoDiarioRisco (agendada, 1x por dia, 6h) -- o
    // Monitor de Risco ficaria ate 24h atrasado em relacao a grade de Riscos,
    // que le a colecao ao vivo. Regrava so o dia de hoje (salvarRetrato e
    // idempotente por chave de dia); os dias passados continuam intocados.
    try {
      const retrato = await retratoRisco.gerarRetrato(db, new Date().toISOString());
      await retratoRisco.salvarRetrato(db, retrato);
    } catch (err) {
      logger.error('medicaoDeRisco: falha ao atualizar o retrato de hoje', { id: event.params.id, erro: err.message });
    }
  }
);

// Retrato diario do risco consolidado (Fase 5 -- O monitor). Roda 1x por dia
// e grava em historico_risco/{YYYY-MM-DD} -- e o que faz a curva existir.
// Usa a mesma reconstrucao (retratoRisco.js/historicoRisco.js) que o
// backfill manual (scripts/backfill-historico-risco.js), para os dois
// nunca poderem divergir sobre como calcular o mesmo numero.
exports.retratoDiarioRisco = onSchedule(
  { region: 'us-central1', schedule: '0 6 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    try {
      const agora = new Date().toISOString();
      const insumos = await retratoRisco.montarInsumos(db);
      // DECISAO 21/10/2026: risco criado (ou datado) no passado muda os dias ja
      // gravados -- regrava do dia mais antigo afetado ate ontem, com os mesmos
      // insumos, antes do retrato de hoje.
      const dias = retratoRisco.diasParaRegravar(insumos.medicoesRisco, agora);
      for (const d of dias) {
        await retratoRisco.salvarRetrato(db, await retratoRisco.gerarRetrato(db, retratoRisco.fimDoDiaISO(d), insumos));
      }
      if (dias.length) logger.info('retratoDiarioRisco: dias passados regravados', { de: dias[0], ate: dias[dias.length - 1], total: dias.length });
      const retrato = await retratoRisco.gerarRetrato(db, agora, insumos);
      const dia = await retratoRisco.salvarRetrato(db, retrato);
      logger.info('retratoDiarioRisco: gravado', { dia, carga: retrato.empresa.carga, contados: retrato.empresa.contados });
    } catch (err) {
      logger.error('retratoDiarioRisco: falha ao gravar o retrato do dia', { erro: err.message });
    }
  }
);
