// Relatorio de Status de Continuidade (27/10/2026): tela, documento, salvar e
// reabrir. Carrega o app.js REAL no jsdom; a aba nova e um documento falso.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const v = (data) => JSON.stringify([{ versao: 1, data }]);
const PROCESSOS = [
  { id: 'p1', area: 'TI', processo: 'Folha', avaliado: true, score: 15, biaUltimaEm: '2026-09-01', pcnSalvo: v('2026-09-10'), dependenciaItens: [{ categoria: 'Fornecedores', id: 'f1', nome: 'Nuvem' }] },
  { id: 'p2', area: 'RH', processo: 'Ponto' },
];
const DEPS = [{ id: 'f1', categoria: 'Fornecedores', nome: 'Nuvem' }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI'; w.USER_EMAIL = 'eu@x';
  const chamadas = [];
  const salvos = [];
  const dados = Object.assign({
    getProcessos: PROCESSOS, getDependencias: DEPS, getServicos: [], getAreas: [{ id: 'a', nome: 'TI' }, { id: 'b', nome: 'RH' }],
    getCiclosContinuidade: null,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'post') return async (acao, corpo) => { chamadas.push({ nome: 'post:' + acao, arg: JSON.parse(JSON.stringify(corpo)) }); const r = dados['post:' + acao]; if (r instanceof Error) throw r; return r; };
      if (nome === 'salvarRelatorioExecutivo') return async (r) => { chamadas.push({ nome, arg: r }); salvos.push(Object.assign({ id: 'e' + salvos.length }, r)); return { success: true, id: 'e' + (salvos.length - 1), salvoEm: '2026-10-27T12:00:00Z' }; };
      if (nome === 'getRelatoriosExecutivos') return async () => salvos.map((s) => Object.assign({}, s, { conteudo: undefined }));
      if (nome === 'getConteudoRelatorioExecutivo') return async (id) => ({ id, conteudo: salvos.find((s) => s.id === id).conteudo });
      if (nome === 'invalidate') return () => undefined;
      return async () => JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'continuidade-relatorio.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  // Aba nova falsa: guarda o ultimo HTML escrito.
  const abas = [];
  w.open = () => { const aba = { html: '', document: { open() { aba.html = ''; }, write(h) { aba.html += h; }, close() {}, getElementById: () => null } }; abas.push(aba); return aba; };
  return { w, doc: w.document, chamadas, salvos, abas };
}

test('quem ve: Admin, Seguranca e Operador de Processos; card na tela Relatorios', async () => {
  const Perfis = require('../public/perfis.js');
  for (const [perfil, ve] of [['admin', true], ['seguranca', true], ['operador_processos', true], ['ti', false], ['operador', false], ['gestor', false]]) {
    assert.strictEqual(Perfis.podeVerTela([perfil], 'continuidade-relatorio'), ve, perfil);
  }
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  assert.match(html, /<a href="#continuidade-relatorio" class="nav-link" data-page="continuidade-relatorio">Relatório de Continuidade<\/a>/);
  assert.match(html, /continuidade-relatorio\.js\?v=\d+/);
  const op = await carregar(['operador_processos']);
  await op.w.relatorios();
  assert.match(op.doc.getElementById('app').textContent, /Status de Continuidade/);
  const ti = await carregar(['ti']);
  await ti.w.relatorios();
  assert.doesNotMatch(ti.doc.getElementById('app').textContent, /Status de Continuidade/);
});

test('tela: escopo por area com contagem; gerar sem IA abre o documento com todas as secoes', async () => {
  const { w, doc, abas, chamadas } = await carregar(['operador_processos']);
  await w.continuidadeRelatorio();
  const sel = doc.getElementById('relContArea');
  assert.deepStrictEqual([...sel.options].map((o) => o.value), ['', 'RH', 'TI']);
  assert.match(doc.getElementById('relContContagem').textContent, /2 processos no escopo · Empresa inteira/);
  sel.value = 'TI';
  w.atualizarEscopoRelatorioContinuidade();
  assert.match(doc.getElementById('relContContagem').textContent, /1 processo no escopo · Área TI/);
  sel.value = '';
  doc.getElementById('relContIA').checked = false;
  await w.gerarRelatorioContinuidade();
  const html = abas[0].html;
  assert.match(html, /Relatório de Status de Continuidade/);
  ['Cobertura de BIA, PCN e DRP', 'Evolução desde a última edição', 'Por área', 'Por categoria de dependência', 'Revisões e testes', 'Pendências', 'Notas metodológicas']
    .forEach((s) => assert.ok(html.includes(s), s));
  assert.match(html, /Primeira edição deste escopo/);
  assert.match(html, /BIA realizado em 1 de 2 \(50%\)/);
  assert.match(html, /Dependência crítica sem DRP/);
  assert.match(html, /💾 Salvar no sistema/);
  assert.ok(!chamadas.some((c) => c.nome === 'post:gerarResumoExecutivo'), 'sem IA');
});

test('IA: manda tipo continuidade e so agregados; falha da IA vira aviso no documento', async () => {
  const ok = await carregar(['seguranca'], { 'post:gerarResumoExecutivo': { paragrafos: ['Cobertura boa.'], recomendacoes: ['Fazer PCN.'] } });
  await ok.w.continuidadeRelatorio();
  await ok.w.gerarRelatorioContinuidade();
  const pedido = ok.chamadas.find((c) => c.nome === 'post:gerarResumoExecutivo').arg;
  assert.strictEqual(pedido.tipo, 'continuidade');
  assert.strictEqual(pedido.indicadores.escopo, 'Empresa inteira');
  assert.strictEqual(pedido.indicadores.bia.pctRealizados, 50);
  assert.match(ok.abas[0].html, /Cobertura boa\.[\s\S]*Fazer PCN\./);

  const falha = await carregar(['seguranca'], { 'post:gerarResumoExecutivo': new Error('quota') });
  await falha.w.continuidadeRelatorio();
  await falha.w.gerarRelatorioContinuidade();
  assert.match(falha.abas[0].html, /Resumo por IA indisponível/);
});

test('salvar grava tipo continuidade com o retrato; a proxima edicao mostra a evolucao; reabrir desenha igual', async () => {
  const { w, doc, abas, salvos } = await carregar(['operador_processos']);
  await w.continuidadeRelatorio();
  doc.getElementById('relContIA').checked = false;
  await w.gerarRelatorioContinuidade();
  const idTemp = Object.keys(w._relatoriosGerados)[0];
  await w._salvarRelatorioExecutivoGerado(idTemp);
  assert.strictEqual(salvos.length, 1);
  assert.strictEqual(salvos[0].tipo, 'continuidade');
  assert.strictEqual(salvos[0].escopo, 'Empresa inteira');
  const retrato = JSON.parse(salvos[0].conteudo);
  assert.strictEqual(retrato.dados.d.indicadores.biaRealizadosPct, 50);
  assert.strictEqual(retrato.dados.indicadoresIA, undefined, 'o pacote da IA nao vai para o banco');
  assert.doesNotMatch(salvos[0].conteudo, /<table/, 'retrato dos dados, nunca HTML');
  assert.match(doc.getElementById('relatoriosSalvos').textContent, /Relatório de Status de Continuidade/);

  // Proxima edicao: compara com a salva.
  await w.gerarRelatorioContinuidade();
  assert.match(abas[1].html, /Em 27\/10\/2026|Em \d{2}\/\d{2}\/\d{4}/);
  assert.doesNotMatch(abas[1].html, /Primeira edição deste escopo/);

  await w.abrirRelatorioExecutivoSalvo('e0');
  assert.match(abas[2].html, /Edição salva/);
  assert.match(abas[2].html, /BIA realizado em 1 de 2 \(50%\)/);
});
