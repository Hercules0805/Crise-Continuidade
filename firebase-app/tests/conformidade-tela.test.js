// Tela Conformidade de Continuidade e selo do ciclo de revisao (23/10/2026).
// Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const pcn = (data) => JSON.stringify([{ versao: 1, data, autor: 'x' }]);
const ERP = { id: 'erp', nome: 'ERP', categoria: 'Sistemas', drpSalvo: '' };
const P_FIN = { id: 'fin', area: 'Financeiro', processo: 'Faturamento', score: 14, avaliado: true, biaUltimaEm: '2026-09-01T00:00:00Z',
  pcnSalvo: pcn('2026-09-01'), dependenciaItens: [{ id: 'erp', nome: 'ERP', categoria: 'Sistemas' }] };
const P_RH = { id: 'rh', area: 'RH', processo: 'Folha', score: 8, avaliado: true, biaUltimaEm: '2024-01-01T00:00:00Z', pcnSalvo: '', bcpStatus: 'BCP Realizado' };
const P_TI = { id: 'ti', area: 'TI', processo: 'Wiki', score: 0, avaliado: false, pcnSalvo: '' };

async function carregar(perfis, area) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = area || null;
  const gravacoes = [];
  const dados = {
    getProcessos: [P_FIN, P_RH, P_TI], getDependencias: [ERP], getServicos: [],
    getCiclosContinuidade: { biaMeses: 12, pcnMeses: 12, drpMeses: 12, avisoDias: 30 },
  };
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|registrar)/.test(nome)) {
        gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg)) });
        return { success: true, revisao: { ultimaEm: arg && arg.data, revisadoPor: 'eu' } };
      }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.conformidade();
  return { w, doc: w.document, gravacoes };
}

const linhas = (doc) => [...doc.querySelectorAll('#conformidadeRows tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());

test('operador de processos ve indicadores e pendencias de todas as areas', async () => {
  const { doc } = await carregar(['operador_processos']);
  const cards = doc.getElementById('conformidadeMetricas').textContent;
  assert.match(cards, /BIA em dia/);
  assert.match(cards, /PCN em dia \(Tier 1\/2\)/);
  const l = linhas(doc).join('\n');
  assert.match(l, /Folha/);
  assert.match(l, /Wiki/);
  assert.match(l, /ERP/, 'dependencia critica sem DRP');
  assert.match(l, /Tier 2 sem PCN/);
  assert.match(l, /A homologar.*Faturamento.*falta homologar/, 'BIA avaliado sem homologacao');
  assert.match(cards, /BIA a homologar/);
  assert.ok(!doc.querySelector('button[onclick="abrirDrawerCiclos()"]'), 'periodicidades sao de Admin/SI');
});

test('card filtra a lista pelo tipo e clicar de novo limpa', async () => {
  const { w, doc } = await carregar(['operador_processos']);
  const total = linhas(doc).length;
  w.filtrarConformidadePorCard('homologacao');
  assert.deepStrictEqual(linhas(doc).length, 1);
  assert.strictEqual(doc.getElementById('confTipo').value, 'homologacao');
  w.filtrarConformidadePorCard('homologacao');
  assert.strictEqual(linhas(doc).length, total);
});

test('gestor ve so a propria area; gestor sem area nao ve nada', async () => {
  const { doc } = await carregar(['gestor'], 'RH');
  const l = linhas(doc).join('\n');
  assert.match(l, /Folha/);
  assert.ok(!/Wiki|Faturamento|ERP/.test(l), l);
  const semArea = await carregar(['gestor'], null);
  assert.match(linhas(semArea.doc).join('\n'), /Nenhuma pendência/);
});

test('registrar revisao do BIA vencido grava tipo, id, data e aprovador', async () => {
  const { w, doc, gravacoes } = await carregar(['operador_processos']);
  const btn = [...doc.querySelectorAll('#conformidadeRows button[title="Registrar revisão"]')]
    .find((b) => /'bia','rh'/.test(b.getAttribute('onclick')));
  assert.ok(btn, 'BIA vencido do RH tem o botao');
  w.abrirDrawerRevisao('bia', 'rh');
  assert.ok(doc.getElementById('drawerRevisao').classList.contains('open'));
  doc.getElementById('revAprovador').value = 'Dona do RH';
  await w.salvarRevisaoPlano();
  const g = gravacoes.find((x) => x.nome === 'registrarRevisao');
  assert.strictEqual(g.arg.tipo, 'bia');
  assert.strictEqual(g.arg.id, 'rh');
  assert.strictEqual(g.arg.aprovadoPor, 'Dona do RH');
  assert.match(g.arg.data, /^\d{4}-\d{2}-\d{2}$/);
});

test('SI ajusta as periodicidades; operador de processos nao registra revisao de DRP', async () => {
  const si = await carregar(['seguranca']);
  si.w.abrirDrawerCiclos();
  si.doc.getElementById('cicloPcn').value = '6';
  await si.w.salvarCiclosTela();
  assert.strictEqual(si.gravacoes.find((x) => x.nome === 'salvarCiclosContinuidade').arg.pcnMeses, '6');

  const op = await carregar(['operador_processos']);
  op.w.abrirDrawerRevisao('drp', 'erp');
  assert.ok(!op.doc.getElementById('drawerRevisao') || !op.doc.getElementById('drawerRevisao').classList.contains('open'));
});

test('selo do ciclo no drawer de Processo (aba BCP) mostra o status do PCN', async () => {
  const { w, doc } = await carregar(['operador_processos']);
  await w.processos();
  w.editarProcesso('fin');
  w.trocarAbaProcesso('bcp');
  await new Promise((r) => setTimeout(r, 20));
  const selo = doc.querySelector('[data-ciclo="pcn"]').textContent;
  assert.match(selo, /Vigente/);
  assert.match(selo, /Registrar revisão/);
});
