// Aviso de fonte que falhou na coleta (29/10/2026): mostra a mensagem do erro
// junto do nome da fonte, para saber se foi bloqueio (HTTP 403), queda ou tempo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div><div id="intelAvisos"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin';
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => { if (fs.existsSync(path.join(PUB, f))) w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')); });
  // O `let intelConfig` do app.js so e visivel no mesmo eval: o gancho vai junto.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;window.__avisosIntel = (c) => { intelConfig = c; _desenharAvisosIntel(); };');
  return w;
}

test('aviso da coleta: nome da fonte com a mensagem do erro, escapada', () => {
  const w = carregar();
  w.__avisosIntel({ inventario: { importacaoAtual: 'x' }, geral: { feeds: [], ultimaColeta: {
    em: '2026-10-29T09:30:00.000Z',
    erros: [{ feed: 'CISO Advisor', erro: 'HTTP 403' }, { feed: 'Outra <b>', erro: '' }],
  } } });
  const el = w.document.getElementById('intelAvisos');
  assert.match(el.textContent, /2 fontes falharam: CISO Advisor \(HTTP 403\), Outra <b>\./);
  assert.ok(!el.querySelector('b'), 'nome da fonte escapado');
});
