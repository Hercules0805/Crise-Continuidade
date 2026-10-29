// Composicao de Servicos (21/10/2026): telas -- drawer de Dependencia (RTO/RPO/MTTR
// com unidade, Componentes abaixo, Esta abaixo de). Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const ref = (d) => ({ id: d.id, nome: d.nome, categoria: d.categoria });
const INFRA = { id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura', rtoMin: 120, componentes: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] };
const SRV = { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', rto: '3 horas', rpo: '> 24 horas', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] };
const DB = { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados', rtoMin: 240, rpoMin: 15, mttrMin: 90 };
const SOLTA = { id: 'solta', nome: 'API Pix', categoria: 'API' };
const FORN = { id: 'forn', nome: 'Fornecedor X', categoria: 'Fornecedores' };
const DEPS = [INFRA, SRV, DB, SOLTA, FORN];
const SERVICOS = [{ id: 's1', nome: 'Portal', dependenciaItens: [ref(INFRA)] }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: DEPS, getServicos: SERVICOS, getAreas: [{ id: 'a1', nome: 'TI' }], getProcessos: [],
    getBackups: [], getSlasDependencia: { success: true, contratos: [] },
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'subareas.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return { w, doc: w.document, gravacoes };
}

const esperar = () => new Promise((r) => setTimeout(r, 20));

async function abrirDep(perfis, dep, extra) {
  const ctx = await carregar(perfis, extra);
  await ctx.w.dependencias();
  ctx.w.abrirDrawerDependencia(JSON.parse(JSON.stringify(dep)));
  await esperar();
  return ctx;
}

test('dependencia: RTO/RPO/MTTR em numero + unidade; texto legado e convertido ou vira aviso', async () => {
  const { doc } = await abrirDep(['ti'], SRV);
  assert.strictEqual(doc.getElementById('depRto').value, '3');
  assert.strictEqual(doc.getElementById('depRtoUnidade').value, 'h');
  assert.strictEqual(doc.getElementById('depRpo').value, '');
  assert.match(doc.getElementById('depRpoLegado').textContent, /"> 24 horas" não pôde ser convertido/);
  assert.notStrictEqual(doc.getElementById('depRpoLegado').style.display, 'none');
  assert.strictEqual(doc.getElementById('depMttr').value, '');

  const db = await abrirDep(['ti'], DB);
  assert.strictEqual(db.doc.getElementById('depRpo').value, '15');
  assert.strictEqual(db.doc.getElementById('depRpoUnidade').value, 'min');
  assert.strictEqual(db.doc.getElementById('depMttr').value, '90');
  assert.strictEqual(db.doc.getElementById('depRpoLegado').style.display, 'none');
});

test('dependencia: salvar grava minutos, componentes e o texto de compatibilidade; legado ilegivel e preservado', async () => {
  const { w, doc, gravacoes } = await abrirDep(['ti'], SRV);
  doc.getElementById('depRto').value = '1.5';
  doc.getElementById('depRtoUnidade').value = 'h';
  doc.getElementById('depMttr').value = '2';
  doc.getElementById('depMttrUnidade').value = 'd';
  await w.salvarDep();
  const g = gravacoes.find((x) => x.nome === 'salvarDependencia').arg;
  assert.strictEqual(g.rtoMin, 90);
  assert.strictEqual(g.rpoMin, null);
  assert.strictEqual(g.mttrMin, 2880);
  assert.strictEqual(g.rto, '1,5 horas');
  assert.strictEqual(g.rpo, '> 24 horas', 'campo vazio nao apaga o texto antigo nao convertido');
  assert.deepStrictEqual(g.componentes, [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }]);
});

test('componentes: o seletor so oferece tecnicas, fora ela mesma, quem esta acima e as ja escolhidas', async () => {
  const { w, doc } = await abrirDep(['ti'], SRV);
  assert.match(doc.getElementById('depComp-tags').textContent, /Oracle/);
  w.depCompMostrarDropdown();
  const opcoes = doc.getElementById('depComp-dropdown').textContent;
  assert.match(opcoes, /API Pix/);
  assert.doesNotMatch(opcoes, /Cluster K8s/, 'infra esta acima do servidor: fecharia ciclo');
  assert.doesNotMatch(opcoes, /SRV-01/, 'ela mesma');
  assert.doesNotMatch(opcoes, /Oracle/, 'ja escolhida');
  assert.doesNotMatch(opcoes, /Fornecedor X/, 'fornecedor nao e componente tecnico');
  w.selecionarDepComponente('solta');
  assert.match(doc.getElementById('depComp-tags').textContent, /API Pix/);
  w.removerDepComponente(0);
  assert.doesNotMatch(doc.getElementById('depComp-tags').textContent, /Oracle/);
});

test('esta abaixo de: mostra o servico e a dependencia de cima, somente leitura', async () => {
  const { doc } = await abrirDep(['ti'], INFRA);
  assert.match(doc.getElementById('depAcimaDe').textContent, /Portal\s*\(Serviço\)/);
  const srv = await abrirDep(['ti'], SRV);
  const bloco = srv.doc.getElementById('depAcimaDe');
  assert.match(bloco.textContent, /Cluster K8s/);
  assert.strictEqual(bloco.querySelectorAll('input,select,button').length, 0);
  const solta = await abrirDep(['ti'], SOLTA);
  assert.match(solta.doc.getElementById('depAcimaDe').textContent, /Nenhum Serviço ou dependência/);
});

// ---- Servicos: grade, drawer, alerta e aba Composicao ----

const PROCS = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento', dependenciaItens: [] },
  { id: 'p2', area: 'TI', processo: 'Monitoracao', dependenciaItens: [{ id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' }] }];
// Portal: RTO 4h; cadeia infra(2h) -> srv(3h) -> db(4h) = 9h -> alerta.
const PORTAL = { id: 's1', nome: 'Portal', rtoMin: 240, rpoMin: 600, mttrMin: 6000, dependenciaItens: [ref(INFRA)], processoIds: [{ id: 'p1', nome: 'Financeiro · Faturamento' }] };
const LEVE = { id: 's2', nome: 'Intranet', rtoMin: 60, rpoMin: 60, mttrMin: 60, dependenciaItens: [ref(DB)] };
const VAZIO = { id: 's3', nome: 'Novo', dependenciaItens: [] };

async function telaServicos(perfis, extra) {
  const ctx = await carregar(perfis, Object.assign({ getServicos: [PORTAL, LEVE, VAZIO], getProcessos: PROCS }, extra || {}));
  await ctx.w.servicos();
  return ctx;
}

test('servicos: coluna e filtro de Composicao calculados na leitura', async () => {
  const { w, doc } = await telaServicos(['admin']);
  const linhas = () => [...doc.querySelectorAll('#servicoRows tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
  assert.match(linhas().find((l) => /Portal/.test(l)), /Alerta/);
  assert.match(linhas().find((l) => /Intranet/.test(l)), /Alerta/, 'Oracle sozinho: RTO 4h > 1h');
  assert.match(linhas().find((l) => /Novo/.test(l)), /Sem dependências/);
  doc.getElementById('filtroComposicaoServico').value = 'sem-dependencias';
  w.renderizarServicos();
  assert.deepStrictEqual(linhas().map((l) => l.split(' ')[0]), ['Novo']);
  const selo = doc.querySelector('#servicoRows span[title]');
  assert.match(selo.getAttribute('title'), /O serviço não tem dependências/);
});

test('servico: faixa de alerta com o caminho critico, recalculada ao mudar o limite', async () => {
  const { w, doc } = await telaServicos(['admin']);
  w.abrirDrawerServico('s1');
  const faixa = doc.getElementById('servicoAlertaComposicao');
  assert.notStrictEqual(faixa.style.display, 'none');
  assert.match(faixa.textContent, /RTO das dependências \(caminho crítico\) = 9 h > RTO do serviço = 4 h/);
  assert.strictEqual(doc.getElementById('servicoRto').value, '4');
  doc.getElementById('servicoRto').value = '10';
  new w.Function(doc.getElementById('servicoRto').getAttribute('oninput')).call(doc.getElementById('servicoRto'));
  assert.strictEqual(faixa.style.display, 'none');
});

test('servico: aba Composicao mostra limite x caminho critico, a cadeia e a arvore', async () => {
  const { w, doc } = await telaServicos(['admin']);
  w.abrirDrawerServico('s1');
  w.trocarAbaServico('composicao');
  const aba = doc.getElementById('servicoComposicao').textContent.replace(/\s+/g, ' ');
  assert.match(aba, /RTO 4 h 9 h ⚠️ Excede Cluster K8s → SRV-01 → Oracle/);
  assert.match(aba, /MTTR .*\(mín\.\)/, 'infra e srv sem MTTR: soma e um minimo');
  ['Cluster K8s', 'SRV-01', 'Oracle'].forEach((n) => assert.match(aba, new RegExp(n)));
  w.abrirDrawerServico('s3');
  assert.match(doc.getElementById('servicoComposicao').textContent, /Adicione dependências ao serviço/);
});

test('servico: processos suportados + via dependencia, e o salvar grava limites e processos', async () => {
  const { w, doc, gravacoes } = await telaServicos(['admin']);
  w.abrirDrawerServico('s1');
  const imp = doc.getElementById('servicoProcessosImpactados').textContent.replace(/\s+/g, ' ');
  assert.match(imp, /Faturamento.*Suportado/);
  assert.match(imp, /Monitoracao.*Via dependência/);
  doc.getElementById('servicoProcessoAdd').value = 'p2';
  w.adicionarProcessoServico();
  assert.match(doc.getElementById('servicoProcessosImpactados').textContent.replace(/\s+/g, ' '), /Monitoracao.*Suportado/);
  doc.getElementById('servicoMttr').value = '3';
  doc.getElementById('servicoMttrUnidade').value = 'd';
  await w.salvarServico();
  const g = gravacoes.find((x) => x.nome === 'salvarServico').arg;
  assert.strictEqual(g.rtoMin, 240);
  assert.strictEqual(g.mttrMin, 4320);
  // O vinculo mora no processo (21/10/2026): o servico zera o processoIds
  // antigo e cada processo ganha o item 'Serviços'.
  assert.deepStrictEqual(g.processoIds, []);
  const procs = gravacoes.filter((x) => x.nome === 'salvarProcesso').map((x) => x.arg);
  assert.deepStrictEqual(procs.map((p) => p.id).sort(), ['p1', 'p2']);
  procs.forEach((p) => assert.ok(p.dependenciaItens.some((it) => it.categoria === 'Serviços' && it.id === 's1'), p.id));
  assert.ok(!('area' in procs[0]) && !('processo' in procs[0]), 'so as dependencias do processo, nada mais');
});

// ---- Relatorios de Servicos (tela propria no menu Servicos) ----

const SALVOS = [
  { id: 'e1', tipo: 'servicos', titulo: 'Relatório de Composição de Serviços', geradoEm: '2026-10-21T10:00:00Z', geradoPor: 'si@x', escopo: 'Empresa inteira' },
  { id: 'e2', tipo: 'riscos', titulo: 'Relatório Executivo de Riscos', geradoEm: '2026-10-20T10:00:00Z', geradoPor: 'si@x', versao: 2 },
];

async function telaRelatorio(perfis) {
  const ctx = await carregar(perfis, { getServicos: [PORTAL, LEVE, VAZIO], getProcessos: PROCS, getRelatoriosExecutivos: SALVOS });
  ctx.paginas = [];
  ctx.w.open = () => ({ document: { open() {}, close() {}, write: (h) => ctx.paginas.push(h), getElementById: () => null } });
  await ctx.w.servicosRelatorio();
  return ctx;
}
const textoDoc = (html) => new JSDOM(html).window.document.body.textContent.replace(/\s+/g, ' ');

test('relatorios de servicos: so Admin e Seguranca; atalho na tela de Servicos', async () => {
  const Perfis = require('../public/perfis.js');
  for (const [perfil, ve] of [['admin', true], ['seguranca', true], ['gestor', false], ['ti', false], ['operador', false]]) {
    assert.strictEqual(Perfis.podeVerTela([perfil], 'servicos-relatorio'), ve, perfil);
  }
  const { doc } = await telaServicos(['seguranca']);
  assert.match(doc.querySelector('.page-header').innerHTML, /#servicos-relatorio/);
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.match(html, /<a href="#servicos-relatorio" class="nav-link" data-page="servicos-relatorio">Relatórios de Serviços<\/a>/);
});

test('relatorios de servicos: escopo com contagem ao vivo; zero desabilita Gerar', async () => {
  const { w, doc } = await telaRelatorio(['seguranca']);
  assert.match(doc.getElementById('relSrvContagem').textContent, /3 serviços no escopo \(2 em alerta\) · Empresa inteira/);
  doc.getElementById('relSrvFiltroProcesso').value = 'p1';
  w.atualizarEscopoRelatorioServicos();
  assert.match(doc.getElementById('relSrvContagem').textContent, /1 serviço no escopo \(1 em alerta\) · Processo: Financeiro · Faturamento/);
  doc.getElementById('relSrvFiltroStatus').value = 'ok';
  w.atualizarEscopoRelatorioServicos();
  assert.ok(doc.getElementById('btnGerarRelSrv').disabled);
  const opcoesProc = [...doc.querySelectorAll('#relSrvFiltroProcesso option')].map((o) => o.textContent);
  assert.deepStrictEqual(opcoesProc, ['Todos', 'Financeiro · Faturamento'], 'so processos vinculados a algum servico');
});

test('relatorios de servicos: documento com situacao, cadeias acima do limite e o que falta; escapado', async () => {
  const ctx = await carregar(['seguranca'], {
    getServicos: [Object.assign({}, PORTAL, { nome: 'Portal <img src=x onerror=alert(1)>' }), LEVE, VAZIO], getProcessos: PROCS, getRelatoriosExecutivos: [],
  });
  const paginas = [];
  ctx.w.open = () => ({ document: { open() {}, close() {}, write: (h) => paginas.push(h), getElementById: () => null } });
  await ctx.w.servicosRelatorio();
  await ctx.w.gerarRelatorioServicos();
  assert.match(paginas[0], /Gerando o relatório/);
  const doc = paginas[paginas.length - 1];
  assert.doesNotMatch(doc, /<img src=x/);
  const t = textoDoc(doc);
  assert.match(t, /Relatório de Composição de Serviços/);
  assert.match(t, /1s*Situação dos serviços/);
  assert.match(t, /2s*Cadeias acima do limite/);
  assert.match(t, /RTO: 9 h contra limite de 4 h/);
  assert.match(t, /Cluster K8s \(2 h\) → SRV-01 \(3 h\) → Oracle \(4 h\)/);
  assert.match(t, /3s*O que falta informar/);
  assert.match(t, /SRV-01s*Servidors*RPO, MTTR/);
  assert.match(t, /💾 Salvar no sistema|Salvar no sistema/);
  assert.doesNotMatch(t, /Resumo executivo/, 'sem IA');
});

test('relatorios de servicos: salvar guarda o retrato com tipo servicos; lista so as edicoes da tela, sem Compartilhar', async () => {
  const ctx = await telaRelatorio(['seguranca']);
  const salvas = ctx.doc.getElementById('relatoriosSalvos');
  assert.match(salvas.textContent, /Relatório de Composição de Serviços/);
  assert.doesNotMatch(salvas.textContent, /Riscos/);
  assert.doesNotMatch(salvas.innerHTML, /Compartilhar/);
  await ctx.w.gerarRelatorioServicos();
  const idTemp = Object.keys(ctx.w._relatoriosGerados).pop();
  await ctx.w._salvarRelatorioExecutivoGerado(idTemp);
  const g = ctx.gravacoes.find((x) => x.nome === 'salvarRelatorioExecutivo').arg;
  assert.strictEqual(g.tipo, 'servicos');
  assert.strictEqual(g.escopo, 'Empresa inteira');
  const retrato = JSON.parse(g.conteudo);
  assert.strictEqual(retrato.dados.d.totais.servicos, 3);
  assert.ok(!/<html/i.test(g.conteudo), 'nunca o HTML');
  // Reabrir a edicao salva redesenha o mesmo documento.
  assert.ok(ctx.w._retratoValido(retrato));
});

test('mapa de conexoes: segundo tipo na tela; documento com um SVG por servico, caminho critico em vermelho, paisagem', async () => {
  const ctx = await telaRelatorio(['seguranca']);
  const tipos = [...ctx.doc.querySelectorAll('#relSrvTipo option')].map((o) => o.value);
  assert.deepStrictEqual(tipos, ['servicos', 'servicos-mapa']);
  ctx.doc.getElementById('relSrvTipo').value = 'servicos-mapa';
  ctx.w.atualizarEscopoRelatorioServicos();
  assert.match(ctx.doc.getElementById('relSrvTipoDica').textContent, /Um mapa por serviço/);
  await ctx.w.gerarRelatorioServicos();
  const html = ctx.paginas[ctx.paginas.length - 1];
  const dom = new JSDOM(html).window.document;
  assert.match(dom.title, /Mapa de Conexões de Serviços/);
  assert.match(html, /@page\{size:A4 landscape/);
  const svgs = dom.querySelectorAll('svg');
  assert.strictEqual(svgs.length, 2, 'Portal e Intranet (Novo nao tem dependencias)');
  const portal = [...dom.querySelectorAll('.bloco')].find((b) => /Portal/.test(b.querySelector('h3') ? b.querySelector('h3').textContent : ''));
  const texto = portal.textContent.replace(/\s+/g, ' ');
  ['Financeiro · Faturamento', 'Cluster K8s', 'SRV-01', 'Oracle'].forEach((n) => assert.match(texto, new RegExp(n)));
  assert.match(texto, /RTO: limite 4 h · caminho 9 h — excede/);
  const vermelhas = [...portal.querySelectorAll('path')].filter((p) => p.getAttribute('stroke') === '#d60014');
  assert.strictEqual(vermelhas.length, 3, 'servico->infra->srv->db');
  const tracejados = [...portal.querySelectorAll('rect[stroke-dasharray]')].length;
  assert.strictEqual(tracejados, 2, 'Cluster K8s e SRV-01 sem RPO/MTTR');
  assert.match(dom.body.textContent.replace(/\s+/g, ' '), /Novo Sem dependências .*Serviço sem dependências/);
});

test('mapa de conexoes: salva como servicos-mapa com o layout no retrato e lista junto das edicoes da tela', async () => {
  const ctx = await telaRelatorio(['seguranca']);
  ctx.doc.getElementById('relSrvTipo').value = 'servicos-mapa';
  await ctx.w.gerarRelatorioServicos();
  const idTemp = Object.keys(ctx.w._relatoriosGerados).pop();
  await ctx.w._salvarRelatorioExecutivoGerado(idTemp);
  const g = ctx.gravacoes.find((x) => x.nome === 'salvarRelatorioExecutivo').arg;
  assert.strictEqual(g.tipo, 'servicos-mapa');
  assert.strictEqual(g.titulo, 'Mapa de Conexões de Serviços');
  const retrato = JSON.parse(g.conteudo);
  assert.ok(ctx.w._retratoValido(retrato));
  assert.ok(retrato.dados.d.mapas[0].layout.nos.length > 1);
  // Redesenhar do retrato da o mesmo documento.
  const de = ctx.w._htmlRelatorioExecutivoPorTipo(retrato.tipo, retrato.dados, retrato.opcoes, null, { modo: 'salvo', geradoEm: retrato.geradoEm });
  assert.match(de, /Edição salva/);
  assert.strictEqual((de.match(/<svg/g) || []).length, 2);
});
