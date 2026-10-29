// Contratos: topo compacto (15/10/2026) -- faixa de indicadores numa linha e
// filtros em 1 linha com "Mais filtros" e "Limpar filtros". app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const CC = require('../public/contrato-ciclo.js');

const PUB = path.join(__dirname, '..', 'public');
const HOJE = CC.hojeIso();
const contrato = (extra) => Object.assign({
  id: 'c1', codigo: 'CT-0001', objeto: 'Suite de e-mail', fornecedorId: 'f1', fornecedorNome: 'Alfa Cloud',
  tipoId: 't1', statusId: 's-vig', indexadorId: 'i1', area: 'TI', gestor: { id: 'p1', nome: 'Ana Souza' },
  dataInicio: CC.somarMeses(HOJE, -11), dataFim: CC.somarDias(HOJE, 20), vigenciaMeses: 12,
  renovacaoAutomatica: true, avisoCancelamentoDias: 30, valorMensal: 1000, valorGlobal: 12000, documentos: [], alertas: [],
}, extra);

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const dados = {
    getDependencias: [
      { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', setor: 'TI' },
      { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud', tic: true },
      { id: 'f2', categoria: 'Fornecedores', nome: 'Beta Telecom', tic: true },
    ],
    getAreas: [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'RH' }],
    getContratos: [contrato(), contrato({ id: 'c2', codigo: 'CT-0002', objeto: 'Link', area: 'RH', renovacaoAutomatica: false, dataFim: CC.somarDias(HOJE, 400), valorMensal: 500 })],
    getTiposContrato: [{ id: 't1', nome: 'SaaS', ativo: true }],
    getIndexadoresReajuste: [{ id: 'i1', nome: 'IPCA', ativo: true }],
    getStatusContrato: [{ id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true }],
    getEventosContrato: [], getProcessos: [], getRiscos: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
  };
  Object.assign(dados, extra || {});
  w.API = new Proxy({}, { get: (_, nome) => async () => JSON.parse(JSON.stringify(dados[nome] || [])) });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.contratos();
  return { w, doc: w.document, $: (id) => w.document.getElementById(id) };
}

const linhasGrade = (doc) => doc.querySelectorAll('#listaContratos tbody tr').length;
const chips = (doc) => [...doc.querySelectorAll('#contratosPainel .kpi-chip')];

test('indicadores numa faixa única no Dashboard de Terceiros, número antes do rótulo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.terceirosDashboard();
  assert.equal(doc.querySelectorAll('#listaContratos').length, 0);
  assert.equal(doc.querySelectorAll('#contratosPainel .kpi-strip').length, 1);
  assert.equal(doc.querySelectorAll('#contratosPainel .bia-metric').length, 0);
  const textos = chips(doc).map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  assert.equal(textos.length, 7);
  assert.equal(textos[0], '2 vigentes');
  assert.match(textos[1], /^R\$ 1\.500 por mês \(vigentes\)$/);
  assert.match(textos[6], /^1 fornecedores TIC sem contrato vigente$/);
});

test('número do Dashboard abre a lista já filtrada (selects marcados); "Limpar" desfaz', async () => {
  const { w, doc, $ } = await carregar(['admin']);
  assert.equal(linhasGrade(doc), 2);
  await w.terceirosDashboard();
  assert.match(chips(doc)[2].getAttribute('onclick'), /_abrirListaFiltrada\('contratos'/);
  w._abrirListaFiltrada('contratos', { filtroContratoStatus: '__vigentes__', filtroContratoAlerta: '__vencimento__' });
  await w.contratos();
  assert.equal(linhasGrade(doc), 1);
  assert.ok($('filtroContratoAlerta').classList.contains('lista-sel--ativo'));
  w.limparFiltrosContratos();
  assert.equal(linhasGrade(doc), 2);
});

test('linha de filtros: busca, Fornecedor, Status e Alerta à vista, sem rótulo acima; o select se nomeia', async () => {
  const { doc, $ } = await carregar(['admin']);
  const linha = doc.querySelector('.filtros-linha');
  ['buscaContrato', 'filtroContratoFornecedor', 'filtroContratoStatus', 'filtroContratoAlerta', 'contadorContratos']
    .forEach((id) => assert.ok(linha.contains($(id)), id));
  assert.equal([...linha.querySelectorAll('label')].filter((l) => l.textContent.trim()).length, 0, 'sem rótulo escrito acima');
  assert.equal($('filtroContratoFornecedor').options[0].textContent, 'Fornecedor: Todos');
  assert.equal($('filtroContratoStatus').options[0].textContent, 'Status: Todos');
  assert.equal($('contadorContratos').textContent, '2 contratos');
});

test('Tipo, Área e Renovação ficam em "Mais filtros", recolhido; o botão abre e fecha', async () => {
  const { w, $ } = await carregar(['admin']);
  ['filtroContratoTipo', 'filtroContratoArea', 'filtroContratoRenovacao'].forEach((id) => assert.ok($('maisFiltrosContratos').contains($(id)), id));
  assert.equal($('maisFiltrosContratos').style.display, 'none');
  w.alternarMaisFiltrosContratos();
  assert.equal($('maisFiltrosContratos').style.display, 'flex');
  w.alternarMaisFiltrosContratos();
  assert.equal($('maisFiltrosContratos').style.display, 'none');
});

test('filtro escondido ativo: o botão mostra quantos e o bloco abre sozinho', async () => {
  const { w, doc, $ } = await carregar(['admin']);
  $('filtroContratoArea').value = 'RH';
  w.renderizarContratos();
  assert.equal(linhasGrade(doc), 1);
  assert.equal($('btnMaisFiltrosContratos').textContent, '⚙ Mais filtros (1)');
  assert.equal($('maisFiltrosContratos').style.display, 'flex');
});

test('"Limpar filtros" só aparece com filtro ativo e zera tudo, inclusive o filtro do painel', async () => {
  const { w, doc, $ } = await carregar(['admin']);
  assert.equal($('limparFiltrosContratos').style.display, 'none');
  $('buscaContrato').value = 'link';
  $('filtroContratoRenovacao').value = 'nao';
  w.renderizarContratos();
  w.filtrarContratosPainel('vigentes');
  assert.equal($('limparFiltrosContratos').style.display, 'inline');
  w.limparFiltrosContratos();
  assert.equal($('buscaContrato').value, '');
  assert.equal($('filtroContratoRenovacao').value, '');
  assert.equal(linhasGrade(doc), 2);
  assert.equal($('limparFiltrosContratos').style.display, 'none');
  assert.ok(!chips(doc).some((c) => c.classList.contains('kpi-chip--ativo')));
  assert.equal($('btnMaisFiltrosContratos').textContent, '⚙ Mais filtros');
});

test('gestor não vê o chip de fornecedores sem contrato (catálogo inteiro)', async () => {
  const { w, doc } = await carregar(['gestor']);
  await w.terceirosDashboard();
  assert.ok(!/sem contrato vigente/.test(doc.getElementById('contratosPainel').textContent));
  assert.equal(chips(doc).length, 6);
});

test('na grade, Fornecedor vem antes de Objeto (cabeçalho, linhas e larguras alinhados)', async () => {
  const { doc } = await carregar(['admin']);
  const cab = [...doc.querySelectorAll('#listaContratos thead th')].map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
  // Grade de 8 colunas (23/10/2026): Tipo foi para o title do Objeto; Fim e Valor mensal = "Vigência".
  assert.deepStrictEqual(cab, ['Código', 'Fornecedor', 'Objeto', 'Status', 'Área', 'Vigência', 'Alertas', 'Ações']);
  const linha = doc.querySelector('#listaContratos tbody tr');
  assert.equal(linha.children.length, cab.length);
  assert.match(linha.children[1].textContent, /Alfa Cloud/);
  assert.match(linha.children[2].textContent, /Suite de e-mail|Link/);
  assert.equal(doc.querySelectorAll('#listaContratos colgroup col').length, cab.length);
});

test('situação "Vigência expirada": opção no cadastro de Status, rótulo e cor próprios, e não conta como vigente', async () => {
  const status = [
    { id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true },
    { id: 's-exp', nome: 'Vigência expirada', situacao: 'expirada', ativo: true },
  ];
  const { w, doc } = await carregar(['admin'], {
    getStatusContrato: status,
    getContratos: [contrato(), contrato({ id: 'c3', codigo: 'CT-0003', objeto: 'Antigo', statusId: 's-exp', dataFim: CC.somarDias(HOJE, -60), valorMensal: 700 })],
  });
  const linha = [...doc.querySelectorAll('#listaContratos tbody tr')].find((tr) => tr.textContent.includes('CT-0003'));
  assert.match(linha.innerHTML, /Vigência expirada/);
  assert.match(linha.innerHTML, /#e65100/, 'laranja, diferente do verde do vigente e do cinza do encerrado');
  // Cadastro de Status: a situação nova é uma das opções.
  await w.contratosStatus();
  w.abrirDrawerListaContrato();
  const opcoes = [...doc.getElementById('listaContratoSituacao').options].map((o) => [o.value, o.textContent]);
  assert.deepStrictEqual(opcoes, [['pre', 'Antes da vigência'], ['vigente', 'Vigente'], ['expirada', 'Vigência expirada'], ['encerrado', 'Encerrado']]);
  // A faixa do Dashboard só conta o vigente (R$ 1.000), nunca o expirado.
  await w.terceirosDashboard();
  assert.match(doc.getElementById('contratosPainel').textContent, /R\$ 1\.000/);
  assert.doesNotMatch(doc.getElementById('contratosPainel').textContent, /1\.700/);
});

test('Status do contrato fica logo depois do Objeto (visível sem rolar), com a pill da situação, e cabeçalho/linha/larguras alinhados', async () => {
  const { doc } = await carregar(['admin']);
  const cab = [...doc.querySelectorAll('#listaContratos thead th')].map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
  assert.equal(cab[3], 'Status');
  assert.equal(cab[cab.length - 1], 'Ações');
  const linha = doc.querySelector('#listaContratos tbody tr');
  assert.match(linha.children[3].textContent, /Vigente/);
  assert.ok(linha.children[3].querySelector('span'), 'pill de status');
  assert.equal(linha.children.length, cab.length);
  assert.equal(doc.querySelectorAll('#listaContratos colgroup col').length, cab.length);
});

const STATUS_AJUSTE = [
  { id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true },
  { id: 's-exp', nome: 'Ativo com vigência expirada e renegociação pendente', situacao: 'expirada', ativo: true },
  { id: 's-sem', nome: 'Sem situação', situacao: '', ativo: true },
];
const contratosAjuste = () => [
  contrato(),
  contrato({ id: 'c3', codigo: 'CT-0003', objeto: 'Antigo', statusId: 's-exp', dataFim: CC.somarDias(HOJE, -60) }),
  contrato({ id: 'c4', codigo: 'CT-0004', objeto: 'Cadastro incompleto', statusId: 's-sem' }),
];
const celulaStatus = (doc, codigo) => [...doc.querySelectorAll('#listaContratos tbody tr')].find((tr) => tr.textContent.includes(codigo)).children[3];

test('coluna Status: a pill fica contida na célula (nome longo quebra, não invade a coluna vizinha) e tem o nome completo no title', async () => {
  const { doc } = await carregar(['admin'], { getStatusContrato: STATUS_AJUSTE, getContratos: contratosAjuste() });
  const pill = celulaStatus(doc, 'CT-0003').querySelector('.contrato-status-pill');
  assert.equal(pill.textContent, 'Ativo com vigência expirada e renegociação pendente');
  assert.equal(pill.getAttribute('title'), pill.textContent);
  assert.match(pill.getAttribute('style'), /max-width:100%/);
  assert.match(pill.getAttribute('style'), /white-space:normal/);
  assert.doesNotMatch(pill.getAttribute('style'), /nowrap/);
});

test('coluna Status: mostra só o nome do status — nenhuma linha de Situação na célula', async () => {
  const { doc } = await carregar(['admin'], { getStatusContrato: STATUS_AJUSTE, getContratos: contratosAjuste() });
  ['CT-0001', 'CT-0003', 'CT-0004'].forEach((codigo) => {
    const celula = celulaStatus(doc, codigo);
    assert.equal(celula.querySelector('.contrato-status-situacao'), null, codigo);
    assert.doesNotMatch(celula.textContent, /Situação/, codigo);
  });
  assert.equal(celulaStatus(doc, 'CT-0001').textContent.trim(), 'Vigente');
  assert.equal(celulaStatus(doc, 'CT-0003').textContent.trim(), 'Ativo com vigência expirada e renegociação pendente');
});

test('coluna Status: a largura ficou em 175px e cabeçalho, linhas e larguras seguem alinhados', async () => {
  const { doc } = await carregar(['admin'], { getStatusContrato: STATUS_AJUSTE, getContratos: contratosAjuste() });
  const cols = [...doc.querySelectorAll('#listaContratos colgroup col')];
  assert.match(cols[3].getAttribute('style'), /175px/);
  assert.equal(cols.length, doc.querySelectorAll('#listaContratos thead th').length);
  assert.equal(doc.querySelector('#listaContratos tbody tr').children.length, cols.length);
});

test('ordenar por Status: por nome e, empatando, pela situação', async () => {
  const mesmo = [
    { id: 's-a', nome: 'Ativo', situacao: 'vigente', ativo: true },
    { id: 's-b', nome: 'Ativo', situacao: 'expirada', ativo: true },
  ];
  const { w, doc } = await carregar(['admin'], {
    getStatusContrato: mesmo,
    getContratos: [contrato({ id: 'x1', codigo: 'CT-0101', statusId: 's-b' }), contrato({ id: 'x2', codigo: 'CT-0102', statusId: 's-a' })],
  });
  w.ordenarContratos('status');
  const ordem = [...doc.querySelectorAll('#listaContratos tbody tr')].map((tr) => tr.children[0].textContent.trim());
  assert.deepStrictEqual(ordem, ['CT-0102', 'CT-0101'], 'vigente antes de expirada no empate de nome');
});
