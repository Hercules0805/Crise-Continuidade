// Relatorio "Processos por Area" (tela Relatorios): cartao, selecao de areas e a pagina
// gerada. app.js real no jsdom, com a API trocada por dados de teste.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const AREAS = [
  { id: 'a1', nome: 'TI', responsavel: 'Kaique Branco' },
  { id: 'a2', nome: 'Comercial Corporativo', responsavel: 'Allan Rodrigues Lima' },
  { id: 'a3', nome: 'Área Vazia', responsavel: '' },
];
const PROCESSOS = [
  { id: 'p1', area: 'Comercial Corporativo', processo: 'Prospecção', score: 3, avaliado: true, rto: '4h a 24 horas', rpo: '< 1 hora', biaHomologada: 'BIA Realizado', bcpStatus: 'BCP Realizado', drpStatus: '' },
  { id: 'p2', area: 'Comercial Corporativo', processo: 'Negociação Vendas', score: 14, avaliado: true, rto: '< 4 horas', rpo: '', biaHomologada: 'Processo Avaliado', bcpStatus: '', drpStatus: 'DRP Realizado' },
  { id: 'p3', area: 'Comercial Corporativo', processo: 'Fechamento de Vendas', score: 7, avaliado: true },
  { id: 'p4', area: 'Comercial Corporativo', processo: 'Contrato Pendente', score: 0, avaliado: false },
  { id: 'p5', area: 'TI', processo: 'Backup', score: 13, avaliado: true, rto: '< 1 hora' },
  { id: 'p6', area: 'Área Órfã', processo: 'Processo sem área cadastrada', score: 5, avaliado: true },
];

async function carregar(opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const toasts = [];
  const paginas = [];
  const estado = { aberturas: 0 };
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin'];
  w.open = () => {
    estado.aberturas++;
    if (o.popupBloqueado) return null;
    return { document: { open() {}, close() {}, write: (h) => paginas.push(h) } };
  };
  w.API = new Proxy({}, { get: (_, nome) => async () => {
    if (o.falhaCarga) throw new Error('sem rede');
    if (nome === 'getAreas') return JSON.parse(JSON.stringify(o.areas || AREAS));
    if (nome === 'getProcessos') return JSON.parse(JSON.stringify(o.processos || PROCESSOS));
    return [];
  } });
  ['util.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8')
    + '\n;showToast = (m) => { window.__toasts.push(m); };window.__t = { grupos: _gruposRelatorioAreas, html: _htmlRelatorioProcessosPorArea };');
  w.__toasts = toasts;
  await w.relatorios();
  return { w, toasts, paginas, estado, doc: w.document };
}

const texto = (html) => {
  const d = new JSDOM('<body></body>').window.document;
  d.body.innerHTML = html;
  return d.body.textContent.replace(/\s+/g, ' ').trim();
};
// Texto de cada <td> da linha, sem depender de espaco entre as celulas.
const celulas = (trHtml) => [...trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
const bloco = (html, area) => (html.match(new RegExp(`<div class="area-bloco">\\s*<h2>${area}[\\s\\S]*?</div>\\s*(?=<div class="area-bloco">|<div class="footer">)`)) || [''])[0];

test('tela Relatorios: o cartao "Processos por Area" existe, com o botao que abre a selecao', async () => {
  const { doc } = await carregar();
  const titulos = [...doc.querySelectorAll('#app h3')].map((h) => h.textContent.trim());
  assert.ok(titulos.includes('Processos por Área'));
  assert.ok(titulos.includes('Processos por Dependência'), 'os relatorios que ja existiam continuam');
  assert.ok(titulos.includes('Relatório de Vínculos da Pessoa'));
  assert.ok([...doc.querySelectorAll('#app button')].some((b) => /abrirSelecaoAreasRelatorio/.test(b.getAttribute('onclick') || '')));
  assert.ok(doc.getElementById('drawerSelecaoAreasRelatorio'));
});

test('selecao: lista as areas em ordem alfabetica, com a contagem, tudo marcado, e a area fora do cadastro avisada', async () => {
  const { w, doc } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  const itens = [...doc.querySelectorAll('#relatorioAreasChecklist label')].map((l) => l.textContent.replace(/\s+/g, ' ').trim());
  assert.deepStrictEqual(itens.map((t) => t.split(' (')[0].replace(/ \d+$/, '')), ['Área Órfã', 'Área Vazia', 'Comercial Corporativo', 'TI']);
  assert.match(itens[0], /Área Órfã \(área fora do cadastro\) 1$/);
  assert.match(itens[1], /Área Vazia 0$/);
  assert.match(itens[2], /Comercial Corporativo 4$/);
  assert.match(itens[3], /TI 1$/);
  assert.ok([...doc.querySelectorAll('#relatorioAreasChecklist input')].every((i) => i.checked));
  assert.ok(doc.getElementById('drawerSelecaoAreasRelatorio').classList.contains('open'));
});

test('relatorio: um bloco por area, com o Dono (responsavel da area) e o resumo de Tier', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  assert.strictEqual(paginas.length, 1);
  const html = paginas[0];
  assert.match(html, /<title>Processos por Área<\/title>/);
  assert.match(texto(html), /4 áreas • 6 processos/);
  const com = texto(bloco(html, 'Comercial Corporativo'));
  assert.match(com, /Dono: Allan Rodrigues Lima/);
  assert.match(com, /4 processos/);
  assert.match(com, /Tier 1: 1/);
  assert.match(com, /Tier 2: 1/);
  assert.match(com, /Tier 3: 1/);
  assert.match(com, /Pendente: 1/);
  assert.match(texto(bloco(html, 'TI')), /Dono: Kaique Branco/);
});

test('relatorio: processos do mais critico ao Pendente, depois por nome; colunas da grade', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  const com = bloco(paginas[0], 'Comercial Corporativo');
  const ordem = ['Negociação Vendas', 'Fechamento de Vendas', 'Prospecção', 'Contrato Pendente'].map((n) => com.indexOf(n));
  assert.ok(ordem.every((v) => v > 0) && ordem.slice().sort((a, b) => a - b).join() === ordem.join(), 'Tier 1, Tier 2, Tier 3, Pendente');
  assert.match(com, /<th>Processo<\/th><th>Tier<\/th><th class="c">Score<\/th><th>RTO<\/th><th>RPO<\/th><th>BIA<\/th><th>BCP<\/th><th>DRP<\/th>/);
  const negociacao = celulas(com.match(/<tr>\s*<td><strong>Negociação Vendas[\s\S]*?<\/tr>/)[0]);
  assert.deepStrictEqual(negociacao, ['Negociação Vendas', 'Tier 1 (Crítico)', '14', '< 4 horas', '–', 'Processo Avaliado', '–', 'DRP Realizado']);
});

test('relatorio: campo vazio vira "–" e processo nao avaliado fica sem score', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  const pendente = celulas(bloco(paginas[0], 'Comercial Corporativo').match(/<tr>\s*<td><strong>Contrato Pendente[\s\S]*?<\/tr>/)[0]);
  assert.deepStrictEqual(pendente, ['Contrato Pendente', 'Pendente', '–', '–', '–', '–', '–', '–']);
});

test('relatorio: area sem processo aparece com a mensagem, e sem Dono mostra traco', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  const vazia = texto(bloco(paginas[0], 'Área Vazia'));
  assert.match(vazia, /Nenhum processo cadastrado nesta área/);
  assert.match(vazia, /Dono: —/);
  assert.ok(!/<table>/.test(bloco(paginas[0], 'Área Vazia')));
});

test('relatorio: area que so existe nos processos entra como "fora do cadastro", sem Dono', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  const orfa = texto(bloco(paginas[0], 'Área Órfã'));
  assert.match(orfa, /\(área fora do cadastro\)/);
  assert.match(orfa, /Dono: —/);
  assert.match(orfa, /Processo sem área cadastrada/);
});

test('selecao parcial: so as areas marcadas entram no relatorio', async () => {
  const { w, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  w.selecionarTodasAreasRelatorio(false);
  w.toggleAreaRelatorioSelecionada(w._relatorioAreasGrupos.findIndex((g) => g.nome === 'TI'), true);
  await w.confirmarGerarRelatorioProcessosPorArea();
  const html = paginas[0];
  assert.match(html, /<h2>TI/);
  assert.ok(!/<h2>Comercial Corporativo/.test(html));
  assert.match(texto(html), /1 área • 1 processo •/);
});

test('sem nenhuma area marcada: avisa e nao abre pagina nenhuma', async () => {
  const { w, toasts, estado, paginas } = await carregar();
  await w.abrirSelecaoAreasRelatorio();
  w.selecionarTodasAreasRelatorio(false);
  await w.confirmarGerarRelatorioProcessosPorArea();
  assert.deepStrictEqual(Array.from(toasts), ['Selecione ao menos uma área.']);
  assert.strictEqual(estado.aberturas, 0);
  assert.strictEqual(paginas.length, 0);
});

test('erro ao carregar areas/processos: avisa e nao abre o drawer', async () => {
  const { w, toasts, doc } = await carregar({ falhaCarga: true });
  await w.abrirSelecaoAreasRelatorio();
  // Mensagem para pessoas (_mensagemErro): a acao que falhou, sem o texto tecnico do erro.
  assert.match(toasts[0], /Não foi possível carregar áreas e processos\. Tente de novo\./);
  assert.doesNotMatch(toasts[0], /sem rede/);
  assert.ok(!doc.getElementById('drawerSelecaoAreasRelatorio').classList.contains('open'));
});

test('popup bloqueado: avisa e o drawer continua aberto para tentar de novo', async () => {
  const { w, toasts, doc } = await carregar({ popupBloqueado: true });
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  assert.match(toasts[0], /Popup bloqueado/);
  assert.ok(doc.getElementById('drawerSelecaoAreasRelatorio').classList.contains('open'));
});

test('nomes de area, processo e dono com HTML saem escapados', async () => {
  const { w, paginas } = await carregar({
    areas: [{ id: 'x', nome: '<b>Área</b>', responsavel: '<img src=x onerror=alert(1)>' }],
    processos: [{ id: 'p', area: '<b>Área</b>', processo: '<script>alert(2)</script>', score: 3, avaliado: true }],
  });
  await w.abrirSelecaoAreasRelatorio();
  await w.confirmarGerarRelatorioProcessosPorArea();
  const html = paginas[0];
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>alert(2)') && !html.includes('<b>Área</b>'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('_gruposRelatorioAreas: catalogo + areas so dos processos, ordenado, com os processos de cada uma', async () => {
  const { w } = await carregar();
  const g = Array.from(w.__t.grupos(AREAS, PROCESSOS)).map((x) => ({ nome: x.nome, n: x.processos.length, fora: x.foraDoCadastro, dono: x.responsavel }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g)), [
    { nome: 'Área Órfã', n: 1, fora: true, dono: '' },
    { nome: 'Área Vazia', n: 0, fora: false, dono: '' },
    { nome: 'Comercial Corporativo', n: 4, fora: false, dono: 'Allan Rodrigues Lima' },
    { nome: 'TI', n: 1, fora: false, dono: 'Kaique Branco' },
  ]);
});
