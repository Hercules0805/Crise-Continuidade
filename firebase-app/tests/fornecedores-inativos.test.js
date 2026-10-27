// Fornecedores Ativos / Inativos e importação CSV como inativos (27/10/2026).
// Camada de dados (api.js com Firestore falso) + tela (app.js real no jsdom).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const apiSrc = fs.readFileSync(path.join(PUB, 'api.js'), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------
// Camada de dados
// ---------------------------------------------------------------
function extrair(nome) {
  const ini = apiSrc.search(new RegExp(`(async )?function ${nome}\\(`));
  assert.ok(ini >= 0, 'funcao nao encontrada: ' + nome);
  let i = apiSrc.indexOf('{', apiSrc.indexOf(')', ini));
  let prof = 0;
  for (; i < apiSrc.length; i++) {
    if (apiSrc[i] === '{') prof++;
    else if (apiSrc[i] === '}' && --prof === 0) break;
  }
  return apiSrc.slice(ini, i + 1);
}

function ambienteApi(docsIniciais) {
  const store = JSON.parse(JSON.stringify(docsIniciais || {}));
  let seq = 0;
  const lotes = [];
  const gravar = (nome, id, data, opts) => {
    store[nome] = store[nome] || {};
    store[nome][id] = opts && opts.merge ? { ...(store[nome][id] || {}), ...data } : data;
  };
  const col = (nome) => ({
    doc: (id) => { const docId = id || ('auto' + (++seq)); return { id: docId, _col: nome, set: async (data, opts) => gravar(nome, docId, data, opts) }; },
    add: async (data) => { const id = 'novo' + (++seq); gravar(nome, id, data); return { id }; },
  });
  const ctx = {
    COLLECTION: { dependencias: 'dependencias' },
    window: { USER_EMAIL: 'Op@fortestecnologia.com.br' },
    _db: {
      collection: col,
      batch: () => {
        const ops = [];
        lotes.push(ops);
        return { set: (ref, data, opts) => ops.push(() => gravar(ref._col, ref.id, data, opts)), commit: async () => ops.forEach((f) => f()) };
      },
    },
    _getAll: async (nome) => Object.entries(store[nome] || {}).map(([id, d]) => ({ id, ...d })),
  };
  vm.createContext(ctx);
  ['_minutosOuNull', '_lerDependencias', '_salvarDependencia', '_alterarSituacaoFornecedor', '_importarFornecedoresInativos'].forEach((f) => {
    vm.runInContext(extrair(f) + `\nthis.${f} = ${f};`, ctx);
  });
  return { ctx, store, lotes };
}

test('api: fornecedor sem o campo ativo e lido como ATIVO (os atuais continuam ativos)', async () => {
  const { ctx } = ambienteApi({ dependencias: { f1: { categoria: 'Fornecedores', nome: 'Antigo' }, f2: { categoria: 'Fornecedores', nome: 'Inat', ativo: false } } });
  const lidos = await ctx._lerDependencias();
  assert.strictEqual(lidos.find((d) => d.id === 'f1').ativo, true);
  assert.strictEqual(lidos.find((d) => d.id === 'f2').ativo, false);
});

test('api: salvar o cadastro SEM ativo/importacao no payload nao reativa nem apaga a referencia importada', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { f1: { categoria: 'Fornecedores', nome: 'X', ativo: false, importacao: { origem: 'p.csv', linhas: [{ numeracao: '1' }] } } } });
  await ctx._salvarDependencia({ id: 'f1', categoria: 'Fornecedores', nome: 'X S.A.' });
  assert.strictEqual(store.dependencias.f1.ativo, false);
  assert.strictEqual(store.dependencias.f1.importacao.linhas.length, 1);
  assert.strictEqual(store.dependencias.f1.nome, 'X S.A.');
});

test('api: alterarSituacaoFornecedor grava SO a situacao (merge), com quem e quando', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { f1: { categoria: 'Fornecedores', nome: 'X', cnpj: '1', pessoas: [{ nome: 'C' }], ativo: false } } });
  const r = await ctx._alterarSituacaoFornecedor({ id: 'f1', ativo: true });
  assert.deepStrictEqual(Object.keys(r.dado).sort(), ['ativo', 'situacaoAlteradaEm', 'situacaoAlteradaPor']);
  const d = store.dependencias.f1;
  assert.strictEqual(d.ativo, true);
  assert.strictEqual(d.cnpj, '1', 'o resto do documento fica');
  assert.strictEqual(d.pessoas.length, 1);
  assert.strictEqual(d.situacaoAlteradaPor, 'op@fortestecnologia.com.br');
  await assert.rejects(() => ctx._alterarSituacaoFornecedor({ ativo: true }), /não informado/);
});

test('api: importacao cria cada fornecedor INATIVO, categoria Fornecedores, com as linhas, em lotes de ate 400', async () => {
  const { ctx, store, lotes } = ambienteApi();
  const lista = Array.from({ length: 401 }, (_, i) => ({ nome: 'F' + i, cnpj: '', detalhes: 'd', importacao: { origem: 'p.csv', linhas: [{ numeracao: String(i) }] } }));
  lista[0].ativo = true; // a tela nunca manda, mas mesmo que mande, entra inativo
  const r = await ctx._importarFornecedoresInativos({ fornecedores: lista });
  assert.strictEqual(r.total, 401);
  assert.strictEqual(lotes.length, 2);
  const docs = Object.values(store.dependencias);
  assert.ok(docs.every((d) => d.ativo === false && d.categoria === 'Fornecedores'));
  assert.strictEqual(docs[0].importacao.origem, 'p.csv');
  assert.strictEqual(docs[0].importacao.importadoPor, 'op@fortestecnologia.com.br');
  assert.strictEqual(docs[0].importacao.linhas[0].numeracao, '0');
});

// ---------------------------------------------------------------
// Tela
// ---------------------------------------------------------------
const DEPS = [
  { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza' },
  { id: 'fa', categoria: 'Fornecedores', nome: 'Alfa Ativo' },
  { id: 'fb', categoria: 'Fornecedores', nome: 'Beta Ativo', ativo: true },
  { id: 'fi', categoria: 'Fornecedores', nome: 'Gama Inativo', ativo: false, situacaoAlteradaEm: '2026-10-27T10:00:00Z' },
  { id: 'fm', categoria: 'Fornecedores', nome: 'Delta Importado', ativo: false,
    importacao: { origem: 'Planilha.csv', importadoEm: '2026-10-27T10:00:00Z', importadoPor: 'op@x', cnpjRevisar: 'CNPJ ausente ou com tamanho errado',
      linhas: [{ numeracao: '7', descricao: 'Contrato de limpeza', prazo: '12 meses', setor: 'ADMINISTRATIVO', gestor: 'Ana', cnpj: 'não consta' }] } },
  { id: 's1', categoria: 'Servidor', nome: 'SRV-01' },
];
const STATUS = [{ id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  w.console.error = () => {};
  const chamadas = [];
  const dados = Object.assign({
    getDependencias: DEPS, getCriteriosFornecedor: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
    getCategoriasFornecedor: [], getSubcategoriasFornecedor: [], getCriticidadeFornecedorPerguntas: [],
    getAreas: [{ nome: 'Administrativo' }], getContratos: [], getStatusContrato: STATUS,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => (...args) => {
      if (nome === 'invalidate') return undefined;
      if (/^(salvar|alterar|importar)/.test(nome)) {
        chamadas.push({ nome, args: JSON.parse(JSON.stringify(args)) });
        if (nome === 'alterarSituacaoFornecedor') return Promise.resolve({ success: true, dado: { ativo: args[1], situacaoAlteradaEm: '2026-10-27T12:00:00Z', situacaoAlteradaPor: 'op@x' } });
        if (nome === 'importarFornecedoresInativos') return Promise.resolve({ success: true, total: args[0].length });
        return Promise.resolve({ success: true, id: 'novo-id', dado: {} });
      }
      return Promise.resolve(JSON.parse(JSON.stringify(dados[nome] || [])));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js', 'contrato-ciclo.js', 'cadeia-dependencias.js', 'inventario-csv.js', 'importacao-fornecedores.js']
    .forEach((f) => { if (fs.existsSync(path.join(PUB, f))) w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')); });
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  w.confirm = () => true;
  await w.fornecedores();
  return { w, doc: w.document, chamadas, $: (id) => w.document.getElementById(id) };
}
const empresas = (doc) => [...doc.querySelectorAll('#listaFornecedores tbody tr')].map((tr) => tr.children[0].firstChild.textContent.trim()).filter(Boolean).sort();
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('abas Ativos / Inativos com contador; Ativos e a padrao e nao mostra inativo', async () => {
  const { w, doc, $ } = await carregar(['admin']);
  assert.strictEqual($('contFornAba-ativos').textContent, '(2)');
  assert.strictEqual($('contFornAba-inativos').textContent, '(2)');
  assert.strictEqual($('tab-forn-lista-ativos').getAttribute('aria-selected'), 'true');
  assert.deepStrictEqual(empresas(doc), ['Alfa Ativo', 'Beta Ativo']);
  w.trocarAbaFornecedores('inativos');
  assert.deepStrictEqual(empresas(doc), ['Delta Importado', 'Gama Inativo']);
  assert.strictEqual($('tab-forn-lista-inativos').getAttribute('aria-selected'), 'true');
  assert.match(txt($('fornAbaAcoes')), /ficam aqui até alguém ativá-los/);
  assert.match($('fornAbaAcoes').innerHTML, /abrirImportacaoFornecedores/);
  assert.match(doc.getElementById('listaFornecedores').innerHTML, /· importado/);
});

test('aba Inativos: "Ativar" pede confirmacao, grava so a situacao e o fornecedor muda de aba', async () => {
  const { w, doc, $, chamadas } = await carregar(['operador']);
  w.trocarAbaFornecedores('inativos');
  assert.match(doc.getElementById('listaFornecedores').innerHTML, /alternarSituacaoFornecedor\('fi', true\)/);
  let pergunta = '';
  w.confirm = (m) => { pergunta = m; return true; };
  await w.alternarSituacaoFornecedor('fi', true);
  assert.match(pergunta, /Ativar "Gama Inativo"\?/);
  assert.deepStrictEqual(chamadas.map((c) => [c.nome, c.args]), [['alterarSituacaoFornecedor', ['fi', true]]]);
  assert.deepStrictEqual(empresas(doc), ['Delta Importado']);
  assert.strictEqual($('contFornAba-ativos').textContent, '(3)');
  w.confirm = () => false;
  await w.alternarSituacaoFornecedor('fm', true);
  assert.strictEqual(chamadas.length, 1, 'cancelou: nao grava');
});

test('inativar fornecedor com contrato vigente avisa quantos contratos ele tem', async () => {
  const { w } = await carregar(['admin'], { getContratos: [{ id: 'c1', codigo: 'CT-1', fornecedorId: 'fa', statusId: 's-vig' }] });
  let pergunta = '';
  w.confirm = (m) => { pergunta = m; return false; };
  await w.alternarSituacaoFornecedor('fa', false);
  assert.match(pergunta, /tem 1 contrato vigente/);
});

test('quem so consulta nao ve Importar nem Ativar', async () => {
  const { w, doc, $ } = await carregar(['gestor']);
  w.trocarAbaFornecedores('inativos');
  assert.doesNotMatch($('fornAbaAcoes').innerHTML, /abrirImportacaoFornecedores/);
  assert.doesNotMatch(doc.getElementById('listaFornecedores').innerHTML, /alternarSituacaoFornecedor/);
});

test('"Importar CSV" abre o drawer de importacao fora do drawer do fornecedor (nenhum drawer aninhado em outro)', async () => {
  // Regressao: um </div> faltando no drawer do fornecedor deixava o drawer de importacao
  // dentro dele (fechado e fora da tela) -- o clique abria um drawer invisivel.
  const { w, doc, $ } = await carregar(['operador']);
  w.trocarAbaFornecedores('inativos');
  doc.querySelectorAll('.drawer').forEach((d) => assert.equal(d.parentElement.closest('.drawer'), null, `${d.id} esta dentro de outro drawer`));
  assert.ok($('fornAbaAcoes').querySelector('button[onclick*="abrirImportacaoFornecedores"]'));
  w.abrirImportacaoFornecedores();
  assert.ok($('drawerImportarFornecedores').classList.contains('open'));
  assert.equal($('drawerFornecedorCadastro').contains($('drawerImportarFornecedores')), false);
});

test('drawer: barra de situacao com Ativar/Inativar e "Dados importados" so quando ha linhas', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('fm');
  assert.match(txt($('fornSituacaoBarra')), /Inativo.*Fica só na aba Inativos/);
  assert.match($('fornSituacaoBarra').innerHTML, /alternarSituacaoFornecedor\('fm', true\)/);
  const imp = txt($('fornDadosImportados'));
  assert.match(imp, /Dados importados da planilha \(1 linha\)/);
  assert.match(imp, /Importado de Planilha\.csv/);
  assert.match(imp, /CNPJ a revisar: CNPJ ausente ou com tamanho errado/);
  assert.match(imp, /Contrato de limpeza.*não consta.*12 meses.*ADMINISTRATIVO.*Ana/);
  assert.ok($('fornDadosImportados').querySelector('details').open, 'inativo: aberto por padrao');
  w.abrirDrawerFornecedorCadastro('fa');
  assert.match($('fornSituacaoBarra').innerHTML, /Inativar/);
  assert.strictEqual($('fornDadosImportados').innerHTML, '');
  w.abrirDrawerFornecedorCadastro();
  assert.strictEqual($('fornSituacaoBarra').innerHTML, '', 'fornecedor novo nasce ativo, sem barra');
});

const CSV = [
  'NUMERAÇÃO,FORNECEDOR,CNPJ DO FORNECEDOR,DESCRIÇÃO,SETOR RESPONSÁVEL,GESTOR',
  '1,NOVO UM LTDA,11.111.111/0001-11,Servico um,ADMINISTRATIVO,Ana Souza',
  '1.1,Novo Um Ltda.,11.111.111/0001-11,Aditivo,ADMINISTRATIVO,Ana Souza',
  '2,ALFA ATIVO,,Ja existe ativo,,',
  '3,GAMA INATIVO,,Ja existe inativo,,',
  '4,NOVO DOIS,não consta,Servico dois,,',
].join('\n');

test('importacao: previa agrupa, marca "ja existe" (ativo e inativo) e CNPJ a revisar; confirmar grava em lote e abre a aba Inativos', async () => {
  const { w, $, chamadas } = await carregar(['admin']);
  w.abrirImportacaoFornecedores();
  assert.ok($('drawerImportarFornecedores').classList.contains('open'));
  const p = w._processarImportFornecedores(CSV, 'Planilha.csv');
  assert.deepStrictEqual(plano(p.contagem), { linhas: 5, fornecedores: 4, novos: 2, existentes: 2, cnpjRevisar: 1 });
  const res = txt($('importFornResultado'));
  assert.match(res, /2 fornecedores novos \(entram inativos\)/);
  assert.match(res, /2 já existem na base/);
  assert.match(res, /Gama Inativo \(inativo\)/);
  assert.match(res, /CNPJ ausente ou com tamanho errado/);
  assert.strictEqual($('btnConfirmarImportFornecedores').textContent, 'Importar 2 fornecedores como inativos');
  await w.confirmarImportacaoFornecedores();
  const imp = chamadas.find((c) => c.nome === 'importarFornecedoresInativos').args[0];
  assert.deepStrictEqual(imp.map((x) => x.nome).sort(), ['NOVO DOIS', 'NOVO UM LTDA']);
  const um = imp.find((x) => x.nome === 'NOVO UM LTDA');
  assert.strictEqual(um.importacao.origem, 'Planilha.csv');
  assert.strictEqual(um.importacao.linhas.length, 2);
  assert.deepStrictEqual(um.areasRelacionadas, ['Administrativo']);
  assert.deepStrictEqual(um.pessoasRelacionadas, [{ id: 'p1', nome: 'Ana Souza', papel: 'Gestor (anterior ao contrato)' }]);
  assert.ok(!$('drawerImportarFornecedores').classList.contains('open'));
  assert.strictEqual($('tab-forn-lista-inativos').getAttribute('aria-selected'), 'true');
  assert.match(w.__toasts.join(' '), /2 fornecedores importados como inativos/);
});

test('importacao: arquivo sem a coluna do fornecedor nao deixa importar', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirImportacaoFornecedores();
  assert.strictEqual(w._processarImportFornecedores('A,B\n1,2', 'x.csv'), null);
  assert.match(txt($('importFornResultado')), /Não achei a coluna "Fornecedor"/);
  assert.strictEqual($('btnConfirmarImportFornecedores').style.display, 'none');
});

test('metricas do Dashboard de Terceiros contam so ativos', async () => {
  const { w } = await carregar(['admin']);
  const m = w._metricasFornecedores();
  assert.strictEqual(m[0].n, 2, 'fornecedores no catalogo = so ativos');
  assert.strictEqual(m.find((x) => x.t === 'Sem avaliação').n, 2);
});

test('DRP e processo BIA: fornecedor inativo nao e oferecido; digitar o nome dele avisa em vez de vincular', async () => {
  const { w } = await carregar(['admin']);
  w.eval("window.dependenciasCatalogo = " + JSON.stringify(DEPS.filter((d) => d.categoria !== 'Pessoas')) + "; window._depDrpDependenciasSel = []; window._dependenciaSelecionadas = [];");
  const nomes = [...w._drpDepCatalogoDisponivel('').map((d) => d.nome)].sort();
  assert.deepStrictEqual(nomes, ['Alfa Ativo', 'Beta Ativo', 'SRV-01']);
  assert.ok(w.CadeiaDependencias, 'cadeia-dependencias.js carregado');
  w.adicionarDependenciaCategoria('Gama Inativo', 'Fornecedores');
  assert.strictEqual(w._dependenciaSelecionadas.length, 0);
  assert.match(w.__toasts.join(' '), /"Gama Inativo" está inativo/);
});

test('contrato: o select de fornecedor nao oferece inativo, mas mantem o ja gravado marcado "(inativo)"', async () => {
  const { w } = await carregar(['admin'], {
    getContratos: [{ id: 'c1', codigo: 'CT-1', objeto: 'X', fornecedorId: 'fi', fornecedorNome: 'Gama Inativo', statusId: 's-vig', documentos: [], alertas: [] }],
  });
  await w.contratos();
  w.abrirDrawerContrato();
  const novo = [...w.document.getElementById('contratoFornecedor').options].map((o) => o.textContent);
  assert.ok(novo.some((t) => t.startsWith('Alfa Ativo')));
  assert.ok(!novo.some((t) => /Gama Inativo|Delta Importado/.test(t)), 'contrato novo: so ativos');
  w.abrirDrawerContrato('c1');
  const sel = w.document.getElementById('contratoFornecedor');
  assert.strictEqual(sel.value, 'fi');
  assert.match(sel.options[sel.selectedIndex].textContent, /Gama Inativo \(inativo\)/);
});
