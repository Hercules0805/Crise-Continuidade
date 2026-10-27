// Operador Administrativo (14/10/2026): consulta Pessoas, Areas e Processos, sem os
// controles de edicao; Admin continua com tudo. app.js real no jsdom, API de teste.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'd1', categoria: 'Pessoas', nome: 'Ana Souza', detalhes: 'Analista', email: 'ana@x.com', areas: ['TI'] },
  { id: 'd2', categoria: 'Fornecedores', nome: 'Alfa Cloud' },
];
const AREAS = [{ id: 'a1', nome: 'TI', responsavel: 'Kaique Branco', email: 'k@x.com' }];
const PROCESSOS = [
  { id: 'p1', area: 'TI', processo: 'Backup', score: 13, avaliado: true, rto: '< 1 hora', biaHomologada: 'BIA Realizado' },
];

async function carregar(perfis) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0];
  const dados = { getDependencias: DEPS, getAreas: AREAS, getProcessos: PROCESSOS };
  w.API = new Proxy({}, { get: (_, nome) => async () => JSON.parse(JSON.stringify(dados[nome] || [])) });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  return { w, doc: w.document };
}

const html = (doc) => doc.getElementById('app').innerHTML;

test('Pessoas: operador ve a lista, sem "+ Nova Pessoa", sem editar/excluir e sem abrir o formulario ao clicar', async () => {
  const { w, doc } = await carregar(['operador']);
  await w.pessoas();
  const tela = html(doc);
  assert.match(tela, /Ana Souza/);
  assert.doesNotMatch(tela, /onclick="abrirModalPessoa\(\)"/);
  assert.doesNotMatch(tela, /abrirModalPessoa\('/);
  assert.doesNotMatch(tela, /excluirPessoaCadastro/);
  assert.match(tela, /Gerar organograma/, 'o organograma e leitura e continua');
});

test('Pessoas: admin continua com tudo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.pessoas();
  const tela = html(doc);
  assert.match(tela, /onclick="abrirModalPessoa\(\)"/);
  assert.match(tela, /abrirModalPessoa\('d1'\)/);
  assert.match(tela, /excluirPessoaCadastro\('d1'\)/);
});

test('Areas: operador ve a lista, sem "+ Nova Area", sem editar/excluir', async () => {
  const { w, doc } = await carregar(['operador']);
  await w.areas();
  const tela = html(doc);
  assert.match(tela, /Kaique Branco/);
  assert.doesNotMatch(tela, /onclick="abrirModalArea\(\)"/);
  assert.doesNotMatch(tela, /editarArea\(|excluirArea\(/);
});

test('Areas: admin continua com tudo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.areas();
  const tela = html(doc);
  assert.match(tela, /onclick="abrirModalArea\(\)"/);
  assert.match(tela, /editarArea\('a1'\)/);
  assert.match(tela, /excluirArea\('a1'\)/);
});

test('Processos: operador ve a grade; a linha abre so o detalhe, sem editar/avaliar/enviar/excluir/lote', async () => {
  const { w, doc } = await carregar(['operador']);
  await w.processos();
  const tela = html(doc);
  assert.match(tela, /Backup/);
  assert.doesNotMatch(tela, /onclick="abrirModalProcesso\(\)"/);
  assert.doesNotMatch(tela, /editarProcesso\('/);
  assert.doesNotMatch(tela, /avaliarProcesso\(|abrirModalEnviar\(|excluirProcesso\(/);
  assert.equal(doc.querySelectorAll('.chk-processo').length, 0, 'sem selecao para edicao em lote');
  assert.match(tela, /verDetalhesProcesso\('p1'\)/);
});

test('Processos: o atalho editarProcesso (deep link) abre so o detalhe para o operador', async () => {
  const { w, doc } = await carregar(['operador']);
  await w.processos();
  w.editarProcesso('p1');
  assert.ok(doc.getElementById('modalDetalhes').classList.contains('open'));
  assert.ok(!doc.getElementById('modalProcesso') || !doc.getElementById('modalProcesso').classList.contains('open'));
});

test('Processos: admin continua com tudo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.processos();
  const tela = html(doc);
  assert.match(tela, /onclick="abrirModalProcesso\(\)"/);
  assert.match(tela, /editarProcesso\('p1'\)/);
  assert.match(tela, /avaliarProcesso\('p1'\)/);
  assert.match(tela, /excluirProcesso\('p1'\)/);
  assert.equal(doc.querySelectorAll('.chk-processo').length, 1);
});

test('Gestor de area continua editando os processos (so o operador perde os controles)', async () => {
  const { w, doc } = await carregar(['gestor']);
  w.USER_AREA = 'TI';
  await w.processos();
  assert.match(html(doc), /editarProcesso\('p1'\)/);
});

test('Criterios de fornecedor: o limiar da regua e so do Admin (operador gerencia criterios, mas ve o limiar sem editar)', async () => {
  const op = await carregar(['operador']);
  await op.w.fornecedoresCriterios();
  assert.ok(op.doc.getElementById('fornLimiar').disabled, 'limiar travado para o operador');
  assert.doesNotMatch(html(op.doc), /salvarLimiarFornecedor/);
  assert.match(html(op.doc), /abrirModalCriterio|novoCriterio|Novo Crit/i, 'mas o operador gerencia os criterios');
  const ad = await carregar(['admin']);
  await ad.w.fornecedoresCriterios();
  assert.ok(!ad.doc.getElementById('fornLimiar').disabled);
  assert.match(html(ad.doc), /salvarLimiarFornecedor/);
});
