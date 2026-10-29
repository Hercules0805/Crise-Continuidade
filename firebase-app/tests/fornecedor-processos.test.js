// Criticidade automatica do fornecedor e aba "Processos" do drawer (29/10/2026).
// JSDOM com o app.js real e o API mockado, no molde de fornecedores-inativos.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'fd', categoria: 'Fornecedores', nome: 'Direto Tier1' },
  { id: 'fs', categoria: 'Fornecedores', nome: 'Via Servico' },
  { id: 'f2', categoria: 'Fornecedores', nome: 'So Tier2' },
  { id: 'fl', categoria: 'Fornecedores', nome: 'Livre' },
];
const SERVICOS = [{ id: 'srv', nome: 'SRV-01', dependenciaItens: [{ categoria: 'Fornecedores', id: 'fs', nome: 'Via Servico' }] }];
const PROCESSOS = [
  { id: 'p1', processo: 'Folha de pagamento', area: 'RH', avaliado: true, score: 15,
    dependenciaItens: [{ categoria: 'Fornecedores', id: 'fd', nome: 'Direto Tier1' }, { categoria: 'Serviços', id: 'srv', nome: 'SRV-01' }] },
  { id: 'p2', processo: 'Compras', area: 'Financeiro', avaliado: true, score: 8,
    dependenciaItens: [{ categoria: 'Fornecedores', id: 'f2', nome: 'So Tier2' }, { categoria: 'Fornecedores', id: 'fd', nome: 'Direto Tier1' }] },
];
const PERGUNTAS = [
  { id: 'q1', ativa: true, texto: 'Importância', opcoes: [{ rotulo: 'Baixa', score: 0 }, { rotulo: 'Alta', score: 3 }] },
];
// fd respondeu Baixa (0 de 3); a automatica tem de prevalecer.
const AVALS = [
  { fornecedorId: 'fd', avaliadoEm: '2026-10-01T00:00:00Z', nota: 80, completa: true, respostas: {},
    respostasCriticidade: { q1: 0 }, scoreCriticidade: 0, scoreMaximoCriticidade: 3, completaCriticidade: true },
];
const CRITERIOS = [{ id: 'c1', nome: 'ISO', peso: 1, ativo: true }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  w.console.error = () => {};
  const chamadas = [];
  const dados = Object.assign({
    getDependencias: DEPS, getCriteriosFornecedor: CRITERIOS, getAvaliacoesFornecedor: AVALS, getConfigFornecedor: { limiarRisco: 70 },
    getCategoriasFornecedor: [], getSubcategoriasFornecedor: [], getCriticidadeFornecedorPerguntas: PERGUNTAS,
    getAreas: [], getContratos: [], getStatusContrato: [], getProcessos: PROCESSOS, getServicos: SERVICOS,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => (...args) => {
      if (nome === 'invalidate') return undefined;
      if (dados[nome] instanceof Error) return Promise.reject(dados[nome]);
      if (/^salvar/.test(nome)) {
        chamadas.push({ nome, args: JSON.parse(JSON.stringify(args)) });
        return Promise.resolve({ success: true, id: 'av-novo', dado: Object.assign({ fornecedorId: args[0].fornecedorId }, args[0]) });
      }
      return Promise.resolve(JSON.parse(JSON.stringify(dados[nome] || [])));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js', 'contrato-ciclo.js', 'cadeia-dependencias.js', 'inventario-csv.js', 'importacao-fornecedores.js']
    .forEach((f) => { if (fs.existsSync(path.join(PUB, f))) w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')); });
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  w.confirm = () => true;
  await w.fornecedores();
  return { w, doc: w.document, chamadas, $: (id) => w.document.getElementById(id) };
}

const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const linha = (doc, nome) => [...doc.querySelectorAll('#listaFornecedores tbody tr')].find((tr) => tr.textContent.includes(nome));

test('grade: fornecedor de processo Tier 1 (direto ou via Servico) mostra Alta automatica; Tier 2 nao', async () => {
  const { doc } = await carregar(['admin']);
  const direto = linha(doc, 'Direto Tier1');
  assert.ok(direto.querySelector('.crit-automatica'), 'direto deveria ser automatico');
  assert.match(direto.querySelector('.crit-automatica').getAttribute('title'), /Folha de pagamento/);
  assert.ok(linha(doc, 'Via Servico').querySelector('.crit-automatica'), 'via Servico deveria ser automatico');
  assert.equal(linha(doc, 'So Tier2').querySelector('.crit-automatica'), null);
  assert.equal(linha(doc, 'Livre').querySelector('.crit-automatica'), null);
});

test('aba Criticidade: questionario bloqueado com aviso dos processos; salvar regrava as respostas anteriores', async () => {
  const { w, $, doc, chamadas } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('fd');
  w.trocarAbaFornecedor('criticidade');
  assert.match(txt($('fornCriticidadeAuto')), /Criticidade Alta automática/);
  assert.match(txt($('fornCriticidadeAuto')), /Folha de pagamento · Direta/);
  const radios = [...doc.querySelectorAll('#fornCriticidadeLista input[type="radio"]')];
  assert.ok(radios.length && radios.every((r) => r.disabled), 'radios deveriam estar bloqueados');
  assert.ok(radios[0].checked, 'a resposta anterior continua marcada');
  assert.match(txt($('fornCriticidadePreview')), /Alta Automática/);
  doc.querySelector('.forn-aplicavel').checked = true;
  await w.salvarAvaliacaoFornecedor();
  const salvar = chamadas.find((c) => c.nome === 'salvarAvaliacaoFornecedor');
  assert.deepStrictEqual(salvar.args[0].respostasCriticidade, { q1: 0 });
});

test('aba Criticidade: sem processo critico o questionario fica editavel', async () => {
  const { w, $, doc } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f2');
  assert.equal(txt($('fornCriticidadeAuto')), '');
  assert.ok([...doc.querySelectorAll('#fornCriticidadeLista input[type="radio"]')].every((r) => !r.disabled));
});

test('aba Processos: lista os processos com a origem, Tier 1 primeiro, e o contador', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('fd');
  assert.equal($('contFornProcessos').textContent, '(2)');
  w.trocarAbaFornecedor('processos');
  assert.equal($('painel-forn-processos').style.display, 'block');
  const linhas = [...$('fornProcessosTabela').querySelectorAll('tbody tr')].map(txt);
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /Folha de pagamento.*Tier 1/);
  assert.match(linhas[1], /Compras.*Tier 2/);

  w.abrirDrawerFornecedorCadastro('fs');
  assert.match(txt($('fornProcessosTabela')), /Via serviço SRV-01/);
  w.abrirDrawerFornecedorCadastro('fl');
  assert.match(txt($('fornProcessosTabela')), /Nenhum processo depende deste fornecedor/);
  assert.equal($('contFornProcessos').textContent, '(0)');
});

test('processos que nao carregam nao quebram a tela: nada e automatico', async () => {
  const { doc } = await carregar(['admin'], { getProcessos: new Error('offline') });
  assert.ok(linha(doc, 'Direto Tier1'));
  assert.equal(doc.querySelector('#listaFornecedores .crit-automatica'), null);
});

test('mapa de criticidade para os riscos: automatica pesa 3 no risco do fornecedor', async () => {
  const { w } = await carregar(['admin']);
  const mapa = w._mapaCriticidadeFornecedores(AVALS, { processos: PROCESSOS, servicos: SERVICOS, dependencias: DEPS });
  assert.equal(mapa.fd.automatica, true);
  assert.equal(mapa.fs.automatica, true);
  assert.equal(mapa.f2.automatica, false);
  assert.equal(w.RiscoConsolidado.pesoDoRisco({ fornecedor: 'fd' }, {}, mapa), 3);
  assert.equal(w.RiscoConsolidado.pesoDoRisco({ fornecedor: 'f2' }, {}, mapa), w.RiscoConsolidado.PESO_PADRAO);
});
