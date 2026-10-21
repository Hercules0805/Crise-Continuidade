// Fornecedor (19/10/2026): gestor e área vêm dos CONTRATOS vigentes; seção "Áreas e
// pessoas relacionadas". Camada de dados (api.js com Firestore falso) + drawer (app.js
// real no jsdom) + relatório de vínculos da Pessoa.
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
  const col = (nome) => ({
    doc: (id) => ({ set: async (data, opts) => { store[nome] = store[nome] || {}; store[nome][id] = opts && opts.merge ? { ...(store[nome][id] || {}), ...data } : data; } }),
    add: async (data) => { const id = 'novo' + (++seq); store[nome] = store[nome] || {}; store[nome][id] = data; return { id }; },
  });
  const ctx = {
    COLLECTION: { dependencias: 'dependencias' },
    window: { USER_EMAIL: 'adm@fortestecnologia.com.br' },
    _db: { collection: col },
    _getAll: async (nome) => Object.entries(store[nome] || {}).map(([id, d]) => ({ id, ...d })),
  };
  vm.createContext(ctx);
  ['_minutosOuNull', '_refsDependencia', '_lerDependencias', '_salvarDependencia'].forEach((f) => { vm.runInContext(extrair(f) + `\nthis.${f} = ${f};`, ctx); });
  return { ctx, store };
}

const FORN_ANTIGO = {
  categoria: 'Fornecedores', nome: 'Alfa', setor: 'Jurídico', gestorContrato: 'Ana', endereco: 'Rua X',
  gestoresContrato: [{ id: 'p1', nome: 'Ana', cargo: 'Analista', telefone: '1', email: 'a@x', area: 'TI' }],
};

test('api: salvar o fornecedor SEM setor/gestor no payload nao apaga o dado antigo (merge)', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { f1: FORN_ANTIGO } });
  await ctx._salvarDependencia({ id: 'f1', categoria: 'Fornecedores', nome: 'Alfa S.A.', endereco: 'Rua Y',
    areasRelacionadas: ['TI'], pessoasRelacionadas: [{ id: 'p1', nome: 'Ana', papel: 'Usuário-chave' }] });
  const d = store.dependencias.f1;
  assert.strictEqual(d.nome, 'Alfa S.A.');
  assert.strictEqual(d.setor, 'Jurídico', 'setor antigo preservado ate a migracao');
  assert.strictEqual(d.gestorContrato, 'Ana');
  assert.strictEqual(d.gestoresContrato.length, 1);
  assert.deepStrictEqual(plano(d.areasRelacionadas), ['TI']);
  assert.deepStrictEqual(plano(d.pessoasRelacionadas), [{ id: 'p1', nome: 'Ana', papel: 'Usuário-chave' }]);
});

test('api: Pessoa e outras categorias continuam gravando o setor como antes', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { p1: { categoria: 'Pessoas', nome: 'Ana', setor: 'TI' } } });
  await ctx._salvarDependencia({ id: 'p1', categoria: 'Pessoas', nome: 'Ana', setor: 'RH', areas: ['RH'] });
  assert.strictEqual(store.dependencias.p1.setor, 'RH');
  await ctx._salvarDependencia({ id: 'p1', categoria: 'Pessoas', nome: 'Ana', areas: ['RH'] });
  assert.strictEqual(store.dependencias.p1.setor, '', 'comportamento de antes: sem setor no payload, grava vazio');
});

test('api: fornecedor novo sem setor nao grava setor; gestor so grava se vier no payload', async () => {
  const { ctx, store } = ambienteApi();
  const r = await ctx._salvarDependencia({ categoria: 'Fornecedores', nome: 'Novo' });
  assert.ok(!('setor' in store.dependencias[r.id]));
  assert.ok(!('gestoresContrato' in store.dependencias[r.id]));
  const r2 = await ctx._salvarDependencia({ categoria: 'Fornecedores', nome: 'Com gestor', gestoresContrato: [{ id: 'p9', nome: 'Z' }] });
  assert.strictEqual(store.dependencias[r2.id].gestoresContrato.length, 1, 'quem ainda manda gestor (migracao) continua gravando');
});

test('api: relacionados sao limpos (sem repetir area, sem item vazio) e lidos de volta', async () => {
  const { ctx } = ambienteApi();
  const r = await ctx._salvarDependencia({ categoria: 'Fornecedores', nome: 'F',
    areasRelacionadas: ['TI', ' TI ', '', 'RH'],
    pessoasRelacionadas: [{ id: 'p1', nome: ' Ana ', papel: 'Outro' }, { id: null, nome: '', papel: 'x' }, { id: null, nome: 'Sem cadastro', papel: '' }] });
  const lidos = (await ctx._lerDependencias()).find((d) => d.id === r.id);
  assert.deepStrictEqual(plano(lidos.areasRelacionadas), ['TI', 'RH']);
  assert.deepStrictEqual(plano(lidos.pessoasRelacionadas), [{ id: 'p1', nome: 'Ana', papel: 'Outro' }, { id: null, nome: 'Sem cadastro', papel: '' }]);
});

// ---------------------------------------------------------------
// Drawer do fornecedor
// ---------------------------------------------------------------
const DEPS = [
  { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', detalhes: 'Analista de TI', areas: ['TI', 'RH'], setor: 'TI' },
  { id: 'p2', categoria: 'Pessoas', nome: 'Bruno Lima', detalhes: 'Compras', setor: 'Financeiro' },
  { id: 'p3', categoria: 'Pessoas', nome: 'Carla Dias', detalhes: 'Jurídico', setor: 'Jurídico' },
  { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud', setor: 'Jurídico', gestorContrato: 'Antigo', gestoresContrato: [{ id: 'p3', nome: 'Carla Dias' }] },
  { id: 'f2', categoria: 'Fornecedores', nome: 'Beta Sem Contrato' },
];
const STATUS = [{ id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true }, { id: 's-enc', nome: 'Encerrado', situacao: 'encerrado', ativo: true }];
const ct = (id, extra) => Object.assign({ id, codigo: 'CT-' + id, fornecedorId: 'f1', statusId: 's-vig', gestor: null, area: '', documentos: [], alertas: [] }, extra);
const CONTRATOS = [
  ct('1', { gestor: { id: 'p1', nome: 'Ana Souza' }, area: 'TI' }),
  ct('2', { gestor: { id: 'p2', nome: 'Bruno Lima' }, area: 'Financeiro' }),
  ct('3', { statusId: 's-enc', gestor: { id: 'p3', nome: 'Carla Dias' }, area: 'Jurídico' }),
];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: DEPS, getCriteriosFornecedor: [], getAvaliacoesFornecedor: [], getConfigFornecedor: { limiarRisco: 70 },
    getCategoriasFornecedor: [], getSubcategoriasFornecedor: [], getCriticidadeFornecedorPerguntas: [],
    getAreas: [{ nome: 'TI' }, { nome: 'RH' }, { nome: 'Jurídico' }, { nome: 'Financeiro' }],
    getContratos: CONTRATOS, getStatusContrato: STATUS,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (nome === 'invalidate') return undefined;
      if (/^salvar/.test(nome)) {
        gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) });
        return { success: true, id: (arg && arg.id) || 'novo-id', dado: { ...(arg || {}) } };
      }
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.fornecedores();
  return { w, doc: w.document, gravacoes, $: (id) => w.document.getElementById(id) };
}
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('drawer: a secao "Dados do contratante" (gestor e setor manuais) saiu', async () => {
  const { w, doc, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f1');
  assert.strictEqual($('fornCadSetor'), null);
  assert.strictEqual($('gestorContratoBusca'), null);
  assert.strictEqual($('gestoresContratoTabela'), null);
  assert.doesNotMatch(txt(doc.getElementById('painel-forn-dados')), /Dados do contratante|Setor responsável pelo contrato/);
});

test('gestao pelos contratos: uma linha por contrato VIGENTE, so leitura, contrato encerrado e dado legado nao aparecem', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f1');
  const bloco = $('fornGestaoContratos');
  assert.strictEqual(bloco.querySelectorAll('tbody tr').length, 2);
  const t = txt(bloco);
  assert.match(t, /CT-1.*Ana Souza.*TI/);
  assert.match(t, /CT-2.*Bruno Lima.*Financeiro/);
  assert.doesNotMatch(t, /CT-3|Carla Dias|Antigo|Jurídico/);
  assert.strictEqual(bloco.querySelectorAll('input, select, button').length, 0, 'somente leitura');
  assert.match(bloco.querySelector('tbody tr').getAttribute('onclick'), /abrirContratoDoFornecedor/);
});

test('gestao pelos contratos: contrato vigente sem gestor mostra o selo; sem vigente mostra o aviso e "+ Novo contrato"', async () => {
  const semGestor = await carregar(['admin'], { getContratos: [ct('9', { area: 'TI' })] });
  semGestor.w.abrirDrawerFornecedorCadastro('f1');
  assert.match(txt(semGestor.$('fornGestaoContratos')), /Sem gestor/);

  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f2');
  assert.match(txt($('fornGestaoContratos')), /Nenhum contrato vigente: o gestor e o setor vêm do contrato/);
  assert.match($('fornGestaoContratos').innerHTML, /novoContratoDoFornecedor/);

  w.abrirDrawerFornecedorCadastro();
  assert.match(txt($('fornGestaoContratos')), /Salve o fornecedor para vincular contratos/);
});

test('areas relacionadas: adicionar e remover, sem repetir, e a lista de opcoes esconde as ja escolhidas', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f2');
  assert.match(txt($('fornAreasRelChips')), /Nenhuma área relacionada/);
  $('fornAreaRelAdd').value = 'TI';
  w.adicionarAreaRelFornecedor();
  $('fornAreaRelAdd').value = 'RH';
  w.adicionarAreaRelFornecedor();
  assert.deepStrictEqual([...w._fornAreasRel], ['TI', 'RH']);
  assert.deepStrictEqual([...$('fornAreaRelAdd').options].map((o) => o.value), ['', 'Financeiro', 'Jurídico']);
  w.removerAreaRelFornecedor(0);
  assert.deepStrictEqual([...w._fornAreasRel], ['RH']);
  assert.ok([...$('fornAreaRelAdd').options].some((o) => o.value === 'TI'), 'TI volta para as opcoes');
  w.adicionarAreaRelFornecedor();
  assert.match(w.__toasts.join(' '), /Escolha uma área/);
});

test('pessoas relacionadas: exige pessoa e papel, nao repete a pessoa, troca o papel e remove', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f2');
  w.adicionarPessoaRelFornecedor();
  assert.match(w.__toasts.join(' '), /Selecione uma pessoa/);
  $('fornPessoaRelAdd').value = 'p1';
  w.adicionarPessoaRelFornecedor();
  assert.match(w.__toasts.join(' '), /Escolha o papel/);
  $('fornPessoaRelPapel').value = 'Usuário-chave';
  w.adicionarPessoaRelFornecedor();
  assert.strictEqual(w._fornPessoasRel.length, 1);
  const linha = txt($('fornPessoasRelTabela'));
  assert.match(linha, /Ana Souza.*Analista de TI.*TI, RH/, 'cargo e areas vem do cadastro da Pessoa');
  assert.ok(![...$('fornPessoaRelAdd').options].some((o) => o.value === 'p1'), 'pessoa ja relacionada sai das opcoes');
  w.mudarPapelPessoaRelFornecedor(0, 'Aprovador/Patrocinador');
  assert.strictEqual(w._fornPessoasRel[0].papel, 'Aprovador/Patrocinador');
  w.removerPessoaRelFornecedor(0);
  assert.strictEqual(w._fornPessoasRel.length, 0);
});

test('pessoas relacionadas: pessoa removida do cadastro e pessoa sem cadastro aparecem marcadas', async () => {
  const deps = DEPS.map((d) => (d.id === 'f2' ? { ...d, pessoasRelacionadas: [
    { id: 'p-sumiu', nome: 'Saiu da Empresa', papel: 'Outro' },
    { id: null, nome: 'Migrada Sem Cadastro', papel: 'Gestor (anterior ao contrato)' },
  ] } : d));
  const { w, $ } = await carregar(['admin'], { getDependencias: deps });
  w.abrirDrawerFornecedorCadastro('f2');
  const t = txt($('fornPessoasRelTabela'));
  assert.match(t, /Saiu da Empresa \(removida\)/);
  assert.match(t, /Migrada Sem Cadastro \(sem cadastro\)/);
  assert.match($('fornPessoasRelTabela').innerHTML, /<option value="Gestor \(anterior ao contrato\)" selected(="")?>/);
});

test('salvar: envia areasRelacionadas e pessoasRelacionadas, e NAO envia setor nem gestor', async () => {
  const { w, $, gravacoes } = await carregar(['admin']);
  w.abrirDrawerFornecedorCadastro('f1');
  $('fornAreaRelAdd').value = 'RH';
  w.adicionarAreaRelFornecedor();
  $('fornPessoaRelAdd').value = 'p2';
  $('fornPessoaRelPapel').value = 'Financeiro/Compras';
  w.adicionarPessoaRelFornecedor();
  assert.strictEqual(await w.salvarFornecedorCadastro(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarDependencia').arg;
  assert.deepStrictEqual(g.areasRelacionadas, ['RH']);
  assert.deepStrictEqual(g.pessoasRelacionadas, [{ id: 'p2', nome: 'Bruno Lima', papel: 'Financeiro/Compras' }]);
  ['setor', 'gestorContrato', 'gestoresContrato'].forEach((k) => assert.ok(!(k in g), `${k} nao pode ir no payload`));
});

test('quem so consulta ve tudo sem controles: sem selects, sem x, sem linha de adicionar', async () => {
  const deps = DEPS.map((d) => (d.id === 'f1' ? { ...d, areasRelacionadas: ['TI'], pessoasRelacionadas: [{ id: 'p1', nome: 'Ana Souza', papel: 'Usuário-chave' }] } : d));
  const { w, doc, $ } = await carregar(['gestor'], { getDependencias: deps });
  w.abrirDrawerFornecedorCadastro('f1');
  doc.querySelectorAll('#drawerFornecedorCadastro .forn-rel-adicionar').forEach((el) => assert.strictEqual(el.style.display, 'none'));
  assert.doesNotMatch($('fornAreasRelChips').innerHTML, /removerAreaRelFornecedor/);
  assert.strictEqual($('fornPessoasRelTabela').querySelectorAll('select, button').length, 0);
  assert.match(txt($('fornPessoasRelTabela')), /Usuário-chave/);
});

// ---------------------------------------------------------------
// Relatório de vínculos da Pessoa
// ---------------------------------------------------------------
test('relatorio da pessoa: fornecedores em que e gestora de contrato vigente ou pessoa relacionada, com a relacao', async () => {
  const { w } = await carregar(['admin']);
  const deps = DEPS.map((d) => (d.id === 'f2' ? { ...d, pessoasRelacionadas: [{ id: 'p1', nome: 'Ana Souza', papel: 'Responsável técnico' }] } : d));
  const pessoa = deps.find((d) => d.id === 'p1');
  const base = { processos: [], deps, riscos: [], indicadores: [], backups: [], perfis: [], areas: [], produtos: [] };
  const html = w._buildRelatorioPessoaPage(pessoa, { ...base, contratos: CONTRATOS, statusContratos: STATUS });
  assert.match(html, /<h2>Fornecedores<\/h2>/);
  assert.match(html, /Alfa Cloud<\/b><\/td><td>Gestor do contrato CT-1/);
  assert.match(html, /Beta Sem Contrato<\/b><\/td><td>Pessoa relacionada — Responsável técnico/);
  assert.doesNotMatch(html, /Os contratos não puderam ser lidos/);
  // Gestora de contrato ENCERRADO nao conta.
  const carla = deps.find((d) => d.id === 'p3');
  assert.doesNotMatch(w._buildRelatorioPessoaPage(carla, { ...base, contratos: CONTRATOS, statusContratos: STATUS }), /<h2>Fornecedores<\/h2>/);
});

test('relatorio da pessoa: sem acesso aos contratos, mostra so as relacoes por pessoa relacionada e avisa', async () => {
  const { w } = await carregar(['admin']);
  const deps = DEPS.map((d) => (d.id === 'f2' ? { ...d, pessoasRelacionadas: [{ id: 'p1', nome: 'Ana Souza', papel: 'Usuário-chave' }] } : d));
  const html = w._buildRelatorioPessoaPage(deps.find((d) => d.id === 'p1'),
    { processos: [], deps, riscos: [], indicadores: [], backups: [], perfis: [], areas: [], produtos: [], contratos: null, statusContratos: null });
  assert.match(html, /Beta Sem Contrato<\/b><\/td><td>Pessoa relacionada — Usuário-chave/);
  assert.doesNotMatch(html, /Alfa Cloud/);
  assert.match(html, /Os contratos não puderam ser lidos com o seu perfil/);
});

// ---------------------------------------------------------------
// Excluir Pessoa: o aviso conta onde ela esta em uso
// ---------------------------------------------------------------
test('excluir pessoa: o aviso diz de quantos contratos ela e gestora e a quantos fornecedores esta relacionada', async () => {
  const deps = DEPS.map((d) => (d.id === 'f2' ? { ...d, pessoasRelacionadas: [{ id: 'p1', nome: 'Ana Souza', papel: 'Outro' }] } : d));
  const { w } = await carregar(['admin'], { getDependencias: deps });
  w.eval("pessoasData = [{ id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza' }]");
  let aviso = '';
  w.confirm = (m) => { aviso = m; return false; };
  await w.excluirPessoaCadastro('p1');
  assert.match(aviso, /Esta pessoa é gestora de 1 contrato e está relacionada a 1 fornecedor\./);
  aviso = '';
  w.eval("pessoasData = [{ id: 'p3', categoria: 'Pessoas', nome: 'Carla Dias' }]");
  await w.excluirPessoaCadastro('p3');
  assert.match(aviso, /Esta pessoa é gestora de 1 contrato\. Onde ela/, 'conta qualquer contrato que aponte para ela, inclusive o encerrado');
  aviso = '';
  w.eval("pessoasData = [{ id: 'p2', categoria: 'Pessoas', nome: 'Bruno Lima' }]");
  await w.excluirPessoaCadastro('p2');
  assert.match(aviso, /Esta pessoa é gestora de 1 contrato\./);
  aviso = '';
  w.eval("pessoasData = [{ id: 'p-solta', categoria: 'Pessoas', nome: 'Pessoa Solta' }]");
  await w.excluirPessoaCadastro('p-solta');
  assert.doesNotMatch(aviso, /Esta pessoa/, 'sem uso, sem a frase');
});
