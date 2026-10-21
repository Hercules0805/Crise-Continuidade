// Mapa de Continuidade (21/10/2026): tela #mapa -- mapa mental centrado, busca,
// trilha, painel, filtros e "Abrir cadastro". Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
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

async function carregar(perfis, extra, hash) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' + (hash || '') });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
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
    'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.mapaContinuidade();
  return { w, doc: w.document, chamadas };
}
const txt = (el) => el.textContent.replace(/\s+/g, ' ');

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

test('centralizar: vizinhos em volta com a relacao, lacuna marcada, painel com Tier/PCN e trilha', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaCentralizar('processo:p1');
  const svg = doc.getElementById('mapaSvg');
  const t = txt(svg);
  ['Portal', 'Cluster K8s', 'Beto Lima', 'Financeiro'].forEach((n) => assert.match(t, new RegExp(n)));
  assert.match(t, /contato de crise/);
  assert.match(t, /suportado pelo serviço/);
  assert.doesNotMatch(svg.innerHTML, /<img src=x/, 'nome escapado');
  assert.ok([...svg.querySelectorAll('rect')].some((r) => r.getAttribute('stroke') === '#c62828'), 'anel de lacuna');
  const painel = txt(doc.getElementById('mapaPainel'));
  assert.match(painel, /Processo/);
  assert.match(painel, /Lacuna: Tier 1 sem PCN/);
  assert.match(painel, /PCN gerado\s*Não/);
  assert.match(painel, /Abrir cadastro/);
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Faturamento/);
  assert.strictEqual(w.location.hash, '#mapa?no=processo%3Ap1');
});

test('navegar: 1o clique seleciona, 2o centraliza; trilha cresce e volta pelo clique', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaCentralizar('processo:p1');
  w.mapaClicarNo('servico:s1');
  assert.match(txt(doc.getElementById('mapaPainel')), /Portal.*Composição/);
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Centralizar/);
  w.mapaClicarNo('servico:s1');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Faturamento.* › Portal/);
  w.mapaClicarNo('dependencia:infra');
  w.mapaClicarNo('dependencia:infra');
  assert.match(txt(doc.getElementById('mapaSvg')), /Oracle/);
  assert.match(txt(doc.getElementById('mapaPainel')), /DRP gerado\s*Não/);
  w.mapaCentralizar('processo:p1');
  assert.strictEqual(txt(doc.getElementById('mapaTrilha')).trim(), 'Início › Faturamento <img src=x onerror=alert(1)>');
  w.mapaVoltarAoInicio();
  assert.match(txt(doc.getElementById('mapaCanvas')), /Processos Tier 1/);
});

test('filtros por tipo e "+N" que expande', async () => {
  const muitos = Array.from({ length: 11 }, (_, k) => ({ id: 'pp' + k, area: 'Financeiro', processo: 'Proc ' + String(k).padStart(2, '0') }));
  const { w, doc } = await carregar(['admin'], { getProcessos: PROCESSOS.concat(muitos) });
  w.mapaCentralizar('area:financeiro');
  assert.match(txt(doc.getElementById('mapaSvg')), /\+6 processos/);
  w.mapaClicarNo('mais:processo');
  assert.doesNotMatch(txt(doc.getElementById('mapaSvg')), /\+\d+ processos/);
  assert.match(txt(doc.getElementById('mapaSvg')), /Proc 10/);
  w.mapaAlternarTipo('processo');
  assert.doesNotMatch(txt(doc.getElementById('mapaSvg')), /Proc 10/);
  assert.match(txt(doc.getElementById('mapaSvg')), /Ana Souza/);
});

test('busca sem acento leva ao centro e zera a trilha', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaCentralizar('processo:p1');
  doc.getElementById('mapaBusca').value = 'cobranca';
  w.mapaBuscar();
  assert.match(txt(doc.getElementById('mapaBuscaResultados')), /Cobrança.*Processo/);
  w.mapaEscolherBusca('processo:p2');
  assert.strictEqual(txt(doc.getElementById('mapaTrilha')).trim(), 'Início › Cobrança');
});

test('deep link #mapa?no= abre centrado', async () => {
  const { doc } = await carregar(['admin'], {}, '#mapa?no=servico%3As1');
  assert.match(txt(doc.getElementById('mapaTrilha')), /Início › Portal/);
});

test('TI: sem contratos (nem chama a API), aviso, e "Abrir cadastro" so onde ve a tela', async () => {
  const { w, doc, chamadas } = await carregar(['ti']);
  assert.ok(!chamadas.includes('getContratos'));
  assert.match(txt(doc.getElementById('mapaAviso')), /Contratos não aparecem/);
  assert.doesNotMatch(txt(doc.getElementById('mapaTipos')), /Contratos/);
  w.mapaCentralizar('servico:s1');
  assert.doesNotMatch(doc.getElementById('mapaPainel').innerHTML, /Abrir cadastro/, 'TI nao ve Servicos');
  w.mapaCentralizar('dependencia:infra');
  assert.match(doc.getElementById('mapaPainel').innerHTML, /Abrir cadastro/);
});

test('admin ve contratos; abrir cadastro do servico navega e abre o drawer quando a tela carrega', async () => {
  const { w, doc } = await carregar(['admin']);
  w.mapaCentralizar('dependencia:db');
  assert.match(txt(doc.getElementById('mapaSvg')), /CT-0001/);
  // Como no navegador: a troca de hash dispara o route() (hashchange).
  w._perfilCarregado = true;
  w.mapaAbrirCadastro('servico', 's1');
  assert.strictEqual(w._abrirAposCarregar.pagina, 'servicos');
  assert.strictEqual(w.location.hash, '#servicos');
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(doc.getElementById('drawerServico').classList.contains('open'));
  assert.strictEqual(doc.getElementById('servicoNome').value, 'Portal');
  assert.strictEqual(w._abrirAposCarregar, null);
});

test('"Ver no mapa" no drawer do Servico: sem alteracao fecha e abre o mapa centrado; registro novo pede para salvar', async () => {
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
