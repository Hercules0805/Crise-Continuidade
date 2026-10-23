// Revisão de UX, fase 2 (16/10/2026): menu e navegação.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const Perfis = require('../public/perfis.js');
const INDEX = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');

function menu() {
  const doc = new JSDOM(INDEX).window.document;
  return Array.from(doc.querySelectorAll('.nav-group')).map((g) => {
    const itens = [];
    let secao = 'operacao';
    // Grupo dividido em seções temáticas (Riscos: Vulnerabilidades e Riscos): o
    // separador abre uma seção com nome; só "Configuração" é configuração.
    let tema = '';
    Array.from(g.querySelector('.nav-dropdown').children).forEach((el) => {
      if (el.classList.contains('nav-secao')) {
        tema = el.textContent.trim();
        secao = tema === 'Configuração' ? 'configuracao' : 'operacao';
      } else itens.push({ page: el.dataset.page, rotulo: el.textContent.trim(), secao, tema });
    });
    return { grupo: g.dataset.group, itens };
  });
}

test('tela inicial e uma escolha explicita por perfil', () => {
  assert.strictEqual(Perfis.paginaInicial(['admin']), 'admin');
  assert.strictEqual(Perfis.paginaInicial(['seguranca']), 'admin');
  assert.strictEqual(Perfis.paginaInicial(['gestor']), 'admin');
  assert.strictEqual(Perfis.paginaInicial(['ti']), 'drp');
  assert.strictEqual(Perfis.paginaInicial(['operador']), 'processos', 'DECISAO 14/10/2026: Operador comeca em Processos');
  assert.strictEqual(Perfis.paginaInicial(['ti', 'gestor']), 'admin', 'varios perfis: o de maior alcance');
  for (const p of ['admin', 'seguranca', 'gestor', 'ti', 'operador']) {
    assert.ok(Perfis.podeVerTela([p], Perfis.paginaInicial([p])), p + ' ve a propria tela inicial');
  }
});

test('Gestor sem area comeca em Processos (o Dashboard fica bloqueado para ele)', () => {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: null }) };
  w.GRC360 = {};
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.USER_PERFIS = ['gestor'];
  w.USER_AREA = null;
  assert.strictEqual(w._paginaInicialDoPerfil(), 'processos');
  w.USER_AREA = 'TI';
  assert.strictEqual(w._paginaInicialDoPerfil(), 'admin');
  w.close();
});

test('menu: grupos na ordem, tela principal primeiro, alfabetico dentro de cada secao', () => {
  const m = menu();
  // Ordem dos grupos (um modulo ainda nao publicado simplesmente nao aparece).
  const ORDEM = ['continuidade', 'riscos', 'indicadores', 'fornecedores', 'contratos', 'servicos', 'administracao'];
  assert.deepStrictEqual(m.map((g) => g.grupo), ORDEM.filter((g) => m.some((x) => x.grupo === g)));
  assert.ok(m.length >= 6);
  // Riscos e dividido em duas secoes tematicas (sem tela "principal" do grupo):
  // a regra "principal primeiro" vale dentro de cada secao, e a ordem e alfabetica.
  const principal = { continuidade: 'admin', indicadores: 'indicadores-dashboard', fornecedores: 'fornecedores', contratos: 'contratos', servicos: 'servicos' };
  for (const g of m) {
    if (principal[g.grupo]) assert.strictEqual(g.itens[0].page, principal[g.grupo], g.grupo + ': principal primeiro');
    const temas = [...new Set(g.itens.map((i) => i.tema))];
    for (const tema of temas) {
      let nomes = g.itens.filter((i) => i.tema === tema).map((i) => i.rotulo);
      if (tema === '' && principal[g.grupo]) nomes = nomes.slice(1);
      const ordenado = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      assert.deepStrictEqual(nomes, ordenado, `${g.grupo}/${tema || 'operacao'} em ordem alfabetica`);
    }
  }
});

test('menu Riscos: telas de vulnerabilidade primeiro, depois as de risco', () => {
  const g = menu().find((x) => x.grupo === 'riscos');
  assert.deepStrictEqual(g.itens.map((i) => [i.tema, i.page]), [
    ['Vulnerabilidades', 'vulnerabilidades-painel'],
    ['Vulnerabilidades', 'vulnerabilidades-relatorio'],
    ['Vulnerabilidades', 'vulnerabilidades'],
    ['Riscos', 'riscos'],
    ['Riscos', 'riscos-relatorio'],
    ['Riscos', 'monitor'],
  ]);
});

test('menu: cadastros de configuracao ficam sob o separador "Configuracao"', () => {
  const secao = {};
  menu().forEach((g) => g.itens.forEach((i) => { secao[i.page] = i.secao; }));
  for (const p of ['areas', 'pessoas', 'perguntas', 'indicadores-cadastro', 'fornecedores-categorias', 'fornecedores-subcategorias',
    'fornecedores-criterios', 'fornecedores-criticidade', 'contratos-tipos', 'contratos-status', 'contratos-indexadores']) {
    if (secao[p] !== undefined) assert.strictEqual(secao[p], 'configuracao', p);
  }
  for (const p of ['admin', 'processos', 'riscos', 'fornecedores', 'contratos', 'indicadores-dashboard']) {
    if (secao[p] !== undefined) assert.strictEqual(secao[p], 'operacao', p);
  }
});

test('menu: rotulos sem ambiguidade e iguais ao titulo da tela', () => {
  const itens = menu().flatMap((g) => g.itens);
  const rotulos = itens.map((i) => i.rotulo);
  assert.strictEqual(new Set(rotulos).size, rotulos.length, 'nenhum rotulo repetido');
  for (const r of ['Dashboard', 'Cadastro', 'Matriz', 'Perguntas', 'Categorias', 'Critérios', 'Subcategorias', 'PCNs', 'DRP']) {
    assert.ok(!rotulos.includes(r), `rotulo ambiguo "${r}"`);
  }
  for (const i of itens) {
    const comoTitulo = APP.includes(`<h2>${i.rotulo}</h2>`) || APP.includes(`titulo: '${i.rotulo}'`);
    assert.ok(comoTitulo, `"${i.rotulo}" (#${i.page}) deveria ser tambem o titulo da tela`);
  }
});

test('todas as rotas tem item de menu e vice-versa', () => {
  const doMenu = menu().flatMap((g) => g.itens.map((i) => i.page)).sort();
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: null }) };
  w.GRC360 = {};
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // `pages` e const do app.js: so e alcancavel dentro do mesmo eval.
  w.eval(APP + '\n;window.__rotas = Object.keys(pages);');
  const rotas = Array.from(w.__rotas).sort();
  w.close();
  assert.deepStrictEqual(doMenu, rotas);
});

test('titulo da aba do navegador acompanha a tela', () => {
  const dom = new JSDOM(INDEX.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only', url: 'https://x.test/#riscos' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: null }) };
  w.GRC360 = {};
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.USER_PERFIS = ['admin'];
  w._perfilCarregado = true;
  w.route();
  assert.strictEqual(w.document.title, 'Registro de Riscos · GRC360');
  w.close();
});
