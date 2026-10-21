// Dica dos pontos do grafico do Monitor de Risco: ao passar o mouse, mostra os
// riscos que moveram a curva naquele dia (retrato.mudancas). app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

function carregar() {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin'];
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;window.__t = { svg: _svgLinhaTempoRisco, dica: _conteudoDicaMonitor };');
  return w;
}

const m = (extra) => Object.assign({ area: 'TI', tipo: 'novo', scoreAntes: null, scoreDepois: 5, cargaAntes: 0, cargaDepois: 0, financeiroAntes: 0, financeiroDepois: 0 }, extra);
const area = (nome, carga, fin) => ({ area: nome, carga, contados: 1, impactoFinanceiro: fin || 0, composicao: {} });
const dia = (d, empresa, areas, mudancas, finEmpresa) => ({
  dia: d, empresa: { carga: empresa, contados: 1, impactoFinanceiro: finEmpresa || 0, composicao: {} }, areas, ...(mudancas === undefined ? {} : { mudancas }),
});

const HISTORICO = [
  dia('2026-10-06', 10, [area('TI', 10, 1000)], [m({ riscoId: 'a', titulo: 'Falha A', cargaDepois: 10, financeiroDepois: 1000 })], 1000),
  dia('2026-10-07', 10, [area('TI', 10, 1000)], [], 1000),
  dia('2026-10-08', 40, [area('TI', 10, 1000), area('RH', 30, 5000)], [
    m({ riscoId: 'b', titulo: 'Falha B', area: 'RH', scoreDepois: 9, cargaDepois: 18, financeiroDepois: 4000 }),
    m({ riscoId: 'c', titulo: 'Risco C', area: 'RH', tipo: 'reavaliado', scoreAntes: 2, scoreDepois: 6, cargaAntes: 4, cargaDepois: 16, financeiroAntes: 1000, financeiroDepois: 1000 }),
  ], 6000),
  dia('2026-10-09', 30, [area('TI', 0, 0), area('RH', 30, 5000)], [
    m({ riscoId: 'a', titulo: 'Falha A', tipo: 'encerrado', scoreAntes: 5, scoreDepois: null, cargaAntes: 10, cargaDepois: 0, financeiroAntes: 1000, financeiroDepois: 0 }),
  ], 5000),
  dia('2026-10-10', 35, [area('TI', 0, 0), area('RH', 35, 5000)]), // dia antigo: sem `mudancas`
  dia('2026-10-11', 45, [area('TI', 0, 0), area('RH', 45, 5000)], [
    m({ riscoId: 'd', titulo: 'Risco D', area: 'RH', scoreDepois: 5, cargaDepois: 7 }),
  ]), // soma (+7) nao fecha com a variacao (+10)
];

function contexto(campo) {
  const w = carregar();
  const formatarValor = campo === 'impactoFinanceiro' ? (v) => 'R$ ' + v : (v) => String(v);
  const g = w.__t.svg(HISTORICO, { campo, formatarValor });
  const ctx = w._monitorGraficos[campo];
  const texto = (serie, diaChave) => {
    const sIdx = ctx.series.findIndex((s) => s.nome === serie);
    const i = HISTORICO.findIndex((d) => d.dia === diaChave);
    assert.ok(sIdx >= 0 && i >= 0, `${serie} ${diaChave}`);
    const div = w.document.createElement('div');
    div.innerHTML = w.__t.dica(ctx, sIdx, i);
    return div.textContent.replace(/\s+/g, ' ').trim();
  };
  return { w, g, ctx, texto };
}

test('Empresa: mostra todos os riscos do dia, com variacao e tipo, do maior para o menor', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-08');
  assert.match(t, /Empresa · 08\/10/);
  assert.match(t, /Carga 40/);
  assert.match(t, /▲ \+30 desde 07\/10/);
  assert.match(t, /▲ \+18 Falha B novo · score 9 · RH/);
  assert.match(t, /▲ \+12 Risco C reavaliado · score 2 → 6 · RH/);
  assert.ok(t.indexOf('Falha B') < t.indexOf('Risco C'), 'ordenado por tamanho da variacao');
  assert.ok(!/pesos de hoje/.test(t), 'a soma fecha, sem nota de divergencia');
});

test('Area: so os riscos da propria area', () => {
  const { texto } = contexto('carga');
  const t = texto('TI', '2026-10-06');
  assert.match(t, /Falha A novo/);
  const rh = texto('RH', '2026-10-08');
  assert.match(rh, /Falha B/);
  assert.match(rh, /Risco C/);
  const ti = texto('TI', '2026-10-08');
  assert.ok(!/Falha B|Risco C/.test(ti), 'riscos da RH nao aparecem na TI');
  assert.match(ti, /sem variação desde 07\/10/);
  assert.match(ti, /Sem mudança neste dia/);
});

test('Descida: risco encerrado aparece com seta para baixo e o tipo', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-09');
  assert.match(t, /▼ −10 desde 08\/10/);
  assert.match(t, /▼ −10 Falha A encerrado/);
});

test('Dia plano (sem variacao e sem mudancas): "Sem mudanca neste dia"', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-07');
  assert.match(t, /sem variação desde 06\/10/);
  assert.match(t, /Sem mudança neste dia/);
});

test('Primeiro dia registrado nao inventa variacao', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-06');
  assert.match(t, /primeiro dia registrado/);
  assert.match(t, /Falha A novo/);
});

test('Dia antigo, sem `mudancas` gravado: so o valor e o aviso de detalhe indisponivel', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-10');
  assert.match(t, /Carga 35/);
  assert.match(t, /▲ \+5/);
  assert.match(t, /Detalhe por risco indisponível para este dia/);
});

test('Quando a soma do detalhe nao fecha com o ponto, avisa que usou os pesos de hoje', () => {
  const { texto } = contexto('carga');
  const t = texto('Empresa', '2026-10-11');
  assert.match(t, /▲ \+10/);
  assert.match(t, /Risco D/);
  assert.match(t, /Detalhe calculado com os pesos de hoje/);
});

test('Impacto financeiro: usa o valor em R$ de cada risco, nao a carga', () => {
  const { texto } = contexto('impactoFinanceiro');
  const t = texto('Empresa', '2026-10-08');
  assert.match(t, /Impacto financeiro R\$ 6000/);
  assert.match(t, /▲ \+R\$ 5000/);
  assert.match(t, /▲ \+R\$ 4000 Falha B novo/);
  // Risco C so mudou o score (carga), o financeiro ficou em 1000: nao entra na dica financeira.
  assert.ok(!/Risco C/.test(t));
});

test('Mais de 6 riscos: lista os 6 maiores e diz quantos ficaram de fora', () => {
  const w = carregar();
  const muitos = Array.from({ length: 9 }, (_, i) => m({ riscoId: 'r' + i, titulo: 'Risco ' + i, cargaDepois: 10 + i }));
  const h = [dia('2026-10-01', 0, []), dia('2026-10-02', 99, [area('TI', 99)], muitos)];
  w.__t.svg(h, { campo: 'carga' });
  const ctx = w._monitorGraficos.carga;
  const div = w.document.createElement('div');
  div.innerHTML = w.__t.dica(ctx, 0, 1);
  const t = div.textContent;
  assert.strictEqual((t.match(/Risco \d/g) || []).length, 6);
  assert.match(t, /\+3 outros/);
  assert.match(t, /Risco 8/, 'o maior entra');
  assert.ok(!/Risco 0\b/.test(t), 'o menor fica de fora');
});

test('Titulo do risco com HTML sai escapado na dica', () => {
  const w = carregar();
  const h = [dia('2026-10-01', 0, []), dia('2026-10-02', 5, [area('TI', 5)], [m({ riscoId: 'x', titulo: '<img src=x onerror=alert(1)>', cargaDepois: 5 })])];
  w.__t.svg(h, { campo: 'carga' });
  const html = w.__t.dica(w._monitorGraficos.carga, 0, 1);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Grafico: um alvo de hover por ponto, sem o <title> nativo antigo', () => {
  const { g, ctx } = contexto('carga');
  const alvos = (g.svg.match(/class="ponto-monitor-hit"/g) || []).length;
  assert.strictEqual(alvos, ctx.series.length * HISTORICO.length);
  assert.ok(!/<title>/.test(g.svg));
  assert.match(g.svg, /onmouseenter="_mostrarDicaMonitor\(event,'carga',0,0\)"/);
});

test('Passar o mouse num ponto mostra a dica perto dele; sair esconde', () => {
  const { w, g } = contexto('carga');
  w.document.getElementById('app').innerHTML = g.svg;
  const alvo = w.document.querySelectorAll('#app .ponto-monitor-hit')[2]; // Empresa, 3o dia
  w.document.querySelector('#app svg'); // garante que o svg esta montado
  w._mostrarDicaMonitor({ currentTarget: alvo }, 'carga', 0, 2);
  const el = w.document.getElementById('dicaMonitor');
  assert.strictEqual(el.style.display, 'block');
  assert.match(el.textContent, /Falha B/);
  w._esconderDicaMonitor();
  assert.strictEqual(el.style.display, 'none');
});

test('Os dois graficos guardam contexto proprio (carga e impacto financeiro)', () => {
  const w = carregar();
  w.__t.svg(HISTORICO, { campo: 'carga' });
  w.__t.svg(HISTORICO, { campo: 'impactoFinanceiro', formatarValor: (v) => 'R$ ' + v });
  assert.strictEqual(w._monitorGraficos.carga.rotuloValor, 'Carga');
  assert.strictEqual(w._monitorGraficos.impactoFinanceiro.rotuloValor, 'Impacto financeiro');
});
