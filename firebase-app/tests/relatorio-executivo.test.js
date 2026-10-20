// Relatorios Executivos de Vulnerabilidades e de Riscos (20/10/2026): cards da tela Relatorios,
// fluxo de geracao (aba aberta no clique, IA opcional que nao bloqueia) e o documento.
// app.js real no jsdom, com a API e o window.open trocados por dados de teste.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const dia = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

const VULNS = [
  { id: 'v1', codigo: '2026-001', nome: 'RCE <script>alert(1)</script>', cvss: 9.8, severidadeManual: '', statusCorrecao: 'Pendente', dataDeteccao: dia(-20), dataPrevistaCorrecao: dia(-2), dependenciasAfetadas: [{ id: 'd1' }], equipeResponsavel: 'Infra' },
  { id: 'v2', codigo: '2026-002', nome: 'Header ausente', cvss: null, severidadeManual: 'Baixa', statusCorrecao: 'Corrigida', dataDeteccao: dia(-40), dataPrevistaCorrecao: dia(-10), dataCorrecao: dia(-12), equipeResponsavel: 'Infra' },
];
const PROCESSOS = [{ id: 'p1', processo: 'Folha', area: 'DP', score: 15, avaliado: true, dependenciaItens: [{ id: 'd1' }] }];
const RISCOS = [
  { id: 'r1', titulo: 'Ransomware <img src=x onerror=alert(1)>', area: 'TI', processoId: 'p1', status: 'Identificado', probabilidade: 'Muito alta', impacto: 'Muito alto', impactoFinanceiro: 1000, proximaReavaliacao: dia(-5) },
  { id: 'r2', titulo: 'Fornecedor único', area: '', status: 'Aceito', probabilidade: 'Alta', impacto: 'Muito alto', estrategiaTratamento: 'Aceitar', justificativaAceite: 'Sem alternativa',
    planoAcao: [{ acao: 'Plano B', quando: dia(-3), status: 'Pendente' }] },
];

async function carregar(perfil, o) {
  const opc = o || {};
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const paginas = [];
  const chamadas = [];
  const toasts = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = [perfil]; w.USER_EMAIL = 'analista@fortestecnologia.com.br';
  w.open = () => (opc.popupBloqueado ? null : { document: { open() {}, close() {}, write: (h) => paginas.push(h) } });
  w.API = new Proxy({}, { get: (_, nome) => async (a, b) => {
    chamadas.push({ nome, a, b });
    if (opc.api && opc.api[nome]) return opc.api[nome](a, b);
    if (nome === 'getVulnerabilidades') return JSON.parse(JSON.stringify(VULNS));
    if (nome === 'getProcessos') return JSON.parse(JSON.stringify(PROCESSOS));
    if (nome === 'getRiscos') return JSON.parse(JSON.stringify(RISCOS));
    if (nome === 'getConfigVulnerabilidade') return { limiarCvss: 7 };
    if (nome === 'getConfigRiscos') return { apetite: 'Moderado' };
    if (nome === 'getHistoricoRiscoDesde') return [{ dia: dia(-1), empresa: { carga: 99, contados: 2, impactoFinanceiro: 1000 }, mudancas: [{ tipo: 'novo' }] }];
    if (nome === 'post' && a === 'gerarResumoExecutivo') return { success: true, paragrafos: ['Situação <b>grave</b>.'], recomendacoes: ['Corrigir o RCE.'] };
    return [];
  } });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'vulnerabilidade-painel.js', 'cvss31.js', 'risco-consolidado.js', 'risco-relatorio.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  w.__toasts = toasts;
  await w.relatorios();
  return { w, doc: w.document, paginas, chamadas, toasts };
}

async function gerar(ctx, tipo, marcarIA) {
  ctx.w.abrirOpcoesRelatorioExecutivo(tipo);
  ctx.doc.getElementById('relExecIA').checked = marcarIA !== false;
  await ctx.w.gerarRelatorioExecutivo();
  return ctx.paginas[ctx.paginas.length - 1];
}

const texto = (html) => new JSDOM(html).window.document.body.textContent.replace(/\s+/g, ' ');
const secoes = (html) => [...new JSDOM(html).window.document.querySelectorAll('.secao')].map((s) => s.textContent.replace(/\s+/g, ' ').trim());

test('cards executivos so para Admin e Seguranca (TI e Operador veem a tela, mas nao os cards)', async () => {
  for (const [perfil, ve] of [['admin', true], ['seguranca', true], ['ti', false], ['operador', false]]) {
    const { doc } = await carregar(perfil);
    const t = doc.getElementById('app').textContent;
    assert.strictEqual(/Relatório Executivo de Vulnerabilidades/.test(t), ve, perfil);
    assert.strictEqual(/Relatório Executivo de Riscos/.test(t), ve, perfil);
  }
});

test('vulnerabilidades: aba aberta com "Gerando…", depois o documento com as 5 perguntas, IA escapada e apendice', async () => {
  const ctx = await carregar('seguranca');
  const html = await gerar(ctx, 'vulnerabilidades');
  assert.match(ctx.paginas[0], /Gerando o relatório e o resumo por IA/);
  assert.strictEqual(ctx.paginas.length, 2);
  const s = secoes(html);
  assert.strictEqual(s.length, 7, '5 perguntas + apendice + notas');
  assert.match(s[0], /exposição atual/);
  assert.match(s[4], /serviços e dados críticos/);
  assert.match(s[5], /Apêndice/);
  assert.match(html, /Situação &lt;b&gt;grave&lt;\/b&gt;\./, 'texto da IA escapado');
  assert.ok(!html.includes('<script>alert(1)'), 'nome da vulnerabilidade escapado');
  assert.match(texto(html), /Corrigir o RCE\./);
  assert.match(texto(html), /Texto gerado por IA/);
  assert.match(texto(html), /Classificação: Uso Interno/);
  assert.match(texto(html), /Folha/, 'processo Tier 1 exposto');
  const ia = ctx.chamadas.find((c) => c.nome === 'post');
  assert.strictEqual(ia.b.tipo, 'vulnerabilidades');
  assert.strictEqual(ia.b.indicadores.emAberto, 1);
});

test('IA desmarcada nao chama o servidor; IA com erro: relatorio sai com aviso e destaques', async () => {
  const sem = await carregar('admin');
  const html = await gerar(sem, 'vulnerabilidades', false);
  assert.ok(!sem.chamadas.some((c) => c.nome === 'post'));
  assert.doesNotMatch(texto(html), /Resumo executivo/);
  assert.match(texto(html), /Destaques/);
  const erro = await carregar('admin', { api: { post: () => { throw new Error('Cota da IA esgotada para hoje.'); } } });
  const html2 = await gerar(erro, 'riscos');
  assert.match(texto(html2), /Resumo por IA indisponível \(Cota da IA esgotada para hoje\.\)/);
  assert.strictEqual(secoes(html2).length, 8, '7 secoes + notas');
});

test('riscos: secoes nas etapas NIST, mapa de calor, aceite sem aprovador, acao atrasada, tendencia', async () => {
  const ctx = await carregar('admin');
  const html = await gerar(ctx, 'riscos');
  const s = secoes(html);
  assert.match(s[0], /Panorama/);
  assert.match(s[1], /Mapa de calor/);
  assert.match(s[4], /Resposta ao risco/);
  assert.match(s[5], /Monitoramento/);
  assert.match(s[6], /Tendência/);
  const doc = new JSDOM(html).window.document;
  assert.strictEqual(doc.querySelectorAll('table.mapa').length, 2, 'inerente e residual');
  const t = texto(html);
  assert.match(t, /Sem aprovador/);
  assert.match(t, /Plano B/);
  assert.match(t, /Reavaliações vencidas/);
  assert.ok(!html.includes('<img src=x'), 'titulo do risco escapado');
  const hist = ctx.chamadas.find((c) => c.nome === 'getHistoricoRiscoDesde');
  assert.match(hist.a, /^\d{4}-\d{2}-01$/, 'desde o 1o dia do primeiro mes');
  assert.match(t, /99/, 'carga do ultimo retrato');
});

test('riscos sem permissao no historico: a tendencia explica e o resto sai', async () => {
  const ctx = await carregar('admin', { api: { getHistoricoRiscoDesde: () => { throw new Error('Missing or insufficient permissions'); } } });
  const html = await gerar(ctx, 'riscos', false);
  assert.match(texto(html), /histórico de risco não pôde ser lido/);
  assert.match(texto(html), /Principais riscos/);
});

test('popup bloqueado avisa; falha ao carregar os dados vira pagina de erro na mesma aba', async () => {
  const bloq = await carregar('admin', { popupBloqueado: true });
  await gerar(bloq, 'riscos');
  assert.match(bloq.toasts.join(' '), /Popup bloqueado/);
  const falha = await carregar('admin', { api: { getRiscos: () => { throw new Error('Falha na leitura do banco de dados.'); } } });
  const html = await gerar(falha, 'riscos');
  assert.match(texto(html), /Não foi possível carregar os dados: Falha na leitura do banco de dados/);
  assert.ok(!falha.chamadas.some((c) => c.nome === 'post'), 'sem dados, nao chama a IA');
});
