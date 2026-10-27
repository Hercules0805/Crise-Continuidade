// Painel de Vulnerabilidades (19/10/2026): conta do painel (public/vulnerabilidade-painel.js),
// paridade com a foto mensal do servidor (functions/painelVulnerabilidades.js) e a tela no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const VP = require('../public/vulnerabilidade-painel.js');
const Servidor = require('../functions/painelVulnerabilidades.js');

const HOJE = '2026-10-19';
const v = (extra) => Object.assign({
  id: 'x', codigo: '2026-000', nome: 'Falha', cvss: null, severidadeManual: 'Média', statusCorrecao: 'Pendente',
  dataDeteccao: '2026-09-01', dataPrevistaCorrecao: '', dataCorrecao: '', dataAceite: '', atualizadoEm: '',
  tipo: '', subtipo: '', exploitDisponivel: '', equipeResponsavel: '', dependenciasAfetadas: [],
  severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);

// Processos com Tier pelo score do BIA (Criticidade: >=12 T1, >=6 T2, senao T3; sem avaliacao = Pendente).
const PROCESSOS = [
  { id: 'p1', processo: 'Folha de pagamento', area: 'RH', score: 15, avaliado: true, dependenciaItens: [{ id: 'd1' }] },
  { id: 'p2', processo: 'Atendimento', area: 'CS', score: 8, avaliado: true, dependenciaItens: [{ id: 'd2' }] },
  { id: 'p3', processo: 'Arquivo', area: 'ADM', score: 0, avaliado: false, dependenciaItens: [{ id: 'd1' }] },
];

const LISTA = [
  v({ id: 'a', codigo: '2026-001', cvss: 9.8, dataDeteccao: '2026-10-01', dependenciasAfetadas: [{ id: 'd1' }] }), // Critica, T1
  v({ id: 'b', codigo: '2026-002', severidadeManual: 'Alta', exploitDisponivel: 'Sim', dataPrevistaCorrecao: '2026-10-09', equipeResponsavel: 'Infra' }), // atrasada 10d
  v({ id: 'c', codigo: '2026-003', severidadeManual: 'Média', statusCorrecao: 'Em Correção', dataPrevistaCorrecao: '2026-12-01', equipeResponsavel: 'Infra' }),
  v({ id: 'd', codigo: '2026-004', severidadeManual: 'Baixa', statusCorrecao: 'Corrigida', dataDeteccao: '2026-08-01', dataPrevistaCorrecao: '2026-08-31', dataCorrecao: '2026-08-21', equipeResponsavel: 'Infra' }), // 20 dias, no prazo
  v({ id: 'e', codigo: '2026-005', severidadeManual: 'Alta', statusCorrecao: 'Corrigida', dataDeteccao: '2026-07-01', dataPrevistaCorrecao: '2026-07-15', dataCorrecao: '2026-09-29', equipeResponsavel: 'Dev' }), // 90 dias, fora do prazo
  v({ id: 'f', codigo: '2026-006', severidadeManual: 'Alta', statusCorrecao: 'Aceita', dataDeteccao: '2026-06-01', dataAceite: '2026-08-10' }),
  v({ id: 'g', codigo: '2026-007', severidadeManual: '', tipo: 'Não Conformidade', subtipo: 'LGPD/Privacidade', dependenciasAfetadas: [{ id: 'd2' }] }), // sem severidade
  v({ id: 'h', codigo: '2026-008', severidadeManual: 'Média', tipo: 'Não Conformidade', severidadeCriterios: { impacto: 'Grave', facilidade: 'Possível' }, dataDeteccao: '' }),
];

test('em aberto, atrasada e sem prazo seguem a regra da lista (Corrigida e Aceita saem do backlog)', () => {
  assert.deepStrictEqual(LISTA.filter(VP.emAberto).map((x) => x.id), ['a', 'b', 'c', 'g', 'h']);
  assert.deepStrictEqual(LISTA.filter((x) => VP.atrasada(x, HOJE)).map((x) => x.id), ['b']);
  assert.deepStrictEqual(LISTA.filter(VP.semPrazo).map((x) => x.id), ['a', 'g', 'h']);
  assert.ok(!VP.atrasada(v({ dataPrevistaCorrecao: HOJE }), HOJE), 'vence hoje ainda nao esta atrasada');
});

test('exposicao: contagem por severidade, indice ponderado e aceitas a parte', () => {
  const e = VP.exposicao(LISTA);
  assert.strictEqual(e.abertas, 5);
  assert.deepStrictEqual(e.porSeveridade, { 'Crítica': 1, 'Alta': 1, 'Média': 2, 'Baixa': 0, 'Não informado': 1 });
  assert.strictEqual(e.criticasAltas, 2);
  assert.strictEqual(e.indice, 10 + 5 + 2 * 2, 'sem severidade pesa 0');
  assert.strictEqual(e.semSeveridade, 1);
  assert.strictEqual(e.aceitas, 1);
  assert.strictEqual(e.aceitasPorSeveridade['Alta'], 1);
});

test('porProduto: mais exposto (indice) primeiro, sem produto agrupado', () => {
  const nome = (x) => ({ a: 'ERP', b: 'Portal', c: 'Portal' }[x.id] || '');
  const g = VP.porProduto(LISTA, nome);
  assert.deepStrictEqual(g.map((p) => [p.nome, p.total, p.indice]), [['ERP', 1, 10], ['Portal', 2, 7], ['Sem produto', 2, 2]]);
});

test('mesesAte e fimDoMes atravessam a virada de ano', () => {
  assert.deepStrictEqual(VP.mesesAte('2026-02-10', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.strictEqual(VP.fimDoMes('2028-02'), '2028-02-29');
  assert.strictEqual(VP.rotuloMes('2026-09'), 'set/26');
});

test('serie reconstruida: backlog no fim de cada mes pelas datas de deteccao, correcao e aceite', () => {
  const s = VP.serieMensal(LISTA, { meses: 5, hoje: HOJE });
  assert.deepStrictEqual(s.map((p) => p.mes), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  const porMes = Object.fromEntries(s.map((p) => [p.mes, p]));
  assert.strictEqual(porMes['2026-06'].abertas, 1, 'jun: so f (aceita em agosto)');
  assert.strictEqual(porMes['2026-07'].abertas, 2, 'jul: f + e');
  assert.strictEqual(porMes['2026-08'].abertas, 1, 'ago: d corrigida e f aceita no mes; sobra e');
  assert.strictEqual(porMes['2026-08'].novas, 1);
  assert.strictEqual(porMes['2026-08'].corrigidas, 1);
  assert.strictEqual(porMes['2026-08'].atrasadas, 1, 'e venceu em julho');
  assert.strictEqual(porMes['2026-09'].abertas, 3, 'set: b, c, g (e corrigida em 29/09; h sem data de deteccao fica fora)');
  assert.ok(s.slice(0, 4).every((p) => p.fonte === 'reconstruida'));
  const out = porMes['2026-10'];
  assert.strictEqual(out.fonte, 'atual');
  assert.strictEqual(out.abertas, VP.exposicao(LISTA).abertas, 'mes corrente = estado ao vivo (bate com os cards)');
  assert.strictEqual(out.atrasadas, 1);
});

test('serie: a foto gravada pelo servidor prevalece sobre a reconstrucao do mes', () => {
  const foto = { mes: '2026-09', abertas: 7, porSeveridade: { 'Crítica': 2, 'Alta': 1, 'Média': 0, 'Baixa': 4, 'Não informado': 0 }, atrasadas: 3, semPrazo: 2, novas: 4, corrigidas: 1 };
  const s = VP.serieMensal(LISTA, { meses: 2, hoje: HOJE, fotos: [foto, Object.assign({}, foto, { mes: '2026-10', abertas: 99 })] });
  assert.deepStrictEqual([s[0].fonte, s[0].abertas, s[0].criticasAltas, s[0].indice, s[0].novas], ['foto', 7, 3, 2 * 10 + 5 + 4, 4]);
  assert.strictEqual(s[1].fonte, 'atual', 'o mes corrente nunca usa a foto');
  assert.strictEqual(s[1].abertas, 5);
});

test('aceita antiga sem dataAceite: usa a ultima edicao; sem nada, nunca conta no passado', () => {
  assert.strictEqual(VP.dataSaida(v({ statusCorrecao: 'Aceita', atualizadoEm: '2026-05-03T10:00:00Z' })), '2026-05-03');
  assert.ok(!VP.abertaEm(v({ statusCorrecao: 'Corrigida', dataDeteccao: '2026-01-01' }), '2026-03-31'));
  assert.ok(VP.abertaEm(v({ dataDeteccao: '2026-01-01' }), '2026-03-31'));
});

test('mttr e movimento: corrigidas na janela, deteccao -> correcao', () => {
  const m = VP.mttr(LISTA, '2026-08-01', '2026-10-19');
  assert.strictEqual(m.n, 2);
  assert.strictEqual(m.media, 55, '(20 + 90) / 2');
  assert.deepStrictEqual(m.porSeveridade['Baixa'], { media: 20, n: 1 });
  assert.deepStrictEqual(m.porSeveridade['Alta'], { media: 90, n: 1 });
  const mov = VP.movimento(LISTA, '2026-09-01', '2026-10-19');
  assert.deepStrictEqual(mov, { novas: 4, corrigidas: 1, saldo: 3, taxaFechamento: 25 }, 'a, b, c, g (h sem data de deteccao)');
  const j = VP.janelas(HOJE, 90);
  assert.deepStrictEqual(j.atual, { de: '2026-07-22', ate: HOJE });
  assert.deepStrictEqual(j.anterior, { de: '2026-04-23', ate: '2026-07-21' });
});

test('cumprimento de prazo: so conta quem tinha Data Prevista; atraso medio de hoje', () => {
  const cp = VP.cumprimentoPrazo(LISTA, '2026-08-01', HOJE);
  assert.deepStrictEqual(cp, { corrigidas: 2, comPrazo: 2, noPrazo: 1, foraDoPrazo: 1, semPrazoDefinido: 0, pct: 50 });
  const at = VP.atraso(LISTA, HOJE);
  assert.deepStrictEqual([at.atrasadas, at.diasMedio, at.diasMaximo, at.semPrazo, at.pctSemPrazo], [1, 10, 10, 3, 60]);
});

test('por equipe: mais atrasadas primeiro, sem equipe agrupado', () => {
  const eq = VP.porEquipe(LISTA, '2026-08-01', HOJE, HOJE);
  assert.deepStrictEqual(eq.map((e) => e.equipe), ['Infra', 'Sem equipe definida', 'Dev']);
  const infra = eq[0];
  assert.deepStrictEqual([infra.abertas, infra.atrasadas, infra.corrigidas, infra.pctNoPrazo, infra.mttr], [2, 1, 1, 100, 20]);
  assert.deepStrictEqual([eq[2].abertas, eq[2].corrigidas, eq[2].pctNoPrazo], [0, 1, 0]);
});

test('acao imediata: criterios, motivos e ordem de prioridade', () => {
  const itens = VP.acaoImediata(LISTA, { hoje: HOJE, processos: PROCESSOS, limiar: 7, riscoAberto: (id) => id === 'a' });
  assert.deepStrictEqual(itens.map((i) => i.v.id), ['a', 'b']);
  assert.deepStrictEqual(itens[0].motivos, ['Crítica', 'Processo Tier 1']);
  assert.deepStrictEqual(itens[1].motivos, ['Alta com exploit', 'Atrasada', 'Acima do limiar sem risco']);
  assert.strictEqual(itens[1].diasAtraso, 10);
  // Sem a lista de riscos (Gestor), o criterio do limiar some -- nunca acusa "sem risco" no escuro.
  const gestor = VP.acaoImediata(LISTA, { hoje: HOJE, processos: PROCESSOS, limiar: 7 });
  assert.ok(gestor.every((i) => !i.motivos.includes('Acima do limiar sem risco')));
  // Media que so atinge processo Tier 1 tambem entra.
  const t1 = VP.acaoImediata([v({ id: 'z', dependenciasAfetadas: [{ id: 'd1' }] })], { hoje: HOJE, processos: PROCESSOS });
  assert.deepStrictEqual(t1.map((i) => i.motivos), [['Processo Tier 1']]);
});

test('processos expostos: cadeia vulnerabilidade -> dependencia -> processo, Tier 1 primeiro', () => {
  const exp = VP.processosExpostos(LISTA, PROCESSOS);
  assert.deepStrictEqual(exp.processos.map((p) => [p.processo, p.tier, p.total, p.piorSeveridade]), [
    ['Folha de pagamento', 'Tier 1 (Crítico)', 1, 'Crítica'],
    ['Atendimento', 'Tier 2 (Essencial)', 1, 'Não informado'],
    ['Arquivo', 'Pendente', 1, 'Crítica'],
  ]);
  assert.deepStrictEqual(exp.porTier, { 'Tier 1 (Crítico)': 1, 'Tier 2 (Essencial)': 1, 'Tier 3 (Suporte)': 0, 'Pendente': 1 });
  const corrigida = VP.processosExpostos([v({ statusCorrecao: 'Corrigida', dependenciasAfetadas: [{ id: 'd1' }] })], PROCESSOS);
  assert.strictEqual(corrigida.processos.length, 0, 'so vulnerabilidade em aberto expoe processo');
});

test('exposicao de dados (LGPD ou Nao Conformidade Alto/Grave) e abertas sem vinculo', () => {
  const d = VP.exposicaoDados(LISTA);
  assert.deepStrictEqual(d.vulnerabilidades.map((x) => x.id), ['g', 'h']);
  assert.strictEqual(d.lgpd, 1);
  assert.deepStrictEqual(VP.semVinculo(LISTA), { total: 3, pct: 60 });
});

test('dica do mes: texto puro com fonte, backlog e saldo', () => {
  const linhas = VP.linhasDicaMes({ mes: '2026-09', fonte: 'foto', abertas: 7, criticasAltas: 3, indice: 29, novas: 4, corrigidas: 1, atrasadas: 3, semPrazo: 2 });
  assert.strictEqual(linhas[0], 'set/26 · Fechamento do mês (foto gravada)');
  assert.ok(linhas.includes('Novas: 4 · Corrigidas: 1 · Saldo: +3'));
});

// ---- Paridade com o servidor (cada deploy leva so a sua pasta: duas implementacoes) ----

test('foto do servidor bate com a conta da tela (em aberto, severidade, indice, atraso, sem prazo)', () => {
  const foto = Servidor.fotoDoMes(LISTA, '2026-10-20');
  const e = VP.exposicao(LISTA);
  assert.strictEqual(foto.mes, '2026-10', 'foto do mes de ontem');
  assert.strictEqual(foto.abertas, e.abertas);
  assert.deepStrictEqual(foto.porSeveridade, e.porSeveridade);
  assert.strictEqual(foto.indice, e.indice);
  assert.strictEqual(foto.aceitas, e.aceitas);
  assert.strictEqual(foto.atrasadas, VP.atraso(LISTA, '2026-10-20').atrasadas);
  assert.strictEqual(foto.semPrazo, VP.atraso(LISTA, '2026-10-20').semPrazo);
  assert.deepStrictEqual(Servidor.PESO, VP.PESO);
  // A tela, reconstruindo o mes depois, chega ao mesmo fechamento da foto do dia 1o.
  const fotoVirada = Servidor.fotoDoMes(LISTA, '2026-09-01');
  const rec = VP.serieMensal(LISTA, { meses: 3, hoje: HOJE }).find((p) => p.mes === '2026-08');
  assert.strictEqual(fotoVirada.mes, '2026-08');
  assert.deepStrictEqual([rec.novas, rec.corrigidas], [fotoVirada.novas, fotoVirada.corrigidas]);
});

test('data de aceite: grava ao aceitar, limpa ao sair de Aceita, senao nada', () => {
  assert.deepStrictEqual(Servidor.patchDataAceite({ statusCorrecao: 'Aceita' }, HOJE), { dataAceite: HOJE });
  assert.strictEqual(Servidor.patchDataAceite({ statusCorrecao: 'Aceita', dataAceite: '2026-01-02' }, HOJE), null);
  assert.deepStrictEqual(Servidor.patchDataAceite({ statusCorrecao: 'Pendente', dataAceite: '2026-01-02' }, HOJE), { dataAceite: '' });
  assert.strictEqual(Servidor.patchDataAceite({ statusCorrecao: 'Pendente' }, HOJE), null);
  assert.strictEqual(Servidor.patchDataAceite(null, HOJE), null, 'exclusao');
});

// ---- Tela (app.js real no jsdom) ----

const PUB = path.join(__dirname, '..', 'public');
const diaRel = (dias) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

const TELA_VULNS = [
  v({ id: 'a', codigo: '2026-001', nome: 'RCE no ERP', cvss: 9.8, dataDeteccao: diaRel(-20), dependenciasAfetadas: [{ id: 'd1' }] }),
  v({ id: 'b', codigo: '2026-002', nome: 'XSS no portal', severidadeManual: 'Alta', exploitDisponivel: 'Sim', dataDeteccao: diaRel(-40), dataPrevistaCorrecao: diaRel(-5), equipeResponsavel: 'Infra' }),
  v({ id: 'c', codigo: '2026-003', nome: 'Header ausente', severidadeManual: 'Baixa', statusCorrecao: 'Corrigida', dataDeteccao: diaRel(-30), dataPrevistaCorrecao: diaRel(-10), dataCorrecao: diaRel(-12), equipeResponsavel: 'Infra' }),
];

async function carregarTela(perfil, api) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const chamadas = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = [perfil]; w.USER_PERFIL = perfil;
  w.API = new Proxy({}, {
    get: (_, nome) => async () => {
      chamadas.push(nome);
      if (api && api[nome]) return api[nome]();
      if (nome === 'getVulnerabilidades') return JSON.parse(JSON.stringify(TELA_VULNS));
      if (nome === 'getProcessos') return JSON.parse(JSON.stringify(PROCESSOS));
      if (nome === 'getRiscos') return [];
      if (nome === 'getConfigVulnerabilidade') return { limiarCvss: 7 };
      return [];
    },
    set: () => true,
  });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'vulnerabilidade-painel.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'app.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  await w.vulnerabilidadesPainel();
  return { w, doc: w.document, chamadas };
}

const texto = (doc) => doc.getElementById('painelVulnConteudo').textContent.replace(/\s+/g, ' ');

test('tela: as 5 perguntas, na ordem, com os numeros do backlog', async () => {
  const { doc } = await carregarTela('admin');
  const perguntas = [...doc.querySelectorAll('.painel-pergunta')].map((el) => el.textContent);
  assert.strictEqual(perguntas.length, 5);
  assert.match(perguntas[0], /exposição atual/);
  assert.match(perguntas[1], /melhorando ou piorando/);
  assert.match(perguntas[2], /ação imediata/);
  assert.match(perguntas[3], /dentro dos prazos/);
  assert.match(perguntas[4], /serviços e dados críticos/);
  const cards = [...doc.querySelectorAll('.painel-metricas')[0].querySelectorAll('.bia-metric')].map((c) => c.querySelector('.bia-metric__value').textContent);
  assert.deepStrictEqual(cards, ['2', '2', '15', '0'], 'em aberto, criticas+altas, indice (10+5), aceitas');
  assert.ok(doc.querySelectorAll('svg[role="img"]').length === 2, 'backlog e entradas x saidas');
  assert.match(texto(doc), /Folha de pagamento/, 'processo Tier 1 atingido');
});

test('tela (Admin): acao imediata leva ao drawer; criterio do limiar ativo', async () => {
  const { doc, chamadas } = await carregarTela('admin');
  assert.ok(chamadas.includes('getRiscos'));
  const linhas = [...doc.querySelectorAll('.painel-card tbody tr')].filter((tr) => /2026-00[12]/.test(tr.textContent));
  assert.strictEqual(linhas.length, 2);
  assert.match(linhas[0].getAttribute('onclick'), /#vulnerabilidades\?vuln=a/);
  assert.match(texto(doc), /Acima do limiar sem risco/);
});

test('tela (Gestor): ve o painel sem ler o Registro de Riscos e sem link para a lista', async () => {
  const { doc, chamadas } = await carregarTela('gestor');
  assert.ok(!chamadas.includes('getRiscos'), 'regra do banco: gestor so le riscos da propria area');
  assert.ok(doc.querySelectorAll('.painel-pergunta').length === 5);
  const linhas = [...doc.querySelectorAll('.painel-card tbody tr')].filter((tr) => /2026-00[12]/.test(tr.textContent));
  assert.ok(linhas.length && linhas.every((tr) => !tr.getAttribute('onclick')));
  assert.doesNotMatch(texto(doc), /Acima do limiar sem risco/);
  assert.doesNotMatch(doc.querySelector('.page-header').innerHTML, /Ver lista/);
});

test('tela: filtro por tipo recalcula; sem resultado mostra estado vazio', async () => {
  const { w, doc } = await carregarTela('admin');
  doc.getElementById('painelVulnTipo').value = 'Não Conformidade';
  w.filtrarPainelVulnerabilidades();
  assert.ok(doc.querySelector('#painelVulnConteudo .vazio'), 'nenhuma Nao Conformidade nos dados');
  doc.getElementById('painelVulnTipo').value = '';
  w.filtrarPainelVulnerabilidades();
  assert.strictEqual(doc.querySelectorAll('.painel-pergunta').length, 5);
});

test('tela: processos que nao carregam viram erro so no bloco 5; vulnerabilidades que nao carregam, erro da tela', async () => {
  const semProc = await carregarTela('admin', { getProcessos: () => { throw new Error('x'); } });
  assert.match(texto(semProc.doc), /Não foi possível carregar os processos/);
  assert.strictEqual(semProc.doc.querySelectorAll('.painel-pergunta').length, 5);
  const semVuln = await carregarTela('admin', { getVulnerabilidades: () => { throw new Error('x'); } });
  assert.match(semVuln.doc.getElementById('app').textContent, /Não foi possível carregar as vulnerabilidades/);
});

test('tela: dica do grafico mostra o mes', async () => {
  const { w, doc } = await carregarTela('admin');
  const alvo = doc.querySelector('rect.ponto-monitor-hit');
  w._mostrarDicaPainelVuln({ currentTarget: alvo }, w._painelVulnSerie.length - 1);
  assert.match(doc.getElementById('dicaMonitor').textContent, /Hoje \(ao vivo\)/);
  assert.match(doc.getElementById('dicaMonitor').textContent, /Em aberto: 2/);
});

// ---- Relatorio Executivo (20/10/2026): dadosRelatorio, destaques e o que vai para a IA ----

test('relatorio: dadosRelatorio junta os blocos do painel; destaques e IA saem dos mesmos numeros', () => {
  const d = VP.dadosRelatorio(LISTA, { hoje: HOJE, meses: 3, processos: PROCESSOS, limiar: 7, riscoAberto: (id) => id === 'a' });
  assert.strictEqual(d.exposicao.abertas, 5);
  assert.strictEqual(d.serie.length, 3);
  assert.deepStrictEqual(d.acao.map((i) => i.v.id), ['a', 'b']);
  assert.strictEqual(d.janela, 90);
  const txt = VP.destaques(d).join(' | ');
  assert.match(txt, /5 vulnerabilidades em aberto \(\+2 vs\. set\/26\); 2 são Críticas ou Altas\. Índice de exposição: 19\./);
  assert.match(txt, /2 vulnerabilidades exigem ação imediata/);
  assert.match(txt, /1 está atrasada \(atraso médio de 10 dias\)/);
  assert.match(txt, /1 processo Tier 1 está exposto/);
  const ia = VP.indicadoresParaIA(d);
  assert.strictEqual(ia.emAberto, 5);
  assert.deepStrictEqual(ia.principaisAcaoImediata[0], { codigo: '2026-001', nome: 'Falha', severidade: 'Crítica', motivos: ['Crítica', 'Processo Tier 1'] });
  assert.ok(!('descricao' in ia.principaisAcaoImediata[0]), 'so codigo, nome, severidade e motivos');
  assert.ok(JSON.stringify(ia).length < 20000);
});

// ---- Filtros do relatorio (20/10/2026) ----

test('filtrar: produto, equipe, responsavel, tipo, severidade minima e periodo de deteccao', () => {
  const nome = (x) => ({ a: 'ERP', b: 'Portal', c: 'Portal' }[x.id] || '');
  const ids = (f) => VP.filtrar(LISTA, f, { nomeProduto: nome }).map((x) => x.id);
  assert.deepStrictEqual(ids({}), LISTA.map((x) => x.id));
  assert.deepStrictEqual(ids({ produto: 'Portal' }), ['b', 'c']);
  assert.deepStrictEqual(ids({ produto: VP.SEM }), ['d', 'e', 'f', 'g', 'h']);
  assert.deepStrictEqual(ids({ equipe: 'Infra' }), ['b', 'c', 'd']);
  assert.deepStrictEqual(ids({ equipe: VP.SEM }), ['a', 'f', 'g', 'h']);
  assert.deepStrictEqual(ids({ tipo: 'Não Conformidade' }), ['g', 'h']);
  assert.deepStrictEqual(ids({ tipo: '__sem_tipo__' }).length, 6);
  assert.deepStrictEqual(ids({ severidadeMinima: 'Alta' }), ['a', 'b', 'e', 'f'], 'sem severidade fica fora');
  assert.deepStrictEqual(ids({ severidadeMinima: 'Crítica' }), ['a']);
  assert.deepStrictEqual(ids({ detectadoDe: '2026-09-01', detectadoAte: '2026-09-30' }), ['b', 'c', 'g'], 'sem data de deteccao fica fora');
  assert.deepStrictEqual(ids({ produto: 'Portal', severidadeMinima: 'Alta' }), ['b'], 'filtros combinados');
});

test('descreverFiltros: frase do escopo; sem filtro = Empresa inteira', () => {
  assert.strictEqual(VP.descreverFiltros({}), 'Empresa inteira');
  assert.ok(!VP.temFiltro({ produto: '', tipo: '' }));
  assert.strictEqual(VP.descreverFiltros({ produto: 'ERP', equipe: VP.SEM, severidadeMinima: 'Alta', detectadoDe: '2026-07-01', detectadoAte: '2026-09-30' }),
    'Produto: ERP · Equipe: sem equipe · Alta ou mais grave · Detectadas de 01/07/2026 até 30/09/2026');
});

// ---- Processo -> Servico -> componentes (21/10/2026) ----
test('processosExpostos/acaoImediata com a rede: vulnerabilidade no Banco expoe o processo ligado so via Servico', () => {
  const rede = {
    servicos: [{ id: 's1', nome: 'Portal', dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] }],
    dependencias: [
      { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
      { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' },
    ],
  };
  const processos = [{ id: 'p1', processo: 'Folha', area: 'RH', tierManual: 'Tier 1 (Crítico)', dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }] }];
  const vulns = [{ id: 'v1', status: 'Pendente', severidadeManual: 'Média', dependenciasAfetadas: [{ id: 'db', nome: 'Oracle' }] }];
  assert.deepStrictEqual(VP.processosExpostos(vulns, processos, rede).processos.map((p) => p.id), ['p1']);
  assert.deepStrictEqual(VP.processosExpostos(vulns, processos).processos, [], 'sem a rede, so o vinculo direto');
  const acao = VP.acaoImediata(vulns, { processos, rede, hoje: '2026-10-21' });
  assert.ok(acao.length && acao[0].processosTier1.length === 1, 'atinge processo Tier 1 pela cadeia');
});
