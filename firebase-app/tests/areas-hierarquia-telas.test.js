// Áreas hierárquicas (29/10/2026): "Pertence a" no modal da Área, lista em árvore,
// exclusão que sobe as filhas, filtro "com as áreas abaixo", escopo do Gestor e relatório.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js',
  'sanitizar-pcn.js', 'contrato-ciclo.js'];

const AREAS = [
  { id: 'dir', nome: 'Diretoria', responsavel: 'Ana', areaPaiId: null },
  { id: 'ti', nome: 'TI', responsavel: 'Ana', areaPaiId: 'dir' },
  { id: 'infra', nome: 'Infraestrutura', responsavel: '', areaPaiId: 'ti' },
  { id: 'rh', nome: 'RH', responsavel: '', areaPaiId: null },
];
const PROCESSOS = [
  { id: 'p1', area: 'TI', processo: 'Deploy', categoriaId: 'processo-de-negocio', continuidade: true },
  { id: 'p2', area: 'Infraestrutura', processo: 'Backup', categoriaId: 'processo-de-negocio', continuidade: true },
  { id: 'p3', area: 'RH', processo: 'Folha', categoriaId: 'processo-de-negocio', continuidade: true },
  { id: 'p4', area: 'Diretoria', processo: 'Estratégia', categoriaId: 'processo-de-negocio', continuidade: true },
];

async function carregar(opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_EMAIL = 'u@x';
  w.USER_PERFIS = o.perfis || ['admin']; w.USER_PERFIL = w.USER_PERFIS[0];
  w.USER_AREA = o.area || null; w.USER_AREAS = o.areas || [];
  w.console.error = () => {};
  const calls = {};
  const dados = {
    getAreas: AREAS, getDependencias: [{ id: 'ana', categoria: 'Pessoas', nome: 'Ana', areas: ['TI'] }],
    getProcessos: PROCESSOS, getProcessosCadastro: PROCESSOS,
    getCategoriasProcesso: [{ id: 'processo-de-negocio', nome: 'Processo de Negócio', ativo: true }],
  };
  w.API = new Proxy({}, {
    get: (_, nome) => (nome === 'invalidate' ? () => {} : async (...args) => {
      (calls[nome] = calls[nome] || []).push(JSON.parse(JSON.stringify(args)));
      if (/^(salvar|excluir)/.test(nome)) return { success: true, id: (args[0] && args[0].id) || 'novo', dado: args[0] };
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? (/Config/.test(nome) ? {} : []) : dados[nome]));
    }),
  });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.__toasts = [];
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); }; confirmarAcao = async (m) => { window.__msg = m; return true; };');
  return { w, doc: w.document, calls, $: (id) => w.document.getElementById(id) };
}
const opcoes = (sel) => [...sel.options].map((op) => op.textContent.replace(/ /g, ' ').replace(/^Área: /, '').trim());

test('Áreas: lista em árvore com "Pertence a"; busca acha pela área de cima', async () => {
  const { w, $, doc } = await carregar();
  await w.areas();
  const linhas = () => [...doc.querySelectorAll('#rows tr')].map((tr) => [tr.children[0].textContent.trim(), tr.children[1].textContent.trim()]);
  assert.deepStrictEqual(linhas(), [['Diretoria', '–'], ['↳ TI', 'Diretoria'], ['↳ Infraestrutura', 'Diretoria › TI'], ['RH', '–']]);
  $('buscaArea').value = 'diretoria';
  w.filtrarAreas();
  assert.deepStrictEqual(linhas().map((l) => l[0]).sort(), ['Diretoria', 'Infraestrutura', 'TI'].sort());
});

test('Áreas: "Pertence a" sem a própria e as de baixo; Salvar grava areaPaiId', async () => {
  const { w, $, calls } = await carregar();
  await w.areas();
  w.editarArea('ti');
  assert.deepStrictEqual(opcoes($('fAreaPai')), ['— Nenhuma (área raiz) —', 'Diretoria', 'RH']);
  assert.strictEqual($('fAreaPai').value, 'dir');
  $('fAreaPai').value = 'rh';
  await w.salvarArea();
  assert.strictEqual(calls.salvarArea[0][0].areaPaiId, 'rh');
  w.abrirModalArea();
  assert.strictEqual($('fAreaPai').value, '', 'área nova começa como raiz');
});

test('Áreas: excluir área com filhas sobe as filhas um nível', async () => {
  const { w, calls } = await carregar();
  await w.areas();
  await w.excluirArea('ti');
  assert.match(w.__msg, /"Infraestrutura" sobe um nível e passa a pertencer a "Diretoria"/);
  assert.deepStrictEqual(calls.salvarArea.map((c) => [c[0].id, c[0].areaPaiId]), [['infra', 'dir']]);
  assert.deepStrictEqual(calls.excluirArea[0], ['ti']);
});

test('Cadastro de Processos: filtro em árvore com "com as áreas abaixo"', async () => {
  const { w, $, doc } = await carregar();
  await w.cadastroProcessos();
  const nomes = () => [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')].map((tr) => tr.children[1].textContent.trim()).sort();
  assert.ok(opcoes($('filtroCadProcArea')).includes('↳ TI (com as áreas abaixo)'));
  $('filtroCadProcArea').value = 'TI';
  w.filtrarCadastroProcessos();
  assert.deepStrictEqual(nomes(), ['Deploy']);
  $('filtroCadProcArea').value = 'TI||abaixo';
  w.filtrarCadastroProcessos();
  assert.deepStrictEqual(nomes(), ['Backup', 'Deploy']);
});

test('Gestor de TI (com Infraestrutura abaixo): vê e edita as duas; filtro lista só o escopo', async () => {
  const { w, $, doc } = await carregar({ perfis: ['gestor'], area: 'TI', areas: ['TI', 'Infraestrutura'] });
  await w.cadastroProcessos();
  const nomes = [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')].map((tr) => tr.children[1].textContent.trim()).sort();
  assert.deepStrictEqual(nomes, ['Backup', 'Deploy']);
  assert.ok(!$('filtroCadProcArea').disabled);
  assert.deepStrictEqual(opcoes($('filtroCadProcArea')), ['Todas', 'TI', 'TI (com as áreas abaixo)', '↳ Infraestrutura']);
  w.abrirDrawerCadastroProcesso('p2');
  assert.notStrictEqual($('btnSalvarCadastroProcesso').style.display, 'none', 'edita processo da área de baixo');
  assert.deepStrictEqual(opcoes($('cadProcArea')), ['TI', 'Infraestrutura']);

  await w.processos();
  const areasLista = [...doc.querySelectorAll('#rows tr')].map((tr) => tr.children[1].textContent.trim()).sort();
  assert.deepStrictEqual(areasLista, ['Infraestrutura', 'TI']);
});

test('Gestor de uma área só: filtro travado como antes', async () => {
  const { w, $ } = await carregar({ perfis: ['gestor'], area: 'RH', areas: ['RH'] });
  await w.cadastroProcessos();
  assert.ok($('filtroCadProcArea').disabled);
});

test('Relatório por área: grupos em árvore com caminho; marcar a área marca as de baixo', async () => {
  const { w, doc } = await carregar();
  const grupos = w._gruposRelatorioAreas(AREAS, PROCESSOS);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(grupos.map((g) => [g.nome, g.nivel, g.caminho]))), [
    ['Diretoria', 0, 'Diretoria'], ['TI', 1, 'Diretoria › TI'], ['Infraestrutura', 2, 'Diretoria › TI › Infraestrutura'], ['RH', 0, 'RH'],
  ]);
  await w.relatorios();
  await w.abrirSelecaoAreasRelatorio();
  w.selecionarTodasAreasRelatorio(false);
  const iTi = w._relatorioAreasGrupos.findIndex((g) => g.nome === 'TI');
  w.toggleAreaRelatorioSelecionada(iTi, true);
  assert.deepStrictEqual([...w._relatorioAreasSelecionadas].sort(), ['Infraestrutura', 'TI']);
  const marcadas = [...doc.querySelectorAll('#relatorioAreasChecklist .chk-relatorio-area:checked')].length;
  assert.strictEqual(marcadas, 2);
  const html = w._htmlRelatorioProcessosPorArea(grupos.filter((g) => g.nome === 'Infraestrutura'), {});
  assert.match(html, /<h2>Diretoria › TI › Infraestrutura/);
});
