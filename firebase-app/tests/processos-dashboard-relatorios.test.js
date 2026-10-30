// Dashboard de Processos e Relatórios de Processos (29/10/2026). Carrega o
// app.js REAL no jsdom; a API e falsa.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const AGORA = new Date().toISOString();

const CATS = [
  { id: 'departamental', nome: 'Departamental', ativo: true, ordem: 1, finalidade: 'Rotina de uma área só.', criteriosIdentificacao: '', exemplos: '' },
  { id: 'processo-de-negocio', nome: 'Processo de Negócio', ativo: true, ordem: 3, finalidade: '', criteriosIdentificacao: '', exemplos: '' },
];
const AREAS = [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'Infra', areaPaiId: 'a1' }, { id: 'a3', nome: 'RH' }];
const PESSOAS = [{ id: 'ana', nome: 'Ana', categoria: 'Pessoas' }, { id: 'bia', nome: 'Bia', categoria: 'Pessoas' }];
const PROCS = [
  { id: 'p1', area: 'TI', processo: 'Folha; "TI"', categoriaId: 'processo-de-negocio', continuidade: true, descricaoFuncional: 'Paga.',
    criadorId: 'ana', aprovadorId: 'bia', links: [{ titulo: 'Wiki', url: 'https://wiki' }], criadoEm: AGORA, atualizadoEm: AGORA, atualizadoPor: 'ana@x' },
  { id: 'p2', area: 'Infra', processo: 'Backup', categoriaId: 'departamental', continuidade: false, criadorId: 'ana', aprovadorId: '', links: [] },
  { id: 'p3', area: 'RH', processo: 'Ponto', categoriaId: 'departamental', continuidade: false, links: [] },
];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI'; w.USER_AREAS = ['TI', 'Infra'];
  const dados = Object.assign({ getProcessosCadastro: PROCS, getCategoriasProcesso: CATS, getAreas: AREAS, getDependencias: PESSOAS }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async () => (nome === 'invalidate' ? undefined : JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]))),
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return { w, doc: w.document };
}
const texto = (el) => el.textContent.replace(/\s+/g, ' ');

test('Dashboard: as 4 secoes com os numeros, e cada cartao abre o Cadastro filtrado', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.processosDashboard();
  const t = texto(doc.getElementById('processosPainel'));
  assert.match(t, /Totais.*Qualidade do cadastro.*Por área.*Movimentação recente/);
  const cards = [...doc.querySelectorAll('#processosPainel .bia-metric--filtro')].map((b) => [texto(b).trim(), b.getAttribute('onclick')]);
  const achar = (rot) => cards.find(([t2]) => t2.startsWith(rot));
  assert.match(achar('Processos cadastrados')[0], /3$/);
  assert.match(achar('Em Continuidade (33%)')[0], /1$/);
  assert.match(achar('Departamental')[1], /filtroCadProcCategoria&quot;:&quot;departamental|filtroCadProcCategoria":"departamental/);
  assert.match(achar('Cadastro completo (33%)')[0], /1$/);
  const semAprov = achar('Sem aprovador');
  assert.match(semAprov[0], /2$/);
  assert.match(semAprov[1], /_abrirListaFiltrada\('cadastro-processos'/);
  assert.match(semAprov[1], /filtroCadProcPendencia/);
  assert.match(semAprov[1], /semAprovador/);
  // Por área: arvore (Infra abaixo de TI) e a % de completos.
  const linhas = [...doc.querySelectorAll('#processosPainel tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => texto(td).trim()).join(' '));
  assert.ok(linhas.some((l) => /^TI 1 1 0 1 100%/.test(l)), linhas.join(' / '));
  assert.ok(linhas.some((l) => /^Infra 1 0 1 0 0%/.test(l)));
  // Recentes: so o que tem atualizadoEm.
  assert.match(t, /Alterados mais recentemente.*Folha; "TI"/);
});

test('Dashboard do Gestor: so a area dele e as de baixo', async () => {
  const { w, doc } = await carregar(['gestor']);
  await w.processosDashboard();
  const t = texto(doc.getElementById('processosPainel'));
  assert.match(t, /Processos cadastrados 2/);
  assert.doesNotMatch(t, /RH/);
});

test('Cadastro abre com o filtro de Pendencia vindo do Dashboard', async () => {
  const { w, doc } = await carregar(['admin']);
  w._filtroInicialLista = { tela: 'cadastro-processos', filtros: { filtroCadProcPendencia: 'semAprovador' } };
  await w.cadastroProcessos();
  assert.strictEqual(doc.getElementById('filtroCadProcPendencia').value, 'semAprovador');
  const nomes = [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')].map((tr) => tr.textContent);
  assert.deepStrictEqual(nomes.map((n) => /Backup/.test(n) || /Ponto/.test(n)), [true, true]);
  doc.getElementById('filtroCadProcPendencia').value = 'completo';
  w.filtrarCadastroProcessos();
  assert.strictEqual(doc.querySelectorAll('#listaCadastroProcessos tbody tr').length, 1);
});

test('Relatorios: escopo conta e trava os botoes; os 4 documentos saem com o conteudo certo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.processosRelatorios();
  assert.match(doc.getElementById('relProcContagem').textContent, /3 processos no escopo/);
  doc.getElementById('relProcArea').value = 'TI||abaixo';
  w.atualizarEscopoRelatorioProcessos();
  assert.match(doc.getElementById('relProcContagem').textContent, /2 processos/);
  doc.getElementById('relProcContinuidade').value = 'sim';
  doc.getElementById('relProcCategoria').value = 'departamental';
  w.atualizarEscopoRelatorioProcessos();
  assert.ok(doc.getElementById('btnGerarRelProc').disabled, 'escopo vazio');
  doc.getElementById('relProcArea').value = '';
  doc.getElementById('relProcContinuidade').value = '';
  doc.getElementById('relProcCategoria').value = '';
  w.atualizarEscopoRelatorioProcessos();

  const escritos = [];
  w.open = () => ({ document: { write: (h) => escritos.push(h), close() {} } });
  const gerar = (tipo) => { doc.getElementById('relProcTipo').value = tipo; w.gerarRelatorioProcessos(); return escritos[escritos.length - 1]; };
  const inv = gerar('inventario');
  assert.match(inv, /<title>Inventário de Processos<\/title>/);
  assert.match(inv, /Descrição Funcional:<\/b> <span class="desc-texto">Paga\./);
  assert.match(inv, /<a href="https:\/\/wiki">Wiki<\/a>/);
  const pend = gerar('pendencias');
  assert.doesNotMatch(pend, /Folha/, 'processo completo fica de fora');
  assert.match(pend, /Backup<\/strong><\/td><td>Sem descrição funcional · Sem aprovador · Sem links/);
  const cat = gerar('categorias');
  assert.match(cat, /Departamental[\s\S]*Finalidade:<\/b> <span class="desc-texto">Rotina de uma área só\./);
  const pes = gerar('pessoas');
  assert.match(pes, /<h2>Ana<\/h2>[\s\S]*Criador de 2 · Aprovador de 0/);
  assert.match(pes, /<h2>Sem pessoa<\/h2>/);

  w.open = () => null;
  w.gerarRelatorioProcessos();
  assert.match((w.__toasts || []).join(' '), /bloqueou a nova aba/);
});

test('Relatorios: CSV com BOM, ";" e aspas; pendencias so os incompletos; por pessoa uma linha por papel', async () => {
  const { w } = await carregar(['admin']);
  await w.processosRelatorios();
  const ctx = w._ctxRelatorioProcessos();
  const procs = w._processosNoEscopoRelatorio();
  const inv = w._csvRelatorioProcessos('inventario', procs, ctx);
  const csv = w._textoCsv(inv.cabecalho, inv.linhas);
  assert.ok(csv.startsWith('﻿Área;Processo;Categoria;Criador;Aprovador;Continuidade;'));
  assert.match(csv, /\r\nTI;"Folha; ""TI""";Processo de Negócio;Ana;Bia;Sim;Paga\.;Wiki: https:\/\/wiki;/);
  const pend = w._csvRelatorioProcessos('pendencias', procs, ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pend.linhas.map((l) => l[1]))), ['Backup', 'Ponto']);
  const pes = w._csvRelatorioProcessos('pessoas', procs, ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pes.linhas.slice(0, 3))), [['Ana', 'Criador', 'Infra', 'Backup'], ['Ana', 'Criador', 'TI', 'Folha; "TI"'], ['Bia', 'Aprovador', 'TI', 'Folha; "TI"']]);
});

test('Dashboard: Processos criticos (Tier 1) conta so os de Continuidade e abre Processos de Negocio filtrado', async () => {
  const procs = [
    { id: 'c1', area: 'TI', processo: 'Licenca', categoriaId: 'processo-de-negocio', continuidade: true, tierManual: 'Tier 1 (Crítico)' },
    { id: 'c2', area: 'TI', processo: 'Nuvem', categoriaId: 'processo-de-negocio', continuidade: true, avaliado: true, score: 99, tierManual: 'Tier 3 (Suporte)' },
    { id: 'c3', area: 'TI', processo: 'Fora', categoriaId: 'departamental', continuidade: false, tierManual: 'Tier 1 (Crítico)' },
    { id: 'c4', area: 'TI', processo: 'Pendente', categoriaId: 'departamental', continuidade: true },
  ];
  const { w, doc } = await carregar(['admin'], { getProcessosCadastro: procs });
  await w.processosDashboard();
  const card = [...doc.querySelectorAll('#processosPainel .bia-metric--filtro')].find((b) => /Processos críticos/.test(b.textContent));
  const esperado = w.Criticidade.tierDoProcesso(procs[1]) === w.Criticidade.TIER.T1 ? 2 : 1;
  assert.strictEqual(card.textContent.replace(/\s+/g, ' ').trim(), `Processos críticos (Tier 1) ${esperado}`);
  assert.match(card.getAttribute('onclick'), /_abrirListaFiltrada\('processos'.*filtroTier.*Tier 1/);
});

test('Processos de Negocio abre com o filtro de Tier vindo do Dashboard', async () => {
  const procs = [
    { id: 'c1', area: 'TI', processo: 'Licenca', categoriaId: 'processo-de-negocio', continuidade: true, tierManual: 'Tier 1 (Crítico)' },
    { id: 'c4', area: 'TI', processo: 'Pendente', categoriaId: 'departamental', continuidade: true },
  ];
  const { w, doc } = await carregar(['admin'], { getProcessos: procs, getProcessosCadastro: procs });
  w._filtroInicialLista = { tela: 'processos', filtros: { filtroTier: 'Tier 1' } };
  await w.processos();
  assert.strictEqual(doc.getElementById('filtroTier').value, 'Tier 1');
  const nomes = [...doc.querySelectorAll('#rows tr')].map((tr) => tr.textContent);
  assert.strictEqual(nomes.length, 1);
  assert.match(nomes[0], /Licenca/);
});
