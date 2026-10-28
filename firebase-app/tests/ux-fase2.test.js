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

// Menu lateral (DECISÃO 23/10/2026): grupos > (subníveis) > telas.
function menu() {
  const doc = new JSDOM(INDEX).window.document;
  return Array.from(doc.querySelectorAll('#menuLateral .nav-group')).map((g) => ({
    grupo: g.dataset.group,
    rodape: !!g.closest('.menu-rodape'),
    itens: Array.from(g.querySelectorAll('.nav-link')).map((a) => {
      const sub = a.closest('.nav-sub');
      return { page: a.dataset.page, rotulo: a.textContent.trim(), sub: sub ? sub.querySelector('.rot').textContent.trim() : '' };
    }),
  }));
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
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.USER_PERFIS = ['gestor'];
  w.USER_AREA = null;
  assert.strictEqual(w._paginaInicialDoPerfil(), 'processos');
  w.USER_AREA = 'TI';
  assert.strictEqual(w._paginaInicialDoPerfil(), 'admin');
  w.close();
});

test('menu lateral: operacao primeiro (Processos, a entidade principal, e Continuidade no topo), configuracao e administracao no rodape', () => {
  const m = menu();
  assert.deepStrictEqual(m.map((g) => g.grupo), ['processos', 'continuidade', 'riscos', 'terceiros', 'servicos', 'indicadores', 'configuracoes', 'administracao']);
  assert.deepStrictEqual(m.filter((g) => g.rodape).map((g) => g.grupo), ['configuracoes', 'administracao']);
  // Ordem de uso do módulo: painel/tela principal primeiro.
  const principal = { continuidade: 'admin', terceiros: 'terceiros-dashboard', servicos: 'servicos', indicadores: 'indicadores-dashboard' };
  for (const g of m) if (principal[g.grupo]) assert.strictEqual(g.itens[0].page, principal[g.grupo], g.grupo + ': principal primeiro');
  assert.deepStrictEqual(m.find((g) => g.grupo === 'continuidade').itens.map((i) => i.page),
    ['admin', 'conformidade', 'processos', 'pcns', 'drp', 'dependencias', 'mapa', 'relatorios', 'continuidade-relatorio']);
});

test('menu Riscos e Vulnerabilidades: subnivel Riscos primeiro, depois Vulnerabilidades', () => {
  const g = menu().find((x) => x.grupo === 'riscos');
  assert.deepStrictEqual(g.itens.map((i) => [i.sub, i.page]), [
    ['Riscos', 'riscos-dashboard'],
    ['Riscos', 'riscos'],
    ['Riscos', 'monitor'],
    ['Riscos', 'riscos-relatorio'],
    ['Vulnerabilidades', 'vulnerabilidades-painel'],
    ['Vulnerabilidades', 'vulnerabilidades'],
    ['Vulnerabilidades', 'vulnerabilidades-relatorio'],
    // Threat Intelligence (26/10/2026): a triagem desemboca em Vulnerabilidades.
    ['Vulnerabilidades', 'threat-intel'],
  ]);
});

test('menu: todos os cadastros de configuracao ficam em Configuracoes, por modulo', () => {
  const g = menu().find((x) => x.grupo === 'configuracoes');
  assert.deepStrictEqual(g.itens.map((i) => [i.sub, i.page]), [
    ['Organização', 'areas'], ['Organização', 'pessoas'], ['Organização', 'produtos-software'],
    ['Continuidade', 'perguntas'],
    ['Indicadores', 'indicadores-cadastro'],
    ['Fornecedores', 'fornecedores-categorias'], ['Fornecedores', 'fornecedores-subcategorias'],
    ['Fornecedores', 'fornecedores-criterios'], ['Fornecedores', 'fornecedores-criticidade'],
    ['Contratos', 'contratos-tipos'], ['Contratos', 'contratos-status'], ['Contratos', 'contratos-indexadores'],
    ['Serviços', 'catalogo-backup-ferramentas'],
  ]);
  const operacao = menu().filter((x) => !x.rodape).flatMap((x) => x.itens.map((i) => i.page));
  for (const p of g.itens.map((i) => i.page)) assert.ok(!operacao.includes(p), p + ' nao repete na operacao');
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
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
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
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.USER_PERFIS = ['admin'];
  w._perfilCarregado = true;
  w.route();
  assert.strictEqual(w.document.title, 'Registro de Riscos · BIA');
  w.close();
});
