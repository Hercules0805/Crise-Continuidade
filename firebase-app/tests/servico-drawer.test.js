// Drawer do Servico (28/10/2026): abas Dados/Tecnico/Composicao/Backups, Consumidores,
// Responsaveis internos (Sustentacao herda os antigos stakeholders), dependencias numa
// busca so (sem Outros/API/Portais Web), "Endpoints e APIs" e a sugestao de processos
// por IA. Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const DEPS = [
  { id: 'srv', categoria: 'Servidor', nome: 'SRV-01' },
  { id: 'db', categoria: 'Banco de Dados', nome: 'Banco ERP' },
  { id: 'api1', categoria: 'API', nome: 'API bancária' },
  { id: 'pw', categoria: 'Portais Web', nome: 'Área Restrita' },
  { id: 'ana', categoria: 'Pessoas', nome: 'Ana' },
  { id: 'bia', categoria: 'Pessoas', nome: 'Bia' },
  { id: 'caio', categoria: 'Pessoas', nome: 'Caio' },
];
const PROCESSOS = [
  { id: 'p1', area: 'Financeiro', processo: 'Faturar', dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Faturamento' }] },
  { id: 'p2', area: 'Financeiro', processo: 'Conciliar', dependenciaItens: [{ id: 'db', nome: 'Banco ERP', categoria: 'Banco de Dados' }] },
  { id: 'p3', area: 'RH', processo: 'Folha', dependenciaItens: [] },
];
const SERVICOS = [
  { id: 's1', nome: 'Faturamento', descricao: 'Emite notas', dependenciaItens: [{ id: 'db', nome: 'Banco ERP', categoria: 'Banco de Dados' }],
    stakeholders: [{ id: 'ana', nome: 'Ana' }], processoIds: [],
    endpoints: [{ url: 'https://nfe.fortes.com.br', tipo: 'Portal Web', ambiente: 'Produção', descricao: 'Portal de notas' }],
    consumidores: { areas: 'algumas', listaAreas: ['Financeiro', 'Área Extinta'], clientes: true } },
  { id: 's2', nome: 'Legado API', dependenciaItens: [{ id: 'api1', nome: 'API bancária', categoria: 'API' }],
    responsaveisSustentacao: [], responsaveisDesenvolvimento: [{ id: 'caio', nome: 'Caio' }] },
];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const calls = {};
  const dados = Object.assign({
    getServicos: SERVICOS, getDependencias: DEPS, getProcessos: PROCESSOS, getAreas: [{ id: 'a1', nome: 'Financeiro' }, { id: 'a2', nome: 'RH' }],
    getBackups: [{ id: 'b1', nome: 'Bk', servicoIds: ['s1'], jobs: [] }],
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (...args) => {
      (calls[nome] = calls[nome] || []).push(JSON.parse(JSON.stringify(args)));
      if (nome === 'post') return w.__respostaIA || { success: true, processos: [] };
      if (/^(salvar|excluir)/.test(nome)) return { success: true, id: (args[0] && args[0].id) || 'novo' };
      if (nome === 'invalidate') return undefined;
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
    'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js',
    'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.__toasts = [];
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  await w.servicos();
  return { w, doc: w.document, calls, $: (id) => w.document.getElementById(id) };
}
const plano = (x) => JSON.parse(JSON.stringify(x));
const ultimoSalvo = (calls) => (calls.salvarServico || []).slice(-1)[0][0];
const chips = (el) => [...el.querySelectorAll('span')].filter((s) => s.querySelector('button')).map((s) => s.firstChild.textContent.trim());
const visivel = (el) => el.style.display !== 'none';

test('abas: Dados tem consumidores, processos e responsaveis; Tecnico tem limites, dependencias e endpoints; contagens', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerServico('s1');
  const dados = $('painel-servico-dados');
  assert.ok(dados.contains($('servicoConsumidoresClientes')) && dados.contains($('servicoProcessosChips')) && dados.contains($('servicoRespSustentacaoChips')));
  const tec = $('painel-servico-tecnico');
  assert.ok(tec.contains($('servicoDependenciasPorCategoria')) && tec.contains($('servicoEndpointsTabela')));
  assert.ok(tec.querySelector('[id^="servicoRto"]'), 'RTO/RPO/MTTR foram para o Tecnico');
  assert.ok(!visivel(tec));
  assert.strictEqual($('tab-servico-tecnico').textContent, 'Técnico (2)', '1 dependencia + 1 endpoint');
  assert.strictEqual($('tab-servico-backups').textContent, 'Backups (1)');
  w.trocarAbaServico('tecnico');
  assert.ok(visivel(tec) && !visivel(dados));
  assert.ok(!$('servicoImpactadosDetalhe').open, 'processos impactados recolhido');
  assert.match($('servicoImpactadosContagem').textContent, /\(2\)/, 'Faturar (suportado) + Conciliar (via Banco ERP)');
});

test('consumidores: abre com a escolha gravada, area fora do cadastro marcada; trocar para "todas" esconde a lista e grava sem ela', async () => {
  const { w, $, calls } = await carregar(['admin']);
  w.abrirDrawerServico('s1');
  assert.strictEqual(w.document.querySelector('input[name="servicoConsumidoresAreas"]:checked').value, 'algumas');
  assert.ok(visivel($('servicoConsumidoresAreasBloco')));
  assert.deepStrictEqual(chips($('servicoConsumidoresAreasChips')), ['Financeiro', 'Área Extinta (fora do cadastro)']);
  assert.ok($('servicoConsumidoresClientes').checked);
  assert.deepStrictEqual([...$('servicoConsumidorAreaAdd').options].map((o) => o.value).filter(Boolean), ['RH'], 'so as que faltam');
  $('servicoConsumidorAreaAdd').value = 'RH';
  w.adicionarAreaConsumidoraServico();
  w.removerAreaConsumidoraServico(1);
  await w.salvarServico();
  assert.deepStrictEqual(ultimoSalvo(calls).consumidores, { areas: 'algumas', listaAreas: ['Financeiro', 'RH'], clientes: true });

  w.document.querySelector('input[name="servicoConsumidoresAreas"][value="todas"]').checked = true;
  w.trocarEscopoConsumidoresServico();
  assert.ok(!visivel($('servicoConsumidoresAreasBloco')));
  $('servicoConsumidoresClientes').checked = false;
  await w.salvarServico();
  assert.deepStrictEqual(ultimoSalvo(calls).consumidores, { areas: 'todas', listaAreas: [], clientes: false });
});

test('servico novo: consumidores comecam em "Nenhuma", sem clientes', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerServico();
  assert.strictEqual(w.document.querySelector('input[name="servicoConsumidoresAreas"]:checked').value, 'nenhuma');
  assert.ok(!visivel($('servicoConsumidoresAreasBloco')) && !$('servicoConsumidoresClientes').checked);
});

test('responsaveis: stakeholder antigo aparece na Sustentacao com aviso; Desenvolvimento separado; Salvar grava os dois', async () => {
  const { w, $, calls } = await carregar(['admin']);
  w.abrirDrawerServico('s1');
  assert.deepStrictEqual(chips($('servicoRespSustentacaoChips')), ['Ana']);
  assert.ok(visivel($('servicoSustentacaoMigrados')));
  assert.match($('painel-servico-dados').textContent, /Herdados pelos processos/);
  $('servicoRespDesenvolvimentoAdd').value = 'bia';
  w.adicionarResponsavelServico('desenvolvimento');
  assert.deepStrictEqual(chips($('servicoRespDesenvolvimentoChips')), ['Bia']);
  assert.ok(![...$('servicoRespDesenvolvimentoAdd').options].some((o) => o.value === 'bia'), 'quem ja esta sai do select');
  await w.salvarServico();
  const p = ultimoSalvo(calls);
  assert.deepStrictEqual(p.responsaveisSustentacao, [{ id: 'ana', nome: 'Ana' }]);
  assert.deepStrictEqual(p.responsaveisDesenvolvimento, [{ id: 'bia', nome: 'Bia' }]);
  assert.ok(!visivel($('servicoSustentacaoMigrados')), 'salvar confirma a migracao');
  w.removerResponsavelServico('sustentacao', 0);
  assert.match($('servicoRespSustentacaoChips').textContent, /Ninguém indicado/);
});

test('servico ja no modelo novo: Sustentacao vazia nao traz legado; Desenvolvimento abre com o gravado', async () => {
  const { w, $ } = await carregar(['admin']);
  w.abrirDrawerServico('s2');
  assert.deepStrictEqual(chips($('servicoRespSustentacaoChips')), []);
  assert.ok(!visivel($('servicoSustentacaoMigrados')));
  assert.deepStrictEqual(chips($('servicoRespDesenvolvimentoChips')), ['Caio']);
});

test('dependencias: uma busca so, agrupada por categoria, sem Outros/API/Portais Web; item legado de API fica so para remover', async () => {
  const { w, $, doc } = await carregar(['admin']);
  w.abrirDrawerServico('s2');
  assert.ok(!doc.querySelector('.servico-dep-cat-input'), 'nao ha mais um campo por categoria');
  const legado = doc.querySelector('.servico-dep-grupo[data-categoria="API"]');
  assert.ok(legado && /fora do serviço/.test(legado.textContent), 'API ligada antes aparece marcada');
  $('servicoDepBusca').value = '';
  w.mostrarDropdownServicoDependencias();
  const cats = [...$('servicoDepDropdown').querySelectorAll('.servico-dep-option')].map((o) => o.dataset.categoria);
  assert.deepStrictEqual([...new Set(cats)].sort(), ['Banco de Dados', 'Servidor']);
  $('servicoDepBusca').value = 'srv';
  w.mostrarDropdownServicoDependencias();
  assert.deepStrictEqual([...$('servicoDepDropdown').querySelectorAll('.servico-dep-option')].map((o) => o.textContent), ['SRV-01']);
  assert.match($('servicoDepDropdown').textContent, /Cadastrar "srv" como:/);
  assert.doesNotMatch($('servicoDepDropdown').textContent, /Portais Web|Outros/);
  w.selecionarDependenciaServicoCategoria('SRV-01', 'Servidor', 'srv');
  assert.ok(doc.querySelector('.servico-dep-grupo[data-categoria="Servidor"]'));
  assert.strictEqual($('tab-servico-tecnico').textContent, 'Técnico (2)');
  w.removerDependenciaServico(0);
  assert.ok(!doc.querySelector('.servico-dep-grupo[data-categoria="API"]'), 'o legado sai pelo ×');
});

test('dependencias: papel opcional do vinculo -- abre o gravado, sobrevive a adicionar outra, vai no Salvar; vazio nao grava', async () => {
  const comPapel = plano(SERVICOS);
  comPapel[0].dependenciaItens[0].papel = 'Banco principal';
  const { w, $, doc, calls } = await carregar(['admin'], { getServicos: comPapel });
  w.abrirDrawerServico('s1');
  const papeis = () => [...doc.querySelectorAll('.servico-dep-papel')].map((i) => i.value);
  assert.deepStrictEqual(papeis(), ['Banco principal']);
  w.selecionarDependenciaServicoCategoria('SRV-01', 'Servidor', 'srv');
  assert.deepStrictEqual(papeis(), ['Banco principal', '']);
  const novo = doc.querySelector('.servico-dep-grupo[data-categoria="Servidor"] .servico-dep-papel');
  novo.value = '  hospeda a aplicação ';
  novo.dispatchEvent(new w.Event('input'));
  await w.salvarServico();
  assert.deepStrictEqual(ultimoSalvo(calls).dependenciaItens, [
    { id: 'db', nome: 'Banco ERP', categoria: 'Banco de Dados', papel: 'Banco principal' },
    { categoria: 'Servidor', nome: 'SRV-01', id: 'srv', papel: 'hospeda a aplicação' },
  ]);

  // Legado "fora do serviço" não ganha campo de papel.
  w.abrirDrawerServico('s2');
  assert.ok(!doc.querySelector('.servico-dep-grupo[data-categoria="API"] .servico-dep-papel'));
});

test('dependencias: mudar so o papel conta como alteracao no Fechar; digitar e apagar nao', async () => {
  const { w, $, doc, calls } = await carregar(['admin']);
  const digitar = (valor) => {
    const campo = doc.querySelector('.servico-dep-papel');
    campo.value = valor;
    campo.dispatchEvent(new w.Event('input'));
  };
  w.abrirDrawerServico('s1');
  digitar('x');
  digitar('');
  assert.strictEqual(await w.fecharDrawerServico(), true, 'fecha direto, sem perguntar');
  assert.strictEqual((calls.salvarServico || []).length, 0);

  w.abrirDrawerServico('s1');
  digitar('Banco principal');
  const fechando = w.fecharDrawerServico();
  const pergunta = $('modalAlteracoesNaoSalvas');
  assert.ok(pergunta, 'pergunta se salva');
  pergunta.querySelector('[data-resposta="salvar"]').click();
  await fechando;
  assert.strictEqual(ultimoSalvo(calls).dependenciaItens[0].papel, 'Banco principal');
});

test('endpoints e APIs: lista com tipo; adicionar valida URL e duplicata; vai no Salvar; Tecnico conta', async () => {
  const { w, $, calls } = await carregar(['admin']);
  w.abrirDrawerServico('s1');
  assert.match($('servicoEndpointsTabela').textContent, /nfe\.fortes\.com\.br/);
  assert.match($('servicoEndpointsTabela').textContent, /Portal Web/);
  $('servicoEndpointUrl').value = 'nfe.fortes.com.br';
  w.adicionarEndpointServico();
  $('servicoEndpointUrl').value = 'https://NFE.fortes.com.br/';
  w.adicionarEndpointServico();
  assert.strictEqual(w._servicoEndpoints.length, 1, 'invalida e repetida nao entram');
  $('servicoEndpointUrl').value = 'https://api.nfe.fortes.com.br/v2';
  $('servicoEndpointTipo').value = 'API';
  $('servicoEndpointAmbiente').value = 'Homologação';
  $('servicoEndpointDescricao').value = 'Emissão';
  w.adicionarEndpointServico();
  assert.strictEqual($('tab-servico-tecnico').textContent, 'Técnico (3)');
  await w.salvarServico();
  assert.deepStrictEqual(ultimoSalvo(calls).endpoints, [
    { url: 'https://nfe.fortes.com.br', tipo: 'Portal Web', ambiente: 'Produção', descricao: 'Portal de notas' },
    { url: 'https://api.nfe.fortes.com.br/v2', tipo: 'API', ambiente: 'Homologação', descricao: 'Emissão' },
  ]);
});

test('IA dos processos: so com servico salvo e Admin/SI; caixa sem os ja suportados; adicionar selecionados vira chip', async () => {
  const { w, $, calls } = await carregar(['admin']);
  w.abrirDrawerServico();
  assert.ok(!visivel($('btnSugerirProcessosServico')), 'servico novo: sem botao');
  w.abrirDrawerServico('s1');
  assert.ok(visivel($('btnSugerirProcessosServico')));
  w.__respostaIA = { success: true, processos: [
    { id: 'p1', nome: 'Faturar', area: 'Financeiro', motivo: 'ja suporta' },
    { id: 'p2', nome: 'Conciliar', area: 'Financeiro', motivo: 'Usa o Banco ERP' },
    { id: 'p3', nome: 'Folha', area: 'RH', motivo: 'Paga pelo serviço' },
  ] };
  await w.sugerirProcessosServicoComIA();
  assert.deepStrictEqual(plano(calls.post.slice(-1)[0]), ['sugerirTextoIA', { alvo: 'servico-processos', id: 's1' }]);
  const caixa = $('sugestaoProcessosServico');
  const marcas = [...caixa.querySelectorAll('input[data-sugestao-processo-servico]')];
  assert.deepStrictEqual(marcas.map((c) => c.dataset.sugestaoProcessoServico), ['p2', 'p3'], 'Faturar ja e suportado');
  assert.match(caixa.textContent, /Usa o Banco ERP/);
  marcas[1].checked = false;
  w.adicionarSugestoesProcessosServicoIA();
  assert.deepStrictEqual(chips($('servicoProcessosChips')), ['Financeiro · Faturar', 'Financeiro · Conciliar']);
  assert.strictEqual(caixa.innerHTML, '', 'a caixa some');
  assert.ok(w.__toasts.some((t) => /1 processo adicionado/.test(t)));
  assert.strictEqual((calls.salvarServico || []).length, 0, 'nada grava ate Salvar');
  await w.sugerirProcessosServicoComIA();
  w.descartarSugestaoProcessosServicoIA();
  assert.strictEqual($('sugestaoProcessosServico').innerHTML, '');
});

test('IA dos processos: quem so le nao ve o botao', async () => {
  const { w, $ } = await carregar(['ti']);
  w.abrirDrawerServico('s1');
  assert.ok(!visivel($('btnSugerirProcessosServico')));
});

test('abrir e fechar sem mexer nao grava, nem no servico com stakeholder legado', async () => {
  const { w, calls } = await carregar(['admin']);
  for (const id of ['s1', 's2', undefined]) {
    w.abrirDrawerServico(id);
    await w.fecharDrawerServico();
  }
  assert.strictEqual((calls.salvarServico || []).length, 0);
});

test('lista: a busca acha o servico pela URL do endpoint e pelo nome do responsavel', async () => {
  const { w, $, doc } = await carregar(['admin']);
  const nomes = () => [...doc.querySelectorAll('#servicoRows tr')].map((tr) => tr.children[0].textContent.trim());
  $('buscaServico').value = 'nfe.fortes';
  w.renderizarServicos();
  assert.deepStrictEqual(nomes(), ['Faturamento']);
  $('buscaServico').value = 'caio';
  w.renderizarServicos();
  assert.deepStrictEqual(nomes(), ['Legado API']);
  $('buscaServico').value = 'ana';
  w.renderizarServicos();
  assert.deepStrictEqual(nomes(), ['Faturamento'], 'stakeholder antigo conta como Sustentacao');
});
