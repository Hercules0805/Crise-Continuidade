// ============================================================
// CLIENTE FIRESTORE (REST) PARA APPS SCRIPT
//
// Permite que o Apps Script leia/escreva no Firestore do projeto
// bia-forte-2025, usado pelas funções residuais (geração de token, PCN,
// relatório) após a migração da persistência para o Firestore.
//
// CONFIGURAÇÃO (Propriedades do Script):
//   FIREBASE_PROJECT_ID       -> bia-forte-2025 (opcional; default abaixo)
//   FIREBASE_SA_CLIENT_EMAIL  -> client_email da service account
//   FIREBASE_SA_PRIVATE_KEY   -> private_key da service account (com \n)
//
// A service account precisa do papel "Cloud Datastore User" (ou Firebase Admin)
// no projeto. Gere a chave em: Console GCP -> IAM -> Contas de serviço.
// ============================================================

var FS_PROJECT_ID = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID') || 'bia-forte-2025';
var FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FS_PROJECT_ID + '/databases/(default)/documents';

// ---- OAuth (JWT) da service account, com cache ----
function _fsAccessToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fs_access_token');
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty('FIREBASE_SA_CLIENT_EMAIL');
  var privateKey = (props.getProperty('FIREBASE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Service account do Firestore não configurada (FIREBASE_SA_CLIENT_EMAIL / FIREBASE_SA_PRIVATE_KEY).');
  }

  var now = Math.floor(Date.now() / 1000);
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));
  var signatureInput = header + '.' + claim;
  var signature = Utilities.computeRsaSha256Signature(signatureInput, privateKey);
  var jwt = signatureInput + '.' + Utilities.base64EncodeWebSafe(signature);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (!body.access_token) {
    throw new Error('Falha ao obter token do Firestore: ' + res.getContentText());
  }
  cache.put('fs_access_token', body.access_token, 3300); // ~55 min
  return body.access_token;
}

function _fsHeaders() {
  return { Authorization: 'Bearer ' + _fsAccessToken() };
}

// ---- Conversão JS <-> formato de valores do Firestore REST ----
function _fsToValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(_fsToValue) } };
  if (typeof v === 'object') {
    var fields = {};
    Object.keys(v).forEach(function (k) { fields[k] = _fsToValue(v[k]); });
    return { mapValue: { fields: fields } };
  }
  return { stringValue: String(v) };
}

function _fsFromValue(val) {
  if (!val) return null;
  if (val.nullValue !== undefined) return null;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue !== undefined) return (val.arrayValue.values || []).map(_fsFromValue);
  if (val.mapValue !== undefined) return _fsFieldsToObj(val.mapValue.fields || {});
  return null;
}

function _fsFieldsToObj(fields) {
  var obj = {};
  Object.keys(fields || {}).forEach(function (k) { obj[k] = _fsFromValue(fields[k]); });
  return obj;
}

function _fsDocToObj(doc) {
  if (!doc) return null;
  var obj = _fsFieldsToObj(doc.fields || {});
  var parts = (doc.name || '').split('/');
  obj.id = parts[parts.length - 1];
  return obj;
}

// ---- Operações ----
// Lista todos os documentos de uma coleção (pagina automaticamente).
function fsGetAll(collection) {
  var docs = [];
  var pageToken = '';
  do {
    var url = FS_BASE + '/' + encodeURIComponent(collection) + '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var res = UrlFetchApp.fetch(url, { headers: _fsHeaders(), muteHttpExceptions: true });
    var body = JSON.parse(res.getContentText());
    if (body.error) throw new Error('Firestore GET ' + collection + ': ' + body.error.message);
    (body.documents || []).forEach(function (d) { docs.push(_fsDocToObj(d)); });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}

// Lê um documento por id (null se não existe).
function fsGetDoc(collection, id) {
  var url = FS_BASE + '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(id);
  var res = UrlFetchApp.fetch(url, { headers: _fsHeaders(), muteHttpExceptions: true });
  if (res.getResponseCode() === 404) return null;
  var body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('Firestore GET doc: ' + body.error.message);
  return _fsDocToObj(body);
}

// Cria/atualiza documento por id com merge (updateMask = campos enviados).
function fsSet(collection, id, data) {
  var fields = {};
  Object.keys(data).forEach(function (k) { fields[k] = _fsToValue(data[k]); });
  var mask = Object.keys(data).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var url = FS_BASE + '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(id) + '?' + mask;
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: _fsHeaders(),
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('Firestore SET: ' + body.error.message);
  return _fsDocToObj(body);
}

// Cria documento com id gerado.
function fsAdd(collection, data) {
  var fields = {};
  Object.keys(data).forEach(function (k) { fields[k] = _fsToValue(data[k]); });
  var url = FS_BASE + '/' + encodeURIComponent(collection);
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: _fsHeaders(),
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('Firestore ADD: ' + body.error.message);
  return _fsDocToObj(body);
}

// ---- Helpers de domínio (espelham api.js/tokenLogic) ----
function _fsSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function fsProcessoKey(area, processo) {
  return _fsSlug(area) + '__' + _fsSlug(processo);
}

// Acha o docId de um processo por área+nome (processoKey, com fallback por busca).
function fsAcharProcessoId(area, processo) {
  var chave = fsProcessoKey(area, processo);
  var doc = fsGetDoc('processos', chave);
  if (doc) return chave;
  var todos = fsGetAll('processos');
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  var match = todos.find(function (p) { return norm(p.area) === norm(area) && norm(p.processo) === norm(processo); });
  return match ? match.id : null;
}

// Grava um token no Firestore (docId = token) para que a Cloud Function
// tokenApi consiga validá-lo. `processoComPrefixo` mantém o prefixo
// (_AREA_/_BIA_/_DRP_/_LEV_ ou o nome do processo para avaliação simples).
function fsGravarToken(token, area, processoComPrefixo, email, criadoEm, expiraEm) {
  fsSet('tokens', token, {
    token: token,
    area: area || '',
    processo: processoComPrefixo || '',
    email: email || '',
    criadoEm: criadoEm ? new Date(criadoEm).toISOString() : new Date().toISOString(),
    expiraEm: expiraEm ? new Date(expiraEm).toISOString() : '',
    usado: false
  });
}

// Score do processo = score da última resposta (por timestamp) em respostas_bia
// para o par area/processo. 0 se nunca avaliado.
function _fsScoreProcesso(area, processo) {
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  var respostas = fsGetAll('respostas_bia').filter(function (r) {
    return norm(r.area) === norm(area) && norm(r.processo) === norm(processo);
  });
  if (!respostas.length) return 0;
  respostas.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });
  return Number(respostas[0].score) || 0;
}

// Processos de uma área (Firestore) com score derivado da última resposta.
// Usado pelo relatório de área (gerarRelatorioArea).
function fsGetProcessosPorArea(area) {
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  var processos = fsGetAll('processos').filter(function (p) { return norm(p.area) === norm(area); });

  // Indexar última resposta por processo (área fixa).
  var respostas = fsGetAll('respostas_bia').filter(function (r) { return norm(r.area) === norm(area); });
  respostas.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });
  var scorePorProc = {};
  respostas.forEach(function (r) {
    var key = norm(r.processo);
    if (scorePorProc[key] === undefined) scorePorProc[key] = Number(r.score) || 0;
  });

  return processos.map(function (p) {
    return {
      id: p.id,
      area: p.area,
      processo: p.processo,
      tier: p.tier || '',
      score: scorePorProc[norm(p.processo)] || 0
    };
  });
}
