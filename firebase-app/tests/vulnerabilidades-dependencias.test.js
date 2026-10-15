// Vulnerabilidades: "Dependencias afetadas" (15/10/2026) no lugar do texto livre
// "Ativo afetado". Escolha em duas etapas (categoria -> item), varias por registro,
// vinculo por id; texto antigo preservado como legado. app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'i1', categoria: 'Infraestrutura', nome: 'Firewall' },
  { id: 'i2', categoria: 'Infraestrutura', nome: 'AWS' },
  { id: 'b1', categoria: 'Banco de Dados', nome: 'SQL Server' },
  { id: 's1', categoria: 'Sistemas', nome: 'Jarvis' },
  { id: 'f1', categoria: 'Fornecedores', nome: 'Fornecedor X' },
  { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', areas: ['TI'] },
];
const base = (extra) => Object.assign({
  nome: 'Falha', produto: '', produtoSoftwareId: '', dependenciasAfetadas: [], cvss: null, severidadeManual: 'Média',
  statusCorrecao: 'Pendente', dataDeteccao: '2026-01-10', origemDeteccao: '', tipo: 'Má Configuração', subtipo: '',
  metodoDeteccao: '', cvssVetor: '', cwe: '', cve: '', severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);
const VULNS = [
  base({ id: 'comDeps', codigo: '2026-001', nome: 'Porta aberta', dependenciasAfetadas: [{ id: 'i1', categoria: 'Infraestrutura', nome: 'Firewall' }, { id: 'b1', categoria: 'Banco de Dados', nome: 'SQL Server' }] }),
  base({ id: 'legado', codigo: '2026-002', nome: 'Antigo', produto: '.NET' }),
  base({ id: 'depSumiu', codigo: '2026-003', nome: 'Sumiu', dependenciasAfetadas: [{ id: 'x9', categoria: 'Servidor', nome: 'Servidor Velho' }] }),
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
  const toasts = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['seguranca']; w.USER_PERFIL = 'seguranca';
  w.confirm = () => true;
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (nome === 'salvarVulnerabilidade') { gravacoes.push(JSON.parse(JSON.stringify(arg))); return { success: true, id: arg.id || 'novo' }; }
      if (nome === 'getVulnerabilidades') return JSON.parse(JSON.stringify(VULNS));
      if (nome === 'getDependencias') return JSON.parse(JSON.stringify(DEPS));
      return [];
    },
    set: () => true,
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  w.__toasts = toasts;
  await w.vulnerabilidades();
  return { w, doc: w.document, gravacoes, toasts };
}

const opcoes = (doc, id) => [...doc.getElementById(id).options].map((o) => o.value).filter(Boolean);
const chips = (doc) => [...doc.querySelectorAll('#vulnDepChips .vuln-dep-chip')].map((c) => c.textContent.replace('×', '').trim());
function adicionar(w, doc, categoria, id) {
  doc.getElementById('vulnDepCategoria').value = categoria;
  w._popularItensDependenciaVuln();
  doc.getElementById('vulnDepItem').value = id;
  w.adicionarDependenciaVuln();
}

test('categorias: so as 7 tecnicas + Processos Internos (sem Fornecedores e Pessoas)', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade();
  assert.deepStrictEqual(opcoes(doc, 'vulnDepCategoria'), ['Infraestrutura', 'Sistemas', 'Servidor', 'Banco de Dados', 'API', 'Segurança', 'Processos Internos']);
  assert.ok(doc.getElementById('vulnDepItem').disabled, 'item travado ate escolher a categoria');
  assert.ok(!doc.getElementById('vulnProduto') || doc.getElementById('vulnProduto').type === 'hidden', 'nao ha mais campo de texto livre visivel');
});

test('item: filtra pela categoria, em ordem alfabetica, e esconde os ja escolhidos', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade();
  doc.getElementById('vulnDepCategoria').value = 'Infraestrutura';
  w._popularItensDependenciaVuln();
  assert.deepStrictEqual(opcoes(doc, 'vulnDepItem'), ['i2', 'i1'], 'AWS antes de Firewall');
  adicionar(w, doc, 'Infraestrutura', 'i1');
  assert.deepStrictEqual(opcoes(doc, 'vulnDepItem'), ['i2']);
  adicionar(w, doc, 'Banco de Dados', 'b1');
  assert.deepStrictEqual(chips(doc), ['⚡ Infraestrutura: Firewall', '🗄️ Banco de Dados: SQL Server']);
});

test('adicionar sem escolher avisa; remover pelo x tira o chip e devolve o item a lista', async () => {
  const { w, doc, toasts } = await carregar();
  w.abrirDrawerVulnerabilidade();
  w.adicionarDependenciaVuln();
  assert.equal(toasts.at(-1), 'Escolha a categoria e a dependência.');
  adicionar(w, doc, 'Sistemas', 's1');
  w.removerDependenciaVuln(0);
  assert.deepStrictEqual(chips(doc), []);
  assert.deepStrictEqual(opcoes(doc, 'vulnDepItem'), ['s1']);
});

test('registro gravado abre com os chips; vinculo que sumiu do catalogo aparece "(removida)"', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('comDeps');
  assert.deepStrictEqual(chips(doc), ['⚡ Infraestrutura: Firewall', '🗄️ Banco de Dados: SQL Server']);
  w.abrirDrawerVulnerabilidade('depSumiu');
  assert.deepStrictEqual(chips(doc), ['🖥️ Servidor: Servidor Velho (removida)']);
});

test('adicionar/remover suja o formulario: Fechar grava dependenciasAfetadas com id, categoria e nome', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('comDeps');
  adicionar(w, doc, 'Sistemas', 's1');
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.deepStrictEqual(gravacoes[0].dependenciasAfetadas, [
    { id: 'i1', categoria: 'Infraestrutura', nome: 'Firewall' },
    { id: 'b1', categoria: 'Banco de Dados', nome: 'SQL Server' },
    { id: 's1', categoria: 'Sistemas', nome: 'Jarvis' },
  ]);
});

test('salvar: sem produto e sem dependencia avisa; so com dependencia salva', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  w.abrirDrawerVulnerabilidade();
  doc.getElementById('vulnNome').value = 'Nova';
  doc.getElementById('vulnTipo').value = 'Má Configuração';
  await w.salvarVulnerabilidade();
  assert.equal(gravacoes.length, 0);
  assert.equal(toasts.at(-1), 'Informe o produto de software ou ao menos uma dependência afetada.');
  adicionar(w, doc, 'Infraestrutura', 'i2');
  await w.salvarVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].produto, '');
});

test('legado: texto antigo aparece so leitura; "Limpar" zera e o Fechar grava; sem texto, nao aparece', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('comDeps');
  assert.equal(doc.getElementById('vulnProdutoLegado').style.display, 'none');
  w.abrirDrawerVulnerabilidade('legado');
  assert.equal(doc.getElementById('vulnProdutoLegado').style.display, 'block');
  assert.equal(doc.getElementById('vulnProdutoLegadoTexto').textContent, '.NET');
  adicionar(w, doc, 'Sistemas', 's1');
  w.limparProdutoLegadoVuln();
  assert.equal(doc.getElementById('vulnProdutoLegado').style.display, 'none');
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes[0].produto, '');
  assert.equal(gravacoes[0].dependenciasAfetadas.length, 1);
});

test('legado ainda conta na validacao: editar um registro antigo sem dependencia nao trava', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('legado');
  doc.getElementById('vulnNome').value = 'Antigo editado';
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].produto, '.NET');
});

test('grade: "Dependências: ..." na celula de produto; legado cai no texto; busca acha pela dependencia', async () => {
  const { w, doc } = await carregar();
  const linha = (id) => doc.querySelector(`.chk-vulnerabilidade[data-id="${id}"]`).closest('tr');
  assert.match(linha('comDeps').textContent, /Dependências: Firewall, SQL Server/);
  assert.match(linha('legado').textContent, /\.NET/);
  doc.getElementById('buscaVulnerabilidade').value = 'sql server';
  w.renderizarVulnerabilidades();
  assert.deepStrictEqual([...doc.querySelectorAll('.chk-vulnerabilidade')].map((c) => c.dataset.id), ['comDeps']);
});

test('clonar copia as dependencias afetadas', async () => {
  const { w, doc } = await carregar();
  w.clonarVulnerabilidade('comDeps');
  assert.deepStrictEqual(chips(doc), ['⚡ Infraestrutura: Firewall', '🗄️ Banco de Dados: SQL Server']);
});

test('abrir e fechar sem mexer nao grava', async () => {
  const { w, gravacoes } = await carregar();
  for (const id of VULNS.map((v) => v.id)) {
    w.abrirDrawerVulnerabilidade(id);
    await w.fecharDrawerVulnerabilidade();
  }
  assert.equal(gravacoes.length, 0);
});
