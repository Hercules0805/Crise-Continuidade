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

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { READ_ACTIONS, WRITE_ACTIONS, TokenError } = require('./tokenLogic');

admin.initializeApp();
const db = admin.firestore();

// Origens permitidas (hosting do projeto). '*' também é aceitável aqui porque
// não há credenciais/cookies envolvidos e a autorização vem da posse do token.
const ALLOWED_ORIGINS = [
  'https://bia-forte-2025.web.app',
  'https://bia-forte-2025.firebaseapp.com',
];

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
