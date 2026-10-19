// Revisão de UX, fase 1 (16/10/2026): perda de dados e bugs de navegação.
// Carrega o app.js REAL num navegador simulado (jsdom), como fechar-drawers.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS_REAIS = ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js'];

function carregar(perfis, falhar = {}, extra = '') {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.APP_API_URL = '';
  w.confirm = () => true;
  w.alert = () => {};
  w.USER_PERFIS = perfis;
  w.USER_PERFIL = perfis[0];
  w.USER_EMAIL = 'x@fortestecnologia.com.br';
  w.API = new Proxy({}, {
    get: (_, nome) => async () => {
      if (falhar[nome]) throw new Error('rede caiu');
      if (/Config/.test(nome)) return {};
      return [];
    },
  });
  SCRIPTS_REAIS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // `extra` roda no MESMO eval do app.js, para alcançar as const internas.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};\n' + extra);
  return w;
}

const espera = () => new Promise((r) => setTimeout(r, 0));

test('menu e busca filtram pela UNIAO dos perfis (USER_PERFIS), igual ao route()', () => {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.match(html, /Perfis\.ehAdmin\(window\.USER_PERFIS\)/);
  assert.match(html, /Perfis\.podeVerTela\(window\.USER_PERFIS, el\.dataset\.page\)/);
  assert.doesNotMatch(html, /podeVerTela\(window\.USER_PERFIL,/);
});

test('drawers de edicao nao tem mais "Cancelar" ao lado do "Fechar"', () => {
  const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /SemSalvar\(\)">Cancelar</);
});

test('hash que nao e tela nenhuma mostra "Pagina nao encontrada" (nao "nao e do seu perfil")', () => {
  for (const perfis of [['gestor'], ['admin']]) {
    const w = carregar(perfis);
    w._perfilCarregado = true;
    w.location.hash = '#tela-que-nao-existe';
    w.route();
    const texto = w.document.getElementById('app').textContent;
    assert.match(texto, /Página não encontrada/, perfis.join());
    assert.doesNotMatch(texto, /não é do seu perfil/, perfis.join());
    w.close();
  }
});

test('tela que nao carregou mostra erro com "Tentar de novo", nunca "Nenhum ... cadastrado"', async () => {
  const casos = [
    ['dependencias', 'getDependencias'],
    ['servicos', 'getServicos'],
    ['catalogoBackup', 'getBackups'],
    ['vulnerabilidades', 'getVulnerabilidades'],
    ['areas', 'getAreas'],
    ['admin', 'getProcessos'],
  ];
  for (const [tela, api] of casos) {
    const w = carregar(['admin'], { [api]: true });
    await w[tela]();
    await espera();
    const texto = w.document.getElementById('app').textContent;
    assert.match(texto, /Não foi possível carregar/, tela);
    assert.match(texto, /Tentar de novo/, tela);
    assert.doesNotMatch(texto, /Carregando/, tela);
    w.close();
  }
});

test('atalho para tela que o perfil nao ve nao aparece', () => {
  const w = carregar(['ti']);
  assert.strictEqual(w._seVeTela('fornecedores', '<a>x</a>'), '');
  assert.strictEqual(w._seVeTela('dependencias', '<a>x</a>'), '<a>x</a>');
  w.close();
  const g = carregar(['gestor']);
  assert.strictEqual(g._seVeTela('vulnerabilidades', '<a>x</a>'), '');
  assert.strictEqual(g._seVeTela('contratos-tipos', '<a>x</a>'), '');
  g.close();
});

test('questionario BIA: uma interface so -- o check da lista abre o Processo na aba Avaliacao', async () => {
  const w = carregar(['admin'], {}, `
    window.__abas = [];
    editarProcesso = (id) => { window.__editado = id; };
    trocarAbaProcesso = (aba) => { window.__abas.push(aba); };`);
  w.processosData = [{ id: 'p1', processo: 'Folha', area: 'RH' }];
  w.avaliarProcesso('p1');
  assert.strictEqual(w.__editado, 'p1');
  assert.strictEqual(w.__abas.join(), 'avaliacao');
  const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /drawerAvaliar|salvarAvaliacaoProcesso|_edAvaliar/, 'drawer "Avaliar Processo" removido');
  const aba = app.slice(app.indexOf('<div id="painel-avaliacao"'), app.indexOf('<!-- ABA: BIA -->'));
  assert.match(aba, /premissas-avaliacao/);
  assert.match(aba, /imprimirAvaliacao\(\)/);
  w.close();
});
