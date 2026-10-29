// Categorias de Processo (29/10/2026): cadastro das categorias do Cadastro de
// Processos (nome, finalidade, criterios de identificacao, exemplos, ativa).
// Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const CATS = [
  { id: 'departamental', nome: 'Departamental', ativo: true, ordem: 1, finalidade: 'Rotina de uma área só.', criteriosIdentificacao: 'Um responsável.', exemplos: 'Ponto.' },
  { id: 'intersetorial', nome: 'Intersetorial', ativo: false, ordem: 2, finalidade: '', criteriosIdentificacao: '', exemplos: '' },
];
const PROCS = [
  { id: 'a', area: 'TI', processo: 'A', categoriaId: 'departamental' },
  { id: 'b', area: 'TI', processo: 'B', categoriaId: 'departamental' },
];

async function carregar(perfis) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = { getCategoriasProcesso: CATS, getProcessosCadastro: PROCS };
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'nova' }; }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.processosCategorias();
  return { w, doc: w.document, gravacoes };
}

const linhas = (doc) => [...doc.querySelectorAll('#listaCategoriasProcesso tbody tr')]
  .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | '));

test('lista: categoria, finalidade, quantos processos usam e status', async () => {
  const { doc } = await carregar(['operador_processos']);
  const l = linhas(doc);
  assert.match(l[0], /^Departamental \| Rotina de uma área só\. \| 2 \| Ativa/);
  assert.match(l[1], /^Intersetorial \| – \| 0 \| Inativa/);
  assert.ok(doc.getElementById('btnNovaCategoriaProcesso'));
});

test('nova categoria grava nome, finalidade, criterios, exemplos e ativa', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca']);
  w.abrirDrawerCategoriaProcesso();
  doc.getElementById('catProcNome').value = 'Estratégico';
  doc.getElementById('catProcFinalidade').value = 'Direção da empresa.';
  doc.getElementById('catProcCriterios').value = 'Define metas.\nEnvolve a diretoria.';
  doc.getElementById('catProcExemplos').value = 'Planejamento anual.';
  doc.getElementById('catProcAtivo').checked = false;
  assert.strictEqual(await w.salvarCategoriaProcesso(), true);
  assert.deepStrictEqual(gravacoes.find((g) => g.nome === 'salvarCategoriaProcesso').arg, {
    id: null, nome: 'Estratégico', finalidade: 'Direção da empresa.', criteriosIdentificacao: 'Define metas.\nEnvolve a diretoria.',
    exemplos: 'Planejamento anual.', ativo: false,
  });
});

test('sem nome nao salva', async () => {
  const { w, gravacoes } = await carregar(['admin']);
  w.abrirDrawerCategoriaProcesso();
  assert.strictEqual(await w.salvarCategoriaProcesso(), false);
  assert.ok(!gravacoes.length);
});

test('categoria em uso nao e excluida (orienta a desativar); sem uso, confirma e exclui', async () => {
  const { w, gravacoes } = await carregar(['admin']);
  w.confirm = () => true;
  await w.excluirCategoriaProcesso('departamental');
  assert.ok(!gravacoes.some((g) => g.nome === 'excluirCategoriaProcesso'));
  assert.ok(w.__toasts.some((t) => /2 processos usam "Departamental"\. Desative/.test(t)));
  await w.excluirCategoriaProcesso('intersetorial');
  assert.strictEqual(gravacoes.find((g) => g.nome === 'excluirCategoriaProcesso').arg, 'intersetorial');
});

test('Gestor so consulta: sem "+ Nova categoria", sem acoes e formulario travado', async () => {
  const { w, doc } = await carregar(['gestor']);
  assert.strictEqual(doc.getElementById('btnNovaCategoriaProcesso'), null);
  assert.strictEqual(doc.querySelector('#listaCategoriasProcesso .col-acoes button'), null);
  w.abrirDrawerCategoriaProcesso('departamental');
  assert.ok(doc.getElementById('catProcFinalidade').disabled);
  assert.strictEqual(doc.getElementById('btnSalvarCategoriaProcesso').style.display, 'none');
});
