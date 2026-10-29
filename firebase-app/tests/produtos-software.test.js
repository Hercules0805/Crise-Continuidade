// Catalogo de Produtos de Software + funcoes da Pessoa (Tech Lead / Team Lead / Product Owner).
// Camada de dados (api.js, com Firestore falso) e a pagina do catalogo (app.js real no jsdom).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const apiSrc = fs.readFileSync(path.join(PUB, 'api.js'), 'utf8');
// Objetos criados dentro de vm/jsdom vêm de outro 'mundo': compara pela forma (JSON).
const plano = (x) => JSON.parse(JSON.stringify(x));

// Extrai uma funcao top-level do api.js pelo nome (casa as chaves).
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
    COLLECTION: { produtosSoftware: 'produtos_software', dependencias: 'dependencias' },
    window: { USER_EMAIL: 'Adm@fortestecnologia.com.br' },
    _db: { collection: col },
    _getAll: async (nome) => Object.entries(store[nome] || {}).map(([id, d]) => ({ id, ...d })),
  };
  vm.createContext(ctx);
  ['_lerProdutosSoftware', '_endpointsLidos', '_nomeComparavel', '_salvarProdutoSoftware', '_minutosOuNull', '_refsDependencia', '_lerDependencias', '_salvarDependencia'].forEach((f) => {
    vm.runInContext(extrair(f) + `\nthis.${f} = ${f};`, ctx);
  });
  vm.runInContext('const _CAMPOS_PRODUTO_SOFTWARE = ["nome", "area", "descricao", "endpoints", "ativo", "ordem"]; this._CAMPOS_PRODUTO_SOFTWARE = _CAMPOS_PRODUTO_SOFTWARE;', ctx);
  return { ctx, store };
}

test('produto novo: grava nome limpo, ativo e ordem; criadoPor em minuscula', async () => {
  const { ctx, store } = ambienteApi();
  const r = await ctx._salvarProdutoSoftware({ nome: '  Fortes   Ponto ', ativo: true });
  assert.strictEqual(r.success, true);
  const d = store.produtos_software[r.id];
  assert.strictEqual(d.nome, 'Fortes Ponto');
  assert.strictEqual(d.ativo, true);
  assert.ok(d.ordem > 0 && d.criadoEm && d.atualizadoEm);
  assert.strictEqual(d.criadoPor, 'adm@fortestecnologia.com.br');
});

test('produto: nome vazio e nome duplicado (sem acento/maiuscula) sao recusados', async () => {
  const { ctx } = ambienteApi({ produtos_software: { p1: { nome: 'Fortes Gestão', ativo: true, ordem: 1 } } });
  await assert.rejects(() => ctx._salvarProdutoSoftware({ nome: '   ' }), /Informe o nome/);
  await assert.rejects(() => ctx._salvarProdutoSoftware({ nome: 'FORTES GESTAO' }), /Já existe um produto chamado "Fortes Gestão"/);
  await assert.rejects(() => ctx._salvarProdutoSoftware({ nome: 'fortes   gestão', id: 'outro' }), /Já existe/);
});

test('produto: editar a si mesmo (mesmo nome) e desativar funciona', async () => {
  const { ctx, store } = ambienteApi({ produtos_software: { p1: { nome: 'Colabore', ativo: true, ordem: 5 } } });
  await ctx._salvarProdutoSoftware({ id: 'p1', nome: 'Colabore', ativo: false });
  assert.strictEqual(store.produtos_software.p1.ativo, false);
  assert.strictEqual(store.produtos_software.p1.ordem, 5);
});

test('descricao: grava, lê (vazia em registro antigo) e é preservada ao editar só o nome', async () => {
  const { ctx, store } = ambienteApi({ produtos_software: { p1: { nome: 'Colabore', ativo: true, ordem: 1 } } });
  assert.strictEqual((await ctx._lerProdutosSoftware())[0].descricao, '');
  await ctx._salvarProdutoSoftware({ id: 'p1', nome: 'Colabore', descricao: 'Plataforma de colaboração' });
  assert.strictEqual(store.produtos_software.p1.descricao, 'Plataforma de colaboração');
  await ctx._salvarProdutoSoftware({ id: 'p1', nome: 'Colabore 2' });
  assert.strictEqual(store.produtos_software.p1.descricao, 'Plataforma de colaboração');
  assert.strictEqual((await ctx._lerProdutosSoftware())[0].descricao, 'Plataforma de colaboração');
});

test('pagina: o campo Descrição abre preenchido, sujo ao digitar, e vai no payload', async () => {
  const { w, calls, doc } = await abrirPagina(['admin']);
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'Fortes Doc';
  doc.getElementById('prodSoftDescricao').value = '  Gestão de documentos ';
  await w.salvarProdutoSoftware();
  assert.strictEqual(calls.salvarProdutoSoftware[0][0].descricao, 'Gestão de documentos');
});

test('leitura: ordena por ordem e depois por nome; ativo padrao verdadeiro', async () => {
  const { ctx } = ambienteApi({ produtos_software: {
    a: { nome: 'Zeta', ordem: 1 }, b: { nome: 'Alfa', ordem: 2, ativo: false }, c: { nome: 'Beta', ordem: 1 },
  } });
  const lista = await ctx._lerProdutosSoftware();
  assert.deepStrictEqual(lista.map((p) => p.nome), ['Beta', 'Zeta', 'Alfa']);
  assert.deepStrictEqual(lista.map((p) => p.ativo), [true, true, false]);
});

test('pessoa: gravar so com liderança no payload; sem ela, NAO zera o que ja existe', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', categoria: 'Pessoas', techLead: true, techLeadProdutos: ['ps1'] } } });
  // Fornecedor/Dependencia regravam o documento sem mandar os campos novos.
  await ctx._salvarDependencia({ id: 'pe1', categoria: 'Pessoas', nome: 'Ana B' });
  assert.strictEqual(store.dependencias.pe1.nome, 'Ana B');
  assert.strictEqual(store.dependencias.pe1.techLead, true, 'techLead nao pode ser zerado');
  assert.deepStrictEqual(plano(store.dependencias.pe1.techLeadProdutos), ['ps1']);
});

test('pessoa: liderança normalizada (sem duplicata, produtos so da funcao marcada)', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', categoria: 'Pessoas' } } });
  await ctx._salvarDependencia({
    id: 'pe1', categoria: 'Pessoas', nome: 'Ana',
    techLead: true, techLeadProdutos: ['ps1', 'ps1', 'ps2', ''],
    teamLead: false, teamLeadProdutos: ['ps9'],
  });
  const d = store.dependencias.pe1;
  assert.strictEqual(d.techLead, true);
  assert.deepStrictEqual(plano(d.techLeadProdutos), ['ps1', 'ps2']);
  assert.strictEqual(d.teamLead, false);
  assert.deepStrictEqual(plano(d.teamLeadProdutos), [], 'desmarcar a funcao nao deixa produto orfao');
});

test('pessoa: tirar as duas funcoes grava false/vazio (limpa de verdade)', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', techLead: true, techLeadProdutos: ['ps1'], teamLead: true, teamLeadProdutos: ['ps2'] } } });
  await ctx._salvarDependencia({ id: 'pe1', categoria: 'Pessoas', nome: 'Ana', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [] });
  const d = store.dependencias.pe1;
  assert.deepStrictEqual(plano([d.techLead, d.techLeadProdutos, d.teamLead, d.teamLeadProdutos]), [false, [], false, []]);
});

test('leitura da pessoa: registro antigo sem os campos vem sem lideranca', async () => {
  const { ctx } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', categoria: 'Pessoas' } } });
  const [p] = await ctx._lerDependencias();
  assert.deepStrictEqual(plano([p.techLead, p.techLeadProdutos, p.teamLead, p.teamLeadProdutos]), [false, [], false, []]);
});

// ---------------------------------------------------------------- pagina do catalogo (jsdom)
async function abrirPagina(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const calls = {};
  const retornos = {
    getProdutosSoftware: [
      { id: 'ps1', nome: 'Fortes Ponto', ativo: true, ordem: 1 },
      { id: 'ps2', nome: 'Fortes RH', ativo: false, ordem: 2 },
    ],
    getDependencias: [
      { id: 'pe1', categoria: 'Pessoas', nome: 'Ana', techLead: true, techLeadProdutos: ['ps1'], teamLead: false, teamLeadProdutos: [] },
      { id: 'pe2', categoria: 'Pessoas', nome: 'Bia', techLead: false, techLeadProdutos: [], teamLead: true, teamLeadProdutos: ['ps1'] },
      { id: 'pe3', categoria: 'Pessoas', nome: 'Caio', techLead: true, techLeadProdutos: ['ps1'], teamLead: true, teamLeadProdutos: [] },
    ],
    ...extra,
  };
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.alert = () => {};
  w.USER_PERFIS = perfis;
  w.__confirmou = [];
  w.confirm = (m) => { w.__confirmou.push(m); return true; };
  w.API = new Proxy({}, { get: (_, nome) => async (...a) => {
    (calls[nome] = calls[nome] || []).push(a);
    if (nome === 'salvarProdutoSoftware' && w.__falhaSalvar) throw new Error(w.__falhaSalvar);
    if (retornos[nome] !== undefined) return JSON.parse(JSON.stringify(retornos[nome]));
    return /^salvar/.test(nome) ? { success: true, id: 'novo' } : [];
  } });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  const toasts = [];
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8')
    + '\n;window.__t = { toasts: null, rodar: async () => { showToast = (m) => { window.__toasts.push(m); }; await produtosSoftware(); } };');
  w.__toasts = toasts;
  await w.__t.rodar();
  return { w, calls, toasts, doc: w.document };
}

test('pagina: lista os produtos, mostra Tech Lead e Team Lead de cada um e o status', async () => {
  const { doc } = await abrirPagina(['admin']);
  const linhas = [...doc.querySelectorAll('#listaProdutosSoftware tbody tr')];
  assert.strictEqual(linhas.length, 2);
  const ponto = linhas.find((l) => /Fortes Ponto/.test(l.textContent));
  assert.match(ponto.textContent, /Ana, Caio/);
  assert.match(ponto.textContent, /Bia/);
  assert.match(ponto.textContent, /Ativo/);
  assert.match(linhas.find((l) => /Fortes RH/.test(l.textContent)).textContent, /Inativo/);
});

test('pagina: Admin e Segurança veem os botoes de gerenciar; quem so le, nao', async () => {
  for (const perfil of [['admin'], ['seguranca']]) {
    const { doc } = await abrirPagina(perfil);
    assert.strictEqual(doc.getElementById('btnNovoProdutoSoftware').style.display, 'inline-block', perfil[0]);
    assert.ok(doc.querySelector('#listaProdutosSoftware button[title="Excluir"]'), perfil[0]);
  }
  const { doc } = await abrirPagina(['gestor']);
  assert.strictEqual(doc.getElementById('btnNovoProdutoSoftware').style.display, 'none');
  assert.strictEqual(doc.querySelector('#listaProdutosSoftware button[title="Excluir"]'), null);
});

test('pagina: novo produto grava nome, area e ativo; erro (duplicado) aparece e o drawer continua aberto', async () => {
  const { w, calls, toasts, doc } = await abrirPagina(['admin']);
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'Fortes Doc';
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarProdutoSoftware[0][0]), { id: null, nome: 'Fortes Doc', area: '', descricao: '', endpoints: [], ativo: true });
  assert.ok(doc.getElementById('drawerProdutoSoftware').classList.contains('open'), 'Salvar mantem o drawer (padrao Fechar + Salvar)');
  assert.strictEqual(doc.getElementById('modalProdutoSoftwareTitulo').textContent, 'Editar Produto');

  w.__falhaSalvar = 'Já existe um produto chamado "Fortes Doc".';
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'fortes doc';
  await w.salvarProdutoSoftware();
  assert.ok(toasts.some((t) => /Já existe um produto/.test(t)));
  assert.ok(doc.getElementById('drawerProdutoSoftware').classList.contains('open'), 'o drawer nao pode fechar com erro');
});

test('pagina: excluir avisa quantas pessoas estao associadas', async () => {
  const { w, calls } = await abrirPagina(['admin']);
  await w.excluirProdutoSoftware('ps1');
  assert.match(w.__confirmou[0], /3 pessoas estão associadas/);
  assert.match(w.__confirmou[0], /desativar em vez de excluir/);
  assert.deepStrictEqual(plano(calls.excluirProdutoSoftware[0]), ['ps1']);
});

test('pagina: excluir produto sem ninguem associado nao fala de pessoas', async () => {
  const { w } = await abrirPagina(['admin']);
  await w.excluirProdutoSoftware('ps2');
  assert.ok(!/pessoa/.test(w.__confirmou[0].split('\n\n')[0]));
});

// ---------------------------------------------------------------- Relatorio de Vinculos da Pessoa
async function montarRelatorio(pessoa, produtos, extraDados) {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin'];
  w.API = new Proxy({}, { get: () => async () => [] });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;window.__montar = (p, d) => _buildRelatorioPessoaPage(p, d);');
  const base = { processos: [], deps: [{ id: pessoa.id, categoria: 'Pessoas', nome: pessoa.nome }], riscos: [], indicadores: [], backups: [], perfis: [], areas: [], produtos };
  const html = w.__montar(pessoa, { ...base, ...(extraDados || {}) });
  w.close();
  return html;
}

const CATALOGO = [
  { id: 'ps1', nome: 'Fortes Ponto', ativo: true },
  { id: 'ps2', nome: 'Fortes AC Pessoal', ativo: true },
  { id: 'ps3', nome: 'Antigo', ativo: false },
];
const pessoaBase = { id: 'pe1', nome: 'Marília Paiva', email: 'm@x.com', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [] };
const secao = (html) => (html.match(/<h2>Produtos de Software[\s\S]*?<\/table>/) || [''])[0];

test('relatorio: Tech Lead de 2 produtos e Team Lead de 1 deles = 2 linhas, funcoes juntas, ordem por nome', async () => {
  const html = await montarRelatorio({ ...pessoaBase, techLead: true, techLeadProdutos: ['ps1', 'ps2'], teamLead: true, teamLeadProdutos: ['ps1'] }, CATALOGO);
  const s = secao(html);
  assert.match(s, /Produtos de Software \(funções\)/);
  assert.strictEqual((s.match(/<tr><td>/g) || []).length, 2);
  assert.ok(s.indexOf('Fortes AC Pessoal') < s.indexOf('Fortes Ponto'), 'ordenado por nome');
  assert.match(s, /<b>Fortes AC Pessoal<\/b><\/td><td>Tech Lead<\/td>/);
  assert.match(s, /<b>Fortes Ponto<\/b><\/td><td>Tech Lead \+ Team Lead<\/td>/);
  assert.ok(!/Nenhum vínculo operacional/.test(html));
});

test('relatorio: Team Lead de um produto (caso da Marilia) mostra o produto', async () => {
  const html = await montarRelatorio({ ...pessoaBase, teamLead: true, teamLeadProdutos: ['ps2'] }, CATALOGO);
  assert.match(secao(html), /<b>Fortes AC Pessoal<\/b><\/td><td>Team Lead<\/td>/);
});

test('relatorio: funcao marcada sem produto aparece como vinculo, sem produto associado', async () => {
  const html = await montarRelatorio({ ...pessoaBase, techLead: true }, CATALOGO);
  assert.match(secao(html), /— \(sem produto associado\)<\/b><\/td><td>Tech Lead<\/td>/);
  assert.ok(!/Nenhum vínculo operacional/.test(html), 'ser Tech Lead ja e um vinculo');
});

test('relatorio: produto inativo e produto removido continuam aparecendo', async () => {
  const html = await montarRelatorio({ ...pessoaBase, techLead: true, techLeadProdutos: ['ps3', 'ps-sumiu'] }, CATALOGO);
  const s = secao(html);
  assert.match(s, /Antigo \(inativo\)/);
  assert.match(s, /\(produto removido\)/);
});

test('relatorio: se o catalogo nao carregar, os ids viram "produto removido" e o relatorio sai', async () => {
  const html = await montarRelatorio({ ...pessoaBase, teamLead: true, teamLeadProdutos: ['ps1'] }, undefined);
  assert.match(secao(html), /\(produto removido\)/);
});

test('relatorio: pessoa sem lideranca nao tem a secao e segue dizendo que nao ha vinculo', async () => {
  const html = await montarRelatorio(pessoaBase, CATALOGO);
  assert.strictEqual(secao(html), '');
  assert.match(html, /Nenhum vínculo operacional encontrado/);
});

test('relatorio: nome de produto com HTML sai escapado', async () => {
  const html = await montarRelatorio({ ...pessoaBase, techLead: true, techLeadProdutos: ['x'] }, [{ id: 'x', nome: '<img src=x onerror=alert(1)>', ativo: true }]);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('relatorio: gerarRelatorioPessoa busca o catalogo e o repassa ao relatorio', async () => {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const chamadas = [];
  const escrito = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin'];
  w.open = () => ({ document: { write: (h) => escrito.push(h), open() {}, close() {} } });
  w.API = new Proxy({}, { get: (_, nome) => async () => {
    chamadas.push(nome);
    if (nome === 'getProdutosSoftware') return [{ id: 'ps1', nome: 'Fortes Ponto', ativo: true }];
    if (nome === 'getDependencias') return [{ id: 'pe1', categoria: 'Pessoas', nome: 'Ana' }];
    return [];
  } });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;window.__gerar = (p) => gerarRelatorioPessoa(p);');
  await w.__gerar({ id: 'pe1', nome: 'Ana', techLead: true, techLeadProdutos: ['ps1'] });
  assert.ok(chamadas.includes('getProdutosSoftware'));
  assert.match(escrito.join(''), /<b>Fortes Ponto<\/b><\/td><td>Tech Lead<\/td>/);
  w.close();
});

// ---------------------------------------------------------------- Relatorio: processos de que a pessoa e DONA
const allan = { id: 'pe-allan', nome: 'Allan Rodrigues Lima', email: 'a@x.com', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [] };
const PROCESSOS = [
  { id: 'p1', area: 'Comercial Corporativo', processo: 'Negociação Vendas', bcpContatos: [], dependenciaItens: [] },
  { id: 'p2', area: 'Comercial Corporativo', processo: 'Fechamento de Vendas', bcpContatos: [], dependenciaItens: [] },
  { id: 'p3', area: 'Financeiro', processo: 'Contas a Pagar', bcpContatos: [], dependenciaItens: [] },
  { id: 'p4', area: 'TI', processo: 'Backup', bcpContatos: [], dependenciaItens: [] },
];
const AREAS = [
  { id: 'a1', nome: 'Comercial Corporativo', responsavel: 'Allan Rodrigues Lima' },
  { id: 'a2', nome: 'Financeiro', responsavel: 'Fabiana Alves' },
  { id: 'a3', nome: 'TI', responsavel: 'Kaique' },
];
const secaoProcessos = (html) => (html.match(/<h2>Processos de Negócio<\/h2>[\s\S]*?<\/table>/) || [''])[0];
const linhasProcessos = (html) => [...secaoProcessos(html).matchAll(/<tr><td>([^<]*)<\/td><td><b>([^<]*)<\/b><td>?([^<]*)/g)];

test('relatorio/dono: responsavel de uma area lista os processos dela como "Dono do Processo"', async () => {
  const html = await montarRelatorio(allan, [], { processos: PROCESSOS, areas: AREAS });
  const s = secaoProcessos(html);
  assert.ok(s, 'a secao Processos de Negócio deveria aparecer');
  assert.match(s, /Negociação Vendas/);
  assert.match(s, /Fechamento de Vendas/);
  assert.strictEqual((s.match(/Dono do Processo/g) || []).length, 2);
  assert.ok(!/Contas a Pagar|Backup/.test(s), 'processos de outras areas nao entram');
  assert.ok(!/Nenhum vínculo operacional/.test(html));
});

test('relatorio/dono: ordenado por area e depois por processo', async () => {
  const html = await montarRelatorio(allan, [], { processos: PROCESSOS, areas: AREAS });
  const s = secaoProcessos(html);
  assert.ok(s.indexOf('Fechamento de Vendas') < s.indexOf('Negociação Vendas'), 'Fechamento antes de Negociação');
});

test('relatorio/dono: quem e dono e tambem contato de crise tem os vinculos somados na mesma linha', async () => {
  const processos = PROCESSOS.map((p) => (p.id === 'p1' ? { ...p, bcpContatos: ['pe-allan'] } : p));
  const html = await montarRelatorio(allan, [], { processos, areas: AREAS });
  const s = secaoProcessos(html);
  assert.match(s, /Negociação Vendas<\/b><\/td><td>Dono do Processo \+ Contato de Crise<\/td>/);
  assert.match(s, /Fechamento de Vendas<\/b><\/td><td>Dono do Processo<\/td>/);
  assert.strictEqual((s.match(/Negociação Vendas/g) || []).length, 1, 'o processo aparece uma vez so');
});

test('relatorio/dono: processo de outra area em que a pessoa e so Contato de Crise continua aparecendo', async () => {
  const processos = PROCESSOS.map((p) => (p.id === 'p3' ? { ...p, bcpContatos: ['pe-allan'] } : p));
  const html = await montarRelatorio(allan, [], { processos, areas: AREAS });
  assert.match(secaoProcessos(html), /Contas a Pagar<\/b><\/td><td>Contato de Crise<\/td>/);
});

test('relatorio/dono: o vinculo de dono vem antes na lista, sem duplicar o de Dependencia Critica', async () => {
  const processos = PROCESSOS.map((p) => (p.id === 'p2' ? { ...p, dependenciaItens: [{ id: 'pe-allan', nome: 'Allan Rodrigues Lima', categoria: 'Pessoas' }] } : p));
  const html = await montarRelatorio(allan, [], { processos, areas: AREAS });
  assert.match(secaoProcessos(html), /Fechamento de Vendas<\/b><\/td><td>Dono do Processo \+ Dependência Crítica<\/td>/);
});

test('relatorio/dono: pessoa que nao e responsavel de nenhuma area nao ganha processos de dono', async () => {
  const bia = { id: 'pe-bia', nome: 'Bia Souza', email: 'b@x.com', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [] };
  const html = await montarRelatorio(bia, [], { processos: PROCESSOS, areas: AREAS });
  assert.strictEqual(secaoProcessos(html), '');
  assert.match(html, /Nenhum vínculo operacional encontrado/);
});

test('relatorio/dono: responsavel de area SEM processos continua sem a secao de processos (mas a area aparece)', async () => {
  const html = await montarRelatorio(allan, [], { processos: [], areas: AREAS });
  assert.strictEqual(secaoProcessos(html), '');
  assert.match(html, /<h2>Áreas<\/h2>/);
});

test('relatorio/dono: dono de mais de uma area lista os processos de todas, por area', async () => {
  const areas = AREAS.map((a) => (a.id === 'a3' ? { ...a, responsavel: 'Allan Rodrigues Lima' } : a));
  const html = await montarRelatorio(allan, [], { processos: PROCESSOS, areas });
  const s = secaoProcessos(html);
  assert.match(s, /Backup/);
  assert.ok(s.indexOf('Fechamento de Vendas') < s.indexOf('Backup'), 'Comercial Corporativo antes de TI');
});

test('relatorio/dono: nome de processo com HTML sai escapado', async () => {
  const processos = [{ id: 'px', area: 'Comercial Corporativo', processo: '<img src=x onerror=alert(1)>', bcpContatos: [], dependenciaItens: [] }];
  const html = await montarRelatorio(allan, [], { processos, areas: AREAS });
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// ---------------------------------------------------------------- Product Owner e area responsavel (27/10/2026)
test('pessoa: Product Owner grava como as outras funcoes (sem repetido; desmarcar limpa)', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', categoria: 'Pessoas' } } });
  const base = { id: 'pe1', categoria: 'Pessoas', nome: 'Ana', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [] };
  await ctx._salvarDependencia({ ...base, productOwner: true, productOwnerProdutos: ['ps1', 'ps1', ''] });
  assert.deepStrictEqual(plano([store.dependencias.pe1.productOwner, store.dependencias.pe1.productOwnerProdutos]), [true, ['ps1']]);
  await ctx._salvarDependencia({ ...base, productOwner: false, productOwnerProdutos: ['ps1'] });
  assert.deepStrictEqual(plano([store.dependencias.pe1.productOwner, store.dependencias.pe1.productOwnerProdutos]), [false, []]);
});

test('produto: area responsavel grava e le; produto antigo vem sem area', async () => {
  const { ctx, store } = ambienteApi({ produtos_software: { velho: { nome: 'Antigo', ativo: true } } });
  const r = await ctx._salvarProdutoSoftware({ nome: 'Fortes Ponto', area: 'Produto', ativo: true });
  assert.strictEqual(store.produtos_software[r.id].area, 'Produto');
  const lidos = await ctx._lerProdutosSoftware();
  assert.strictEqual(lidos.find((p) => p.id === 'velho').area, '');
  assert.strictEqual(lidos.find((p) => p.id === r.id).area, 'Produto');
});

test('vinculos pela tela de Produtos: um lote; vincular liga a funcao, desvincular so tira o produto; funcao fora da lista recusa', async () => {
  const sets = [];
  const ctx = {
    COLLECTION: { dependencias: 'dependencias' },
    window: { USER_EMAIL: 'Adm@X' },
    firebase: { firestore: { FieldValue: { arrayUnion: (v) => ({ union: v }), arrayRemove: (v) => ({ remove: v }) } } },
    _db: {
      collection: () => ({ doc: (id) => ({ id }) }),
      batch: () => ({ set: (ref, data, opts) => sets.push({ id: ref.id, data, opts }), commit: async () => sets.push('commit') }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext("const FUNCOES_PRODUTO_PESSOA = ['techLead', 'teamLead', 'productOwner'];\n" + extrair('_salvarVinculosProdutoPessoas') + '\nthis.f = _salvarVinculosProdutoPessoas;', ctx);
  const r = await ctx.f('ps1', [{ pessoaId: 'pe1', funcao: 'productOwner', vinculado: true }, { pessoaId: 'pe2', funcao: 'techLead', vinculado: false }]);
  assert.strictEqual(r.gravadas, 2);
  assert.strictEqual(sets[0].id, 'pe1');
  assert.strictEqual(sets[0].data.productOwner, true);
  assert.deepStrictEqual(plano(sets[0].data.productOwnerProdutos), { union: 'ps1' });
  assert.strictEqual(sets[0].data.atualizadoPor, 'adm@x');
  assert.deepStrictEqual(plano(sets[0].opts), { merge: true });
  assert.deepStrictEqual(plano(sets[1].data.techLeadProdutos), { remove: 'ps1' });
  assert.strictEqual(sets[1].data.techLead, undefined, 'desvincular mantem a funcao');
  assert.strictEqual(sets[2], 'commit');
  await assert.rejects(() => ctx.f('ps1', [{ pessoaId: 'pe1', funcao: 'admin', vinculado: true }]), /Função inválida/);
  assert.deepStrictEqual(plano(await ctx.f('ps1', [])), { success: true, gravadas: 0 });
});

const PESSOAS_PO = [
  { id: 'pe1', categoria: 'Pessoas', nome: 'Ana', areas: ['TI'], techLead: true, techLeadProdutos: ['ps1'], teamLead: false, teamLeadProdutos: [] },
  { id: 'pe2', categoria: 'Pessoas', nome: 'Bia', areas: ['Produto'], productOwner: true, productOwnerProdutos: ['ps1'] },
  { id: 'pe3', categoria: 'Pessoas', nome: 'Caio', areas: ['Produto'] },
  { id: 'pe4', categoria: 'Pessoas', nome: 'Duda', areas: ['RH'] },
];
const PRODUTOS_AREA = [
  { id: 'ps1', nome: 'Fortes Ponto', area: 'Produto', ativo: true, ordem: 1 },
  { id: 'ps2', nome: 'Fortes RH', area: 'Área Antiga', ativo: true, ordem: 2 },
];
const comAreas = { getDependencias: PESSOAS_PO, getProdutosSoftware: PRODUTOS_AREA, getAreas: [{ nome: 'Produto' }, { nome: 'TI' }] };

test('pagina: colunas Area responsavel e Product Owner; filtro por area', async () => {
  const { w, doc } = await abrirPagina(['admin'], comAreas);
  const cab = [...doc.querySelectorAll('#listaProdutosSoftware thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim());
  assert.deepStrictEqual(cab.slice(0, 5), ['Produto', 'Área responsável', 'Tech Lead', 'Team Lead', 'Product Owner']);
  const ponto = [...doc.querySelectorAll('#listaProdutosSoftware tbody tr')].find((l) => /Fortes Ponto/.test(l.textContent));
  assert.match(ponto.textContent, /Produto[\s\S]*Ana[\s\S]*Bia/);
  const filtro = doc.getElementById('filtroProdutoArea');
  assert.deepStrictEqual([...filtro.options].map((o) => o.value), ['', 'Área Antiga', 'Produto', '__sem__']);
  filtro.value = 'Produto';
  w.filtrarProdutosSoftware();
  assert.strictEqual(doc.querySelectorAll('#listaProdutosSoftware tbody tr').length, 1);
});

test('drawer: area gravada (e fora do cadastro marcada); pessoas por funcao, as da area primeiro; salva so o que mudou', async () => {
  const { w, calls, doc } = await abrirPagina(['seguranca'], comAreas);
  w.abrirModalProdutoSoftware('ps2');
  assert.match(doc.getElementById('prodSoftArea').selectedOptions[0].textContent, /Área Antiga \(fora do cadastro\)/);
  w.abrirModalProdutoSoftware('ps1');
  assert.strictEqual(doc.getElementById('prodSoftArea').value, 'Produto');
  const bloco = (f) => doc.querySelector(`[data-funcao-produto="${f}"]`);
  assert.match(bloco('techLead').textContent, /Ana/);
  assert.match(bloco('productOwner').textContent, /Bia/);
  const primeiro = bloco('productOwner').querySelector('optgroup');
  assert.strictEqual(primeiro.label, 'Da área Produto');
  assert.deepStrictEqual([...primeiro.querySelectorAll('option')].map((o) => o.textContent), ['Caio — Produto'], 'a da area primeiro; quem ja e PO nao aparece');
  w.adicionarPessoaAoProduto('productOwner', 'pe3');
  w.removerPessoaDoProduto('techLead', 'pe1');
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarVinculosProdutoPessoas[0]), ['ps1', [
    { pessoaId: 'pe1', funcao: 'techLead', vinculado: false },
    { pessoaId: 'pe3', funcao: 'productOwner', vinculado: true },
  ]]);
  const ponto = [...doc.querySelectorAll('#listaProdutosSoftware tbody tr')].find((l) => /Fortes Ponto/.test(l.textContent));
  assert.match(ponto.textContent, /Bia, Caio/, 'a lista ja reflete');
  assert.doesNotMatch(ponto.textContent, /Ana/);
  await w.salvarProdutoSoftware();
  assert.strictEqual(calls.salvarVinculosProdutoPessoas.length, 1, 'salvar de novo sem mudar nao grava vinculos');
});

test('drawer: produto novo grava os vinculos com o id criado; quem so le nao ve os selects', async () => {
  const { w, calls, doc } = await abrirPagina(['admin'], comAreas);
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'Fortes Doc';
  w.adicionarPessoaAoProduto('teamLead', 'pe4');
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarVinculosProdutoPessoas[0]), ['novo', [{ pessoaId: 'pe4', funcao: 'teamLead', vinculado: true }]]);

  const so = await abrirPagina(['gestor'], comAreas);
  so.w.abrirModalProdutoSoftware('ps1');
  assert.strictEqual(so.doc.querySelectorAll('#prodSoftPessoas select').length, 0);
  assert.ok(so.doc.getElementById('prodSoftNome').disabled);
});

// ---------------------------------------------------------------- Liderança de Suporte (27/10/2026)
test('pessoa: Liderança de Suporte grava e limpa como as outras funcoes', async () => {
  const { ctx, store } = ambienteApi({ dependencias: { pe1: { nome: 'Ana', categoria: 'Pessoas' } } });
  const base = { id: 'pe1', categoria: 'Pessoas', nome: 'Ana', techLead: false, techLeadProdutos: [], teamLead: false, teamLeadProdutos: [], productOwner: false, productOwnerProdutos: [] };
  await ctx._salvarDependencia({ ...base, liderSuporte: true, liderSuporteProdutos: ['ps1', 'ps1'] });
  assert.deepStrictEqual(plano([store.dependencias.pe1.liderSuporte, store.dependencias.pe1.liderSuporteProdutos]), [true, ['ps1']]);
  await ctx._salvarDependencia({ ...base, liderSuporte: false, liderSuporteProdutos: ['ps1'] });
  assert.deepStrictEqual(plano([store.dependencias.pe1.liderSuporte, store.dependencias.pe1.liderSuporteProdutos]), [false, []]);
});

test('produtos: coluna e bloco de Liderança de Suporte; vincular grava a funcao liderSuporte', async () => {
  const pessoas = [
    { id: 'pe1', categoria: 'Pessoas', nome: 'Ana', areas: ['Suporte'], liderSuporte: true, liderSuporteProdutos: ['ps1'] },
    { id: 'pe2', categoria: 'Pessoas', nome: 'Beto', areas: ['Suporte'] },
  ];
  const { w, calls, doc } = await abrirPagina(['admin'], { getDependencias: pessoas, getProdutosSoftware: [{ id: 'ps1', nome: 'Fortes Ponto', ativo: true, ordem: 1 }] });
  const cab = [...doc.querySelectorAll('#listaProdutosSoftware thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim());
  assert.ok(cab.includes('Liderança de Suporte'));
  assert.match(doc.querySelector('#listaProdutosSoftware tbody tr').textContent, /Ana/);
  w.abrirModalProdutoSoftware('ps1');
  const bloco = doc.querySelector('[data-funcao-produto="liderSuporte"]');
  assert.match(bloco.textContent, /Liderança de Suporte[\s\S]*Ana/);
  w.adicionarPessoaAoProduto('liderSuporte', 'pe2');
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarVinculosProdutoPessoas[0]), ['ps1', [{ pessoaId: 'pe2', funcao: 'liderSuporte', vinculado: true }]]);
});

// ---------------------------------------------------------------- endpoints do produto (28/10/2026)
const COM_ENDPOINT = { getProdutosSoftware: [
  { id: 'ps1', nome: 'Conecta', ativo: true, ordem: 1, endpoints: [{ url: 'https://conecta.fortes.com.br', ambiente: 'Produção', descricao: 'Portal do cliente' }] },
  { id: 'ps2', nome: 'Fortes RH', ativo: true, ordem: 2 },
] };
const endpointsNaTela = (doc) => [...doc.querySelectorAll('#prodSoftEndpointsTabela a')].map((a) => a.getAttribute('href'));
const digitarEndpoint = (doc, url, ambiente, descricao) => {
  doc.getElementById('prodSoftEndpointUrl').value = url;
  doc.getElementById('prodSoftEndpointAmbiente').value = ambiente || '';
  doc.getElementById('prodSoftEndpointDescricao').value = descricao || '';
};

test('endpoints: leitura normaliza (sem lista vira [], item sem URL sai) e gravacao preserva ao editar so o nome', async () => {
  const { ctx, store } = ambienteApi({ produtos_software: {
    p1: { nome: 'Conecta', endpoints: [{ url: 'https://a.x' }, { url: '' }, null] }, p2: { nome: 'RH' },
  } });
  const lista = await ctx._lerProdutosSoftware();
  assert.deepStrictEqual(plano(lista.find((p) => p.id === 'p1').endpoints), [{ url: 'https://a.x', ambiente: '', descricao: '' }]);
  assert.deepStrictEqual(plano(lista.find((p) => p.id === 'p2').endpoints), []);
  await ctx._salvarProdutoSoftware({ id: 'p1', nome: 'Conecta 2' });
  assert.strictEqual(store.produtos_software.p1.endpoints.length, 3, 'sem endpoints no payload, nao mexe');
});

test('endpoints: o drawer lista os gravados com link, ambiente e descricao', async () => {
  const { w, doc } = await abrirPagina(['admin'], COM_ENDPOINT);
  w.abrirModalProdutoSoftware('ps1');
  assert.deepStrictEqual(endpointsNaTela(doc), ['https://conecta.fortes.com.br']);
  const tabela = doc.getElementById('prodSoftEndpointsTabela');
  assert.match(tabela.textContent, /Produção/);
  assert.match(tabela.textContent, /Portal do cliente/);
  assert.strictEqual(tabela.querySelector('a').getAttribute('target'), '_blank');
  w.abrirModalProdutoSoftware('ps2');
  assert.match(doc.getElementById('prodSoftEndpointsTabela').textContent, /Nenhum endpoint cadastrado/);
});

test('endpoints: adicionar valida URL http(s) e recusa repetida (sem caixa e sem barra final)', async () => {
  const { w, doc } = await abrirPagina(['admin'], COM_ENDPOINT);
  w.abrirModalProdutoSoftware('ps1');
  digitarEndpoint(doc, 'conecta.fortes.com.br');
  w.adicionarEndpointProduto();
  digitarEndpoint(doc, 'ftp://arquivos.x');
  w.adicionarEndpointProduto();
  digitarEndpoint(doc, 'HTTPS://CONECTA.FORTES.COM.BR/');
  w.adicionarEndpointProduto();
  assert.deepStrictEqual(endpointsNaTela(doc), ['https://conecta.fortes.com.br'], 'nada invalido ou repetido entrou');
  digitarEndpoint(doc, '  https://api.conecta.fortes.com.br/v1  ', 'Homologação', 'API');
  w.adicionarEndpointProduto();
  assert.deepStrictEqual(endpointsNaTela(doc), ['https://conecta.fortes.com.br', 'https://api.conecta.fortes.com.br/v1']);
  assert.strictEqual(doc.getElementById('prodSoftEndpointUrl').value, '', 'formulario limpa depois de adicionar');
});

test('endpoints: editar no formulario de cima, cancelar, remover; tudo vai no Salvar', async () => {
  const { w, doc, calls } = await abrirPagina(['admin'], COM_ENDPOINT);
  w.abrirModalProdutoSoftware('ps1');
  digitarEndpoint(doc, 'https://hml.conecta.fortes.com.br', 'Homologação');
  w.adicionarEndpointProduto();

  w.editarEndpointProduto(0);
  assert.strictEqual(doc.getElementById('prodSoftEndpointUrl').value, 'https://conecta.fortes.com.br');
  assert.strictEqual(doc.getElementById('btnAdicionarEndpointProduto').textContent, 'Salvar alteração');
  doc.getElementById('prodSoftEndpointDescricao').value = 'Portal novo';
  w.adicionarEndpointProduto();
  assert.strictEqual(doc.getElementById('btnAdicionarEndpointProduto').textContent, '+ Adicionar');

  w.editarEndpointProduto(1);
  w.cancelarEdicaoEndpointProduto();
  assert.strictEqual(doc.getElementById('prodSoftEndpointUrl').value, '');

  w.removerEndpointProduto(1);
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarProdutoSoftware[0][0].endpoints), [
    { url: 'https://conecta.fortes.com.br', ambiente: 'Produção', descricao: 'Portal novo' },
  ]);
});

test('endpoints: mexer na lista suja o drawer; abrir e fechar sem mexer nao grava', async () => {
  const { w, calls } = await abrirPagina(['admin'], COM_ENDPOINT);
  w.abrirModalProdutoSoftware('ps1');
  // O rastreador de edicao compara esta foto do formulario: a lista de endpoints faz parte dela.
  const antes = JSON.stringify(w._coletarFormularioProdutoSoftware());
  w.removerEndpointProduto(0);
  assert.notStrictEqual(JSON.stringify(w._coletarFormularioProdutoSoftware()), antes);
  w.abrirModalProdutoSoftware('ps1');
  assert.strictEqual(JSON.stringify(w._coletarFormularioProdutoSoftware()), antes, 'reabrir descarta a mudanca nao salva');
  await w.fecharModalProdutoSoftware();
  w.abrirModalProdutoSoftware('ps2');
  await w.fecharModalProdutoSoftware();
  assert.ok(!calls.salvarProdutoSoftware, 'nada gravado');
});

test('endpoints: quem so le ve a lista sem o formulario e sem editar/remover', async () => {
  const { w, doc } = await abrirPagina(['gestor'], COM_ENDPOINT);
  w.abrirModalProdutoSoftware('ps1');
  assert.deepStrictEqual(endpointsNaTela(doc), ['https://conecta.fortes.com.br']);
  assert.strictEqual(doc.getElementById('prodSoftEndpointForm').style.display, 'none');
  assert.strictEqual(doc.querySelectorAll('#prodSoftEndpointsTabela .btn-icon').length, 0);
});

test('endpoints: a busca da lista acha o produto pela URL', async () => {
  const { w, doc } = await abrirPagina(['admin'], COM_ENDPOINT);
  doc.getElementById('buscaProdutoSoftware').value = 'conecta.fortes';
  w.renderizarProdutosSoftware();
  const linhas = [...doc.querySelectorAll('#listaProdutosSoftware tbody tr')];
  assert.strictEqual(linhas.length, 1);
  assert.match(linhas[0].textContent, /Conecta/);
});
