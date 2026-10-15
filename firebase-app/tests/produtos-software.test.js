// Catalogo de Produtos de Software + lideranca da Pessoa (Tech Lead / Team Lead).
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
  ['_lerProdutosSoftware', '_nomeComparavel', '_salvarProdutoSoftware', '_lerDependencias', '_salvarDependencia'].forEach((f) => {
    vm.runInContext(extrair(f) + `\nthis.${f} = ${f};`, ctx);
  });
  vm.runInContext('const _CAMPOS_PRODUTO_SOFTWARE = ["nome", "ativo", "ordem"]; this._CAMPOS_PRODUTO_SOFTWARE = _CAMPOS_PRODUTO_SOFTWARE;', ctx);
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
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js']
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

test('pagina: novo produto grava nome e ativo; erro (duplicado) aparece e o modal continua aberto', async () => {
  const { w, calls, toasts, doc } = await abrirPagina(['admin']);
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'Fortes Doc';
  await w.salvarProdutoSoftware();
  assert.deepStrictEqual(plano(calls.salvarProdutoSoftware[0][0]), { id: null, nome: 'Fortes Doc', ativo: true });
  assert.ok(!doc.getElementById('modalProdutoSoftware').classList.contains('open'));

  w.__falhaSalvar = 'Já existe um produto chamado "Fortes Doc".';
  w.abrirModalProdutoSoftware();
  doc.getElementById('prodSoftNome').value = 'fortes doc';
  await w.salvarProdutoSoftware();
  assert.ok(toasts.some((t) => /Já existe um produto/.test(t)));
  assert.ok(doc.getElementById('modalProdutoSoftware').classList.contains('open'), 'o modal nao pode fechar com erro');
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
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js']
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
  assert.match(s, /Produtos de Software \(Tech Lead \/ Team Lead\)/);
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
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'sanitizar-pcn.js']
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
