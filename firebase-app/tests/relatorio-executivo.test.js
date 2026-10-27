// Relatorios Executivos de Vulnerabilidades e de Riscos (20/10/2026): cards da tela Relatorios,
// fluxo de geracao (aba aberta no clique, IA opcional que nao bloqueia) e o documento.
// app.js real no jsdom, com a API e o window.open trocados por dados de teste.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const dia = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

const VULNS = [
  { id: 'v1', codigo: '2026-001', nome: 'RCE <script>alert(1)</script>', cvss: 9.8, severidadeManual: '', statusCorrecao: 'Pendente', dataDeteccao: dia(-20), dataPrevistaCorrecao: dia(-2), dependenciasAfetadas: [{ id: 'd1' }], equipeResponsavel: 'Infra' },
  { id: 'v2', codigo: '2026-002', nome: 'Header ausente', cvss: null, severidadeManual: 'Baixa', statusCorrecao: 'Corrigida', dataDeteccao: dia(-40), dataPrevistaCorrecao: dia(-10), dataCorrecao: dia(-12), equipeResponsavel: 'Infra' },
];
const PROCESSOS = [{ id: 'p1', processo: 'Folha', area: 'DP', score: 15, avaliado: true, dependenciaItens: [{ id: 'd1' }] }];
const RISCOS = [
  { id: 'r1', titulo: 'Ransomware <img src=x onerror=alert(1)>', area: 'TI', processoId: 'p1', status: 'Identificado', probabilidade: 'Muito alta', impacto: 'Muito alto', impactoFinanceiro: 1000, proximaReavaliacao: dia(-5) },
  { id: 'r2', titulo: 'Fornecedor único', area: '', status: 'Aceito', probabilidade: 'Alta', impacto: 'Muito alto', estrategiaTratamento: 'Aceitar', justificativaAceite: 'Sem alternativa',
    planoAcao: [{ acao: 'Plano B', quando: dia(-3), status: 'Pendente' }] },
];

async function carregar(perfil, o) {
  const opc = o || {};
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const paginas = [];
  const chamadas = [];
  const toasts = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = [perfil]; w.USER_EMAIL = 'analista@fortestecnologia.com.br';
  const botoes = {};
  w.open = () => (opc.popupBloqueado ? null : { document: { open() {}, close() {}, write: (h) => paginas.push(h), getElementById: (id) => (botoes[id] = botoes[id] || { textContent: '', disabled: false }) } });
  w.__botoes = botoes;
  w.API = new Proxy({}, { get: (_, nome) => async (a, b) => {
    chamadas.push({ nome, a, b });
    if (opc.api && opc.api[nome]) return opc.api[nome](a, b);
    if (nome === 'getVulnerabilidades') return JSON.parse(JSON.stringify(VULNS));
    if (nome === 'getProcessos') return JSON.parse(JSON.stringify(PROCESSOS));
    if (nome === 'getRiscos') return JSON.parse(JSON.stringify(RISCOS));
    if (nome === 'getConfigVulnerabilidade') return { limiarCvss: 7 };
    if (nome === 'getConfigRiscos') return { apetite: 'Moderado' };
    if (nome === 'getHistoricoRiscoDesde') return [{ dia: dia(-1), empresa: { carga: 99, contados: 2, impactoFinanceiro: 1000 }, mudancas: [{ tipo: 'novo' }] }];
    if (nome === 'post' && a === 'gerarResumoExecutivo') return { success: true, paragrafos: ['Situação <b>grave</b>.'], recomendacoes: ['Corrigir o RCE.'] };
    if (nome === 'post' && a === 'serieRiscoPorEscopo') {
      const pontos = (k) => [['2026-08', 60], ['2026-09', 85], ['2026-10', 115]].map(([mes, carga], i) => ({ mes, carga: Math.round(carga * k), contados: 2, impactoFinanceiro: 1000, novos: i ? 1 : 2, sairam: i === 2 ? 1 : 0,
        areas: [{ area: 'TI', carga: Math.round(carga * k * 0.6), contados: 1, novos: 1, sairam: 0 }] }));
      const marcos = [{ riscoId: 'r1', titulo: 'Ransomware <img src=x onerror=alert(1)>', area: 'TI', tipo: 'reavaliado', cargaAntes: 30, cargaDepois: 75 }];
      return { success: true, empresa: { pontos: pontos(1.5), marcos }, escopo: b && b.riscoIds ? { pontos: pontos(1), marcos } : null };
    }
    return [];
  } });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'vulnerabilidade-painel.js', 'cvss31.js', 'risco-consolidado.js', 'risco-relatorio.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  w.__toasts = toasts;
  return { w, doc: w.document, paginas, chamadas, toasts };
}

// DECISAO 20/10/2026: cada relatorio tem tela propria no menu Riscos
// (#vulnerabilidades-relatorio, #riscos-relatorio), com as opcoes na tela.
const TELA = { vulnerabilidades: 'vulnerabilidadesRelatorio', riscos: 'riscosRelatorio' };

async function gerar(ctx, tipo, marcarIA) {
  if (ctx.w._relExecTipo !== tipo || !ctx.doc.getElementById('relExecIA')) await ctx.w[TELA[tipo]]();
  ctx.doc.getElementById('relExecIA').checked = marcarIA !== false;
  await ctx.w.gerarRelatorioExecutivo();
  return ctx.paginas[ctx.paginas.length - 1];
}

const texto = (html) => new JSDOM(html).window.document.body.textContent.replace(/\s+/g, ' ');
const secoes = (html) => [...new JSDOM(html).window.document.querySelectorAll('.secao')].map((s) => s.textContent.replace(/\s+/g, ' ').trim());

test('telas proprias no menu Riscos: Admin/Seguranca geram, Gestor so ve o compartilhado; TI/Operador nao; a tela Relatorios nao tem mais os executivos', async () => {
  const Perfis = require('../public/perfis.js');
  for (const [perfil, ve] of [['admin', true], ['seguranca', true], ['gestor', true], ['ti', false], ['operador', false]]) {
    assert.strictEqual(Perfis.podeVerTela([perfil], 'vulnerabilidades-relatorio'), ve, perfil);
    assert.strictEqual(Perfis.podeVerTela([perfil], 'riscos-relatorio'), ve, perfil);
  }
  const ctx = await carregar('admin');
  await ctx.w.relatorios();
  assert.doesNotMatch(ctx.doc.getElementById('app').textContent, /Executivo|Edições salvas/);
  await ctx.w.vulnerabilidadesRelatorio();
  assert.strictEqual(ctx.doc.querySelector('h2').textContent, 'Relatório de Vulnerabilidades');
  assert.ok(ctx.doc.getElementById('relExecApendice'), 'opcao do apendice so no de vulnerabilidades');
  await ctx.w.riscosRelatorio();
  assert.strictEqual(ctx.doc.querySelector('h2').textContent, 'Relatório de Riscos');
  assert.ok(!ctx.doc.getElementById('relExecApendice'));
  assert.match(ctx.doc.getElementById('relatoriosSalvos').textContent, /Nenhuma edição salva deste relatório/);
});

test('vulnerabilidades: aba aberta com "Gerando…", depois o documento com as 5 perguntas, IA escapada e apendice', async () => {
  const ctx = await carregar('seguranca');
  const html = await gerar(ctx, 'vulnerabilidades');
  assert.match(ctx.paginas[0], /Gerando o relatório e o resumo por IA/);
  assert.strictEqual(ctx.paginas.length, 2);
  const s = secoes(html);
  assert.strictEqual(s.length, 7, '5 perguntas + apendice + notas');
  assert.match(s[0], /exposição atual/);
  assert.match(s[4], /serviços e dados críticos/);
  assert.match(s[5], /Apêndice/);
  assert.match(html, /Situação &lt;b&gt;grave&lt;\/b&gt;\./, 'texto da IA escapado');
  assert.ok(!html.includes('<script>alert(1)'), 'nome da vulnerabilidade escapado');
  assert.match(texto(html), /Corrigir o RCE\./);
  assert.match(texto(html), /Texto gerado por IA/);
  assert.match(texto(html), /Classificação: Uso Interno/);
  assert.match(texto(html), /Folha/, 'processo Tier 1 exposto');
  const ia = ctx.chamadas.find((c) => c.nome === 'post');
  assert.strictEqual(ia.b.tipo, 'vulnerabilidades');
  assert.strictEqual(ia.b.indicadores.emAberto, 1);
});

test('IA desmarcada nao chama o servidor; IA com erro: relatorio sai com aviso e destaques', async () => {
  const sem = await carregar('admin');
  const html = await gerar(sem, 'vulnerabilidades', false);
  assert.ok(!sem.chamadas.some((c) => c.nome === 'post'));
  assert.doesNotMatch(texto(html), /Resumo executivo/);
  assert.match(texto(html), /Destaques/);
  const erro = await carregar('admin', { api: { post: () => { throw new Error('Cota da IA esgotada para hoje.'); } } });
  const html2 = await gerar(erro, 'riscos');
  assert.match(texto(html2), /Resumo por IA indisponível \(Cota da IA esgotada para hoje\.\)/);
  assert.strictEqual(secoes(html2).length, 8, '7 secoes + notas');
});



test('popup bloqueado avisa; falha ao carregar os dados vira pagina de erro na mesma aba', async () => {
  const bloq = await carregar('admin', { popupBloqueado: true });
  await gerar(bloq, 'riscos');
  assert.match(bloq.toasts.join(' '), /Popup bloqueado/);
  const falha = await carregar('admin', { api: { getRiscos: () => { throw new Error('Falha na leitura do banco de dados.'); } } });
  const html = await gerar(falha, 'riscos');
  assert.match(texto(html), /Não foi possível carregar os dados: Falha na leitura do banco de dados/);
  assert.ok(!falha.chamadas.some((c) => c.nome === 'post'), 'sem dados, nao chama a IA');
});

// ---- Edicoes salvas (20/10/2026): retrato dos dados, nunca HTML; reabre igual; so Admin exclui ----

function bancoRelatorios() {
  const salvos = [];
  return {
    salvos,
    api: {
      salvarRelatorioExecutivo: (r) => { salvos.push(r); return { success: true, id: 's' + salvos.length, salvoEm: '2026-10-20T12:00:00.000Z' }; },
      getRelatoriosExecutivos: () => salvos.map((r, i) => ({ id: 's' + (i + 1), tipo: r.tipo, titulo: r.titulo, geradoEm: r.geradoEm, geradoPor: 'analista@fortestecnologia.com.br', meses: r.meses, comIA: r.comIA, resumo: r.resumo, versao: r.versao })),
      getConteudoRelatorioExecutivo: (id) => ({ id, conteudo: salvos[Number(String(id).slice(1)) - 1].conteudo }),
    },
  };
}

const idTempDe = (html) => (html.match(/_salvarRelatorioExecutivoGerado\('([^']+)'\)/) || [])[1];

test('relatorio gerado tem "Salvar no sistema"; salvar grava o retrato JSON (sem HTML) e nao duplica', async () => {
  const banco = bancoRelatorios();
  const ctx = await carregar('seguranca', { api: banco.api });
  const html = await gerar(ctx, 'riscos');
  assert.match(html, /💾 Salvar no sistema/);
  const id = idTempDe(html);
  assert.ok(id, 'botao chama a aba do sistema com o id da edicao');
  await ctx.w._salvarRelatorioExecutivoGerado(id);
  await ctx.w._salvarRelatorioExecutivoGerado(id);
  assert.strictEqual(banco.salvos.length, 1, 'segundo clique nao duplica');
  const s = banco.salvos[0];
  assert.strictEqual(s.tipo, 'riscos');
  assert.strictEqual(s.comIA, true);
  const retrato = JSON.parse(s.conteudo);
  assert.strictEqual(retrato.versao, 2);
  assert.ok(retrato.dados.baseRecorte && retrato.dados.baseRecorte.riscos.length, 'v2: base do recorte por area');
  assert.ok(retrato.dados.d.panorama, 'dados calculados');
  assert.deepStrictEqual(retrato.resumoIA.paragrafos, ['Situação <b>grave</b>.']);
  assert.ok(!/<html|<!DOCTYPE/i.test(s.conteudo), 'nunca o HTML do documento');
  assert.ok(!('indicadoresIA' in retrato.dados));
  assert.match(ctx.w.__botoes.btnSalvarRelatorio.textContent, /✅ Salvo em/);
  assert.ok(ctx.w.__botoes.btnSalvarRelatorio.disabled);
  assert.match(ctx.toasts.join(' '), /Relatório salvo/);
});

test('"Edicoes salvas": cada tela so lista as do proprio relatorio; abre a edicao igual, com faixa e sem botao de salvar', async () => {
  const banco = bancoRelatorios();
  const ctx = await carregar('admin', { api: banco.api });
  await ctx.w._salvarRelatorioExecutivoGerado(idTempDe(await gerar(ctx, 'riscos', false)));
  const original = await gerar(ctx, 'vulnerabilidades');
  await ctx.w._salvarRelatorioExecutivoGerado(idTempDe(original));
  const lista = ctx.doc.getElementById('relatoriosSalvos').textContent;
  assert.match(lista, /Edições salvas/);
  assert.match(lista, /Relatório Executivo de Vulnerabilidades/);
  assert.doesNotMatch(lista, /Relatório Executivo de Riscos/, 'a de riscos fica na tela de riscos');
  assert.ok(ctx.doc.querySelector('#relatoriosSalvos [title="Excluir"]'), 'Admin ve Excluir');
  await ctx.w.riscosRelatorio();
  assert.match(ctx.doc.getElementById('relatoriosSalvos').textContent, /Relatório Executivo de Riscos/);
  await ctx.w.abrirRelatorioExecutivoSalvo('s2');
  const reaberto = ctx.paginas[ctx.paginas.length - 1];
  assert.match(reaberto, /Edição salva/);
  assert.doesNotMatch(reaberto, /Salvar no sistema/);
  const corpo = (h) => texto(h).replace(/.*?Destaques/, 'Destaques').replace(/Gerado em .*$/, '');
  assert.strictEqual(corpo(reaberto), corpo(original), 'mesmo conteudo do documento gerado');
});

test('Seguranca ve a lista mas nao exclui; Admin exclui com confirmacao', async () => {
  const banco = bancoRelatorios();
  const si = await carregar('seguranca', { api: banco.api });
  await si.w._salvarRelatorioExecutivoGerado(idTempDe(await gerar(si, 'riscos', false)));
  assert.ok(!si.doc.querySelector('#relatoriosSalvos [title="Excluir"]'));
  const excluidos = [];
  const admin = await carregar('admin', { api: Object.assign({}, banco.api, { excluirRelatorioExecutivo: (id) => { excluidos.push(id); return { success: true }; } }) });
  admin.w.confirm = () => true;
  await admin.w.excluirRelatorioExecutivoSalvo('s1');
  assert.deepStrictEqual(excluidos, ['s1']);
});

test('edicao adulterada sai escapada; corrompida ou de versao desconhecida vira erro na mesma aba', async () => {
  const banco = bancoRelatorios();
  const ctx = await carregar('admin', { api: banco.api });
  await ctx.w._salvarRelatorioExecutivoGerado(idTempDe(await gerar(ctx, 'riscos', false)));
  const retrato = JSON.parse(banco.salvos[0].conteudo);
  retrato.dados.d.principais[0].r.titulo = '<script>alert("x")</script>';
  retrato.dados.destaques = ['<img src=x onerror=alert(1)>'];
  banco.salvos.push(Object.assign({}, banco.salvos[0], { conteudo: JSON.stringify(retrato) }));
  banco.salvos.push(Object.assign({}, banco.salvos[0], { conteudo: '{nao e json' }));
  banco.salvos.push(Object.assign({}, banco.salvos[0], { conteudo: JSON.stringify(Object.assign({}, retrato, { versao: 99 })) }));
  await ctx.w.abrirRelatorioExecutivoSalvo('s2');
  const adulterado = ctx.paginas[ctx.paginas.length - 1];
  assert.ok(!adulterado.includes('<script>alert'), 'titulo escapado');
  assert.ok(!adulterado.includes('<img src=x'), 'destaque escapado');
  await ctx.w.abrirRelatorioExecutivoSalvo('s3');
  assert.match(texto(ctx.paginas[ctx.paginas.length - 1]), /está corrompido/);
  await ctx.w.abrirRelatorioExecutivoSalvo('s4');
  assert.match(texto(ctx.paginas[ctx.paginas.length - 1]), /formato que esta versão do sistema não sabe abrir/);
});

test('falha ao salvar: botao volta, toast de erro, pode tentar de novo', async () => {
  let tentativas = 0;
  const ctx = await carregar('admin', { api: { salvarRelatorioExecutivo: () => { tentativas++; throw new Error('Este relatório é grande demais para ser salvo no sistema. Use Imprimir / PDF.'); } } });
  const id = idTempDe(await gerar(ctx, 'riscos', false));
  await ctx.w._salvarRelatorioExecutivoGerado(id);
  assert.strictEqual(ctx.w.__botoes.btnSalvarRelatorio.textContent, '💾 Salvar no sistema');
  assert.ok(!ctx.w.__botoes.btnSalvarRelatorio.disabled);
  assert.match(ctx.toasts.join(' '), /grande demais/);
  await ctx.w._salvarRelatorioExecutivoGerado(id);
  assert.strictEqual(tentativas, 2);
});

// ---- Compartilhar com gestores (20/10/2026): Riscos recortado por area, sem IA; Gestor so ve o seu ----

function bancoComCompartilhar() {
  const b = bancoRelatorios();
  const compartilhados = [];
  const abertos = [];
  const revogados = [];
  const PERFIS_LISTA = [
    { email: 'gestor.ti@fortestecnologia.com.br', perfis: ['gestor'], area: 'TI' },
    { email: 'gestor.semarea@fortestecnologia.com.br', perfis: ['gestor'], area: '' },
    { email: 'analista@fortestecnologia.com.br', perfis: ['seguranca'], area: '' },
  ];
  Object.assign(b.api, {
    getPerfis: () => JSON.parse(JSON.stringify(PERFIS_LISTA)),
    compartilharRelatorioExecutivo: (c) => {
      c.destinatarios.forEach((d) => compartilhados.push(Object.assign({ id: 'c' + (compartilhados.length + 1), edicaoId: c.edicaoId, tipo: c.tipo, titulo: c.titulo, geradoEm: c.geradoEm,
        mensagem: c.mensagem, compartilhadoPor: 'analista@fortestecnologia.com.br', compartilhadoEm: '2026-10-20T13:00:00Z', revogado: false, abertoEm: null }, d)));
      return { success: true };
    },
    getCompartilhamentosDaEdicao: (id) => compartilhados.filter((c) => c.edicaoId === id).map((c) => Object.assign({}, c, { conteudo: undefined })),
    getRelatoriosCompartilhadosComigo: () => compartilhados.filter((c) => !c.revogado && c.para === 'gestor.ti@fortestecnologia.com.br'),
    marcarCompartilhamentoAberto: (id) => { abertos.push(id); compartilhados.find((c) => c.id === id).abertoEm = '2026-10-20T14:00:00Z'; return { success: true }; },
    revogarCompartilhamento: (id) => { revogados.push(id); compartilhados.find((c) => c.id === id).revogado = true; return { success: true }; },
  });
  return Object.assign(b, { compartilhados, abertos, revogados });
}

// Gestores em ordem de e-mail no modal: gestor.semarea, depois gestor.ti.
const IDX = { semArea: 0, ti: 1 };

async function salvarECompartilhar(banco, tipo) {
  const si = await carregar('seguranca', { api: banco.api });
  await si.w._salvarRelatorioExecutivoGerado(idTempDe(await gerar(si, tipo)));
  const edicao = 's' + banco.salvos.length;
  await si.w._carregarRelatoriosSalvos();
  await si.w.abrirCompartilharRelatorio(edicao);
  return { si, edicao };
}

test('compartilhar Riscos: modal lista gestores (sem area bloqueado), cada um recebe so a area dele e sem o resumo da IA', async () => {
  const banco = bancoComCompartilhar();
  const { si } = await salvarECompartilhar(banco, 'riscos');
  const modal = si.doc.getElementById('compartilharRelatorioCorpo');
  assert.match(modal.textContent, /só os riscos da área dele/);
  const caixas = [...modal.querySelectorAll('input[type="checkbox"]')];
  assert.strictEqual(caixas.length, 2, 'so os perfis de Gestor');
  assert.ok(caixas[IDX.semArea].disabled, 'gestor sem area nao recebe recorte');
  assert.match(modal.textContent, /sem área no perfil/);
  si.w.marcarGestorCompartilhar(IDX.semArea, true);
  si.w.marcarGestorCompartilhar(IDX.ti, true);
  si.doc.getElementById('compartilharMensagem').value = 'Para a reunião de segunda';
  await si.w.confirmarCompartilharRelatorio();
  assert.strictEqual(banco.compartilhados.length, 1);
  const c = banco.compartilhados[0];
  assert.deepStrictEqual([c.para, c.area, c.mensagem], ['gestor.ti@fortestecnologia.com.br', 'TI', 'Para a reunião de segunda']);
  const r = JSON.parse(c.conteudo);
  assert.strictEqual(r.recorteArea, 'TI');
  assert.strictEqual(r.resumoIA, null, 'resumo da IA nao vai no recorte');
  assert.deepStrictEqual(r.dados.d.principais.map((x) => x.r.id), ['r1']);
  assert.ok(!c.conteudo.includes('Fornecedor único'), 'risco de outra area fora do retrato');
  assert.ok(!c.conteudo.includes('baseRecorte'), 'a base da empresa nao vai para o gestor');
  assert.match(si.doc.getElementById('compartilharRelatorioCorpo').textContent, /Já compartilhado[\s\S]*gestor\.ti[\s\S]*Não aberto/);
  assert.ok(si.doc.querySelectorAll('#compartilharRelatorioCorpo input[type="checkbox"]')[IDX.ti].disabled, 'quem ja recebeu nao recebe de novo');
});

test('Gestor: tela so com "Compartilhados com voce"; abre o recorte com faixa e referencia da empresa; marca a abertura uma vez', async () => {
  const banco = bancoComCompartilhar();
  const { si } = await salvarECompartilhar(banco, 'riscos');
  si.w.marcarGestorCompartilhar(IDX.ti, true);
  await si.w.confirmarCompartilharRelatorio();
  const g = await carregar('gestor', { api: banco.api });
  g.w.USER_EMAIL = 'gestor.ti@fortestecnologia.com.br';
  await g.w.riscosRelatorio();
  const tela = g.doc.getElementById('app').textContent;
  assert.match(tela, /Compartilhados com você/);
  assert.doesNotMatch(tela, /Gerar relatório|Edições salvas/);
  assert.match(tela, /Área TI/);
  await g.w.abrirRelatorioCompartilhado('c1');
  const html = g.paginas[g.paginas.length - 1];
  const t = texto(html);
  assert.match(t, /Compartilhado com você por analista@fortestecnologia\.com\.br/);
  assert.match(t, /recorte da área TI/);
  assert.match(t, /Referência da empresa/);
  assert.match(t, /Área TI \(eixo à esquerda\)/, 'linha do tempo da area do gestor');
  assert.match(t, /Empresa — referência \(eixo à direita\)/);
  assert.match(t, /Relatório Executivo de Riscos — área TI/);
  assert.doesNotMatch(t, /Fornecedor único/);
  assert.doesNotMatch(t, /Carga por área/);
  assert.doesNotMatch(t, /Resumo executivo/);
  assert.ok(!html.includes('<img src=x'), 'titulo escapado');
  assert.deepStrictEqual(banco.abertos, ['c1']);
  await g.w.abrirRelatorioCompartilhado('c1');
  assert.deepStrictEqual(banco.abertos, ['c1'], 'abertura marcada so na primeira vez');
});

test('Vulnerabilidades vai inteiro (com IA); edicao v1 de Riscos nao compartilha; revogar tira o acesso', async () => {
  const banco = bancoComCompartilhar();
  const { si } = await salvarECompartilhar(banco, 'vulnerabilidades');
  const caixas = [...si.doc.querySelectorAll('#compartilharRelatorioCorpo input[type="checkbox"]')];
  assert.ok(!caixas[IDX.semArea].disabled, 'no de vulnerabilidades, gestor sem area tambem recebe');
  si.w.marcarGestorCompartilhar(IDX.ti, true);
  await si.w.confirmarCompartilharRelatorio();
  const r = JSON.parse(banco.compartilhados[0].conteudo);
  assert.ok(!r.recorteArea);
  assert.deepStrictEqual(r.resumoIA.paragrafos, ['Situação <b>grave</b>.']);
  si.w.confirm = () => true;
  await si.w.revogarCompartilhamentoRelatorio('c1');
  assert.deepStrictEqual(banco.revogados, ['c1']);
  assert.match(si.doc.getElementById('compartilharRelatorioCorpo').textContent, /Revogado/);
  // v1 de Riscos (salvo antes do recorte): botao desabilitado
  banco.salvos.push(Object.assign({}, banco.salvos[0], { tipo: 'riscos', titulo: 'Relatório Executivo de Riscos', versao: 1 }));
  await si.w.riscosRelatorio();
  const btn = [...si.doc.querySelectorAll('#relatoriosSalvos button')].find((b) => b.textContent === 'Compartilhar');
  assert.ok(btn && btn.disabled);
  assert.match(btn.title, /anterior ao recorte por área/);
});

// ---- Escopo do relatorio: filtros antes de gerar (20/10/2026) ----

const sel = (doc, id, valor) => { const el = doc.getElementById(id); el.value = valor; return el; };

test('vulnerabilidades: filtros saem dos dados; contagem ao vivo; zero desabilita Gerar; documento e IA so com o escopo', async () => {
  const ctx = await carregar('admin');
  await ctx.w.vulnerabilidadesRelatorio();
  const equipe = [...ctx.doc.getElementById('relFiltroEquipe').options].map((o) => o.value);
  assert.deepStrictEqual(equipe, ['', 'Infra', '__sem__'], 'opcoes vem do que existe');
  assert.match(ctx.doc.getElementById('relExecContagem').textContent, /2 vulnerabilidades no escopo \(1 em aberto\) · Empresa inteira/);
  sel(ctx.doc, 'relFiltroTipo', 'Não Conformidade');
  ctx.w.atualizarEscopoRelatorio();
  assert.ok(ctx.doc.getElementById('btnGerarRelExec').disabled, 'nada no escopo');
  sel(ctx.doc, 'relFiltroTipo', '');
  sel(ctx.doc, 'relFiltroSeveridade', 'Crítica');
  ctx.w.atualizarEscopoRelatorio();
  assert.ok(!ctx.doc.getElementById('btnGerarRelExec').disabled);
  assert.match(ctx.doc.getElementById('relExecContagem').textContent, /1 vulnerabilidade no escopo \(1 em aberto\) · Só Crítica/);
  const html = await gerar(ctx, 'vulnerabilidades');
  assert.match(texto(html), /Escopo do relatório: Só Crítica/);
  assert.doesNotMatch(texto(html), /Header ausente/, 'a Baixa ficou fora do escopo');
  const ia = ctx.chamadas.find((c) => c.nome === 'post');
  assert.strictEqual(ia.b.indicadores.escopo, 'Só Crítica');
});


test('edicao filtrada guarda o escopo; gestor de area fora do escopo fica bloqueado no compartilhar', async () => {
  const banco = bancoComCompartilhar();
  banco.api.getPerfis = () => [
    { email: 'gestor.rh@fortestecnologia.com.br', perfis: ['gestor'], area: 'RH' },
    { email: 'gestor.ti@fortestecnologia.com.br', perfis: ['gestor'], area: 'TI' },
  ];
  const getRel = banco.api.getRelatoriosExecutivos;
  banco.api.getRelatoriosExecutivos = () => getRel().map((r, i) => Object.assign(r, { escopo: banco.salvos[i].escopo, areasEscopo: banco.salvos[i].areasEscopo }));
  const si = await carregar('seguranca', { api: banco.api });
  await si.w.riscosRelatorio();
  sel(si.doc, 'relFiltroArea', 'TI');
  si.w.atualizarEscopoRelatorio();
  await si.w._salvarRelatorioExecutivoGerado(idTempDe(await gerar(si, 'riscos', false)));
  assert.strictEqual(banco.salvos[0].escopo, 'Área: TI');
  assert.strictEqual(JSON.stringify(banco.salvos[0].areasEscopo), '["TI"]');
  assert.match(si.doc.getElementById('relatoriosSalvos').textContent, /Escopo: Área: TI/);
  await si.w.abrirCompartilharRelatorio('s1');
  const corpo = si.doc.getElementById('compartilharRelatorioCorpo');
  const caixas = [...corpo.querySelectorAll('input[type="checkbox"]')];
  assert.ok(caixas[0].disabled, 'gestor de RH: area fora do escopo');
  assert.match(corpo.textContent, /sem riscos da área neste escopo/);
  assert.ok(!caixas[1].disabled);
});

test('riscos: pagina executiva no inicio (situacao, linha do tempo, decisoes); detalhamento nas etapas NIST; apendice', async () => {
  const ctx = await carregar('admin');
  const html = await gerar(ctx, 'riscos');
  const s = secoes(html);
  assert.match(s[0], /Panorama/);
  assert.match(s[1], /Mapa de calor/);
  assert.match(s[4], /Resposta ao risco/);
  assert.match(s[5], /Monitoramento/);
  assert.match(s[6], /Apêndice/);
  const doc = new JSDOM(html).window.document;
  const quebra = doc.querySelector('.quebra-antes');
  assert.ok(quebra && quebra.nextElementSibling.classList.contains('ia'), 'pagina 1 = visao executiva; o resumo abre a pagina 2');
  const t = texto(html);
  const pos = (re) => t.search(re);
  assert.ok(pos(/Situação geral/) < pos(/Linha do tempo — carga de risco/) && pos(/Linha do tempo — carga de risco/) < pos(/Decisões que dependem da diretoria/)
    && pos(/Decisões que dependem/) < pos(/Resumo executivo/), 'ordem da primeira pagina');
  assert.match(t, /Piorando/);
  assert.match(t, /Carga da empresa115▼ −13 vs\. set\/26▲ \+25 vs\. ago\/26/, 'mes corrente ao vivo (115) contra os fechamentos');
  assert.match(t, /O que mais mudou no período/);
  assert.match(t, /Aceite acima do apetite sem aprovador: 1/);
  assert.strictEqual(doc.querySelectorAll('svg[aria-label="Linha do tempo da carga de risco"]').length, 1);
  assert.strictEqual(doc.querySelectorAll('table.mapa').length, 2);
  assert.ok(doc.querySelector('.mapa td.acima-apetite'), 'celulas acima do apetite marcadas');
  assert.ok(doc.querySelectorAll('.cartao-risco').length <= 5, 'top 5 no corpo');
  assert.match(t, /A\. Os 10 principais riscos/);
  assert.match(t, /B\. Linha do tempo mês a mês/);
  assert.ok(!html.includes('<img src=x'), 'titulo do risco escapado');
  const chamada = ctx.chamadas.find((c) => c.nome === 'post' && c.a === 'serieRiscoPorEscopo');
  assert.strictEqual(chamada.b.riscoIds, null, 'sem filtro: empresa inteira');
  assert.strictEqual(doc.querySelectorAll('svg[aria-label="Linha do tempo da carga de risco"] polyline').length, 1, 'sem filtro: so a linha da empresa');
});

test('riscos com filtro: linha do escopo + empresa como referencia; ids do escopo incluem os encerrados', async () => {
  const ctx = await carregar('admin');
  await ctx.w.riscosRelatorio();
  sel(ctx.doc, 'relFiltroOrigem', 'Manual');
  ctx.w.atualizarEscopoRelatorio();
  const html = await gerar(ctx, 'riscos', false);
  const chamada = ctx.chamadas.find((c) => c.nome === 'post' && c.a === 'serieRiscoPorEscopo');
  assert.deepStrictEqual(Array.from(chamada.b.riscoIds), ['r1', 'r2']);
  const doc = new JSDOM(html).window.document;
  assert.strictEqual(doc.querySelectorAll('svg[aria-label="Linha do tempo da carga de risco"] polyline').length, 2, 'escopo + referencia');
  assert.match(texto(html), /Escopo do relatório — referência \(eixo à direita\)|Empresa — referência \(eixo à direita\)/);
  assert.doesNotMatch(texto(html), /Tendência indisponível/);
});

test('riscos: linha do tempo que nao carrega vira aviso e o resto do relatorio sai', async () => {
  const ctx = await carregar('admin', { api: { post: (a) => { if (a === 'serieRiscoPorEscopo') throw new Error('Falha na leitura das medições.'); return { paragrafos: [] }; } } });
  const html = await gerar(ctx, 'riscos', false);
  assert.match(texto(html), /Linha do tempo indisponível/);
  assert.match(texto(html), /Principais riscos/);
});
