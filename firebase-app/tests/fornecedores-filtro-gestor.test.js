// Fornecedores: gestor e área vêm dos CONTRATOS VIGENTES (19/10/2026); filtro por
// "Gestor do Contrato" (16/10/2026). app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'p1', categoria: 'Pessoas', nome: 'Gabriel Fortes' },
  { id: 'p2', categoria: 'Pessoas', nome: 'Kaique Xavier' },
  { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud' },
  { id: 'f2', categoria: 'Fornecedores', nome: 'Beta Telecom' },
  { id: 'f3', categoria: 'Fornecedores', nome: 'Gama Sem Cadastro' },
  { id: 'f4', categoria: 'Fornecedores', nome: 'Delta Sem Contrato' },
  // Só tem contrato ENCERRADO: o gestor dele não conta.
  { id: 'f5', categoria: 'Fornecedores', nome: 'Épsilon Encerrado' },
  // Contrato vigente, mas sem gestor.
  { id: 'f6', categoria: 'Fornecedores', nome: 'Zeta Sem Gestor' },
  // Gestor e área LEGADOS no cadastro: não valem mais, só o contrato.
  { id: 'f7', categoria: 'Fornecedores', nome: 'Eta Legado', setor: 'Jurídico', gestorContrato: 'Fulano Antigo', gestoresContrato: [{ id: 'p2', nome: 'Kaique Xavier' }] },
];
const STATUS = [
  { id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true },
  { id: 's-enc', nome: 'Encerrado', situacao: 'encerrado', ativo: true },
];
const ct = (id, fornecedorId, extra) => Object.assign({ id, codigo: 'CT-' + id, fornecedorId, statusId: 's-vig', gestor: null, area: '' }, extra);
const CONTRATOS = [
  ct('1', 'f1', { gestor: { id: 'p1', nome: 'Gabriel Fortes' }, area: 'TI' }),
  ct('2', 'f2', { gestor: { id: 'p2', nome: 'Kaique Xavier' }, area: 'Jurídico' }),
  ct('3', 'f2', { gestor: { id: 'p1', nome: 'Gabriel Fortes' }, area: 'TI' }),
  ct('4', 'f3', { gestor: { id: null, nome: 'Ana Souza' }, area: 'RH' }),
  ct('5', 'f5', { statusId: 's-enc', gestor: { id: 'p1', nome: 'Gabriel Fortes' }, area: 'TI' }),
  ct('6', 'f6', { area: 'Financeiro' }),
];

async function carregar(extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin';
  const dados = Object.assign({
    getDependencias: DEPS, getCriteriosFornecedor: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
    getCategoriasFornecedor: [], getSubcategoriasFornecedor: [], getCriticidadeFornecedorPerguntas: [],
    getAreas: [{ nome: 'TI' }, { nome: 'Jurídico' }, { nome: 'RH' }, { nome: 'Financeiro' }],
    getContratos: CONTRATOS, getStatusContrato: STATUS,
  }, extra || {});
  w.API = new Proxy({}, { get: (_, nome) => async () => JSON.parse(JSON.stringify(dados[nome] || [])) });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.fornecedores();
  return { w, doc: w.document, $: (id) => w.document.getElementById(id) };
}

// Nome da empresa = o primeiro nó de texto da célula (embaixo vem a linha de contrato).
const empresas = (doc) => [...doc.querySelectorAll('#listaFornecedores tbody tr')].map((tr) => tr.children[0].firstChild.textContent.trim()).sort();
const escolher = (w, $, valor) => { $('filtroFornCadastroGestor').value = valor; w.renderizarFornecedores(); };
const TOTAL = DEPS.filter((d) => d.categoria === 'Fornecedores').length;

test('o filtro existe, com os gestores dos contratos VIGENTES, em ordem alfabética', async () => {
  const { $ } = await carregar();
  const sel = $('filtroFornCadastroGestor');
  assert.ok(sel);
  assert.equal(sel.getAttribute('aria-label'), 'Gestor');
  const opcoes = [...sel.options].map((o) => o.textContent);
  // Fulano Antigo e o gestor legado do Eta ficam de fora: só o contrato vale.
  assert.deepStrictEqual(opcoes, ['Gestor: Todos', 'Gestor: Sem gestor', 'Gestor: Ana Souza', 'Gestor: Gabriel Fortes', 'Gestor: Kaique Xavier']);
});

test('escolher um gestor mostra os fornecedores em que ele é gestor de contrato vigente, em qualquer posição', async () => {
  const { w, doc, $ } = await carregar();
  assert.equal(empresas(doc).length, TOTAL);
  escolher(w, $, 'id:p1');
  assert.deepStrictEqual(empresas(doc), ['Alfa Cloud', 'Beta Telecom'], 'Épsilon só tem contrato encerrado');
  escolher(w, $, 'id:p2');
  assert.deepStrictEqual(empresas(doc), ['Beta Telecom']);
});

test('gestor do contrato sem cadastro de Pessoa (sem id) também filtra, pelo nome', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, 'nome:ana souza');
  assert.deepStrictEqual(empresas(doc), ['Gama Sem Cadastro']);
});

test('"Sem gestor": sem contrato vigente, só contrato encerrado, ou contrato vigente sem gestor; o gestor legado não conta', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, '__sem_gestor__');
  assert.deepStrictEqual(empresas(doc), ['Delta Sem Contrato', 'Eta Legado', 'Zeta Sem Gestor', 'Épsilon Encerrado'].sort());
});

test('voltar para "Todos os gestores" restaura a lista; combina com a busca', async () => {
  const { w, doc, $ } = await carregar();
  escolher(w, $, 'id:p1');
  $('buscaFornecedor').value = 'beta';
  w.renderizarFornecedores();
  assert.deepStrictEqual(empresas(doc), ['Beta Telecom']);
  $('buscaFornecedor').value = '';
  escolher(w, $, '');
  assert.equal(empresas(doc).length, TOTAL);
});

test('a escolha sobrevive a re-renderizações (digitar na busca não remonta o filtro)', async () => {
  const { w, $ } = await carregar();
  escolher(w, $, 'id:p2');
  $('buscaFornecedor').value = 'b';
  w.renderizarFornecedores();
  w.renderizarFornecedores();
  assert.equal($('filtroFornCadastroGestor').value, 'id:p2');
});

test('a grade mostra gestor e área dos contratos vigentes (1º + "+N"); sem contrato vigente, "–"', async () => {
  const { doc } = await carregar();
  const linha = (nome) => [...doc.querySelectorAll('#listaFornecedores tbody tr')].find((tr) => tr.children[0].firstChild.textContent.trim() === nome);
  const beta = linha('Beta Telecom');
  assert.match(beta.textContent, /Kaique Xavier\s*\+1/, 'dois gestores: o primeiro e +1');
  assert.match(beta.textContent, /Jurídico\s*\+1/, 'duas áreas: a primeira e +1');
  assert.match(beta.innerHTML, /title="Kaique Xavier, Gabriel Fortes"/);
  const delta = linha('Delta Sem Contrato');
  assert.doesNotMatch(delta.textContent, /Kaique|Gabriel|Jurídico/);
  const eta = linha('Eta Legado');
  assert.doesNotMatch(eta.textContent, /Fulano Antigo|Kaique|Jurídico/, 'gestor e setor legados não aparecem mais');
});

test('filtro de área: casa com a área de qualquer contrato vigente; contrato encerrado e setor legado não contam', async () => {
  const { w, doc, $ } = await carregar();
  $('filtroFornCadastroSetor').value = 'TI';
  w.filtrarFornecedores();
  assert.deepStrictEqual(empresas(doc), ['Alfa Cloud', 'Beta Telecom']);
  $('filtroFornCadastroSetor').value = 'Jurídico';
  w.filtrarFornecedores();
  assert.deepStrictEqual(empresas(doc), ['Beta Telecom'], 'o setor legado do Eta não vale');
});

test('a busca também acha pelo nome de uma pessoa relacionada ao fornecedor', async () => {
  const deps = DEPS.map((d) => (d.id === 'f4' ? { ...d, pessoasRelacionadas: [{ id: 'p2', nome: 'Kaique Xavier', papel: 'Usuário-chave' }] } : d));
  const { w, doc, $ } = await carregar({ getDependencias: deps });
  $('buscaFornecedor').value = 'kaique';
  w.renderizarFornecedores();
  assert.deepStrictEqual(empresas(doc), ['Delta Sem Contrato']);
});
