// Instalações (21/10/2026): o "P" de Premises dos 4 Ps do BIA. Categoria do
// catálogo de Dependências com tipo, endereço e instalação alternativa; ligada a
// Processos, dependências técnicas (componentes), Pessoas (lotação) e ao Mapa.
// Carrega o app.js REAL no jsdom; a camada de dados (api.js) com Firestore falso.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const SEDE = { id: 'sede', categoria: 'Instalações', nome: 'Sede SP', tipoInstalacao: 'Sede', endereco: 'Av. Paulista, 1000', instalacaoAlternativa: { id: 'filial', nome: 'Filial RJ' } };
const FILIAL = { id: 'filial', categoria: 'Instalações', nome: 'Filial RJ', tipoInstalacao: 'Filial' };
const DC = { id: 'dc', categoria: 'Instalações', nome: 'Data center', tipoInstalacao: 'Data center', rtoMin: 480 };
const SRV = { id: 'srv', categoria: 'Servidor', nome: 'SRV-01', rtoMin: 60, componentes: [{ id: 'dc', nome: 'Data center', categoria: 'Instalações' }] };
const DEPS = [SEDE, FILIAL, DC, SRV, { id: 'pAna', categoria: 'Pessoas', nome: 'Ana' }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: DEPS, getServicos: [], getAreas: [{ id: 'a1', nome: 'TI' }], getProcessos: [], getBackups: [],
    getSlasDependencia: { success: true, contratos: [] },
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return { w, doc: w.document, gravacoes };
}
const esperar = () => new Promise((r) => setTimeout(r, 20));
const visivel = (el) => el.style.display !== 'none';

async function abrirDep(perfis, dep) {
  const ctx = await carregar(perfis);
  await ctx.w.dependencias();
  ctx.w.abrirDrawerDependencia(dep ? JSON.parse(JSON.stringify(dep)) : undefined);
  await esperar();
  return ctx;
}

// ---- Etapa 1/2: catálogo, drawer e API ----

test('Instalações é categoria do catálogo (drawer), com ícone e exemplo, mas não técnica', async () => {
  const { w, doc } = await abrirDep(['ti']);
  const opcoes = [...doc.querySelectorAll('#depCategoria option')].map((o) => o.value);
  assert.ok(opcoes.includes('Instalações'));
  assert.strictEqual(w._iconeCategoriaDep('Instalações'), '📍');
  // Servicos segue escolhendo so itens tecnicos: nao ha secao Instalacoes no drawer do Servico.
  await w.servicos();
  w.abrirDrawerServico();
  assert.doesNotMatch(doc.getElementById('servicoDependenciasPorCategoria').textContent, /Instalações/);
});

test('bloco "Dados da instalação" aparece só para Instalações e acompanha a troca de categoria', async () => {
  const { doc } = await abrirDep(['ti'], SEDE);
  const bloco = doc.getElementById('depInstalacaoBloco');
  assert.ok(visivel(bloco));
  assert.strictEqual(doc.getElementById('depTipoInstalacao').value, 'Sede');
  assert.strictEqual(doc.getElementById('depEndereco').value, 'Av. Paulista, 1000');
  assert.strictEqual(doc.getElementById('depInstalacaoAlternativa').value, 'filial');
  const alternativas = [...doc.querySelectorAll('#depInstalacaoAlternativa option')].map((o) => o.textContent);
  assert.deepStrictEqual(alternativas, ['Nenhuma', 'Data center (Data center)', 'Filial RJ (Filial)'], 'so outras instalacoes, sem ela mesma');
  const sel = doc.getElementById('depCategoria');
  sel.value = 'Servidor';
  new doc.defaultView.Function(sel.getAttribute('onchange')).call(sel);
  assert.ok(!visivel(bloco));
  const srv = await abrirDep(['ti'], SRV);
  assert.ok(!visivel(srv.doc.getElementById('depInstalacaoBloco')));
});

test('salvar instalação grava tipo, endereço e alternativa; outra categoria não manda esses campos', async () => {
  const { w, doc, gravacoes } = await abrirDep(['ti'], FILIAL);
  doc.getElementById('depEndereco').value = 'Rua do Ouvidor, 50';
  doc.getElementById('depTipoInstalacao').value = 'Filial';
  doc.getElementById('depInstalacaoAlternativa').value = 'dc';
  await w.salvarDep();
  const g = gravacoes.find((x) => x.nome === 'salvarDependencia').arg;
  assert.strictEqual(g.categoria, 'Instalações');
  assert.strictEqual(g.endereco, 'Rua do Ouvidor, 50');
  assert.strictEqual(g.tipoInstalacao, 'Filial');
  assert.deepStrictEqual(g.instalacaoAlternativa, { id: 'dc', nome: 'Data center' });
  const s2 = await abrirDep(['ti'], SRV);
  await s2.w.salvarDep();
  const g2 = s2.gravacoes.find((x) => x.nome === 'salvarDependencia').arg;
  assert.ok(!('tipoInstalacao' in g2) && !('instalacaoAlternativa' in g2));
});

test('componentes: um Servidor pode ficar abaixo de uma Instalação; "Está abaixo de" mostra quem a usa como contingência', async () => {
  const { w, doc } = await abrirDep(['ti'], { id: 'srv2', categoria: 'Servidor', nome: 'SRV-02' });
  w.depCompMostrarDropdown();
  assert.match(doc.getElementById('depComp-dropdown').textContent, /Data center \(Instalações\)/);
  const filial = await abrirDep(['ti'], FILIAL);
  assert.match(filial.doc.getElementById('depAcimaDe').textContent, /Sede SP \(contingência dela\)/);
});

test('componentes: Instalação não oferece outra Instalação; a já gravada fica em laranja para remover; trocar a categoria reavalia', async () => {
  const legado = { ...FILIAL, componentes: [{ id: 'dc', nome: 'Data center', categoria: 'Instalações' }] };
  const { w, doc } = await abrirDep(['ti'], legado);
  w.depCompMostrarDropdown();
  const opcoes = doc.getElementById('depComp-dropdown').textContent;
  assert.doesNotMatch(opcoes, /\(Instalações\)/, 'nenhuma Instalação como componente de Instalação');
  assert.match(opcoes, /SRV-01 \(Servidor\)/);
  const tags = doc.getElementById('depComp-tags');
  assert.ok(tags.querySelector('.dep-comp--nao-se-aplica'), 'componente antigo visivel e marcado');
  assert.match(tags.textContent, /use "Instalação alternativa"/);
  w.selecionarDepComponente('sede');
  assert.strictEqual(w._depComponentesSel.length, 1, 'selecionar direto tambem e recusado');
  // Virou Servidor: Instalação como componente volta a valer ("instalada em").
  doc.getElementById('depCategoria').value = 'Servidor';
  w._atualizarBlocoInstalacao();
  assert.ok(!doc.querySelector('#depComp-tags .dep-comp--nao-se-aplica'));
});

// ---- api.js: leitura e gravacao (Firestore falso) ----
const apiSrc = fs.readFileSync(path.join(PUB, 'api.js'), 'utf8');
function extrair(nome) {
  const ini = apiSrc.search(new RegExp(`(async )?function ${nome}\\(`));
  assert.ok(ini >= 0, nome);
  let i = apiSrc.indexOf('{', ini), nivel = 0;
  for (; i < apiSrc.length; i++) {
    if (apiSrc[i] === '{') nivel++;
    else if (apiSrc[i] === '}' && --nivel === 0) break;
  }
  return apiSrc.slice(ini, i + 1);
}
function ambienteApi(docs) {
  const banco = Object.assign({}, docs);
  const ctx = {
    COLLECTION: { dependencias: 'dependencias' },
    _getAll: async () => Object.keys(banco).map((id) => Object.assign({ id }, banco[id])),
    _db: { collection: () => ({
      doc: (id) => ({ set: async (data, op) => { banco[id] = op && op.merge ? Object.assign({}, banco[id], data) : data; } }),
      add: async (data) => { banco.novo = data; return { id: 'novo' }; },
    }) },
    window: {},
  };
  vm.createContext(ctx);
  ['_minutosOuNull', '_refsDependencia', '_lerDependencias', '_salvarDependencia'].forEach((f) => vm.runInContext(extrair(f) + `\nthis.${f} = ${f};`, ctx));
  return { ctx, banco };
}

test('api: lê e grava os campos da instalação e a lotação; só o que vem no payload; alternativa não é ela mesma', async () => {
  const { ctx, banco } = ambienteApi({ sede: { categoria: 'Instalações', nome: 'Sede', tipoInstalacao: 'Sede', instalacaoAlternativa: { id: 'filial', nome: 'Filial' } },
    pAna: { categoria: 'Pessoas', nome: 'Ana', instalacao: { id: 'sede', nome: 'Sede' } } });
  const lidas = await ctx._lerDependencias();
  const sede = lidas.find((d) => d.id === 'sede');
  const json = (x) => JSON.parse(JSON.stringify(x)); // objetos do contexto vm
  assert.deepStrictEqual(json([sede.tipoInstalacao, sede.instalacaoAlternativa]), ['Sede', { id: 'filial', nome: 'Filial' }]);
  assert.deepStrictEqual(json(lidas.find((d) => d.id === 'pAna').instalacao), { id: 'sede', nome: 'Sede' });
  // Salvar a Sede sem os campos (ex.: pelo DRP) nao apaga tipo nem alternativa.
  await ctx._salvarDependencia({ id: 'sede', categoria: 'Instalações', nome: 'Sede' });
  assert.strictEqual(banco.sede.tipoInstalacao, 'Sede');
  assert.deepStrictEqual(json(banco.sede.instalacaoAlternativa), { id: 'filial', nome: 'Filial' });
  // Alternativa apontando para ela mesma vira null.
  await ctx._salvarDependencia({ id: 'sede', categoria: 'Instalações', nome: 'Sede', instalacaoAlternativa: { id: 'sede', nome: 'Sede' } });
  assert.strictEqual(banco.sede.instalacaoAlternativa, null);
  await ctx._salvarDependencia({ id: 'pAna', categoria: 'Pessoas', nome: 'Ana', instalacao: null });
  assert.strictEqual(banco.pAna.instalacao, null);
});

// ---- Etapa 3: Processo (BIA) e formulario do gestor ----
test('Processo: linha Instalações sempre presente na aba de dependências, depois de Pessoas', () => {
  const src = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  const linhas = src.split('\n').filter((l) => /\[CadeiaDependencias\.CATEGORIA_SERVICO, 'Fornecedores', 'Pessoas', DEPENDENCIA_CATEGORIA_INSTALACAO, 'Processos Internos'\]/.test(l));
  assert.strictEqual(linhas.length, 1, 'edicao em lote');
  // Aba Dependencias do drawer (28/10/2026): cartoes na ordem Servicos, Pessoas, Instalacoes...
  assert.match(src, /const _CATEGORIAS_DEP_PROCESSO = \['Serviços', 'Produtos de Software', 'Pessoas', 'Instalações', 'Fornecedores', 'Processos Internos'\];/);
});

test('formulario do gestor (bia-dependencias.html): cartao 4. Instalações, chave e payload', () => {
  const html = fs.readFileSync(path.join(PUB, 'bia-dependencias.html'), 'utf8');
  assert.match(html, /renderCategoryCard\('instalacoes', '5\. Instalações'/);
  assert.match(html, /if \(c === 'Instalações' \|\| c === 'Instalação'\) return 'instalacoes';/);
  assert.match(html, /instalacoes: JSON\.stringify\(DEPS\.instalacoes\)/);
  assert.match(html, /7\. Observações/);
  const numeros = [...html.matchAll(/renderCategoryCard\('[^']+', '(\d+)\./g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(numeros, [2, 3, 4, 5, 6], 'numeracao continua (Servicos + 4 Ps; o tecnico vem do Servico desde 21/10/2026)');
});

// ---- Etapa 4: lotacao da Pessoa ----
test('Pessoa: select "Instalação (lotação)" com as instalações; salvar grava {id, nome}; relatório mostra a lotação', async () => {
  const ana = { id: 'pAna', categoria: 'Pessoas', nome: 'Ana', areas: ['TI'], instalacao: { id: 'sede', nome: 'Sede SP' } };
  const ctx = await carregar(['admin'], { getDependencias: DEPS.filter((d) => d.id !== 'pAna').concat([ana]), getPerfis: [], getProdutosSoftware: [] });
  await ctx.w.pessoas();
  ctx.w.abrirModalPessoa('pAna');
  const sel = ctx.doc.getElementById('pessoaInstalacao');
  assert.deepStrictEqual([...sel.options].map((o) => o.textContent), ['Nenhuma', 'Data center (Data center)', 'Filial RJ (Filial)', 'Sede SP (Sede)']);
  assert.strictEqual(sel.value, 'sede');
  sel.value = 'filial';
  await ctx.w.salvarPessoaCadastro();
  const g = ctx.gravacoes.find((x) => x.nome === 'salvarDependencia').arg;
  assert.deepStrictEqual(g.instalacao, { id: 'filial', nome: 'Filial RJ' });
  sel.value = '';
  await ctx.w.salvarPessoaCadastro();
  assert.strictEqual(ctx.gravacoes.filter((x) => x.nome === 'salvarDependencia').pop().arg.instalacao, null);
  const html = ctx.w._buildRelatorioPessoaPage(ana, { processos: [], deps: [ana], riscos: [], indicadores: [], backups: [], perfis: [], areas: [], servicos: [] });
  assert.match(html, /Instalação \(lotação\):<\/b> Sede SP/);
});

// ---- Etapa 5: Mapa de Continuidade e composicao do Servico ----
test('mapa (Explorar) numa Instalação: pessoas lotadas, processos, o que ela hospeda e a contingência; painel com tipo e endereço', async () => {
  const ana = { id: 'pAna', categoria: 'Pessoas', nome: 'Ana', instalacao: { id: 'sede', nome: 'Sede SP' } };
  const ctx = await carregar(['admin'], {
    getDependencias: DEPS.filter((d) => d.id !== 'pAna').concat([ana]),
    getProcessos: [{ id: 'p1', area: 'TI', processo: 'Faturamento', tierManual: 'Tier 1 (Crítico)', dependenciaItens: [{ id: 'dc', nome: 'Data center', categoria: 'Instalações' }] }],
    getContratos: [], getStatusContrato: [], getPerguntas: [],
  });
  await ctx.w.mapaContinuidade();
  ctx.w.mapaExplorarDe('instalacao:sede');
  ctx.w.mapaAbrirProximoNivel(); // grupos por tipo comecam recolhidos
  const arvore = ctx.doc.getElementById('mapaCanvas').textContent.replace(/\s+/g, ' ');
  assert.match(arvore, /pessoa lotada.*Ana/);
  assert.match(arvore, /contingência.*Filial RJ/);
  const painel = ctx.doc.getElementById('mapaPainel').textContent.replace(/\s+/g, ' ');
  assert.match(painel, /Instalação/);
  assert.match(painel, /Tipo\s*Sede/);
  assert.match(painel, /Endereço\s*Av\. Paulista, 1000/);
  assert.match(painel, /Contingência\s*Filial RJ/);
  ctx.w.mapaExplorarDe('instalacao:dc');
  ctx.w.mapaAbrirProximoNivel();
  assert.match(ctx.doc.getElementById('mapaCanvas').textContent, /SRV-01/);
  assert.match(ctx.doc.getElementById('mapaPainel').textContent, /Sem instalação alternativa/);
  assert.match(ctx.doc.getElementById('mapaTipos').textContent, /Instalações/);
});

test('"Ver no mapa" no drawer de uma Instalação abre o mapa no tipo instalacao', async () => {
  const { w } = await abrirDep(['admin'], SEDE);
  await w.verNoMapa('dependencia');
  assert.strictEqual(w.location.hash, '#mapa?no=instalacao%3Asede');
});

test('composicao: instalação como componente entra no caminho crítico do Serviço', () => {
  const SC = require('../public/servico-composicao.js');
  const servico = { rtoMin: 120, dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] };
  const av = SC.avaliarServico(servico, DEPS);
  assert.strictEqual(av.atributos.rto.soma, 60 + 480, 'SRV-01 (1 h) -> Data center (8 h)');
  assert.deepStrictEqual(av.atributos.rto.caminho, ['srv', 'dc']);
  assert.strictEqual(av.status, 'alerta');
});
