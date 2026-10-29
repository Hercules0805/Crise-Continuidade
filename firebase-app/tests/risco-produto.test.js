// Produto de Software no risco (20/10/2026): campo no drawer (herdado da vulnerabilidade ou
// escolhido), valor inativo/removido visivel, salvar envia o id; filtro Produto na grade.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const PRODUTOS = [
  { id: 'ps1', nome: 'ERP', ativo: true },
  { id: 'ps2', nome: 'Portal', ativo: true },
  { id: 'ps3', nome: 'Legado', ativo: false },
];
const RISCOS = [
  { id: 'r1', titulo: 'Falha no ERP', area: 'TI', status: 'Identificado', origem: 'Vulnerabilidade', vulnerabilidadeCodigo: '2026-001', produtoSoftwareId: 'ps1', probabilidade: 'Alta', impacto: 'Alto', categorias: [] },
  { id: 'r2', titulo: 'Sistema antigo', area: 'TI', status: 'Identificado', origem: 'Manual', produtoSoftwareId: 'ps3', categorias: [] },
  { id: 'r3', titulo: 'Produto apagado', area: 'RH', status: 'Identificado', origem: 'Manual', produtoSoftwareId: 'psX', categorias: [] },
  { id: 'r4', titulo: 'Risco sem produto', area: '', status: 'Identificado', origem: 'Manual', categorias: [] },
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin';
  w.API = new Proxy({}, {
    get: (_, n) => async () => {
      if (n === 'getRiscos') return JSON.parse(JSON.stringify(RISCOS));
      if (n === 'getProdutosSoftware') return JSON.parse(JSON.stringify(PRODUTOS));
      if (n === 'getConfigRiscos') return { apetite: 'Moderado' };
      return [];
    },
    set: () => true,
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'vulnerabilidade-painel.js', 'cvss31.js', 'risco-consolidado.js', 'risco-relatorio.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.riscos();
  return { w, doc: w.document };
}

const opcoes = (el) => [...el.options].map((o) => [o.value, o.textContent]);

test('drawer: produtos ativos + valor gravado inativo ou removido; dica de heranca no risco de vulnerabilidade', async () => {
  const { w, doc } = await carregar();
  await w.abrirDrawerRisco(JSON.parse(JSON.stringify(RISCOS[0])));
  const s = doc.getElementById('rProdutoSoftware');
  assert.deepStrictEqual(opcoes(s), [['', '-- Nenhum --'], ['ps1', 'ERP'], ['ps2', 'Portal']]);
  assert.strictEqual(s.value, 'ps1');
  assert.match(doc.getElementById('rProdutoSoftwareDica').textContent, /Herdado da vulnerabilidade 2026-001/);
  await w.abrirDrawerRisco(JSON.parse(JSON.stringify(RISCOS[1])));
  assert.deepStrictEqual(opcoes(doc.getElementById('rProdutoSoftware')).pop(), ['ps3', 'Legado (inativo)']);
  assert.strictEqual(doc.getElementById('rProdutoSoftware').value, 'ps3');
  assert.doesNotMatch(doc.getElementById('rProdutoSoftwareDica').textContent, /Herdado/);
  await w.abrirDrawerRisco(JSON.parse(JSON.stringify(RISCOS[2])));
  assert.deepStrictEqual(opcoes(doc.getElementById('rProdutoSoftware')).pop(), ['psX', '(produto removido)']);
});

test('drawer: o formulario envia produtoSoftwareId', async () => {
  const { w, doc } = await carregar();
  await w.abrirDrawerRisco(JSON.parse(JSON.stringify(RISCOS[3])));
  doc.getElementById('rProdutoSoftware').value = 'ps2';
  assert.strictEqual(w._coletarFormularioRisco().produtoSoftwareId, 'ps2');
  doc.getElementById('rProdutoSoftware').value = '';
  assert.strictEqual(w._coletarFormularioRisco().produtoSoftwareId, '');
});

test('grade: filtro Produto (produtos dos riscos + Sem produto) e busca pelo nome do produto', async () => {
  const { w, doc } = await carregar();
  const filtro = doc.getElementById('filtroRiscoProduto');
  assert.deepStrictEqual(opcoes(filtro).map((o) => o[1]), ['Produto: Todos', 'Produto: (produto removido)', 'Produto: ERP', 'Produto: Legado', 'Produto: Sem produto']);
  const linhas = () => [...doc.querySelectorAll('#riscoRows tr')].map((tr) => tr.textContent).join(' | ');
  filtro.value = 'ps1'; w.filtrarRiscos();
  assert.match(linhas(), /Falha no ERP/);
  assert.doesNotMatch(linhas(), /Sistema antigo|Risco sem produto/);
  filtro.value = '__sem__'; w.filtrarRiscos();
  assert.match(linhas(), /Risco sem produto/);
  assert.doesNotMatch(linhas(), /Falha no ERP/);
  filtro.value = ''; doc.getElementById('buscaRisco').value = 'portal'; w.filtrarRiscos();
  assert.doesNotMatch(linhas(), /Falha no ERP/);
  doc.getElementById('buscaRisco').value = 'legado'; w.filtrarRiscos();
  assert.match(linhas(), /Sistema antigo/);
});

test('grade enxuta (8 colunas): Data, Título, Área, Responsável, Status, Score, Residual, Carga; o que saiu fica no title do Título', async () => {
  const { doc } = await carregar();
  const cab = [...doc.querySelectorAll('#listaRiscos thead th')].map((th) => th.textContent.trim().replace(/\s+/g, ' ').split(' ')[0]);
  assert.deepStrictEqual(cab, ['Data', 'Título', 'Área', 'Responsável', 'Status', 'Score', 'Residual', 'Carga', 'Ações']);
  assert.strictEqual(doc.querySelectorAll('#listaRiscos colgroup col').length, cab.length, 'uma largura por coluna');
  const tr = [...doc.querySelectorAll('#riscoRows tr')].find((x) => x.textContent.includes('Falha no ERP'));
  assert.strictEqual(tr.children.length, cab.length, 'cada célula sob o seu cabeçalho');
  const titulo = tr.children[cab.indexOf('Título')];
  assert.ok(titulo.classList.contains('title'));
  assert.strictEqual(titulo.textContent.trim(), 'Falha no ERP');
  assert.match(titulo.getAttribute('title'), /Origem: Vulnerabilidade Reportada/);
  assert.match(titulo.getAttribute('title'), /Corporativo/);
  assert.match(titulo.getAttribute('title'), /Produto: ERP/);
  const semProduto = [...doc.querySelectorAll('#riscoRows tr')].find((x) => x.textContent.includes('Risco sem produto'));
  assert.doesNotMatch(semProduto.children[cab.indexOf('Título')].getAttribute('title'), /Produto:/);
  const apagado = [...doc.querySelectorAll('#riscoRows tr')].find((x) => x.textContent.includes('Produto apagado'));
  assert.match(apagado.children[cab.indexOf('Título')].getAttribute('title'), /Produto: \(produto removido\)/);
});
