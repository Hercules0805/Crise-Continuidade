// Subáreas (29/10/2026): modal da Área, select dependente em Processo/Risco/Pessoa,
// rótulo "Área › Subárea", filtro por subárea e relatório por área.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'dependencia-duplicidade.js', 'subareas.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js',
  'sanitizar-pcn.js', 'contrato-ciclo.js'];

const AREAS = [
  { id: 'a1', nome: 'TI', responsavel: 'Ana', subareas: [
    { id: 'sa1', nome: 'Infraestrutura', lider: { id: 'bia', nome: 'Bia' } },
    { id: 'sa2', nome: 'Sistemas', lider: null },
  ] },
  { id: 'a2', nome: 'RH', responsavel: '', subareas: [] },
];
const PESSOAS = [
  { id: 'ana', categoria: 'Pessoas', nome: 'Ana', areas: ['TI'], email: 'ana@x' },
  { id: 'bia', categoria: 'Pessoas', nome: 'Bia', areas: ['TI'], email: 'bia@x', subarea: { area: 'TI', id: 'sa1', nome: 'Infraestrutura' } },
  { id: 'caio', categoria: 'Pessoas', nome: 'Caio', areas: ['RH'], email: 'caio@x' },
];
const PROCESSOS = [
  { id: 'p1', area: 'TI', processo: 'Backup', categoriaId: 'processo-de-negocio', continuidade: true, subarea: { id: 'sa1', nome: 'Infra' } },
  { id: 'p2', area: 'TI', processo: 'Deploy', categoriaId: 'processo-de-negocio', continuidade: true, subarea: null },
  { id: 'p3', area: 'TI', processo: 'Antigo', categoriaId: 'processo-de-negocio', continuidade: true, subarea: { id: 'velha', nome: 'Redes' } },
];

async function carregar(extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin'; w.USER_EMAIL = 'adm@x';
  w.console.error = () => {};
  const calls = {};
  const dados = Object.assign({
    getAreas: AREAS, getDependencias: PESSOAS, getProcessos: PROCESSOS, getProcessosCadastro: PROCESSOS,
    getCategoriasProcesso: [{ id: 'processo-de-negocio', nome: 'Processo de Negócio', ativo: true }],
    getRiscos: [{ id: 'r1', titulo: 'Queda', area: 'TI', subarea: { id: 'sa2', nome: 'Sistemas' }, status: 'Identificado', categorias: [] }],
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => (nome === 'invalidate' ? () => {} : async (...args) => {
      (calls[nome] = calls[nome] || []).push(JSON.parse(JSON.stringify(args)));
      if (/^(salvar|excluir)/.test(nome)) return { success: true, id: (args[0] && args[0].id) || 'novo', dado: args[0] };
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? (/Config/.test(nome) ? {} : []) : dados[nome]));
    }),
  });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.__toasts = [];
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); }; confirmarAcao = async () => true;');
  return { w, doc: w.document, calls, $: (id) => w.document.getElementById(id) };
}
const visivel = (el) => el.style.display !== 'none';
const opcoes = (sel) => [...sel.options].map((o) => o.textContent.trim());
const espera = () => new Promise((r) => setTimeout(r, 20));

test('Área: lista com chips das subáreas; busca acha pela subárea e pelo líder', async () => {
  const { w, $, doc } = await carregar();
  await w.areas();
  assert.match(doc.querySelector('#rows').textContent, /Infraestrutura/);
  $('buscaArea').value = 'bia';
  w.filtrarAreas();
  assert.deepStrictEqual([...doc.querySelectorAll('#rows tr')].map((tr) => tr.children[0].textContent.trim()), ['TI']);
});

test('Área: modal adiciona, edita e remove subárea com líder; nome repetido recusado; Salvar grava subareas', async () => {
  const { w, $, calls } = await carregar();
  await w.areas();
  w.editarArea('a1');
  assert.strictEqual($('areaSubareasLista').querySelectorAll('.subarea-linha').length, 2);
  assert.match($('areaSubareasLista').textContent, /sem líder/);
  $('subareaNome').value = 'infraestrutura';
  w.adicionarSubareaArea();
  assert.ok(w.__toasts.some((t) => /Já existe a subárea/.test(t)));
  $('subareaNome').value = 'Suporte';
  $('subareaLider').value = 'caio';
  w.adicionarSubareaArea();
  w.editarSubareaArea(1);
  assert.strictEqual($('btnAdicionarSubarea').textContent, 'Salvar alteração');
  $('subareaNome').value = 'Sistemas Internos';
  $('subareaLider').value = 'ana';
  w.adicionarSubareaArea();
  await w.removerSubareaArea(0);
  await w.salvarArea();
  const gravada = calls.salvarArea[0][0].subareas;
  assert.deepStrictEqual(gravada.map((s) => [s.id, s.nome, s.lider && s.lider.id]), [['sa2', 'Sistemas Internos', 'ana'], [gravada[1].id, 'Suporte', 'caio']]);
  assert.match(gravada[1].id, /^sa_/, 'id novo e estavel');
});

test('Área: remover subárea em uso avisa quantos processos, riscos e pessoas apontam para ela', async () => {
  const { w } = await carregar();
  let msg = '';
  await w.areas();
  w.eval('confirmarAcao = async (m) => { window.__msg = m; return false; };');
  w.editarArea('a1');
  await w.removerSubareaArea(0);
  msg = w.__msg;
  assert.match(msg, /em uso por 1 processo, 1 pessoa/);
  assert.strictEqual(w._areaSubareas.length, 2, 'cancelou: nada sai');
});

test('Cadastro de Processos: select de subárea dependente da área, rótulo e filtro por subárea', async () => {
  const { w, $, doc, calls } = await carregar();
  await w.cadastroProcessos();
  const linhas = () => [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')].map((tr) => tr.children[0].textContent.trim());
  assert.deepStrictEqual(linhas().sort(), ['TI', 'TI › Infraestrutura', 'TI › Redes (subárea removida)'].sort());
  assert.ok(opcoes($('filtroCadProcArea')).some((o) => /↳ Infraestrutura/.test(o)));
  $('filtroCadProcArea').value = 'TI||sub:sa1';
  w.filtrarCadastroProcessos();
  assert.deepStrictEqual(linhas(), ['TI › Infraestrutura']);

  w.abrirDrawerCadastroProcesso('p1');
  assert.ok(visivel($('cadProcSubareaBox')));
  assert.strictEqual($('cadProcSubarea').value, 'sa1');
  assert.match($('cadProcSubareaLider').textContent, /Líder: Bia/);
  $('cadProcArea').value = 'RH';
  $('cadProcArea').onchange();
  assert.ok(!visivel($('cadProcSubareaBox')), 'RH não tem subárea');
  $('cadProcArea').value = 'TI';
  $('cadProcArea').onchange();
  assert.strictEqual($('cadProcSubarea').value, '', 'trocar a área limpa');
  $('cadProcSubarea').value = 'sa2';
  await w.salvarCadastroProcesso();
  assert.deepStrictEqual(calls.salvarProcesso[0][0].subarea, { id: 'sa2', nome: 'Sistemas' });

  w.abrirDrawerCadastroProcesso('p3');
  assert.deepStrictEqual(opcoes($('cadProcSubarea')).slice(-1), ['Redes (subárea removida)']);
  assert.strictEqual($('cadProcSubarea').value, 'velha');
});

test('Cadastro de Processos: abrir e fechar sem mexer não grava (com subárea atual e removida)', async () => {
  const { w, calls } = await carregar();
  await w.cadastroProcessos();
  for (const id of ['p1', 'p2', 'p3']) {
    w.abrirDrawerCadastroProcesso(id);
    assert.strictEqual(await w.fecharDrawerCadastroProcesso(), true, id);
  }
  assert.strictEqual((calls.salvarProcesso || []).length, 0);
});

test('Processos de Negócio: drawer com subárea, rótulo na lista e filtro pela subárea', async () => {
  const { w, $, doc } = await carregar();
  await w.processos();
  const areasDaLista = () => [...doc.querySelectorAll('#rows tr')].map((tr) => tr.children[1].textContent.trim());
  assert.ok(areasDaLista().includes('TI › Infraestrutura'));
  $('filtroArea').value = 'TI||sub:sa1';
  w.filtrarProcessosBarra();
  assert.deepStrictEqual(areasDaLista(), ['TI › Infraestrutura']);
  w.editarProcesso('p1');
  assert.ok(visivel($('fSubareaBox')));
  assert.strictEqual($('fSubarea').value, 'sa1');
  $('fArea').value = 'RH';
  $('fArea').onchange();
  assert.ok(!visivel($('fSubareaBox')));
  assert.strictEqual(w._coletarFormularioProcesso().p.subarea, null);
});

test('Risco: subárea no drawer e na lista; corporativo não tem subárea', async () => {
  const { w, $, doc } = await carregar();
  await w.riscos();
  await espera();
  assert.match(doc.getElementById('app').textContent, /TI › Sistemas/);
  await w.abrirDrawerRisco(w.riscosData ? w.riscosData[0] : { id: 'r1', titulo: 'Queda', area: 'TI', subarea: { id: 'sa2', nome: 'Sistemas' }, status: 'Identificado', categorias: [] });
  assert.ok(visivel($('rSubareaBox')));
  assert.strictEqual($('rSubarea').value, 'sa2');
  assert.strictEqual(await w.fecharDrawerRisco(), true, 'sem mexer não pergunta');
  await w.abrirDrawerRisco({ id: 'r1', titulo: 'Queda', area: 'TI', subarea: { id: 'sa2', nome: 'Sistemas' }, status: 'Identificado', categorias: [] });
  $('rArea').value = '';
  $('rArea').onchange();
  assert.ok(!visivel($('rSubareaBox')), 'corporativo não tem subárea');
});

test('Pessoa: subárea entre as das áreas da pessoa; remover a área tira a subárea; vai no Salvar', async () => {
  const { w, $, calls } = await carregar();
  await w.pessoas();
  w.abrirModalPessoa('bia');
  assert.ok(visivel($('pessoaSubareaBox')));
  assert.strictEqual($('pessoaSubarea').value, 'TI||sa1');
  assert.strictEqual(await w.fecharModalPessoa(), true, 'sem mexer não pergunta');
  w.abrirModalPessoa('bia');
  $('pessoaAreaAdd').value = 'RH';
  w.adicionarPessoaArea();
  assert.strictEqual($('pessoaSubarea').value, 'TI||sa1', 'adicionar área mantém');
  w.removerPessoaArea(0);
  assert.strictEqual($('pessoaSubarea').value, '', 'a área TI saiu: a subárea sai junto');
  assert.ok(!visivel($('pessoaSubareaBox')), 'RH não tem subárea');
  await w.salvarPessoaCadastro();
  assert.strictEqual(calls.salvarDependencia[0][0].subarea, null);

  w.abrirModalPessoa('ana');
  $('pessoaSubarea').value = 'TI||sa2';
  $('pessoaSubarea').onchange();
  await w.salvarPessoaCadastro();
  assert.deepStrictEqual(calls.salvarDependencia[1][0].subarea, { area: 'TI', id: 'sa2', nome: 'Sistemas' });
});

test('Relatório por área: tabela dividida por subárea (sem subárea primeiro, removida no fim) com o líder', async () => {
  const { w } = await carregar();
  const grupos = w._gruposRelatorioAreas(AREAS, PROCESSOS);
  const html = w._htmlRelatorioProcessosPorArea(grupos.filter((g) => g.nome === 'TI'), {});
  const titulos = [...html.matchAll(/<tr class="subarea-titulo"><td colspan="8">([^<]*)/g)].map((m) => m[1].trim());
  assert.deepStrictEqual(titulos, ['Sem subárea', 'Infraestrutura', 'Redes (subárea removida)']);
  assert.match(html, /Líder: Bia/);
  const semSub = w._htmlRelatorioProcessosPorArea([{ nome: 'RH', responsavel: '', foraDoCadastro: false, subareas: [], processos: [{ id: 'x', area: 'RH', processo: 'Folha' }] }], {});
  assert.doesNotMatch(semSub, /subarea-titulo">/, 'área sem subárea: tabela como antes');
});
