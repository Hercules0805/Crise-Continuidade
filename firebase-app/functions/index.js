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
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { READ_ACTIONS, WRITE_ACTIONS, TokenError } = require('./tokenLogic');
const { COLECAO: COLECAO_MEDICOES, FONTE, idDaMedicao, medicaoDeRespostaBia } = require('./medicoes');
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
  };
}

exports.appApi = onRequest({ region: 'us-central1', cors: false, secrets: [GEMINI_API_KEY] }, async (req, res) => {
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
