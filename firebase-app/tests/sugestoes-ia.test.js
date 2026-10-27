// Sugestoes por IA na Continuidade (27/10/2026): Descricao Funcional do
// Processo, Parametros DRP (com checkboxes), Descricao do Servico e Observacao
// da revisao. Carrega o app.js REAL no jsdom; a IA e o API.post falso.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEP = {
  id: 'db1', nome: 'Banco ERP', categoria: 'Banco de Dados',
  drpRunbook: ['Restaurar o último backup'],
  drpEstrategiasTeste: [{ cenario: 'Tabletop (Exercício de Mesa)', frequencia: 'Semestral' }],
};
const P1 = { id: 'p1', area: 'TI', processo: 'Folha', descricaoFuncional: '', dependenciaItens: [] };
const SERVICO = { id: 's1', nome: 'Portal RH', descricao: '', dependenciaItens: [] };

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const posts = [];
  const dados = Object.assign({
    getDependencias: [DEP], getServicos: [SERVICO], getAreas: [{ id: 'a1', nome: 'TI' }], getBackups: [],
    getProcessos: [P1], getPerguntas: [], getConfigRespostas: null, getRiscosPorProcesso: [],
    getSlasDependencia: { success: true, contratos: [] },
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => nome === 'post' ? async (acao, corpo) => {
      posts.push({ acao, corpo: JSON.parse(JSON.stringify(corpo)) });
      const r = dados['post:' + acao];
      if (r instanceof Error) throw r;
      return r === undefined ? { success: true } : JSON.parse(JSON.stringify(r));
    } : async () => {
      if (/^(salvar|excluir)/.test(nome)) return { success: true, id: 'novo' };
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return { w, doc: w.document, posts };
}

const visivel = (el) => el && el.style.display !== 'none';

test('Descricao Funcional: botao para quem edita o processo salvo; usar preenche com confirmacao se ja ha texto', async () => {
  const { w, doc, posts } = await carregar(['operador_processos'], { 'post:sugerirTextoIA': { texto: 'Processa a folha de pagamento.' } });
  let perguntou = 0;
  w.confirmarAcao = async () => { perguntou++; return true; };
  await w.processos();
  w.editarProcesso('p1');
  assert.ok(visivel(doc.getElementById('btnSugerirFuncional')));
  await w.sugerirFuncionalComIA();
  assert.deepStrictEqual(posts.map((p) => p.corpo), [{ alvo: 'processo-funcional', id: 'p1' }]);
  assert.match(doc.getElementById('sugestaoFuncional').textContent, /revise antes de usar[\s\S]*folha de pagamento/);
  assert.strictEqual(doc.getElementById('fDescricaoFuncional').value, '', 'nada muda sozinho');
  await w.usarSugestaoIA('sugestaoFuncional');
  assert.strictEqual(perguntou, 0, 'campo vazio: sem pergunta');
  assert.strictEqual(doc.getElementById('fDescricaoFuncional').value, 'Processa a folha de pagamento.');
  assert.strictEqual(doc.getElementById('sugestaoFuncional').textContent.trim(), '');

  doc.getElementById('fDescricaoFuncional').value = 'Outro texto';
  await w.sugerirFuncionalComIA();
  await w.usarSugestaoIA('sugestaoFuncional');
  assert.strictEqual(perguntou, 1, 'ja havia texto diferente: confirma');

  // Reabrir limpa a caixa; processo novo esconde o botao.
  await w.sugerirFuncionalComIA();
  w.abrirModalProcesso();
  assert.strictEqual(doc.getElementById('sugestaoFuncional').textContent.trim(), '');
  assert.ok(!visivel(doc.getElementById('btnSugerirFuncional')));
});

test('Descricao Funcional: erro da IA some com a caixa e avisa', async () => {
  const { w, doc } = await carregar(['admin'], { 'post:sugerirTextoIA': new Error('quota') });
  await w.processos();
  w.editarProcesso('p1');
  await w.sugerirFuncionalComIA();
  assert.strictEqual(doc.getElementById('sugestaoFuncional').innerHTML, '');
  assert.match((w.__toasts || []).join(' '), /Não foi possível gerar a sugestão/);
});

test('Parametros DRP: caixa com checkboxes; so os marcados entram, sem repetir o que a tela ja tem; nada grava', async () => {
  const resposta = {
    listas: {
      drpCriteriosAcionamento: ['Banco fora do ar por mais de 1 hora'],
      drpRunbook: ['Validar integridade da base', 'Subir o serviço do ERP', 'item digitado agora'],
      drpPreRequisitos: [], drpHealthCheck: [], drpCriteriosRetorno: [], drpLimitacoes: [],
    },
    estrategiasTeste: [{ cenario: 'Full Failover Test (Teste Completo)', frequencia: 'Anual' }],
  };
  const { w, doc, posts } = await carregar(['ti'], { 'post:sugerirTextoIA': resposta });
  await w.dependencias();
  w.abrirDrawerDependencia(JSON.parse(JSON.stringify(DEP)));
  assert.ok(visivel(doc.getElementById('btnSugerirDrp')));
  w._depDrpListas.drpRunbook.push('Item digitado agora');
  await w.sugerirParametrosDrpComIA();
  assert.deepStrictEqual(posts.map((p) => p.corpo), [{ alvo: 'dependencia-drp', id: 'db1' }]);
  const caixa = doc.getElementById('sugestaoDrp');
  const caixas = [...caixa.querySelectorAll('input[type=checkbox]')];
  assert.strictEqual(caixas.length, 4, 'o item ja digitado na tela nao aparece');
  assert.ok(caixas.every((c) => c.checked), 'vem tudo marcado');
  assert.match(caixa.textContent, /Critérios de acionamento[\s\S]*Runbook de restore[\s\S]*Estratégias de teste[\s\S]*Full Failover/);
  assert.doesNotMatch(caixa.textContent, /Pré-requisitos/, 'lista sem sugestao nao aparece');

  caixa.querySelector('input[data-campo="drpRunbook"][data-idx="1"]').checked = false;
  w.adicionarSugestoesDrp();
  assert.deepStrictEqual([...w._depDrpListas.drpRunbook], ['Restaurar o último backup', 'Item digitado agora', 'Validar integridade da base']);
  assert.deepStrictEqual([...w._depDrpListas.drpCriteriosAcionamento], ['Banco fora do ar por mais de 1 hora']);
  assert.deepStrictEqual(w._depDrpEstrategias.map((e) => e.cenario), ['Tabletop (Exercício de Mesa)', 'Full Failover Test (Teste Completo)']);
  assert.match(doc.getElementById('lista-drpRunbook').textContent, /Validar integridade da base/);
  assert.match(doc.getElementById('drpEstrategiasTabela').textContent, /Full Failover/);
  assert.strictEqual(caixa.innerHTML, '', 'caixa fecha');
  assert.match((w.__toasts || []).join(' '), /3 itens adicionados — salve a dependência/);
});

test('Parametros DRP: nada novo vira aviso; Operador de Processos e dependencia nova ficam sem o botao', async () => {
  const { w, doc } = await carregar(['admin'], { 'post:sugerirTextoIA': { listas: { drpRunbook: ['restaurar o último  backup'] }, estrategiasTeste: [{ cenario: 'Tabletop (Exercício de Mesa)', frequencia: 'semestral' }] } });
  await w.dependencias();
  w.abrirDrawerDependencia(JSON.parse(JSON.stringify(DEP)));
  await w.sugerirParametrosDrpComIA();
  assert.match(doc.getElementById('sugestaoDrp').textContent, /não encontrou nada novo/);
  w.abrirDrawerDependencia(null);
  assert.ok(!visivel(doc.getElementById('btnSugerirDrp')));
  assert.strictEqual(doc.getElementById('sugestaoDrp').innerHTML, '', 'abrir outra limpa a caixa');

  const op = await carregar(['operador_processos']);
  await op.w.dependencias();
  op.w.abrirDrawerDependencia(JSON.parse(JSON.stringify(DEP)));
  assert.ok(!visivel(op.doc.getElementById('btnSugerirDrp')));
});

test('Parametros DRP: cenarios do servidor = DRP_CENARIOS_TESTE da tela', () => {
  const lista = (src) => { const i = src.indexOf('const DRP_CENARIOS_TESTE = ['); return src.slice(i, src.indexOf('];', i)).replace(/\s+/g, ' '); };
  const cliente = lista(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  const servidor = lista(fs.readFileSync(path.join(__dirname, '..', 'functions', 'appLogic.js'), 'utf8'));
  assert.ok(cliente.includes('Tabletop'));
  assert.strictEqual(servidor, cliente);
});

test('Descricao do Servico: Admin/SI com servico salvo; usar preenche o campo', async () => {
  const { w, doc, posts } = await carregar(['seguranca'], { 'post:sugerirTextoIA': { texto: 'Entrega o portal do RH.' } });
  await w.servicos();
  w.abrirDrawerServico('s1');
  assert.ok(visivel(doc.getElementById('btnSugerirServico')));
  await w.sugerirDescricaoServicoComIA();
  assert.deepStrictEqual(posts.map((p) => p.corpo), [{ alvo: 'servico-descricao', id: 's1' }]);
  await w.usarSugestaoIA('sugestaoServico');
  assert.strictEqual(doc.getElementById('servicoDescricao').value, 'Entrega o portal do RH.');
  w.abrirDrawerServico();
  assert.ok(!visivel(doc.getElementById('btnSugerirServico')), 'servico novo: sem botao');

  const ti = await carregar(['ti']);
  await ti.w.servicos();
  ti.w.abrirDrawerServico('s1');
  assert.ok(!visivel(ti.doc.getElementById('btnSugerirServico')), 'TI nao edita Servicos');
});

test('Observacao da revisao: pede com tipo e id do plano; usar preenche a observacao', async () => {
  const { w, doc, posts } = await carregar(['operador_processos'], { 'post:sugerirTextoIA': { texto: 'Plano conferido; nova resposta em 01/09/2026.' } });
  await w.processos();
  w.abrirDrawerRevisao('bia', 'p1');
  assert.ok(visivel(doc.getElementById('btnSugerirRevisao')));
  await w.sugerirObservacaoRevisaoComIA();
  assert.deepStrictEqual(posts.map((p) => p.corpo), [{ alvo: 'revisao-observacao', tipo: 'bia', id: 'p1' }]);
  assert.match(doc.getElementById('sugestaoRevisao').textContent, /respostas do questionário/);
  await w.usarSugestaoIA('sugestaoRevisao');
  assert.strictEqual(doc.getElementById('revObs').value, 'Plano conferido; nova resposta em 01/09/2026.');
});
