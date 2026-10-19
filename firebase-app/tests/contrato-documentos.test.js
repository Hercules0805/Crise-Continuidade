// Contratos, aba Documentos: editar um link ja inserido (15/10/2026).
// app.js real no jsdom, API trocada por um espiao que guarda as gravacoes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const CC = require('../public/contrato-ciclo.js');

const PUB = path.join(__dirname, '..', 'public');
const HOJE = CC.hojeIso();

const DOCS = [
  { titulo: 'Pasta do contrato', url: 'https://drive.google.com/drive/folders/abc' },
  { titulo: '1º aditivo', url: 'https://sharepoint.x/aditivo1' },
  { titulo: 'Proposta', url: 'https://portal.x/proposta' },
];
const contrato = (extra) => Object.assign({
  id: 'c1', codigo: 'CT-0001', objeto: 'Suite de e-mail', fornecedorId: 'f1', fornecedorNome: 'Alfa Cloud',
  tipoId: 't1', statusId: 's-vig', indexadorId: 'i1', area: 'TI', gestor: { id: 'p1', nome: 'Ana Souza' },
  dataInicio: CC.somarMeses(HOJE, -11), dataFim: CC.somarDias(HOJE, 200), vigenciaMeses: 12,
  renovacaoAutomatica: true, avisoCancelamentoDias: 30, valorMensal: 1000, valorGlobal: 12000,
  documentos: DOCS, alertas: [],
}, extra);

async function carregar(perfis) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = {
    getDependencias: [
      { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', setor: 'TI' },
      { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud', tic: true },
    ],
    getAreas: [{ id: 'a1', nome: 'TI' }],
    getContratos: [contrato(), contrato({ id: 'c2', codigo: 'CT-0002', objeto: 'Outro', documentos: [{ titulo: 'Outro doc', url: 'https://x.y/z' }] })],
    getTiposContrato: [{ id: 't1', nome: 'SaaS', ativo: true }],
    getIndexadoresReajuste: [{ id: 'i1', nome: 'IPCA', ativo: true }],
    getStatusContrato: [{ id: 's-pre', nome: 'Em elaboração', situacao: 'pre', ativo: true }, { id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true }],
    getEventosContrato: [], getProcessos: [], getRiscos: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
  };
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.contratos();
  w.abrirDrawerContrato('c1');
  return { w, doc: w.document, gravacoes, $: (id) => w.document.getElementById(id) };
}

const linhas = (doc) => [...doc.querySelectorAll('#contratoDocumentosLista .contrato-doc')];
const titulos = (w) => w._contratoDocumentos.map((d) => d.titulo);

test('cada documento ganha o ícone de editar (antes da lixeira), para quem edita contratos', async () => {
  const { doc } = await carregar(['operador']);
  assert.equal(linhas(doc).length, 3);
  linhas(doc).forEach((l) => {
    const botoes = [...l.querySelectorAll('button')].map((b) => b.title);
    assert.deepStrictEqual(botoes, ['Editar', 'Remover']);
  });
});

test('gestor (só leitura) não vê editar nem remover', async () => {
  const { doc } = await carregar(['gestor']);
  assert.equal(linhas(doc).length, 3);
  assert.equal(doc.querySelectorAll('#contratoDocumentosLista button').length, 0);
});

test('clicar em editar preenche o formulário, mostra o aviso, destaca a linha e troca o botão', async () => {
  const { w, doc, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(1);
  assert.equal($('contratoDocTitulo').value, '1º aditivo');
  assert.equal($('contratoDocUrl').value, 'https://sharepoint.x/aditivo1');
  assert.equal($('contratoDocEdicaoAviso').style.display, 'block');
  assert.equal($('btnAdicionarDocumentoContrato').textContent, 'Salvar alteração');
  assert.deepStrictEqual(linhas(doc).map((l) => l.classList.contains('editando')), [false, true, false]);
});

test('"Salvar alteração" troca só aquele item; ordem e demais intactos; volta ao estado normal', async () => {
  const { w, doc, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(1);
  $('contratoDocTitulo').value = '1º aditivo (assinado)';
  $('contratoDocUrl').value = 'https://sharepoint.x/aditivo1-v2';
  w.adicionarDocumentoContrato();
  assert.deepStrictEqual(titulos(w), ['Pasta do contrato', '1º aditivo (assinado)', 'Proposta']);
  assert.equal(w._contratoDocumentos[1].url, 'https://sharepoint.x/aditivo1-v2');
  assert.equal(w._contratoDocumentos[0].url, DOCS[0].url);
  assert.equal(w._contratoDocumentos[2].url, DOCS[2].url);
  assert.equal($('btnAdicionarDocumentoContrato').textContent, '+ Adicionar');
  assert.equal($('contratoDocEdicaoAviso').style.display, 'none');
  assert.equal($('contratoDocTitulo').value, '');
  assert.equal(w._contratoDocEditandoIndex, null);
  assert.match(linhas(doc)[1].textContent, /1º aditivo \(assinado\)/);
});

test('link inválido durante a edição avisa e não altera nada (a edição continua aberta)', async () => {
  const { w, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(0);
  $('contratoDocUrl').value = 'sem-protocolo';
  w.adicionarDocumentoContrato();
  assert.equal(w._contratoDocumentos[0].url, DOCS[0].url);
  assert.equal(w._contratoDocEditandoIndex, 0);
  assert.match(w.__toasts.at(-1), /http:\/\/ ou https:\/\//);
});

test('cancelar a edição não altera nada e limpa o formulário', async () => {
  const { w, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(2);
  $('contratoDocTitulo').value = 'mudou';
  w.cancelarEdicaoDocumentoContrato();
  assert.deepStrictEqual(titulos(w), ['Pasta do contrato', '1º aditivo', 'Proposta']);
  assert.equal($('contratoDocTitulo').value, '');
  assert.equal($('btnAdicionarDocumentoContrato').textContent, '+ Adicionar');
});

test('remover descarta a edição em andamento (os índices mudam) e não troca o item errado', async () => {
  const { w, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(2);
  w.removerDocumentoContrato(0);
  assert.equal(w._contratoDocEditandoIndex, null);
  assert.equal($('contratoDocEdicaoAviso').style.display, 'none');
  assert.deepStrictEqual(titulos(w), ['1º aditivo', 'Proposta']);
  $('contratoDocTitulo').value = 'Novo';
  $('contratoDocUrl').value = 'https://x.y/novo';
  w.adicionarDocumentoContrato();
  assert.deepStrictEqual(titulos(w), ['1º aditivo', 'Proposta', 'Novo'], 'sem edição, adicionar faz push');
});

test('reabrir o drawer (outro contrato) começa sem edição', async () => {
  const { w, $ } = await carregar(['operador']);
  w.editarDocumentoContrato(0);
  w.abrirDrawerContrato('c2');
  assert.equal(w._contratoDocEditandoIndex, null);
  assert.equal($('contratoDocEdicaoAviso').style.display, 'none');
  assert.equal($('btnAdicionarDocumentoContrato').textContent, '+ Adicionar');
  assert.deepStrictEqual(titulos(w), ['Outro doc']);
});

test('adicionar continua funcionando e a edição é gravada no Salvar do contrato', async () => {
  const { w, $, gravacoes } = await carregar(['operador']);
  w.editarDocumentoContrato(0);
  $('contratoDocTitulo').value = 'Pasta (nova)';
  w.adicionarDocumentoContrato();
  $('contratoDocTitulo').value = 'Extra';
  $('contratoDocUrl').value = 'https://x.y/extra';
  w.adicionarDocumentoContrato();
  assert.strictEqual(await w.salvarContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarContrato');
  assert.deepStrictEqual(g.arg.documentos.map((d) => d.titulo), ['Pasta (nova)', '1º aditivo', 'Proposta', 'Extra']);
  assert.equal(g.arg.documentos[0].url, DOCS[0].url, 'o link ficou, só o título mudou');
});
