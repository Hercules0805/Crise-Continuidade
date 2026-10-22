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
// Explorar (arvore): cartoes por chave de caminho.
const cartao = (doc, chave) => doc.querySelector(`#mapaCanvas .mm-cartao[data-chave="${chave}"]`);
const chavesNaArvore = (doc) => [...doc.querySelectorAll('#mapaCanvas .mm-cartao')].map((c) => c.getAttribute('data-chave'));
const idsNaArvore = (doc) => chavesNaArvore(doc).map((k) => k.split('>').pop());

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

test('explorar: arvore abre na raiz com o 1o nivel por tipo, relacao com o pai, lacuna e o endereco', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  const raiz = cartao(doc, 'processo:p1');
  assert.ok(raiz.classList.contains('mm-cartao--raiz'));
  assert.ok(raiz.classList.contains('mm-cartao--lacuna'));
  assert.strictEqual(doc.querySelector('#mapaCanvas img'), null, 'nome escapado (nada vira elemento)');
  const ids = idsNaArvore(doc);
  ['servico:s1', 'dependencia:infra', 'pessoa:pBeto', 'area:financeiro'].forEach((id) => assert.ok(ids.includes(id), id));
  assert.ok(!ids.includes('dependencia:db'), 'o 2o nivel ainda nao abriu');
  const grupos = [...doc.querySelectorAll('#mapaCanvas .mm-grupo__rotulo')].map((g) => txt(g));
  assert.ok(grupos.some((g) => /Serviços \(1\)/.test(g)));
  assert.match(txt(cartao(doc, 'processo:p1>pessoa:pBeto')), /contato de crise/);
  assert.match(txt(cartao(doc, 'processo:p1>dependencia:infra').querySelector('.mm-alternar')), /▸ \d+/, 'botao com a contagem');
  const painel = txt(doc.getElementById('mapaPainel'));
  assert.match(painel, /Lacuna: Tier 1 sem PCN/);
  assert.match(painel, /PCN gerado\s*Não/);
  assert.match(painel, /Abrir cadastro/);
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Faturamento.* · 5 itens abertos/);
  assert.strictEqual(w.location.hash, '#mapa?no=processo%3Ap1');
  assert.strictEqual(w._mapa.cy, null, 'Explorar nao usa o grafo');
});

test('explorar: ▸ abre os vinculos a direita, ▾ recolhe (com o que estava aberto abaixo); o caminho nao volta como filho', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  w.mapaAlternarNo('processo:p1>dependencia:infra');
  assert.ok(chavesNaArvore(doc).includes('processo:p1>dependencia:infra>dependencia:db'), 'Oracle abaixo do Cluster');
  assert.ok(!chavesNaArvore(doc).includes('processo:p1>dependencia:infra>processo:p1'), 'nao volta ao processo');
  assert.ok(chavesNaArvore(doc).includes('processo:p1>dependencia:infra>servico:s1'), 'mesmo item em outro ramo');
  w.mapaAlternarNo('processo:p1>dependencia:infra>dependencia:db');
  assert.ok(w._mapa.exploracao.abertos.has('processo:p1>dependencia:infra>dependencia:db'));
  w.mapaAlternarNo('processo:p1>dependencia:infra');
  assert.ok(!chavesNaArvore(doc).includes('processo:p1>dependencia:infra>dependencia:db'));
  assert.ok(!w._mapa.exploracao.abertos.has('processo:p1>dependencia:infra>dependencia:db'), 'recolheu em cascata');
  assert.ok(cartao(doc, 'processo:p1>dependencia:infra'), 'o proprio item fica');
});

test('explorar: clique seleciona e mostra o painel com Abrir vinculos, Comecar daqui e "Tambem ligado a"', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  w.mapaClicarNo('processo:p1>servico:s1');
  assert.ok(cartao(doc, 'processo:p1>servico:s1').classList.contains('mm-cartao--selecionado'));
  const painel = doc.getElementById('mapaPainel');
  assert.match(txt(painel), /Portal.*Composição/);
  assert.match(painel.innerHTML, /Abrir vínculos \(\d+\)/);
  assert.match(painel.innerHTML, /Começar daqui/);
  // Servico e Cluster sao irmaos e ligados entre si: ligacao cruzada.
  assert.match(txt(painel), /Também ligado a.*Cluster K8s.*usa/);
  w.mapaExplorarDe('servico:s1');
  assert.ok(cartao(doc, 'servico:s1').classList.contains('mm-cartao--raiz'));
  assert.strictEqual(w.location.hash, '#mapa?no=servico%3As1');
  w.mapaVoltarAoInicio();
  assert.match(txt(doc.getElementById('mapaCanvas')), /Processos Tier 1/);
});

test('explorar: grupo grande mostra 8 e "mostrar mais"; Abrir proximo nivel e Recolher tudo', async () => {
  const muitos = Array.from({ length: 11 }, (_, k) => ({ id: 'pp' + k, area: 'Financeiro', processo: 'Proc ' + String(k).padStart(2, '0') }));
  const { w, doc } = await carregar(['admin'], { getProcessos: PROCESSOS.concat(muitos) });
  w.mapaExplorarDe('area:financeiro');
  const procs = () => chavesNaArvore(doc).filter((k) => k.split('>').length === 2 && k.endsWith(k.split('>')[1]) && k.split('>')[1].startsWith('processo:'));
  assert.strictEqual(procs().length, 8);
  assert.match(txt(doc.getElementById('mapaCanvas')), /mostrar mais 5/);
  w.mapaMostrarMais('area:financeiro', 'processo');
  assert.strictEqual(procs().length, 13);
  w.mapaAbrirProximoNivel();
  assert.ok(chavesNaArvore(doc).some((k) => k.split('>').length === 3), 'abriu o nivel seguinte');
  w.mapaRecolherTudo();
  assert.ok(!chavesNaArvore(doc).some((k) => k.split('>').length === 3));
});

test('explorar: filtros por tipo tiram o grupo (a raiz fica)', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  w.mapaAlternarTipo('pessoa');
  assert.ok(!idsNaArvore(doc).some((id) => id.startsWith('pessoa:')));
  w.mapaAlternarTipo('processo');
  assert.ok(cartao(doc, 'processo:p1'), 'raiz nunca some');
});

test('busca leva a explorar o item escolhido', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('processo:p1');
  doc.getElementById('mapaBusca').value = 'cobranca';
  w.mapaBuscar();
  assert.match(txt(doc.getElementById('mapaBuscaResultados')), /Cobrança.*Processo/);
  w.mapaEscolherBusca('processo:p2');
  assert.strictEqual(w._mapa.exploracao.raiz, 'processo:p2');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Cobrança/);
});

test('deep link #mapa?no= abre explorando o item', async () => {
  const { doc } = await carregar(['admin'], {}, '#mapa?no=servico%3As1');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Portal/);
  assert.ok(cartao(doc, 'servico:s1>dependencia:infra'));
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
  assert.match(txt(cartao(doc, 'dependencia:db>contrato:c1')), /CT-0001/);
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
  assert.strictEqual(w._mapa.cy, null, 'o grafo da visao completa saiu');
  assert.ok(cartao(doc, 'servico:s1').classList.contains('mm-cartao--raiz'));
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

test('cartoes na cor da familia: fundo claro e borda na cor do tipo; raiz cheia; lacuna e selecionado se destacam', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaExplorarDe('dependencia:db');
  const contrato = cartao(doc, 'dependencia:db>contrato:c1');
  assert.match(contrato.getAttribute('style'), /--cor:#5d4037;/);
  assert.match(contrato.getAttribute('style'), new RegExp(`--fundo:${w._corClaraMapa('#5d4037')};`));
  assert.strictEqual(w._corClaraMapa('#2e7d32'), '#e6efe6');
  const raiz = cartao(doc, 'dependencia:db');
  assert.match(raiz.getAttribute('style'), /--cor:#00838f;--fundo:#00838f;/, 'raiz cheia na cor do tipo');
  w.mapaExplorarDe('servico:s1');
  assert.match(cartao(doc, 'servico:s1>pessoa:pAna').getAttribute('style'), /--fundo:#e6efe6;/);
  assert.ok(cartao(doc, 'servico:s1>processo:p1').classList.contains('mm-cartao--lacuna'));
  w.mapaClicarNo('servico:s1>pessoa:pAna');
  assert.ok(cartao(doc, 'servico:s1>pessoa:pAna').classList.contains('mm-cartao--selecionado'));
});
