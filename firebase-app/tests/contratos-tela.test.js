// Contratos (15/10/2026): tela, drawer, eventos e integracao com Fornecedores.
// app.js real no jsdom, API trocada por um espiao que guarda as gravacoes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const CC = require('../public/contrato-ciclo.js');

const PUB = path.join(__dirname, '..', 'public');
const HOJE = CC.hojeIso();

const DEPS = [
  { id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', setor: 'TI' },
  { id: 'p2', categoria: 'Pessoas', nome: 'Bruno Lima', setor: 'RH' },
  { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa Cloud', tic: true, pessoasRelacionadas: [{ id: 'p2', nome: 'Bruno Lima', papel: 'Usuário-chave' }] },
  { id: 'f2', categoria: 'Fornecedores', nome: 'Beta Telecom', tic: true },
];
const STATUS = [
  { id: 's-pre', nome: 'Em elaboração', situacao: 'pre', ativo: true },
  { id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true },
  { id: 's-enc', nome: 'Encerrado', situacao: 'encerrado', ativo: true },
];
const TIPOS = [{ id: 't1', nome: 'Assinatura de software (SaaS)', ativo: true }];
const INDEXADORES = [{ id: 'i1', nome: 'IPCA', ativo: true }];
const contrato = (extra) => Object.assign({
  id: 'c1', codigo: 'CT-0001', objeto: 'Suite de e-mail', fornecedorId: 'f1', fornecedorNome: 'Alfa Cloud',
  tipoId: 't1', statusId: 's-vig', indexadorId: 'i1', area: 'TI', gestor: { id: 'p1', nome: 'Ana Souza' },
  dataInicio: CC.somarMeses(HOJE, -11), dataFim: CC.somarDias(HOJE, 20), vigenciaMeses: 12,
  renovacaoAutomatica: true, avisoCancelamentoDias: 30, valorMensal: 1000, valorGlobal: 12000,
  documentos: [], alertas: [],
}, extra);

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: DEPS, getAreas: [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'RH' }],
    getContratos: [contrato()], getTiposContrato: TIPOS, getIndexadoresReajuste: INDEXADORES, getStatusContrato: STATUS,
    getEventosContrato: [], getProcessos: [], getRiscos: [], getAvaliacoesFornecedor: [],
    getConfigFornecedor: { limiarRisco: 70 },
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'subareas.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // Pergunta "Há alterações não salvas" (16/10/2026): o teste escolhe a resposta (padrão Salvar) e conta as perguntas.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); }; window.__respostaFechar = "salvar"; window.__perguntasFechar = 0; _perguntarAlteracoesNaoSalvas = async () => { window.__perguntasFechar++; return window.__respostaFechar; };');
  return { w, doc: w.document, gravacoes };
}

const html = (doc) => doc.getElementById('app').innerHTML;

// Digita num campo e executa o handler `oninput` REAL do HTML (o jsdom em
// runScripts 'outside-only' nao dispara atributos inline sozinho).
function digitar(w, el, texto) {
  el.value = texto;
  const codigo = el.getAttribute('oninput');
  assert.ok(codigo, `${el.id} tem oninput`);
  new w.Function(codigo).call(el);
}

test('lista mostra o contrato, o status pela lista configuravel e os alertas de prazo', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  const tela = html(doc);
  assert.match(tela, /CT-0001/);
  assert.match(tela, /Suite de e-mail/);
  assert.match(tela, /Vigente/);
  assert.match(tela, /Vence em 20 dia/);
  assert.match(tela, /Prazo de aviso encerrado/, 'fim em 20 dias com aviso de 30: ja passou da data-limite');
  assert.match(tela, /\+ Novo contrato/);
  assert.match(tela, /excluirContrato\('c1'\)/);
});

test('painel: custo mensal so dos vigentes e fornecedor TIC sem contrato vigente', async () => {
  const { w, doc } = await carregar(['admin'], {
    getContratos: [contrato(), contrato({ id: 'c2', codigo: 'CT-0002', statusId: 's-enc', valorMensal: 5000, fornecedorId: 'f2' })],
  });
  // Faixa de indicadores mora no Dashboard de Terceiros (23/10/2026).
  await w.terceirosDashboard();
  const painel = doc.getElementById('contratosPainel').textContent;
  assert.match(painel, /R\$ 1\.000/);
  assert.doesNotMatch(painel, /6\.000/, 'contrato encerrado nao entra no custo');
  // Faixa compacta (15/10/2026): numero antes do rotulo.
  assert.match(painel, /\b1\s*fornecedores TIC sem contrato vigente/, 'Beta so tem contrato encerrado');
});

test('gestor: ve a tela sem controles de edicao, e o drawer abre so para leitura', async () => {
  const { w, doc } = await carregar(['gestor']);
  await w.contratos();
  const tela = html(doc);
  assert.doesNotMatch(tela, /\+ Novo contrato/);
  assert.doesNotMatch(tela, /excluirContrato\(/);
  w.abrirDrawerContrato('c1');
  assert.ok(doc.getElementById('drawerContrato').classList.contains('open'));
  assert.strictEqual(doc.getElementById('btnSalvarContrato').style.display, 'none');
  assert.ok(doc.getElementById('contratoObjeto').disabled);
  assert.strictEqual(doc.getElementById('contratoEventoForm').style.display, 'none');
});

test('Dashboard de Terceiros: gestor ve so a secao Contratos, sem o catalogo inteiro de fornecedores', async () => {
  const { w, doc } = await carregar(['gestor']);
  await w.terceirosDashboard();
  assert.doesNotMatch(doc.getElementById('contratosPainel').textContent, /sem contrato vigente/, 'gestor nao ve o catalogo inteiro de fornecedores');
  assert.doesNotMatch(doc.getElementById('terceirosPainel').textContent, /Fornecedores no catálogo/);
});

test('novo contrato: valida obrigatorios e grava com codigo sequencial, sem fechar', async () => {
  const { w, doc, gravacoes } = await carregar(['operador']);
  await w.contratos();
  w.abrirDrawerContrato();
  assert.strictEqual(doc.getElementById('contratoStatus').value, 's-pre', 'nasce no primeiro status "pre"');
  assert.strictEqual(await w.salvarContrato(), false);
  assert.strictEqual(gravacoes.length, 0);
  doc.getElementById('contratoObjeto').value = 'Link dedicado';
  doc.getElementById('contratoFornecedor').value = 'f2';
  doc.getElementById('contratoTipo').value = 't1';
  doc.getElementById('contratoArea').value = 'TI';
  doc.getElementById('contratoDataInicio').value = '2026-01-01';
  doc.getElementById('contratoVigencia').value = '12';
  w._onDatasContratoChange('vigencia');
  assert.strictEqual(doc.getElementById('contratoDataFim').value, '2026-12-31', 'fim sugerido pela vigencia');
  assert.strictEqual(await w.salvarContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarContrato');
  assert.strictEqual(g.arg.codigo, 'CT-0002');
  assert.strictEqual(g.arg.fornecedorNome, 'Beta Telecom');
  assert.strictEqual(g.arg.dataFim, '2026-12-31');
  assert.strictEqual(doc.getElementById('contratoId').value, 'novo-id');
  assert.ok(doc.getElementById('drawerContrato').classList.contains('open'));
});

test('pessoas relacionadas ao fornecedor aparecem primeiro no seletor de gestor do contrato', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  const grupos = [...doc.querySelectorAll('#contratoGestor optgroup')].map((g) => g.label);
  assert.deepStrictEqual(grupos, ['Pessoas relacionadas ao fornecedor', 'Demais pessoas']);
  assert.match(doc.querySelector('#contratoGestor optgroup').textContent, /Bruno Lima/);
  assert.strictEqual(doc.getElementById('contratoGestor').value, 'p1', 'mantem o gestor gravado');
});

test('evento "Aplicar reajuste" grava o evento e atualiza o valor mensal no mesmo lote', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  w.prepararEventoContrato('Reajuste aplicado');
  assert.strictEqual(doc.getElementById('contratoEventoValorAnterior').value, '1.000,00', 'pre-preenchido ja mascarado');
  assert.match(doc.getElementById('contratoEventoDescricao').value, /IPCA/);
  doc.getElementById('contratoEventoValorNovo').value = '1.045,50';
  await w.registrarEventoContrato();
  const ev = gravacoes.find((x) => x.nome === 'salvarEventoContrato');
  assert.ok(ev, 'gravou o evento');
  assert.strictEqual(ev.arg.contratoId, 'c1');
  assert.strictEqual(ev.arg.area, 'TI', 'copia da area para a regra do gestor');
  assert.strictEqual(ev.arg.valorMensalNovo, 1045.5, 'numero, nao texto mascarado');
  assert.deepStrictEqual(ev.arg.atualizarContrato, { valorMensal: 1045.5, valorGlobal: 12546 }, 'o global acompanha: mensal novo x 12 meses');
  assert.strictEqual(doc.getElementById('contratoValorMensal').value, '1.045,50');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '12.546,00');
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarContrato'), 'formulario limpo: nao regrava o contrato a toa');
});

test('evento "Renovar" pre-preenche o proximo periodo e atualiza as datas', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  w.prepararEventoContrato('Renovação');
  const c = contrato();
  const p = CC.proximaRenovacao(c);
  assert.strictEqual(doc.getElementById('contratoEventoNovoInicio').value, p.dataUltimaRenovacao);
  assert.strictEqual(doc.getElementById('contratoEventoNovoFim').value, p.dataFim);
  await w.registrarEventoContrato();
  const ev = gravacoes.find((x) => x.nome === 'salvarEventoContrato');
  assert.strictEqual(ev.arg.atualizarContrato.dataFim, p.dataFim);
  assert.strictEqual(ev.arg.atualizarContrato.dataUltimaRenovacao, p.dataUltimaRenovacao);
  assert.strictEqual(ev.arg.atualizarContrato.vigenciaMeses, 12);
});

test('Fechar sem mudar nada nao grava nem pergunta; com mudanca pergunta, e Salvar grava antes de fechar', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  await w.fecharDrawerContrato();
  assert.strictEqual(gravacoes.length, 0);
  assert.strictEqual(w.__perguntasFechar, 0);
  assert.ok(!doc.getElementById('drawerContrato').classList.contains('open'));
  w.abrirDrawerContrato('c1');
  doc.getElementById('contratoObservacoes').value = 'Renegociar em 2027';
  await w.fecharDrawerContrato();
  assert.strictEqual(w.__perguntasFechar, 1);
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarContrato').length, 1);
  assert.ok(!doc.getElementById('drawerContrato').classList.contains('open'));
});

test('documento so aceita link http(s)', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  doc.getElementById('contratoDocUrl').value = 'javascript:alert(1)';
  w.adicionarDocumentoContrato();
  assert.strictEqual(w._contratoDocumentos.length, 0);
  doc.getElementById('contratoDocTitulo').value = 'Contrato assinado';
  doc.getElementById('contratoDocUrl').value = 'https://sharepoint.exemplo/contrato.pdf';
  w.adicionarDocumentoContrato();
  assert.strictEqual(w._contratoDocumentos.length, 1);
  assert.match(doc.getElementById('contratoDocumentosLista').innerHTML, /rel="noopener noreferrer"/);
});

test('lista configuravel: item em uso nao e excluido (orienta desativar); lista vazia oferece os padroes', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratosTipos();
  assert.match(html(doc), /Assinatura de software/);
  await w.excluirItemListaContrato('t1');
  assert.ok(!gravacoes.some((x) => x.nome === 'excluirTipoContrato'));
  assert.match(w.__toasts.join(' '), /Desative/);

  const vazio = await carregar(['admin'], { getIndexadoresReajuste: [] });
  await vazio.w.contratosIndexadores();
  assert.match(html(vazio.doc), /Cadastrar valores padrão \(11\)/);
});

test('status: o drawer pede a situacao, que e o que define "vigente"', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratosStatus();
  w.abrirDrawerListaContrato();
  doc.getElementById('listaContratoNome').value = 'Em auditoria';
  doc.getElementById('listaContratoSituacao').value = 'vigente';
  assert.strictEqual(await w.salvarItemListaContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarStatusContrato');
  assert.deepStrictEqual({ nome: g.arg.nome, situacao: g.arg.situacao }, { nome: 'Em auditoria', situacao: 'vigente' });
});

test('Fornecedores: aba Contratos lista os contratos e mostra "sem contrato vigente"', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.fornecedores();
  const tela = html(doc);
  assert.match(tela, /1 contrato vigente/);
  assert.match(tela, /Sem contrato vigente/, 'Beta Telecom');
  w.abrirDrawerFornecedorCadastro('f1');
  w.trocarAbaFornecedor('contratos');
  assert.match(doc.getElementById('fornContratosLista').innerHTML, /CT-0001/);
  assert.strictEqual(doc.getElementById('btnSalvarAvaliacaoForn').style.display, 'none', 'aba Contratos nao mostra o salvar da avaliacao');
});

// ---- Aba Vigencia e valores (15/10/2026): global automatico, mensal em destaque, mascara de moeda ----

test('valor global e somente leitura e calculado: mensal x vigencia', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  const global = doc.getElementById('contratoValorGlobal');
  assert.ok(global.readOnly);
  assert.strictEqual(global.value, '12.000,00');
  assert.strictEqual(doc.getElementById('contratoValorMensal').value, '1.000,00', 'numero do banco aparece mascarado');
  assert.doesNotMatch(doc.getElementById('drawerContrato').innerHTML, /calcularValorGlobalContrato|= mensal × vigência/);
});

test('mudar o mensal ou a vigencia recalcula o global na hora; sem um dos dois, fica vazio', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  const mensal = doc.getElementById('contratoValorMensal');
  digitar(w, mensal, '4215676');
  assert.strictEqual(mensal.value, '42.156,76', 'mascara no oninput: digitos viram centavos');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '505.881,12');
  const vig = doc.getElementById('contratoVigencia');
  digitar(w, vig, '24');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '1.011.762,24');
  digitar(w, vig, '');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '');
  vig.value = '12';
  digitar(w, mensal, '');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '');
});

test('salvar envia numeros e o global calculado, ignorando o global antigo gravado no contrato', async () => {
  const { w, doc, gravacoes } = await carregar(['admin'], { getContratos: [contrato({ valorGlobal: 99999 })] });
  await w.contratos();
  w.abrirDrawerContrato('c1');
  assert.strictEqual(doc.getElementById('contratoValorGlobal').value, '12.000,00', 'mostra o calculado, nao o 99.999 antigo');
  const mensal = doc.getElementById('contratoValorMensal');
  digitar(w, mensal, '4215676');
  assert.strictEqual(await w.salvarContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarContrato').arg;
  assert.strictEqual(g.valorMensal, 42156.76);
  assert.strictEqual(g.valorGlobal, 505881.12);
});

test('contrato antigo com global diferente nao fica "sujo" so por abrir e fechar', async () => {
  const { w, gravacoes } = await carregar(['admin'], { getContratos: [contrato({ valorGlobal: 99999 })] });
  await w.contratos();
  w.abrirDrawerContrato('c1');
  await w.fecharDrawerContrato();
  assert.strictEqual(gravacoes.length, 0);
});

test('o valor global (calculado) e o ultimo campo da aba, em destaque; o mensal vem antes, comum; blocos Prazos > Reajuste > Renovacao > Valores', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  const painel = doc.getElementById('painel-contrato-vigencia');
  const campos = [...painel.querySelectorAll('input, select')].map((el) => el.id);
  assert.strictEqual(campos[campos.length - 1], 'contratoValorGlobal');
  assert.strictEqual(campos[campos.length - 2], 'contratoValorMensal');
  const blocos = [...painel.children].map((b) => b.firstElementChild.textContent.trim());
  assert.deepStrictEqual(blocos, ['Prazos', 'Reajuste', 'Renovação e cancelamento', 'Valores']);
  const global = doc.getElementById('contratoValorGlobal');
  const mensal = doc.getElementById('contratoValorMensal');
  assert.match(global.getAttribute('style'), /font-size:1\.3em/);
  assert.doesNotMatch(mensal.getAttribute('style'), /font-size:1\.3em/, 'mensal e campo comum');
  const quadro = global.closest('div[style*="border:1.5px solid #d60014"]');
  assert.ok(quadro, 'o global fica no quadro de destaque');
  assert.match(quadro.outerHTML, /Valor global do contrato/);
  assert.ok(!mensal.closest('div[style*="border:1.5px solid #d60014"]'), 'mensal fora do quadro');
  assert.ok(global.readOnly, 'continua calculado e somente leitura');
  assert.match(global.getAttribute('style'), /cursor:not-allowed/);
  assert.match(doc.getElementById('painel-contrato-vigencia').textContent, /Valor mensal do contrato \*/);
});

test('campos de valor do evento de reajuste tambem sao mascarados', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  w.prepararEventoContrato('Reajuste aplicado');
  const novo = doc.getElementById('contratoEventoValorNovo');
  digitar(w, novo, '104550');
  assert.strictEqual(novo.value, '1.045,50');
  assert.match(doc.getElementById('contratoEventoPercentual').textContent, /4,55%/);
});

// ---- SLAs do contrato (15/10/2026) ----
const DEPS_SLA = DEPS.concat([
  { id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud', rto: '4 horas', rpo: '1 hora' },
  { id: 'd-link', categoria: 'Infraestrutura', nome: 'Link MPLS', rto: '8 horas' },
]);
const PROC_SLA = [{ id: 'pr1', area: 'TI', processo: 'Varredura', rto: '< 4 horas', rpo: '< 1 hora', dependenciaItens: [{ id: 'd-qualys', nome: 'Qualys Cloud' }] }];

test('SLA: a secao fica na aba Dados e grava os tempos em minutos e as dependencias cobertas', async () => {
  const { w, doc, gravacoes } = await carregar(['admin'], { getDependencias: DEPS_SLA, getProcessos: PROC_SLA });
  await w.contratos();
  w.abrirDrawerContrato('c1');
  const dados = doc.getElementById('painel-contrato-dados');
  assert.ok(dados.querySelector('#contratoSlaRto'), 'RTO garantido na aba Dados');
  assert.match(dados.textContent, /SLAs do contrato/);
  doc.getElementById('contratoSlaCobertura').value = '24x7';
  doc.getElementById('contratoSlaResp0').value = '30'; doc.getElementById('contratoSlaResp0Un').value = '1';
  doc.getElementById('contratoSlaDisponibilidade').value = '99.9';
  doc.getElementById('contratoSlaRto').value = '8';
  doc.getElementById('contratoSlaRpo').value = '2'; doc.getElementById('contratoSlaRpoUn').value = '1440';
  doc.getElementById('contratoSlaPenalidade').value = '10% por hora';
  doc.getElementById('contratoDepCategoria').value = 'Sistemas';
  w._popularItensDependenciaContrato();
  doc.getElementById('contratoDepItem').value = 'd-qualys';
  w.adicionarDependenciaContrato();
  assert.match(doc.getElementById('contratoDepChips').textContent, /Sistemas: Qualys Cloud/);
  w._atualizarAlertasDrawerContrato();
  assert.match(doc.getElementById('contratoSlaDispDica').textContent, /43 min de parada por mês/);
  assert.strictEqual(await w.salvarContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarContrato').arg;
  assert.strictEqual(g.sla.cobertura, '24x7');
  assert.deepStrictEqual(g.sla.atendimento[0], { severidade: 'Crítica', respostaMin: 30 });
  assert.strictEqual(g.sla.rtoMin, 480);
  assert.strictEqual(g.sla.rpoMin, 2880);
  assert.strictEqual(g.sla.disponibilidadePct, 99.9);
  assert.strictEqual(g.sla.penalidade, '10% por hora');
  assert.deepStrictEqual(g.dependenciasCobertas, [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }]);
});

test('SLA: ao abrir, os minutos voltam na maior unidade exata', async () => {
  const { w, doc } = await carregar(['admin'], { getContratos: [contrato({ sla: { rtoMin: 2880, rpoMin: 90 } })] });
  await w.contratos();
  w.abrirDrawerContrato('c1');
  assert.strictEqual(doc.getElementById('contratoSlaRto').value, '2');
  assert.strictEqual(doc.getElementById('contratoSlaRtoUn').value, '1440');
  assert.strictEqual(doc.getElementById('contratoSlaRpo').value, '90');
  assert.strictEqual(doc.getElementById('contratoSlaRpoUn').value, '1');
});

test('SLA x RTO: RTO garantido acima do exigido vira alerta na grade, no filtro, no painel e na aba Vinculos', async () => {
  const c = contrato({ dataFim: CC.somarMeses(HOJE, 10), sla: { rtoMin: 480 }, dependenciasCobertas: [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }] });
  const { w, doc } = await carregar(['admin'], { getContratos: [c], getDependencias: DEPS_SLA, getProcessos: PROC_SLA });
  await w.contratos();
  assert.match(doc.getElementById('contratoRows').textContent, /SLA: RTO incompatível \(2\)/, 'dependencia (4 h) e processo (< 4 horas)');
  doc.getElementById('filtroContratoAlerta').value = '__sla__';
  w.renderizarContratos();
  assert.match(doc.getElementById('contratoRows').textContent, /CT-0001/);
  w.abrirDrawerContrato('c1');
  w.trocarAbaContrato('vinculos');
  const vinc = doc.getElementById('contratoVinculos').textContent;
  assert.match(vinc, /SLA × RTO\/RPO exigido/);
  assert.match(vinc, /Processo Varredura \(TI\)/);
  assert.match(vinc, /RTO incompatível/);
});

test('SLA x RTO: a faixa do Dashboard de Terceiros conta o contrato com SLA abaixo do exigido', async () => {
  const c = contrato({ dataFim: CC.somarMeses(HOJE, 10), sla: { rtoMin: 480 }, dependenciasCobertas: [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }] });
  const { w, doc } = await carregar(['admin'], { getContratos: [c], getDependencias: DEPS_SLA, getProcessos: PROC_SLA });
  await w.terceirosDashboard();
  assert.match(doc.getElementById('contratosPainel').textContent, /\b1\s*SLA abaixo do RTO\/RPO/);
});

test('SLA x RTO: contrato sem SLA cadastrado nao acusa nada', async () => {
  const c = contrato({ dataFim: CC.somarMeses(HOJE, 10), dependenciasCobertas: [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }] });
  const { w, doc } = await carregar(['admin'], { getContratos: [c], getDependencias: DEPS_SLA, getProcessos: PROC_SLA });
  await w.contratos();
  assert.doesNotMatch(doc.getElementById('contratoRows').textContent, /SLA/);
});

test('SLA: gestor ve a secao desabilitada, sem o seletor e sem o x dos chips', async () => {
  const c = contrato({ sla: { rtoMin: 240 }, dependenciasCobertas: [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }] });
  const { w, doc } = await carregar(['gestor'], { getContratos: [c], getDependencias: DEPS_SLA });
  await w.contratos();
  w.abrirDrawerContrato('c1');
  assert.ok(doc.getElementById('contratoSlaRto').disabled);
  assert.ok(doc.getElementById('contratoSlaCobertura').disabled);
  assert.strictEqual(doc.getElementById('contratoDepPicker').style.display, 'none');
  assert.match(doc.getElementById('contratoDepChips').textContent, /Qualys Cloud/);
  assert.doesNotMatch(doc.getElementById('contratoDepChips').innerHTML, /removerDependenciaContrato/);
});

test('aba DRP da dependencia mostra os SLAs contratados vindos do servidor', async () => {
  const slas = { success: true, contratos: [{ codigo: 'CT-0001', objeto: 'Qualys VMDR', fornecedorNome: 'ICTS', viaCobertura: true, temSla: true,
    sla: { cobertura: '24x7', rtoMin: 480, rpoMin: 60, disponibilidadePct: 99.9 },
    incompatibilidades: [{ codigo: 'sla_rto_incompativel', nivel: 'perigo', rotulo: 'RTO garantido 8 h > exigido 4 h (Dependência Qualys Cloud)' }] }] };
  const { w, doc } = await carregar(['ti'], { getDependencias: DEPS_SLA, getSlasDependencia: slas });
  await w.dependencias();
  w.abrirDrawerDependencia(DEPS_SLA.find((d) => d.id === 'd-qualys'));
  w.trocarAbaDependencia('drp');
  await new Promise((r) => setTimeout(r, 20));
  const bloco = doc.getElementById('depSlasContratados').textContent;
  assert.match(bloco, /SLAs contratados/);
  assert.match(bloco, /CT-0001 — Qualys VMDR/);
  assert.match(bloco, /RTO garantido 8 h/);
  assert.match(bloco, /RTO garantido 8 h > exigido 4 h/);
});

test('SLA: o atendimento tem so a coluna "Primeira resposta" (sem tempo de solucao), com cabecalhos de tabela', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  w.abrirDrawerContrato('c1');
  assert.ok(doc.getElementById('contratoSlaResp0'));
  assert.strictEqual(doc.getElementById('contratoSlaSol0'), null);
  const cab = [...doc.querySelectorAll('#painel-contrato-dados table thead th')].map((t) => t.textContent.trim());
  assert.deepStrictEqual(cab, ['Severidade', 'Primeira resposta']);
  cab.forEach((_, i) => assert.match(doc.querySelectorAll('#painel-contrato-dados table thead th')[i].getAttribute('style'), /display:table-cell/));
});

// ---- Clonar pela grade (16/10/2026) ----

test('o drawer do contrato nao tem mais o botao Clonar no rodape', async () => {
  const { w, doc } = await carregar(['admin']);
  await w.contratos();
  assert.strictEqual(doc.getElementById('btnClonarContrato'), null);
  const rodape = [...doc.querySelectorAll('#drawerContrato .drawer-footer button')].map((b) => b.textContent.trim());
  // Sem "Cancelar" (16/10/2026): descartar é uma das respostas do Fechar quando há alteração.
  assert.deepStrictEqual(rodape, ['Fechar', 'Salvar']);
});

test('grade: quem edita ve o icone Clonar em cada linha; o gestor nao', async () => {
  const admin = await carregar(['admin']);
  await admin.w.contratos();
  assert.match(admin.doc.getElementById('contratoRows').innerHTML, /clonarContrato\('c1'\)/);
  const gestor = await carregar(['gestor']);
  await gestor.w.contratos();
  assert.doesNotMatch(gestor.doc.getElementById('contratoRows').innerHTML, /clonarContrato/);
  gestor.w.clonarContrato('c1');
  assert.ok(!gestor.doc.getElementById('drawerContrato').classList.contains('open'), 'gestor nao clona nem chamando a funcao');
});

test('clonar pela grade abre uma copia sem codigo nem numero, sem gravar, e Salvar cria um contrato novo', async () => {
  const original = contrato({
    numero: '0001', sla: { cobertura: '24x7', rtoMin: 480 }, valorMensal: 1000, documentos: [{ titulo: 'Contrato', url: 'https://x.test/c.pdf' }],
    dependenciasCobertas: [{ id: 'd-qualys', categoria: 'Sistemas', nome: 'Qualys Cloud' }], alertas: [{ codigo: 'x', rotulo: 'x' }],
  });
  const { w, doc, gravacoes } = await carregar(['operador'], { getContratos: [original], getDependencias: DEPS_SLA });
  await w.contratos();
  w.clonarContrato('c1');
  assert.ok(doc.getElementById('drawerContrato').classList.contains('open'));
  assert.strictEqual(doc.getElementById('contratoId').value, '');
  assert.strictEqual(doc.getElementById('contratoDrawerTitulo').textContent, 'Novo Contrato');
  assert.strictEqual(doc.getElementById('contratoCodigo').value, 'CT-0002', 'previa do proximo codigo, nao o do original');
  assert.strictEqual(doc.getElementById('contratoNumero').value, '');
  assert.strictEqual(doc.getElementById('contratoObjeto').value, 'Suite de e-mail (cópia)');
  assert.strictEqual(doc.getElementById('contratoFornecedor').value, 'f1');
  assert.strictEqual(doc.getElementById('contratoTipo').value, 't1');
  assert.strictEqual(doc.getElementById('contratoValorMensal').value, '1.000,00');
  assert.strictEqual(doc.getElementById('contratoSlaCobertura').value, '24x7');
  assert.match(doc.getElementById('contratoDepChips').textContent, /Qualys Cloud/);
  assert.match(doc.getElementById('contratoDocumentosLista').textContent, /Contrato/);
  assert.strictEqual(gravacoes.length, 0, 'abrir a copia nao grava nada');

  assert.strictEqual(await w.salvarContrato(), true);
  const g = gravacoes.find((x) => x.nome === 'salvarContrato').arg;
  assert.strictEqual(g.id, null, 'contrato novo, nao atualiza o original');
  assert.strictEqual(g.codigo, 'CT-0002');
  assert.strictEqual(g.objeto, 'Suite de e-mail (cópia)');
  assert.strictEqual(g.sla.rtoMin, 480);
  assert.strictEqual(w.contratosData ? w.contratosData[0].id : 'c1', 'c1');
});

test('fechar a copia sem mexer pergunta (rascunho nao existe no banco): Salvar cria, o original continua intacto', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratos();
  w.clonarContrato('c1');
  await w.fecharDrawerContrato();
  assert.strictEqual(w.__perguntasFechar, 1);
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarContrato').length, 1);
  assert.strictEqual(gravacoes[0].arg.id, null);
  assert.ok(!doc.getElementById('drawerContrato').classList.contains('open'));
});

test('fechar a copia e Descartar nao cria contrato nenhum', async () => {
  const { w, doc, gravacoes } = await carregar(['admin']);
  await w.contratos();
  w.clonarContrato('c1');
  w.__respostaFechar = 'descartar';
  await w.fecharDrawerContrato();
  assert.strictEqual(w.__perguntasFechar, 1);
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarContrato').length, 0);
  assert.ok(!doc.getElementById('drawerContrato').classList.contains('open'));
});

test('Fornecedores: sem contrato vigente mas com contrato em "Vigência expirada", a linha mostra "Vigência expirada" (e continua contando como sem vigente)', async () => {
  const status = [{ id: 's-vig', nome: 'Vigente', situacao: 'vigente', ativo: true }, { id: 's-exp', nome: 'Ativo', situacao: 'expirada', ativo: true }];
  const expirado = contrato({ id: 'c9', codigo: 'CT-0009', fornecedorId: 'f2', fornecedorNome: 'Beta Telecom', statusId: 's-exp', dataFim: CC.somarDias(HOJE, -90) });
  const { w, doc } = await carregar(['admin'], { getStatusContrato: status, getContratos: [contrato(), expirado] });
  await w.fornecedores();
  const linhas = [...doc.querySelectorAll('.forn-vigencia-expirada')];
  assert.strictEqual(linhas.length, 1);
  assert.match(linhas[0].textContent, /Vigência expirada/);
  assert.match(linhas[0].getAttribute('title'), /CT-0009/);
  assert.match(linhas[0].closest('tr').textContent, /Beta Telecom/);
  assert.match(html(doc), /1 contrato vigente/, 'Alfa continua com o vigente');
  const filtrados = w._contratosVigentesDoFornecedor('f2').length;
  assert.strictEqual(filtrados, 0, 'expirado nao e vigente: segue no filtro "sem contrato vigente"');
});
