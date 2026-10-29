// Risco no Tempo (21/10/2026): seletor de periodo (padrao "Este ano") e o trecho reconstruido pela
// data de identificacao (antes do inicio real do livro de medicoes). app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const dia = (d, carga) => ({ dia: d, inicioLivro: '2026-09-15', empresa: { carga, contados: 2, impactoFinanceiro: 1000, composicao: {} }, areas: [{ area: 'TI', carga, contados: 2, impactoFinanceiro: 1000, composicao: {} }], mudancas: [] });
const HISTORICO = [dia('2026-01-10', 20), dia('2026-05-01', 40), dia('2026-09-15', 60), dia('2026-10-20', 90)];

async function carregar(historico) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const pedidos = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin'];
  w.API = new Proxy({}, { get: (_, n) => async (a) => {
    if (n === 'getHistoricoRiscoDesde') { pedidos.push(a); return JSON.parse(JSON.stringify(historico || HISTORICO)); }
    return [];
  } });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;window.__t = { inicio: _inicioPeriodoMonitor };');
  await w.monitor();
  return { w, doc: w.document, pedidos };
}

test('inicio de cada periodo', async () => {
  const { w } = await carregar();
  const f = w.__t.inicio;
  assert.strictEqual(f('ano', '2026-10-21'), '2026-01-01');
  assert.strictEqual(f('90d', '2026-10-21'), '2026-07-24');
  assert.strictEqual(f('6m', '2026-10-21'), '2026-04-22');
  assert.strictEqual(f('12m', '2026-10-21'), '2025-10-22');
});

test('padrao "Este ano"; trocar o periodo pede a data certa', async () => {
  const { w, doc, pedidos } = await carregar();
  const ano = new Date().toISOString().slice(0, 4);
  assert.strictEqual(doc.getElementById('monitorPeriodo').value, 'ano');
  assert.strictEqual(pedidos[0], `${ano}-01-01`);
  await w.trocarPeriodoMonitor('90d');
  assert.strictEqual(doc.getElementById('monitorPeriodo').value, '90d');
  assert.strictEqual(pedidos[1], w.__t.inicio('90d'));
  await w.trocarPeriodoMonitor('ano');
});

test('trecho reconstruido: faixa cinza nos dois graficos e a nota; sem trecho antigo, nada', async () => {
  const { doc } = await carregar();
  assert.strictEqual(doc.querySelectorAll('rect.trecho-reconstruido').length, 2, 'carga e impacto financeiro');
  assert.match(doc.getElementById('monitorConteudo').textContent, /Antes de 15\/09\/2026, a curva é reconstruída pela data de identificação/);
  const recente = await carregar([dia('2026-09-20', 60), dia('2026-10-20', 90)]);
  assert.strictEqual(recente.doc.querySelectorAll('rect.trecho-reconstruido').length, 0);
  assert.doesNotMatch(recente.doc.getElementById('monitorConteudo').textContent, /reconstruída pela data de identificação/);
});
