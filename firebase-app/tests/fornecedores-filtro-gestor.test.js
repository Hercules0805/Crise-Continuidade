// Fornecedores: filtro por "Gestor do Contrato" (16/10/2026). app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'p1', categoria: 'Pessoas', nome: 'Gabriel Fortes' },
  { id: 'p2', categoria: 'Pessoas', nome: 'Kaique Xavier' },
  { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud', gestoresContrato: [{ id: 'p1', nome: 'Gabriel Fortes' }] },
  { id: 'f2', categoria: 'Fornecedores', nome: 'Beta Telecom', gestoresContrato: [{ id: 'p2', nome: 'Kaique Xavier' }, { id: 'p1', nome: 'Gabriel Fortes' }] },
  { id: 'f3', categoria: 'Fornecedores', nome: 'Gama Legado', gestorContrato: 'Ana Souza' },
  { id: 'f4', categoria: 'Fornecedores', nome: 'Delta Sem Gestor' },
  { id: 'f5', categoria: 'Fornecedores', nome: 'Épsilon', gestoresContrato: [{ id: null, nome: 'Zélia Sem Cadastro' }] },
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin';
  const dados = {
    getDependencias: DEPS, getCriteriosFornecedor: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
    getCategoriasFornecedor: [], getSubcategoriasFornecedor: [], getCriticidadeFornecedorPerguntas: [], getAreas: [],
    getContratos: [], getStatusContrato: [],
  };
  w.API = new Proxy({}, { get: (_, nome) => async () => JSON.parse(JSON.stringify(dados[nome] || [])) });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.fornecedores();
  return { w, doc: w.document, $: (id) => w.document.getElementById(id) };
}

// Nome da empresa = o primeiro nó de texto da célula (embaixo vem a linha de contrato).
const empresas = (doc) => [...doc.querySelectorAll('#listaFornecedores tbody tr')].map((tr) => tr.children[0].firstChild.textContent.trim()).sort();
const escolher = (w, $, valor) => { $('filtroFornCadastroGestor').value = valor; w.renderizarFornecedores(); };

test('o filtro existe ao lado de Categoria e Setor, com os gestores que aparecem nos fornecedores, em ordem alfabética', async () => {
  const { $ } = await carregar();
  const sel = $('filtroFornCadastroGestor');
  assert.ok(sel);
  assert.equal(sel.parentElement.querySelector('label').textContent, 'Gestor do Contrato');
  const opcoes = [...sel.options].map((o) => o.textContent);
  assert.deepStrictEqual(opcoes, ['Todos os gestores', 'Sem gestor', 'Ana Souza', 'Gabriel Fortes', 'Kaique Xavier', 'Zélia Sem Cadastro']);
});

test('escolher um gestor mostra os fornecedores em que ele aparece, em QUALQUER posição da lista (não só o primeiro)', async () => {
  const { w, doc, $ } = await carregar();
  assert.equal(empresas(doc).length, 5);
  escolher(w, $, 'id:p1');
  assert.deepStrictEqual(empresas(doc), ['Alfa Cloud', 'Beta Telecom']);
  escolher(w, $, 'id:p2');
  assert.deepStrictEqual(empresas(doc), ['Beta Telecom']);
});

test('gestor só no texto legado e gestor sem cadastro (sem id) também filtram', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, 'nome:ana souza');
  assert.deepStrictEqual(empresas(doc), ['Gama Legado']);
  escolher(w, $, 'nome:zélia sem cadastro');
  assert.deepStrictEqual(empresas(doc), ['Épsilon']);
});

test('"Sem gestor" lista só os fornecedores sem nenhum gestor', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, '__sem_gestor__');
  assert.deepStrictEqual(empresas(doc), ['Delta Sem Gestor']);
});

test('voltar para "Todos os gestores" restaura a lista; combina com a busca', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, 'id:p1');
  $('buscaFornecedor').value = 'beta';
  w.renderizarFornecedores();
  assert.deepStrictEqual(empresas(doc), ['Beta Telecom']);
  $('buscaFornecedor').value = '';
  escolher(w, $, '');
  assert.equal(empresas(doc).length, 5);
});

test('a escolha sobrevive a re-renderizações (digitar na busca não remonta o filtro)', async () => {
  const { w, $ } = await carregar();
  escolher(w, $, 'id:p2');
  $('buscaFornecedor').value = 'b';
  w.renderizarFornecedores();
  w.renderizarFornecedores();
  assert.equal($('filtroFornCadastroGestor').value, 'id:p2');
});
