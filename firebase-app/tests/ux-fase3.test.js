// Revisão de UX, fase 3 (16/10/2026): padronização visual das telas.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { criarPaginacao } = require('../public/util.js');

const PUB = path.join(__dirname, '..', 'public');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const SCRIPTS = ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js', 'app.js'];

function carregar(dados, perfis = ['admin']) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.APP_API_URL = '';
  w.USER_PERFIS = perfis;
  w.USER_PERFIL = perfis[0];
  w.USER_AREA = 'TI';
  w.confirm = () => true;
  w.console.log = () => {};
  w.API = new Proxy({}, { get: (_, n) => async () => (dados[n] !== undefined ? JSON.parse(JSON.stringify(dados[n])) : (/Config/.test(n) ? {} : [])) });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  return w;
}
const espera = () => new Promise((r) => setTimeout(r, 20));

test('criarPaginacao: corta a lista, prende a pagina e reinicia', () => {
  const p = criarPaginacao(10);
  const lista = Array.from({ length: 23 }, (_, i) => i);
  let r = p.aplicar(lista);
  assert.deepStrictEqual([r.inicio, r.fim, r.total, r.totalPaginas, r.pagina, r.itens.length], [0, 10, 23, 3, 1, 10]);
  p.mover(1); p.mover(1);
  r = p.aplicar(lista);
  assert.deepStrictEqual([r.inicio, r.fim, r.pagina, r.itens.length], [20, 23, 3, 3]);
  r = p.aplicar(lista.slice(0, 5)); // filtro encolheu a lista: nao fica numa pagina que nao existe
  assert.deepStrictEqual([r.pagina, r.itens.length], [1, 5]);
  p.mover(-5);
  assert.strictEqual(p.aplicar(lista).pagina, 1);
  p.mover(2); p.reiniciar();
  assert.strictEqual(p.aplicar(lista).pagina, 1);
  assert.deepStrictEqual(criarPaginacao().aplicar([]), { itens: [], inicio: 0, fim: 0, total: 0, totalPaginas: 1, pagina: 1 });
});

test('acoes de linha em SVG, nunca emoji', () => {
  assert.doesNotMatch(APP, /class="btn-icon"[^>]*>(✏️|🗑️)</);
  assert.doesNotMatch(APP, />🗑️<\/button>/);
});

test('rodape de paginacao unico: "Mostrando X–Y de Z", botoes so com mais de uma pagina', () => {
  const w = carregar({});
  assert.strictEqual(w._htmlPaginacao({ total: 0 }, 'f'), '');
  const uma = w._htmlPaginacao({ pagina: 1, totalPaginas: 1, inicio: 0, fim: 5, total: 5 }, 'f');
  assert.match(uma, /Mostrando 1–5 de 5/);
  assert.doesNotMatch(uma, /Próxima/);
  const varias = w._htmlPaginacao({ pagina: 1, totalPaginas: 2, inicio: 0, fim: 20, total: 27 }, 'irParaX');
  assert.match(varias, /onclick="irParaX\(-1\)" disabled/);
  assert.match(varias, /onclick="irParaX\(1\)" >Próxima/, 'na 1a pagina, Proxima habilitado');
  w.close();
});

const forn = Array.from({ length: 27 }, (_, i) => ({ id: 'f' + i, categoria: 'Fornecedores', nome: 'Forn ' + String(i).padStart(2, '0'), setor: i % 2 ? 'TI' : 'Financeiro' }));

test('Fornecedores: grade paginada (20 por pagina), larguras em px e filtro volta para a 1a pagina', async () => {
  const w = carregar({ getDependencias: forn, getAreas: [{ nome: 'TI' }, { nome: 'Financeiro' }] });
  await w.fornecedores();
  await espera();
  const doc = w.document;
  const linhas = () => doc.querySelectorAll('#listaFornecedores tbody tr').length;
  assert.strictEqual(linhas(), 20);
  assert.match(doc.querySelector('.paginacao').textContent, /Mostrando 1–20 de 27/);
  assert.ok(doc.querySelector('#listaFornecedores colgroup'), 'colgroup em px');
  assert.ok(!/width:\d+%/.test(doc.querySelector('#listaFornecedores thead').innerHTML), 'sem largura em % no cabecalho');
  w.irParaPaginaFornecedores(1);
  assert.strictEqual(linhas(), 7);
  doc.getElementById('filtroFornCadastroSetor').value = 'TI';
  w.filtrarFornecedores();
  assert.match(doc.querySelector('.paginacao').textContent, /Mostrando 1–13 de 13/);
  assert.ok(doc.querySelector('.filters .field-label'), 'filtros no padrao .filters/.field');
  w.close();
});

test('Fornecedores: quem so consulta ve o lapis "Visualizar" (nao um botao "Ver" diferente)', async () => {
  const w = carregar({ getDependencias: forn.slice(0, 2), getAreas: [] }, ['gestor']);
  await w.fornecedores();
  await espera();
  const acoes = w.document.querySelector('#listaFornecedores tbody tr td.col-sticky');
  assert.ok(acoes.querySelector('button[title="Visualizar"] svg'));
  assert.doesNotMatch(acoes.textContent, /Ver/);
  w.close();
});

const procs = Array.from({ length: 26 }, (_, i) => ({ id: 'p' + i, area: i % 2 ? 'TI' : 'RH', processo: 'Proc ' + i, score: i, avaliado: true, respostas: {} }));

test('Processos: grade paginada, filtro por area volta para a 1a pagina, botoes de area sao .btn', async () => {
  const w = carregar({ getProcessos: procs, getAreas: [{ nome: 'TI' }, { nome: 'RH' }], getPerguntas: [] });
  await w.processos();
  await espera();
  const doc = w.document;
  const linhas = () => doc.querySelectorAll('#rows tr').length;
  assert.strictEqual(linhas(), 20);
  w.irParaPaginaProcessos(1);
  assert.strictEqual(linhas(), 6);
  w.filtrarPorArea('TI');
  assert.strictEqual(linhas(), 13);
  assert.match(doc.getElementById('processosPaginacao').textContent, /Mostrando 1–13 de 13/);
  assert.ok(doc.getElementById('btnEnviarArea').classList.contains('btn'));
  assert.strictEqual(doc.getElementById('btnEnviarArea').style.display, 'inline-flex');
  assert.doesNotMatch(doc.querySelector('.filters').textContent, /:/, 'rotulos de filtro sem ":"');
  w.close();
});

test('Dashboard de Continuidade: cards padrao, sem o degrade do indigo antigo, Tier pela mesma regra', async () => {
  const lista = [
    { id: 'a', area: 'TI', processo: 'A', score: 30, avaliado: true },
    { id: 'b', area: 'TI', processo: 'B', score: 10, avaliado: true },
    { id: 'c', area: 'TI', processo: 'C', score: 4, avaliado: true },
    { id: 'd', area: 'TI', processo: 'D', score: 0, avaliado: false },
  ];
  const w = carregar({ getProcessos: lista, getAreas: [{ nome: 'TI' }] });
  await w.admin();
  await espera();
  const html = w.document.getElementById('painel').innerHTML;
  assert.doesNotMatch(html, /#3949ab/, 'sem o indigo antigo');
  assert.strictEqual(w.document.querySelectorAll('#painel .painel-metricas .bia-metric').length, 4);
  assert.strictEqual(w.document.querySelectorAll('#painel .painel-card .data-table').length, 2);
  // Tier 3 no resumo por area = o mesmo numero do card de distribuicao
  const t3Card = lista.filter((p) => w.Criticidade.ehTier(p, w.Criticidade.TIER.T3)).length;
  const linhaTI = Array.from(w.document.querySelectorAll('#painel .painel-card:last-child tbody tr'))[0];
  assert.strictEqual(linhaTI.children[5].textContent.trim(), String(t3Card || '–'));
  w.close();
});
