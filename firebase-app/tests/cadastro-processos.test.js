// Cadastro de Processos (28/10/2026): cadastro geral dos processos das areas
// (Area, Processo, Categoria, Criador, Aprovador, Links, "Avaliar em
// Continuidade"). Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const ANA = { id: 'ana', nome: 'Ana', categoria: 'Pessoas', areas: ['TI'] };
const BRUNO = { id: 'bruno', nome: 'Bruno', categoria: 'Pessoas', areas: ['RH'] };
// Categorias de Processo (29/10/2026): cadastro proprio; o processo guarda categoriaId.
const CATS = [
  { id: 'departamental', nome: 'Departamental', ativo: true, ordem: 1, finalidade: 'Rotina de uma área só.', criteriosIdentificacao: 'Um responsável.', exemplos: 'Ponto.' },
  { id: 'intersetorial', nome: 'Intersetorial', ativo: false, ordem: 2, finalidade: '', criteriosIdentificacao: '', exemplos: '' },
  { id: 'processo-de-negocio', nome: 'Processo de Negócio', ativo: true, ordem: 3, finalidade: 'Valor ao cliente.', criteriosIdentificacao: '', exemplos: '' },
];
const FOLHA = { id: 'ti__folha', area: 'TI', processo: 'Folha', categoriaId: 'processo-de-negocio', continuidade: true, criadorId: 'ana', aprovadorId: 'bruno',
  links: [{ titulo: 'Fluxo', url: 'https://wiki/folha' }], avaliado: true };
const PONTO = { id: 'rh__ponto', area: 'RH', processo: 'Ponto', categoriaId: 'departamental', continuidade: false, criadorId: '', aprovadorId: '', links: [] };
const COMPRAS = { id: 'ti__compras', area: 'TI', processo: 'Compras', categoriaId: 'intersetorial', continuidade: false, criadorId: 'sumiu', aprovadorId: '', links: [] };

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: [ANA, BRUNO], getAreas: [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'RH' }],
    getProcessosCadastro: [FOLHA, PONTO, COMPRAS], getCategoriasProcesso: CATS,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'subareas.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.cadastroProcessos();
  return { w, doc: w.document, gravacoes };
}

const linhas = (doc) => [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')]
  .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | '));
// Objetos do jsdom vem de outro realm: compara pelo JSON.
const links = (w) => JSON.parse(JSON.stringify(w._edLinksProcesso.paraGravar()));
const mudar = (doc, id, valor) => { const el = doc.getElementById(id); el.value = valor; el.dispatchEvent(new doc.defaultView.Event('change')); };

test('lista todos os processos (dentro e fora de Continuidade), com categoria, pessoas, links e Continuidade', async () => {
  const { doc } = await carregar(['admin']);
  const l = linhas(doc);
  assert.strictEqual(l.length, 3);
  const folha = l.find((t) => t.includes('Folha'));
  assert.match(folha, /Processo de Negócio \| Ana \| Bruno \| 1 \| Sim/);
  assert.match(l.find((t) => t.includes('Ponto')), /Departamental \| – \| – \| – \| Não/);
  assert.match(l.find((t) => t.includes('Compras')), /\(pessoa removida\)/);
  assert.match(doc.getElementById('cadastroProcessosContador').textContent, /3 processos/);
  assert.ok(doc.getElementById('btnNovoCadastroProcesso'));
});

test('filtros de Categoria e Continuidade', async () => {
  const { w, doc } = await carregar(['admin']);
  // Filtro pelo id, com as opções do cadastro (inativa marcada).
  assert.ok([...doc.getElementById('filtroCadProcCategoria').options].some((o) => o.value === 'intersetorial' && /\(inativa\)/.test(o.textContent)));
  doc.getElementById('filtroCadProcCategoria').value = 'departamental';
  w.filtrarCadastroProcessos();
  assert.deepStrictEqual(linhas(doc).map((t) => t.includes('Ponto')), [true]);
  doc.getElementById('filtroCadProcCategoria').value = '';
  doc.getElementById('filtroCadProcContinuidade').value = 'sim';
  w.filtrarCadastroProcessos();
  assert.strictEqual(linhas(doc).length, 1);
  assert.match(linhas(doc)[0], /Folha/);
});

test('Gestor ve so a propria area, com o filtro travado', async () => {
  const { doc } = await carregar(['gestor']);
  assert.ok(doc.getElementById('filtroCadProcArea').disabled);
  const l = linhas(doc);
  assert.strictEqual(l.length, 2);
  assert.ok(l.every((t) => !t.includes('Ponto')));
});

test('Operador Administrativo so consulta: sem "+ Novo processo" e formulario travado', async () => {
  const { w, doc } = await carregar(['operador']);
  assert.strictEqual(doc.getElementById('btnNovoCadastroProcesso'), null);
  w.abrirDrawerCadastroProcesso('ti__folha');
  assert.ok(doc.getElementById('cadProcNome').disabled);
  assert.strictEqual(doc.getElementById('btnSalvarCadastroProcesso').style.display, 'none');
  assert.strictEqual(doc.getElementById('cadProcLinkForm').style.display, 'none');
});

test('novo processo: grava area, nome, categoria, criador, aprovador, links e Continuidade', async () => {
  const { w, doc, gravacoes } = await carregar(['operador_processos']);
  w.abrirDrawerCadastroProcesso();
  assert.strictEqual(doc.getElementById('cadProcCategoria').value, 'processo-de-negocio', 'categoria padrão');
  // Inativa não é oferecida para processo novo.
  assert.ok(![...doc.getElementById('cadProcCategoria').options].some((o) => o.value === 'intersetorial'));
  assert.strictEqual(doc.getElementById('cadProcContinuidade').checked, false, 'novo nasce fora de Continuidade');
  mudar(doc, 'cadProcArea', 'RH');
  // Pessoas da área primeiro.
  assert.strictEqual(doc.querySelector('#cadProcCriador optgroup').label, 'Da área RH');
  doc.getElementById('cadProcNome').value = 'Admissão';
  doc.getElementById('cadProcCategoria').value = 'departamental';
  doc.getElementById('cadProcCriador').value = 'bruno';
  doc.getElementById('cadProcAprovador').value = 'ana';
  doc.getElementById('cadProcContinuidade').checked = true;
  doc.getElementById('cadProcLinkTitulo').value = 'Procedimento';
  doc.getElementById('cadProcLinkUrl').value = 'https://wiki/admissao';
  w._edLinksProcesso.adicionar();
  assert.match(doc.getElementById('cadProcLinkLista').textContent, /Procedimento/);
  assert.strictEqual(await w.salvarCadastroProcesso(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.deepStrictEqual(g, {
    id: null, area: 'RH', subarea: null, processo: 'Admissão', categoriaId: 'departamental', criadorId: 'bruno', aprovadorId: 'ana',
    continuidade: true, links: [{ titulo: 'Procedimento', url: 'https://wiki/admissao' }],
  });
});

test('links: URL invalida ou repetida e recusada; editar e remover', async () => {
  const { w, doc } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso('ti__folha');
  doc.getElementById('cadProcLinkUrl').value = 'wiki/sem-protocolo';
  w._edLinksProcesso.adicionar();
  doc.getElementById('cadProcLinkUrl').value = 'https://WIKI/folha/';
  w._edLinksProcesso.adicionar();
  assert.deepStrictEqual(links(w), [{ titulo: 'Fluxo', url: 'https://wiki/folha' }]);
  assert.ok(w.__toasts.some((t) => /URL válida/.test(t)));
  assert.ok(w.__toasts.some((t) => /já está na lista/.test(t)));
  w._edLinksProcesso.editar(0);
  doc.getElementById('cadProcLinkTitulo').value = 'Fluxograma';
  w._edLinksProcesso.adicionar();
  assert.deepStrictEqual(links(w), [{ titulo: 'Fluxograma', url: 'https://wiki/folha' }]);
  w._edLinksProcesso.remover(0);
  assert.deepStrictEqual(links(w), []);
});

test('nome repetido na mesma area e recusado', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso();
  mudar(doc, 'cadProcArea', 'TI');
  doc.getElementById('cadProcNome').value = ' folha ';
  assert.strictEqual(await w.salvarCadastroProcesso(), false);
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarProcesso'));
});

test('tirar de Continuidade um processo com BIA pede confirmacao; recusar nao grava', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  const perguntas = [];
  w.confirm = (m) => { perguntas.push(m); return false; };
  w.abrirDrawerCadastroProcesso('ti__folha');
  doc.getElementById('cadProcContinuidade').checked = false;
  assert.strictEqual(await w.salvarCadastroProcesso(), false);
  assert.match(perguntas[0], /Tirar "Folha" de Continuidade\?[\s\S]*são mantidos/);
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarProcesso'));
  w.confirm = () => true;
  assert.strictEqual(await w.salvarCadastroProcesso(), true);
  assert.strictEqual(gravacoes.find((x) => x.nome === 'salvarProcesso').arg.continuidade, false);
});

test('marcar Continuidade num processo sem BIA nao pergunta nada', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  w.confirm = () => { throw new Error('nao devia perguntar'); };
  w.abrirDrawerCadastroProcesso('rh__ponto');
  doc.getElementById('cadProcContinuidade').checked = true;
  assert.strictEqual(await w.salvarCadastroProcesso(), true);
  assert.strictEqual(gravacoes.find((x) => x.nome === 'salvarProcesso').arg.continuidade, true);
});

test('excluir processo de Continuidade avisa que ele sai de la tambem', async () => {
  const { w, gravacoes } = await carregar(['admin']);
  const perguntas = [];
  w.confirm = (m) => { perguntas.push(m); return true; };
  await w.excluirCadastroProcesso('ti__folha');
  assert.match(perguntas[0], /também sai de Continuidade/);
  assert.strictEqual(gravacoes.find((x) => x.nome === 'excluirProcesso').arg, 'ti__folha');
});

test('deep link #cadastro-processos?processo=<id> abre o processo', async () => {
  const dom = await carregar(['admin']);
  dom.w.location.hash = '#cadastro-processos?processo=rh__ponto';
  await dom.w.cadastroProcessos();
  assert.ok(dom.doc.getElementById('drawerCadastroProcesso').classList.contains('open'));
  assert.strictEqual(dom.doc.getElementById('cadProcNome').value, 'Ponto');
});

test('categoria: ajuda com finalidade, criterios e exemplos da escolhida; muda com a escolha', async () => {
  const { w, doc } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso();
  const ajuda = doc.getElementById('cadProcCategoriaAjuda');
  assert.match(ajuda.textContent, /Finalidade\s*Valor ao cliente\./);
  assert.doesNotMatch(ajuda.textContent, /Critérios/, 'sem texto, a parte nao aparece');
  mudar(doc, 'cadProcCategoria', 'departamental');
  assert.match(ajuda.textContent, /Rotina de uma área só\.[\s\S]*Critérios de identificação\s*Um responsável\.[\s\S]*Exemplos\s*Ponto\./);
  mudar(doc, 'cadProcCategoria', '');
  assert.strictEqual(ajuda.style.display, 'none');
});

test('categoria inativa continua no processo que ja a usa, marcada; sem categoria nao salva', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso('ti__compras');
  const sel = doc.getElementById('cadProcCategoria');
  assert.strictEqual(sel.value, 'intersetorial');
  assert.match(sel.options[sel.selectedIndex].textContent, /Intersetorial \(inativa\)/);
  sel.value = '';
  assert.strictEqual(await w.salvarCadastroProcesso(), false);
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarProcesso'));
});
