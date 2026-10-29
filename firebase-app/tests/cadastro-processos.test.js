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
  links: [{ titulo: 'Fluxo', url: 'https://wiki/folha' }], avaliado: true, descricaoFuncional: 'Paga os colaboradores.' };
const PONTO = { id: 'rh__ponto', area: 'RH', processo: 'Ponto', categoriaId: 'departamental', continuidade: false, criadorId: '', aprovadorId: '', links: [] };
const COMPRAS = { id: 'ti__compras', area: 'TI', processo: 'Compras', categoriaId: 'intersetorial', continuidade: false, criadorId: 'sumiu', aprovadorId: '', links: [] };

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: [ANA, BRUNO], getAreas: [{ id: 'a1', nome: 'TI', responsavel: 'Carla' }, { id: 'a2', nome: 'RH' }],
    getProcessosCadastro: [FOLHA, PONTO, COMPRAS], getCategoriasProcesso: CATS,
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
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
    id: null, area: 'RH', processo: 'Admissão', categoriaId: 'departamental', descricaoFuncional: '', criadorId: 'bruno', aprovadorId: 'ana',
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

// Herdados (29/10/2026): o cadastro principal mostra o Dono (responsavel da
// Area) e edita a Descricao Funcional; Processos de Negocio so mostra.
test('Dono do processo vem do responsavel da area e acompanha a troca de area', async () => {
  const { doc, w } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso('ti__folha');
  assert.strictEqual(doc.getElementById('cadProcDono').value, 'Carla');
  assert.ok(doc.getElementById('cadProcDono').readOnly);
  mudar(doc, 'cadProcArea', 'RH');
  assert.strictEqual(doc.getElementById('cadProcDono').value, '–', 'area sem responsavel');
});

test('Descricao Funcional: abre com a existente e e gravada pelo cadastro principal', async () => {
  const { doc, w, gravacoes } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso('ti__folha');
  assert.strictEqual(doc.getElementById('cadProcDescricaoFuncional').value, 'Paga os colaboradores.');
  doc.getElementById('cadProcDescricaoFuncional').value = 'Calcula e paga a folha.';
  assert.strictEqual(await w.salvarCadastroProcesso(), true);
  assert.strictEqual(gravacoes.find((g) => g.nome === 'salvarProcesso').arg.descricaoFuncional, 'Calcula e paga a folha.');
});

// Atalho para Continuidade (29/10/2026): processo salvo e em Continuidade abre a
// ficha em Processos de Negocio (#processos?editar=<id>); fora dela, sem atalho.
const linhaDe = (doc, nome) => [...doc.querySelectorAll('#listaCadastroProcessos tbody tr')].find((tr) => tr.textContent.includes(nome));

test('grade: atalho (selo "Sim" e icone) so na linha em Continuidade, e leva a ficha', async () => {
  const { w, doc } = await carregar(['admin']);
  const folha = linhaDe(doc, 'Folha');
  assert.ok(folha.querySelector('button[title="Abrir em Continuidade"]'));
  assert.ok(folha.querySelector('button[title="Abrir em Processos de Negócio"]'));
  const ponto = linhaDe(doc, 'Ponto');
  assert.strictEqual(ponto.querySelector('button[title="Abrir em Continuidade"]'), null);
  assert.strictEqual(ponto.querySelector('button[title="Abrir em Processos de Negócio"]'), null);
  // onclick inline nao roda no jsdom (outside-only): confere o atributo e chama a funcao.
  const selo = folha.querySelector('button[title="Abrir em Processos de Negócio"]').getAttribute('onclick');
  assert.match(selo, /^event\.stopPropagation\(\);abrirProcessoEmContinuidade\('ti__folha'\)$/, 'o clique no selo nao abre o cadastro');
  await w.abrirProcessoEmContinuidade('ti__folha');
  assert.strictEqual(w.location.hash, '#processos?editar=ti__folha');
});

test('drawer: link so para processo salvo e em Continuidade pelo que esta gravado', async () => {
  const { w, doc } = await carregar(['admin']);
  const link = () => doc.getElementById('cadProcLinkContinuidade').style.display !== 'none';
  w.abrirDrawerCadastroProcesso('ti__folha');
  assert.ok(link());
  w.abrirDrawerCadastroProcesso('rh__ponto');
  assert.ok(!link(), 'Departamental fora de Continuidade');
  doc.getElementById('cadProcContinuidade').checked = true;
  w.abrirDrawerCadastroProcesso();
  assert.ok(!link(), 'processo novo');
});

test('drawer: com alteracao nao salva, o atalho pergunta; continuar editando nao sai da tela', async () => {
  const { w, doc } = await carregar(['admin']);
  w.abrirDrawerCadastroProcesso('ti__folha');
  doc.getElementById('cadProcNome').value = 'Folha nova';
  w._perguntarAlteracoesNaoSalvas = async () => 'continuar';
  await w.abrirProcessoEmContinuidade('ti__folha');
  assert.notStrictEqual(w.location.hash, '#processos?editar=ti__folha');
  assert.ok(doc.getElementById('drawerCadastroProcesso').classList.contains('open'));
  // Descartar: fecha e vai.
  w._perguntarAlteracoesNaoSalvas = async () => 'descartar';
  await w.abrirProcessoEmContinuidade('ti__folha');
  assert.strictEqual(w.location.hash, '#processos?editar=ti__folha');
  assert.ok(!doc.getElementById('drawerCadastroProcesso').classList.contains('open'));
});

test('perfil sem a tela de Processos de Negocio nao ve o atalho', async () => {
  const { doc, w } = await carregar(['admin']);
  w.Perfis.podeVerTela = (perfis, tela) => tela !== 'processos';
  w.renderizarCadastroProcessos();
  assert.strictEqual(linhaDe(doc, 'Folha').querySelector('button[title="Abrir em Continuidade"]'), null);
});

// Selecao e edicao em lote (29/10/2026): mesmo padrao de Processos de Negocio.
const marcar = (w, ...ids) => ids.forEach((id) => w.toggleCadastroProcessoSelecionado(id, true));
const visivel = (doc, id) => doc.getElementById(id).style.display !== 'none';

test('lote: checkbox so para quem edita; "todos" marca a pagina e os botoes mostram a contagem', async () => {
  const leitor = await carregar(['operador']);
  assert.strictEqual(leitor.doc.querySelectorAll('.chk-cadproc').length, 0);
  assert.strictEqual(leitor.doc.getElementById('btnEditarCadProcLote'), null);
  const { w, doc } = await carregar(['admin']);
  const chks = doc.querySelectorAll('#listaCadastroProcessos .chk-cadproc');
  assert.strictEqual(chks.length, 3);
  assert.match(chks[0].closest('td').getAttribute('onclick'), /stopPropagation/, 'nao abre o drawer');
  assert.ok(!visivel(doc, 'btnEditarCadProcLote'));
  w.toggleTodosCadastroProcessos(true);
  assert.strictEqual(doc.getElementById('btnEditarCadProcLote').textContent, 'Editar selecionados (3)');
  assert.strictEqual(doc.getElementById('btnExcluirCadProcLote').textContent, 'Excluir selecionados (3)');
  w.toggleCadastroProcessoSelecionado('ti__folha', false);
  assert.ok(doc.getElementById('chkTodosCadProc').indeterminate);
  // Re-render (filtro) mantem a selecao.
  w.renderizarCadastroProcessos();
  assert.strictEqual(doc.querySelectorAll('.chk-cadproc:checked').length, 2);
});

test('lote: so os campos alterados vao no payload; "Ninguém (limpar)" grava vazio', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  w.confirm = () => true;
  marcar(w, 'rh__ponto', 'ti__compras');
  w.abrirDrawerCadastroProcessoLote();
  assert.match(doc.getElementById('loteCadProcTitulo').textContent, /Editar 2 processo/);
  await w.aplicarEdicaoLoteCadastroProcessos();
  assert.ok(w.__toasts.some((t) => /ao menos um campo/.test(t)));
  assert.strictEqual(gravacoes.length, 0);
  assert.deepStrictEqual([...doc.getElementById('loteCadProcCategoria').options].map((o) => o.value), ['__manter__', 'departamental', 'processo-de-negocio'], 'so ativas');
  doc.getElementById('loteCadProcContinuidade').value = 'sim';
  doc.getElementById('loteCadProcCriador').value = '';
  await w.aplicarEdicaoLoteCadastroProcessos();
  const salvos = gravacoes.filter((g) => g.nome === 'salvarProcesso').map((g) => g.arg);
  assert.deepStrictEqual(salvos, [{ id: 'rh__ponto', continuidade: true, criadorId: '' }, { id: 'ti__compras', continuidade: true, criadorId: '' }]);
  assert.ok(!visivel(doc, 'btnEditarCadProcLote'), 'selecao zerada');
});

test('lote: troca de area pula quem ja tem o mesmo nome no destino', async () => {
  const OUTRA_FOLHA = { id: 'rh__folha', area: 'RH', processo: 'folha', categoriaId: 'departamental', continuidade: false, links: [] };
  const { w, doc, gravacoes } = await carregar(['admin'], { getProcessosCadastro: [FOLHA, PONTO, COMPRAS, OUTRA_FOLHA] });
  const perguntas = [];
  w.confirm = (m) => { perguntas.push(m); return true; };
  marcar(w, 'ti__folha', 'ti__compras');
  w.abrirDrawerCadastroProcessoLote();
  doc.getElementById('loteCadProcArea').value = 'RH';
  await w.aplicarEdicaoLoteCadastroProcessos();
  assert.match(perguntas[0], /Aplicar as alterações a 1 processo[\s\S]*1 fica\(m\) de fora/);
  assert.deepStrictEqual(gravacoes.filter((g) => g.nome === 'salvarProcesso').map((g) => g.arg), [{ id: 'ti__compras', area: 'RH' }]);
  assert.ok(w.__toasts.some((t) => /Folha \(já existe em RH\)/.test(t)));
});

test('lote: tirar de Continuidade processo com BIA pede confirmacao extra; recusar nao grava', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  const perguntas = [];
  w.confirm = (m) => { perguntas.push(m); return false; };
  marcar(w, 'ti__folha', 'rh__ponto');
  w.abrirDrawerCadastroProcessoLote();
  doc.getElementById('loteCadProcContinuidade').value = 'nao';
  await w.aplicarEdicaoLoteCadastroProcessos();
  assert.match(perguntas[0], /1 processo\(s\) com BIA\/PCN vão sair de Continuidade/);
  assert.strictEqual(gravacoes.length, 0);
});

test('excluir selecionados: pula quem tem dados de Continuidade e exclui os demais', async () => {
  const { w, gravacoes } = await carregar(['admin']);
  const perguntas = [];
  w.confirm = (m) => { perguntas.push(m); return true; };
  marcar(w, 'ti__folha');
  await w.excluirCadastroProcessosSelecionados();
  assert.ok(w.__toasts.some((t) => /têm dados de Continuidade/.test(t)));
  assert.strictEqual(gravacoes.length, 0);
  marcar(w, 'rh__ponto', 'ti__compras');
  await w.excluirCadastroProcessosSelecionados();
  assert.match(perguntas[0], /Excluir 2 processo\(s\)\?[\s\S]*1 com dados de Continuidade[\s\S]*Folha \(TI\)/);
  assert.deepStrictEqual(gravacoes.map((g) => [g.nome, g.arg]), [['excluirProcesso', 'rh__ponto'], ['excluirProcesso', 'ti__compras']]);
});
