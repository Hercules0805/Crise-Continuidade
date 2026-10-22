// Mapa de Continuidade (21/10/2026): tela #mapa -- Explorar (mind map que se
// expande na mesma tela), busca, painel, filtros, visao completa e "Abrir
// cadastro". Carrega o app.js REAL no jsdom, com o cytoscape real.
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const PROCESSOS = [
  { id: 'p1', area: 'Financeiro', processo: 'Faturamento <img src=x onerror=alert(1)>', tierManual: 'Tier 1 (Crítico)', pcnSalvo: '',
    dependenciaItens: [{ id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' }], bcpContatos: ['pBeto'] },
  { id: 'p2', area: 'Financeiro', processo: 'Cobrança', tierManual: 'Tier 2 (Essencial)', pcnSalvo: '[{"versao":1}]' },
];
const DEPS = [
  { id: 'pAna', categoria: 'Pessoas', nome: 'Ana Souza', areas: ['Financeiro'] },
  { id: 'pBeto', categoria: 'Pessoas', nome: 'Beto Lima', areas: ['TI'] },
  { id: 'infra', categoria: 'Infraestrutura', nome: 'Cluster K8s', rtoMin: 120, componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
  { id: 'db', categoria: 'Banco de Dados', nome: 'Oracle', rtoMin: 240, drpSalvo: '[{"versao":1}]' },
  { id: 'fX', categoria: 'Fornecedores', nome: 'Nuvem SA' },
];
const SERVICOS = [{ id: 's1', nome: 'Portal', rtoMin: 600, rpoMin: 600, mttrMin: 600, processoIds: [{ id: 'p1' }],
  dependenciaItens: [{ id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' }], stakeholders: [{ id: 'pAna', nome: 'Ana Souza' }] }];
const CONTRATOS = [{ id: 'c1', codigo: 'CT-0001', objeto: 'Nuvem', fornecedorId: 'fX', area: 'TI', dependenciasCobertas: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] }];

// cytoscape real (modo headless no jsdom), carregado pelo Node: dentro do eval
// do jsdom a biblioteca cruza dois "realms" e se perde (no navegador e um so).
// A configuracao, e o que entra depois por cy.add/cy.layout, e copiada para o
// realm do Node (a biblioteca so aceita objeto "simples" do proprio realm).
const cytoscapeReal = require('../public/vendor/cytoscape-3.34.3.min.js');
function comCytoscapeReal(w) {
  w.__configCy = null;
  w.cytoscape = (opts) => {
    w.__configCy = opts;
    const cy = cytoscapeReal({
      elements: JSON.parse(JSON.stringify(opts.elements)), style: JSON.parse(JSON.stringify(opts.style)),
      layout: Object.assign({}, opts.layout), minZoom: opts.minZoom, maxZoom: opts.maxZoom, headless: true, styleEnabled: true,
    });
    const add = cy.add.bind(cy);
    cy.add = (els) => add(JSON.parse(JSON.stringify(els)));
    const layout = cy.layout.bind(cy);
    cy.layout = (o) => { w.__ultimoLayout = o; return layout(Object.assign({}, o, { animate: false })); };
    return cy;
  };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms || 20));
// O grafo vivo (e a janela do jsdom) seguram o processo aberto: limpa ao fim de cada teste.
const janelas = [];
afterEach(() => {
  janelas.splice(0).forEach((w) => {
    try { if (w._mapa && w._mapa.cy) w._mapa.cy.destroy(); } catch (e) { /* ja destruido */ }
    w.close();
  });
});

async function carregar(perfis, extra, hash, semCytoscape) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' + (hash || '') });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  janelas.push(w);
  const chamadas = [];
  const dados = Object.assign({
    getProcessos: PROCESSOS, getAreas: [{ id: 'a1', nome: 'Financeiro', responsavel: 'Ana Souza' }, { id: 'a2', nome: 'TI' }],
    getDependencias: DEPS, getServicos: SERVICOS, getBackups: [], getContratos: CONTRATOS, getStatusContrato: [],
    getPerguntas: [], getConfigRespostas: null,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async () => {
      chamadas.push(nome);
      if (nome === 'invalidate') return undefined;
      if (dados[nome] instanceof Error) throw dados[nome];
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  if (!semCytoscape) comCytoscapeReal(w);
  await w.mapaContinuidade();
  await esperar();
  return { w, doc: w.document, chamadas };
}
const txt = (el) => el.textContent.replace(/\s+/g, ' ');
const nosNoMapa = (w) => w._mapa.cy.nodes().map((n) => n.id()).sort();
const rotulo = (w, id) => w._mapa.cy.getElementById(id).data('rotulo');

test('acesso: Admin, Seguranca e TI; menu no grupo Continuidade', () => {
  const Perfis = require('../public/perfis.js');
  for (const [perfil, ve] of [['admin', true], ['seguranca', true], ['ti', true], ['gestor', false], ['operador', false]]) {
    assert.strictEqual(Perfis.podeVerTela([perfil], 'mapa'), ve, perfil);
  }
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const grupo = html.slice(html.indexOf('data-group="continuidade"'), html.indexOf('data-group="riscos"'));
  assert.match(grupo, /<a href="#mapa" class="nav-link" data-page="mapa">Mapa de Continuidade<\/a>/);
});

test('inicio: pontos de partida (Tier 1 e lacunas) e o resumo do mapa', async () => {
  const { doc } = await carregar(['admin']);
  const canvas = txt(doc.getElementById('mapaCanvas'));
  assert.match(canvas, /Processos Tier 1/);
  assert.match(canvas, /Faturamento.*Tier 1 sem PCN/);
  assert.match(canvas, /Cluster K8s.*Sem DRP/);
  assert.match(txt(doc.getElementById('mapaPainel')), /Processos\s*2/);
  assert.doesNotMatch(doc.getElementById('mapaCanvas').innerHTML, /<img src=x/);
});

test('explorar: abre no item com os vinculos dele, lacuna marcada, painel com Tier/PCN e o endereco', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  await esperar();
  const ids = nosNoMapa(w);
  ['processo:p1', 'servico:s1', 'dependencia:infra', 'pessoa:pBeto', 'area:financeiro'].forEach((id) => assert.ok(ids.includes(id), id));
  assert.ok(!ids.includes('dependencia:db'), 'o que esta dois passos adiante ainda nao abriu');
  const cy = w._mapa.cy;
  assert.strictEqual(cy.getElementById('processo:p1').data('raiz'), 1);
  assert.strictEqual(cy.getElementById('processo:p1').data('lacuna'), 1);
  assert.match(rotulo(w, 'processo:p1'), /<img src=x/, 'texto puro no canvas (nao vira HTML)');
  const aresta = cy.edges().filter((e) => [e.source().id(), e.target().id()].sort().join('|') === 'pessoa:pBeto|processo:p1');
  assert.match(aresta.data('rels'), /contato de crise/);
  assert.strictEqual(w.__configCy.layout.name, 'breadthfirst');
  const painel = txt(doc.getElementById('mapaPainel'));
  assert.match(painel, /Lacuna: Tier 1 sem PCN/);
  assert.match(painel, /PCN gerado\s*Não/);
  assert.match(painel, /Abrir cadastro/);
  assert.doesNotMatch(doc.getElementById('mapaPainel').innerHTML, /<img src=x/, 'nome escapado no painel');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Faturamento.* · 5 itens no mapa/);
  assert.strictEqual(w.location.hash, '#mapa?no=processo%3Ap1');
});

test('explorar: expandir na mesma tela acrescenta sem recriar o grafo; selo +N; duplo clique recolhe', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  await esperar();
  const cy = w._mapa.cy;
  assert.match(rotulo(w, 'dependencia:infra'), /\n\+\d+$/, 'selo de vinculos fechados');
  w.mapaClicarNo('dependencia:infra');
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Expandir vínculos \(\d+\)/);
  w.mapaExpandir('dependencia:infra');
  await esperar();
  assert.strictEqual(w._mapa.cy, cy, 'mesmo grafo, so cresceu');
  assert.ok(nosNoMapa(w).includes('dependencia:db'), 'Oracle entrou');
  assert.ok(nosNoMapa(w).includes('processo:p1'), 'o que ja estava continua');
  assert.doesNotMatch(rotulo(w, 'dependencia:infra'), /\+\d+$/);
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Recolher/);
  assert.strictEqual(w.__ultimoLayout.name, 'breadthfirst');
  cy.getElementById('dependencia:infra').emit('dbltap');
  await esperar();
  assert.ok(!nosNoMapa(w).includes('dependencia:db'), 'duplo clique recolheu');
  assert.ok(nosNoMapa(w).includes('dependencia:infra'));
  cy.getElementById('dependencia:infra').emit('dbltap');
  await esperar();
  assert.ok(nosNoMapa(w).includes('dependencia:db'), 'e abre de novo');
});

test('explorar: clique seleciona (painel); "Comecar daqui" troca a raiz e o endereco; Inicio volta aos pontos de partida', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  await esperar();
  w._mapa.cy.getElementById('servico:s1').emit('tap');
  assert.match(txt(doc.getElementById('mapaPainel')), /Portal.*Composição/);
  assert.ok(w._mapa.cy.getElementById('servico:s1').hasClass('selecionado'));
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Começar daqui/);
  w.mapaExplorarDe('servico:s1');
  await esperar();
  assert.strictEqual(w._mapa.cy.getElementById('servico:s1').data('raiz'), 1);
  assert.strictEqual(w.location.hash, '#mapa?no=servico%3As1');
  w.mapaVoltarAoInicio();
  assert.match(txt(doc.getElementById('mapaCanvas')), /Processos Tier 1/);
  assert.strictEqual(w._mapa.cy, null);
});

test('explorar: filtros por tipo escondem o tipo (a raiz fica) e valem para o que se expande', async () => {
  const { w } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  await esperar();
  w.mapaAlternarTipo('pessoa');
  await esperar();
  assert.ok(!nosNoMapa(w).includes('pessoa:pBeto'));
  w.mapaExpandir('servico:s1');
  await esperar();
  assert.ok(!nosNoMapa(w).some((id) => id.startsWith('pessoa:')), 'Ana (stakeholder) nao entra com Pessoas desligado');
  w.mapaAlternarTipo('processo');
  await esperar();
  assert.ok(nosNoMapa(w).includes('processo:p1'), 'raiz nunca some');
});

test('busca leva a explorar o item escolhido', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  doc.getElementById('mapaBusca').value = 'cobranca';
  w.mapaBuscar();
  assert.match(txt(doc.getElementById('mapaBuscaResultados')), /Cobrança.*Processo/);
  w.mapaEscolherBusca('processo:p2');
  await esperar();
  assert.strictEqual(w._mapa.exploracao.raiz, 'processo:p2');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Cobrança/);
});

test('deep link #mapa?no= abre explorando o item', async () => {
  const { w, doc } = await carregar(['admin'], {}, '#mapa?no=servico%3As1');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Portal/);
  assert.ok(nosNoMapa(w).includes('dependencia:infra'));
});

test('explorar: sem a biblioteca do mapa, mensagem de erro (nunca mapa vazio)', async () => {
  const semLib = await carregar(['admin'], {}, '', true);
  semLib.w.document.head.appendChild = (s) => { setTimeout(() => s.onerror && s.onerror(), 0); return s; };
  semLib.w.mapaExplorarDe('processo:p1');
  await esperar(40);
  assert.match(semLib.doc.getElementById('mapaCy').textContent, /Não foi possível abrir o mapa/);
});

test('TI: sem contratos (nem chama a API), aviso, e "Abrir cadastro" so onde ve a tela', async () => {
  const { w, doc, chamadas } = await carregar(['ti']);
  assert.ok(!chamadas.includes('getContratos'));
  assert.match(txt(doc.getElementById('mapaAviso')), /Contratos não aparecem/);
  assert.doesNotMatch(txt(doc.getElementById('mapaTipos')), /Contratos/);
  w.mapaExplorarDe('servico:s1');
  assert.doesNotMatch(doc.getElementById('mapaPainel').innerHTML, /Abrir cadastro/, 'TI nao ve Servicos');
  w.mapaExplorarDe('dependencia:infra');
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Abrir cadastro/);
});

test('admin ve contratos; abrir cadastro do servico navega e abre o drawer quando a tela carrega', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('dependencia:db');
  await esperar();
  assert.ok(nosNoMapa(w).includes('contrato:c1'));
  assert.match(rotulo(w, 'contrato:c1'), /CT-0001/);
  // Como no navegador: a troca de hash dispara o route() (hashchange).
  w._perfilCarregado = true;
  w.mapaAbrirCadastro('servico', 's1');
  assert.strictEqual(w._abrirAposCarregar.pagina, 'servicos');
  assert.strictEqual(w.location.hash, '#servicos');
  await esperar(60);
  assert.ok(doc.getElementById('drawerServico').classList.contains('open'));
  assert.strictEqual(doc.getElementById('servicoNome').value, 'Portal');
  assert.strictEqual(w._abrirAposCarregar, null);
});

test('"Ver no mapa" no drawer do Servico: sem alteracao fecha e abre o mapa no item; registro novo pede para salvar', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.servicos();
  assert.match(doc.querySelector('#drawerServico .drawer-footer').textContent, /Ver no mapa/);
  w.abrirDrawerServico();
  await w.verNoMapa('servico');
  assert.match((w.__toasts || []).join(' '), /Salve o cadastro antes/);
  w.abrirDrawerServico('s1');
  await w.verNoMapa('servico');
  assert.ok(!doc.getElementById('drawerServico').classList.contains('open'));
  assert.strictEqual(w.location.hash, '#mapa?no=servico%3As1');
});

test('"Ver no mapa" nao aparece para quem nao ve o mapa', async () => {
  const { w, doc } = await carregar(['admin']);
  w.USER_PERFIS = ['gestor'];
  await w.dependencias();
  assert.doesNotMatch(doc.querySelector('#drawerDependencia .drawer-footer').textContent, /Ver no mapa/);
});

// ---- Visao completa ----

test('visao completa: alterna, monta todos os itens com a biblioteca real, contagem e lacunas', async () => {
  const { w, doc } = await carregar(['admin']);
  assert.match(doc.getElementById('mapaModos').textContent, /Explorar\s*Visão completa/);
  w.mapaModo('completo');
  await esperar();
  const cy = w._mapa.cy;
  assert.ok(cy, 'grafo montado');
  const total = Object.keys(w._mapa.indice.nos).length;
  assert.strictEqual(cy.nodes().length, total);
  assert.match(doc.getElementById('mapaTrilha').textContent, new RegExp(`${total} itens · \\d+ ligações · \\d+ com lacuna`));
  assert.strictEqual(w.location.hash, '#mapa?modo=completo');
  assert.strictEqual(cy.getElementById('processo:p1').data('lacuna'), 1);
  assert.strictEqual(w.__configCy.layout.name, 'cose');
  assert.match(doc.getElementById('mapaPainel').textContent, /No mapa/);
  w.mapaModo('explorar');
  assert.strictEqual(w._mapa.cy, null, 'sair da visao completa destroi o grafo (no inicio nao ha grafo)');
});

test('visao completa: clique destaca o item e mostra o painel; duplo clique passa a explorar a partir dele', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaModo('completo');
  await esperar();
  const cy = w._mapa.cy;
  cy.getElementById('servico:s1').emit('tap');
  assert.match(doc.getElementById('mapaPainel').textContent, /Portal/);
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Explorar a partir daqui/);
  assert.ok(cy.getElementById('servico:s1').hasClass('foco'));
  assert.ok(cy.getElementById('processo:p2').hasClass('apagado'), 'fora da vizinhanca');
  cy.getElementById('servico:s1').emit('dbltap');
  await esperar();
  assert.strictEqual(w._mapa.modo, 'explorar');
  assert.notStrictEqual(w._mapa.cy, cy, 'o grafo da visao completa saiu; o da exploracao e outro');
  assert.strictEqual(w._mapa.cyModo, 'explorar');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Portal/);
});

test('visao completa: filtros por tipo refazem o grafo; deep link ?modo=completo; falha da biblioteca vira erro', async () => {
  const ctx = await carregar(['admin'], {}, '#mapa?modo=completo');
  ctx.w.mapaModo('completo');
  await esperar();
  ctx.w.mapaAlternarTipo('pessoa');
  await esperar();
  assert.ok(ctx.w._mapa.cy.nodes().every((n) => !n.id().startsWith('pessoa:')));
  ctx.w.mapaModo('explorar');
  // Sem a biblioteca (download falhou): mensagem de erro, nunca mapa vazio.
  const semLib = await carregar(['admin'], {}, '', true);
  semLib.w.document.head.appendChild = (s) => { setTimeout(() => s.onerror && s.onerror(), 0); return s; };
  semLib.w.mapaModo('completo');
  await esperar(40);
  assert.match(semLib.doc.getElementById('mapaCyCompleto').textContent, /Não foi possível abrir a visão completa/);
});

test('nos na cor da familia: fundo claro, borda e texto na cor do tipo; raiz cheia; lacuna e selecionado se destacam', async () => {
  const { w } = await carregar(['admin']);
  w.mapaExplorarDe('dependencia:db');
  await esperar();
  const cy = w._mapa.cy;
  const contrato = cy.getElementById('contrato:c1');
  assert.strictEqual(contrato.data('fundo'), w._corClaraMapa('#5d4037'));
  assert.strictEqual(contrato.data('cor'), '#5d4037');
  assert.strictEqual(contrato.data('texto'), '#5d4037');
  assert.strictEqual(w._corClaraMapa('#2e7d32'), '#e6efe6');
  const raiz = cy.getElementById('dependencia:db');
  assert.strictEqual(raiz.data('fundo'), raiz.data('cor'), 'raiz cheia na cor do tipo');
  assert.strictEqual(raiz.data('texto'), '#ffffff');
  w.mapaExplorarDe('servico:s1');
  await esperar();
  const c2 = w._mapa.cy;
  assert.strictEqual(c2.getElementById('pessoa:pAna').data('fundo'), '#e6efe6');
  assert.strictEqual(c2.getElementById('processo:p1').data('lacuna'), 1, 'lacuna (borda vermelha no estilo)');
  w.mapaClicarNo('pessoa:pAna');
  assert.ok(c2.getElementById('pessoa:pAna').hasClass('selecionado'));
});
