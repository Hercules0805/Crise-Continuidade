// Categoria tecnica "Portais Web" (22/10/2026). Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const PORTAL = { id: 'pw', categoria: 'Portais Web', nome: 'Área do Cliente' };
const DEPS = [PORTAL, { id: 'srv', categoria: 'Servidor', nome: 'SRV-01' }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const dados = Object.assign({
    getDependencias: DEPS, getServicos: [], getAreas: [{ id: 'a1', nome: 'TI' }], getBackups: [],
    getProcessos: [{ id: 'p1', area: 'TI', processo: 'Atendimento', dependenciaItens: [] }], getPerguntas: [], getConfigRespostas: null,
    getSlasDependencia: { success: true, contratos: [] },
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async () => {
      if (/^(salvar|excluir)/.test(nome)) return { success: true, id: 'novo' };
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return w;
}

test('Portais Web: categoria tecnica do catalogo, com icone e exemplo; entra em Vulnerabilidades/Contratos', async () => {
  const w = await carregar(['ti']);
  // As listas sao const do app.js (nao ficam no window): confere no codigo-fonte.
  const src = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  const lista = (nome) => { const i = src.indexOf('const ' + nome + ' = ['); return i < 0 ? '' : src.slice(i, src.indexOf(']', i)); };
  assert.match(lista('DEPENDENCIA_CATEGORIAS_TECNICAS'), /'Portais Web'/);
  assert.match(lista('VULN_CATEGORIAS_DEPENDENCIA'), /'Portais Web'/);
  assert.match(src, /'Portais Web': '🌐'/);
  assert.match(src, /'Portais Web': 'Ex: Portal do cliente/);
  assert.strictEqual(w._iconeCategoriaDep('Portais Web'), '🌐');
  await w.dependencias();
  w.abrirDrawerDependencia(JSON.parse(JSON.stringify(PORTAL)));
  const opcoes = [...w.document.querySelectorAll('#depCategoria option')].map((o) => o.value);
  assert.ok(opcoes.includes('Portais Web'));
  assert.strictEqual(w.document.getElementById('depCategoria').value, 'Portais Web');
});

test('Portais Web: o Servico pode usa-la; o Processo nao a aponta direto (vem pelo Servico)', async () => {
  const w = await carregar(['admin']);
  await w.servicos();
  w.abrirDrawerServico();
  assert.strictEqual(JSON.stringify(w._servicoDependenciasCatalogoPorCategoria['Portais Web'].map((d) => d.nome)), JSON.stringify(['Área do Cliente']));
  await w.processos();
  w.editarProcesso('p1');
  assert.doesNotMatch(w.document.getElementById('fDependenciaTabela').textContent, /Portais Web/);
  w.selecionarDependenciaCategoria('Área do Cliente', 'Portais Web', 'pw');
  assert.strictEqual(w._dependenciaSelecionadas.length, 0);
  assert.match((w.__toasts || []).join(' '), /entram pelo Serviço/);
});
