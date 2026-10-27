// Revisão de UX, fase 4 (16/10/2026): acessibilidade de drawers, modais e avisos.
// O "Tab preso no diálogo" depende de layout (offsetParent), que o jsdom não
// calcula: é conferido no navegador, não aqui.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js'];

function carregar(dados = {}) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.APP_API_URL = '';
  w.USER_PERFIS = ['admin'];
  w.USER_PERFIL = 'admin';
  w.confirm = () => true;
  w.console.log = () => {};
  w.API = new Proxy({}, { get: (_, n) => async () => (dados[n] !== undefined ? JSON.parse(JSON.stringify(dados[n])) : (/Config/.test(n) ? {} : [])) });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  return w;
}
const espera = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('drawer aberto e um dialogo acessivel: role, aria-modal e o titulo como rotulo', async () => {
  const w = carregar({ getRiscos: [{ id: 'r1', titulo: 'Risco A', area: 'TI', status: 'Identificado', categorias: [] }] });
  await w.riscos();
  await espera();
  await w.abrirDrawerRisco();
  await espera();
  const d = w.document.getElementById('drawerRisco');
  assert.strictEqual(d.getAttribute('role'), 'dialog');
  assert.strictEqual(d.getAttribute('aria-modal'), 'true');
  const rotulo = w.document.getElementById(d.getAttribute('aria-labelledby'));
  assert.ok(rotulo && /Risco/.test(rotulo.textContent), 'aria-labelledby aponta para o titulo do drawer');
  const x = Array.from(d.querySelectorAll('.drawer-header button')).find((b) => b.textContent.trim() === '×');
  assert.strictEqual(x.getAttribute('aria-label'), 'Fechar');
  w.close();
});

test('botoes so de icone ganham aria-label a partir do title', async () => {
  const w = carregar({ getRiscos: [{ id: 'r1', titulo: 'Risco A', area: 'TI', status: 'Identificado', categorias: [] }] });
  await w.riscos();
  await espera();
  const icones = Array.from(w.document.querySelectorAll('#riscoRows .btn-icon'));
  assert.ok(icones.length > 0);
  icones.forEach((b) => assert.strictEqual(b.getAttribute('aria-label'), b.title));
  w.close();
});

test('ao fechar o dialogo, o foco volta para quem abriu', async () => {
  const w = carregar();
  const doc = w.document;
  doc.body.insertAdjacentHTML('beforeend', '<button id="abridor">abrir</button><div class="modal-overlay" id="mx"><div class="modal"><h3>X</h3><div class="modal-footer"><button>Cancelar</button></div></div></div>');
  doc.getElementById('abridor').focus();
  doc.getElementById('mx').classList.add('open');
  await espera();
  doc.querySelector('#mx button').focus();
  doc.getElementById('mx').classList.remove('open');
  await espera();
  assert.strictEqual(doc.activeElement.id, 'abridor');
  w.close();
});

test('avisos (toast) sao anunciados por leitor de tela', () => {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.match(html, /<div class="toast" id="toast" role="status" aria-live="polite"><\/div>/);
});
