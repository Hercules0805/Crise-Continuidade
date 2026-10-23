// "Fechar" nos 9 drawers de edicao: so grava se o formulario mudou (DECISAO 08/10/2026,
// complemento 13/10/2026). Carrega o app.js REAL num navegador simulado (jsdom), com a
// API trocada por um espiao que conta as gravacoes -- o que importa aqui e quantas
// idas ao servidor cada Fechar faz, e se a edicao nunca e descartada em silencio.
//
// Os cenarios ficam em fixtures/fechar-drawers/*.js (rodam DENTRO do mesmo escopo do
// app.js, para alcançar as variaveis internas); cada um devolve linhas "OK ..." /
// "FALHA ...".
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS_REAIS = ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js'];

async function rodarCenarios(arquivo) {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const calls = {};
  const lentos = {};
  w.__calls = calls;
  w.__lentos = lentos;
  w.__ret = {};
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.APP_API_URL = '';
  w.confirm = () => true;
  w.alert = () => {};
  w.USER_PERFIS = ['admin'];
  w.USER_EMAIL = 'adm@fortestecnologia.com.br';
  w.API = new Proxy({}, {
    get: (_, nome) => async (...a) => {
      (calls[nome] = calls[nome] || []).push(a);
      if (lentos[nome]) await new Promise((r) => setTimeout(r, lentos[nome]));
      if (w.__ret[nome] !== undefined) return JSON.parse(JSON.stringify(w.__ret[nome]));
      if (/^salvar/.test(nome)) { const b = a[0] || {}; return { success: true, id: b.id || 'novo-id', dado: b }; }
      if (/Config/.test(nome)) return {};
      return [];
    },
  });
  SCRIPTS_REAIS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  const cenarios = fs.readFileSync(path.join(__dirname, 'fixtures', 'fechar-drawers', arquivo), 'utf8');
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;' + cenarios);
  // Array.from: o array nasce no "mundo" do jsdom e o deepStrictEqual o trataria como outro tipo.
  try { return Array.from(await w.__rodar()); } finally { w.close(); }
}

test('Fechar em Vulnerabilidade, Servico, Backup, Criticidade, Pessoa, Fornecedor, Risco e Dependencia', async () => {
  const linhas = await rodarCenarios('catalogos.js');
  assert.ok(linhas.length >= 35, 'os cenarios deveriam ter rodado (' + linhas.length + ' linhas)');
  assert.deepStrictEqual(linhas.filter((l) => l.startsWith('FALHA')), []);
});

test('Fechar em Processo: abas sob demanda nao sujam, resposta da avaliacao conta como edicao', async () => {
  const linhas = await rodarCenarios('processo.js');
  assert.ok(linhas.length >= 8, 'os cenarios deveriam ter rodado (' + linhas.length + ' linhas)');
  assert.deepStrictEqual(linhas.filter((l) => l.startsWith('FALHA')), []);
});
