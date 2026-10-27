// Duplicidade no catalogo de dependencias (27/10/2026): helper puro + salvarDep no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const DD = require('../public/dependencia-duplicidade.js');

const PUB = path.join(__dirname, '..', 'public');

test('normaliza acento, caixa e espaços; mesma categoria + mesmo nome duplica', () => {
  assert.equal(DD.normalizarNome('  Servidor   Ápice '), 'servidor apice');
  const lista = [{ id: 'a', categoria: 'Servidor', nome: 'SRV Ápice' }, { id: 'b', categoria: 'API', nome: 'SRV Apice' }];
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Servidor', nome: '  srv  apice' }).id, 'a');
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Banco de Dados', nome: 'SRV Apice' }), null, 'outra categoria não conta');
});

test('o próprio registro não é duplicado de si mesmo', () => {
  const lista = [{ id: 'a', categoria: 'Servidor', nome: 'SRV' }];
  assert.equal(DD.acharDuplicada(lista, { id: 'a', categoria: 'Servidor', nome: 'SRV' }), null);
});

test('Pessoas: homônimos passam; mesmo e-mail duplica', () => {
  const lista = [{ id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', email: 'ana@x.com' }];
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Pessoas', nome: 'Ana Souza', email: 'outra@x.com' }), null);
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Pessoas', nome: 'Ana Souza', email: '' }), null);
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Pessoas', nome: 'Outra', email: ' ANA@x.com' }).id, 'p1');
});

test('Fornecedores: mesmo CNPJ duplica mesmo com nome diferente', () => {
  const lista = [{ id: 'f1', categoria: 'Fornecedores', nome: 'Alfa', cnpj: '12.345.678/0001-90' }];
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Fornecedores', nome: 'Alfa Cloud', cnpj: '12345678000190' }).id, 'f1');
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Fornecedores', nome: 'alfa' }).id, 'f1');
  assert.equal(DD.acharDuplicada(lista, { categoria: 'Fornecedores', nome: 'Beta', cnpj: '' }), null);
});

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['ti']; w.USER_PERFIL = 'ti'; w.USER_AREA = 'TI';
  const gravacoes = [];
  const DEPS = [{ id: 'srv1', categoria: 'Servidor', nome: 'SRV-01' }, { id: 'srv2', categoria: 'Servidor', nome: 'SRV-02' }];
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      if (nome === 'getDependencias') return JSON.parse(JSON.stringify(DEPS));
      return [];
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'dependencia-duplicidade.js', 'servico-composicao.js', 'mapa-continuidade.js',
    'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.dependencias();
  return { w, doc: w.document, gravacoes };
}
const esperar = () => new Promise((r) => setTimeout(r, 20));

test('salvarDep: nome novo grava; repetido na mesma categoria avisa e não grava', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerDependencia();
  await esperar();
  doc.getElementById('depCategoria').value = 'Servidor';
  doc.getElementById('depNome').value = 'SRV-03';
  await w.salvarDep();
  assert.equal(gravacoes.filter((g) => g.nome === 'salvarDependencia').length, 1);

  w.abrirDrawerDependencia();
  await esperar();
  doc.getElementById('depCategoria').value = 'Servidor';
  doc.getElementById('depNome').value = '  srv-01 ';
  const antes = gravacoes.length;
  const r = await w.salvarDep();
  assert.equal(r, false);
  assert.equal(gravacoes.length, antes, 'nada gravado');
});

test('salvarDep: renomear para nome em uso bloqueia; salvar sem mudar o nome passa', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerDependencia({ id: 'srv2', categoria: 'Servidor', nome: 'SRV-02' });
  await esperar();
  doc.getElementById('depNome').value = 'SRV-01';
  assert.equal(await w.salvarDep(), false);
  assert.equal(gravacoes.length, 0);
  doc.getElementById('depNome').value = 'SRV-02';
  await w.salvarDep();
  assert.equal(gravacoes.filter((g) => g.nome === 'salvarDependencia').length, 1);
});
