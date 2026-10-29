// Menu lateral (DECISÃO 23/10/2026, protótipo A "árvore acordeão"): permissão,
// acordeão, subníveis, recolher (lembrado), painel flutuante, gaveta e Esc.
// Usa o markup real do index.html e o menu-lateral.js real.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const Perfis = require('../public/perfis.js');
const INDEX = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function carregar({ recolhido = null, gaveta = false } = {}) {
  const corpo = INDEX.slice(INDEX.indexOf('<body>') + 6, INDEX.indexOf('<script src="config.js'))
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM('<body>' + corpo + '</body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: gaveta });
  if (recolhido !== null) w.localStorage.setItem('grc360.menuRecolhido', recolhido ? '1' : '0');
  w.eval(fs.readFileSync(path.join(PUB, 'menu-lateral.js'), 'utf8'));
  w.MenuLateral.iniciar(); // idempotente: já pode ter iniciado sozinho
  return w;
}
const $ = (w, s) => w.document.querySelector(s);
const visiveis = (w) => Array.from(w.document.querySelectorAll('#menuLateral .nav-link'))
  .filter((a) => a.style.display !== 'none').map((a) => a.dataset.page);
const aberto = (w, g) => $(w, `.nav-group[data-group="${g}"]`).classList.contains('open');

test('o menu tem exatamente as telas de cada perfil (perfis.js), e esconde grupo e subnivel vazios', () => {
  for (const perfil of ['seguranca', 'ti', 'gestor', 'operador', 'operador_processos']) {
    const w = carregar();
    w.MenuLateral.aplicarPerfil((p) => Perfis.podeVerTela([perfil], p));
    const esperado = Array.from(w.document.querySelectorAll('#menuLateral .nav-link'))
      .map((a) => a.dataset.page).filter((p) => Perfis.podeVerTela([perfil], p));
    assert.deepStrictEqual(visiveis(w), esperado, perfil);
    w.document.querySelectorAll('#menuLateral .nav-group, #menuLateral .nav-sub').forEach((el) => {
      const temTela = Array.from(el.querySelectorAll('.nav-link')).some((a) => a.style.display !== 'none');
      assert.strictEqual(el.style.display !== 'none', temTela, `${perfil}: ${el.dataset.group || el.dataset.sub}`);
    });
    w.close();
  }
});

test('TI ve so Continuidade: sem Configuracoes nem Administracao (rodape some)', () => {
  const w = carregar();
  w.MenuLateral.aplicarPerfil((p) => Perfis.podeVerTela(['ti'], p));
  const grupos = Array.from(w.document.querySelectorAll('#menuLateral .nav-group')).filter((g) => g.style.display !== 'none').map((g) => g.dataset.group);
  assert.deepStrictEqual(grupos, ['continuidade']);
  assert.strictEqual($(w, '.menu-rodape').style.display, 'none');
  w.close();
});

test('tela atual: destaca o item e abre o grupo e o subnivel dela; acordeao abre um grupo por vez', () => {
  const w = carregar();
  w.MenuLateral.marcarAtivo('contratos-status');
  const link = $(w, '.nav-link[data-page="contratos-status"]');
  assert.ok(link.classList.contains('active'));
  assert.strictEqual(link.getAttribute('aria-current'), 'page');
  assert.ok(aberto(w, 'configuracoes'));
  assert.ok($(w, '.nav-sub[data-sub="configuracoes/contratos"]').classList.contains('open'), 'subnivel da tela aberto');
  // Configurações tem 6 subniveis: os outros começam fechados.
  assert.ok(!$(w, '.nav-sub[data-sub="configuracoes/organizacao"]').classList.contains('open'));
  // Clicar em outro grupo fecha o anterior.
  $(w, '.nav-group[data-group="riscos"] .nav-group-label').click();
  assert.ok(aberto(w, 'riscos'));
  assert.ok(!aberto(w, 'configuracoes'));
  assert.strictEqual($(w, '.nav-group[data-group="riscos"] .nav-group-label').getAttribute('aria-expanded'), 'true');
  // Riscos tem 2 subniveis: os dois abertos.
  assert.ok($(w, '.nav-sub[data-sub="riscos/riscos"]').classList.contains('open'));
  assert.ok($(w, '.nav-sub[data-sub="riscos/vulnerabilidades"]').classList.contains('open'));
  // O clique do usuário num subnivel vale.
  $(w, '.nav-sub[data-sub="riscos/vulnerabilidades"] .nav-sub-label').click();
  assert.ok(!$(w, '.nav-sub[data-sub="riscos/vulnerabilidades"]').classList.contains('open'));
  w.close();
});

test('recolher: alterna, lembra no navegador e restaura ao abrir de novo', () => {
  let w = carregar({ recolhido: false });
  assert.ok(!w.document.body.classList.contains('menu-recolhido'));
  $(w, '.menu-recolher').click();
  assert.ok(w.document.body.classList.contains('menu-recolhido'));
  assert.strictEqual(w.localStorage.getItem('grc360.menuRecolhido'), '1');
  assert.strictEqual($(w, '.menu-recolher').getAttribute('aria-label'), 'Expandir menu');
  w.close();
  w = carregar({ recolhido: true });
  assert.ok(w.document.body.classList.contains('menu-recolhido'), 'restaurado');
  w.close();
});

test('recolhido: o grupo abre num painel flutuante com as telas visiveis (copias fora do .nav-link)', () => {
  const w = carregar({ recolhido: true });
  w.MenuLateral.aplicarPerfil((p) => Perfis.podeVerTela(['operador'], p));
  w.MenuLateral.marcarAtivo('contratos-tipos');
  $(w, '.nav-group[data-group="configuracoes"] .nav-group-label').click();
  const f = $(w, '#menuFlyout');
  assert.ok(f.classList.contains('open'));
  assert.deepStrictEqual(Array.from(f.querySelectorAll('.menu-flyout__secao')).map((s) => s.textContent), ['Organização', 'Fornecedores', 'Contratos']);
  assert.ok(f.querySelector('.menu-flyout__link.active[href="#contratos-tipos"]'));
  assert.strictEqual(f.querySelectorAll('.nav-link').length, 0, 'route() e a busca leem só o menu');
  assert.ok(!f.textContent.includes('Perguntas do BIA'), 'tela fora do perfil fica fora do painel');
  // Esc fecha o painel e não chega ao Esc geral (que fecharia um drawer).
  const ev = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  w.document.dispatchEvent(ev);
  assert.ok(!f.classList.contains('open'));
  assert.ok(ev.defaultPrevented);
  w.close();
});

test('recolhido: a lupa expande o menu para buscar', () => {
  const w = carregar({ recolhido: true });
  $(w, '[data-menu-buscar]').click();
  assert.ok(!w.document.body.classList.contains('menu-recolhido'));
  w.close();
});

test('tela estreita: o botao do topo abre a gaveta; trocar de tela e o veu fecham', () => {
  const w = carregar({ gaveta: true });
  $(w, '.topo-menu').click();
  assert.ok(w.document.body.classList.contains('menu-gaveta-aberta'));
  assert.ok(!w.document.body.classList.contains('menu-recolhido'), 'na gaveta o botão não recolhe');
  w.MenuLateral.marcarAtivo('processos');
  assert.ok(!w.document.body.classList.contains('menu-gaveta-aberta'));
  $(w, '.topo-menu').click();
  $(w, '#menuVeu').click();
  assert.ok(!w.document.body.classList.contains('menu-gaveta-aberta'));
  w.close();
});

test('nenhuma rota mudou de hash e cada tela aparece uma vez so no menu', () => {
  const doc = new JSDOM(INDEX).window.document;
  const pages = Array.from(doc.querySelectorAll('#menuLateral .nav-link')).map((a) => a.dataset.page);
  assert.strictEqual(pages.length, 45);
  assert.strictEqual(new Set(pages).size, 45);
  for (const a of doc.querySelectorAll('#menuLateral .nav-link')) assert.strictEqual(a.getAttribute('href'), '#' + a.dataset.page);
});
