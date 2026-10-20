// Relatorio Executivo de Riscos (20/10/2026): conta do documento (public/risco-relatorio.js).
const { test } = require('node:test');
const assert = require('node:assert');
const RR = require('../public/risco-relatorio.js');

const HOJE = '2026-10-20';
const r = (extra) => Object.assign({ id: 'x', titulo: 'Risco', area: 'TI', status: 'Identificado', probabilidade: '', impacto: '', origem: 'Manual' }, extra);

// Processos: p1 Tier 1 (score 15), p2 Tier 3 (score 3).
const PROCESSOS = [{ id: 'p1', score: 15, avaliado: true }, { id: 'p2', score: 3, avaliado: true }];

const LISTA = [
  // Muito alta x Muito alto = Muito alto, score 25, Tier 1 -> carga 75. Acima do apetite (Moderado), sem resposta.
  r({ id: 'a', titulo: 'Ransomware', processoId: 'p1', probabilidade: 'Muito alta', impacto: 'Muito alto', impactoFinanceiro: 500000, proximaReavaliacao: '2026-10-01' }),
  // Alta x Alto = Alto, score 16, Tier 3 -> carga 16. Mitigar com 2 acoes (1 atrasada, 1 concluida). Residual Baixa x Moderado.
  r({ id: 'b', titulo: 'Vazamento', area: 'RH', processoId: 'p2', probabilidade: 'Alta', impacto: 'Alto', status: 'Em Tratamento', estrategiaTratamento: 'Mitigar',
    probabilidadeResidual: 'Baixa', impactoResidual: 'Moderado', impactoFinanceiro: 100000, origem: 'Vulnerabilidade',
    planoAcao: [{ acao: 'Corrigir', quando: '2026-10-10', status: 'Pendente' }, { acao: 'Treinar', quando: '2026-09-01', status: 'Concluído' }],
    proximaReavaliacao: '2026-12-01' }),
  // Aceito acima do apetite (Alta x Muito alto = Muito alto) e sem aprovador; sem area = Corporativo.
  r({ id: 'c', titulo: 'Fornecedor unico', area: '', probabilidade: 'Alta', impacto: 'Muito alto', status: 'Aceito', estrategiaTratamento: 'Aceitar', justificativaAceite: 'Sem alternativa', origem: 'Fornecedor', alertaAutomacao: 'Severidade caiu' }),
  // Sem avaliacao.
  r({ id: 'd', titulo: 'Sem P e I' }),
  // Encerrado: fora de tudo, menos do status.
  r({ id: 'e', titulo: 'Antigo', probabilidade: 'Muito alta', impacto: 'Muito alto', status: 'Encerrado' }),
];

test('panorama: ativos, carga, apetite, R$ e contagens por status/origem', () => {
  const p = RR.panorama(LISTA, PROCESSOS, {}, 'Moderado');
  assert.strictEqual(p.ativos, 4);
  assert.strictEqual(p.encerrados, 1);
  assert.strictEqual(p.carga, 75 + 16 + 20 * 2, 'c sem processo: peso padrao 2 (score 4x5=20)');
  assert.strictEqual(p.semAvaliacao, 1);
  assert.strictEqual(p.acimaDoApetite, 3, 'a, b (Alto) e c (Muito alto)');
  assert.strictEqual(p.impactoFinanceiro, 600000);
  assert.strictEqual(p.semImpactoFinanceiro, 2);
  assert.strictEqual(p.porStatus['Encerrado'], 1);
  assert.strictEqual(p.porStatus['Identificado'], 2);
  assert.deepStrictEqual(p.porOrigem, { Manual: 2, Vulnerabilidade: 1, Fornecedor: 1 });
  assert.strictEqual(p.apetite, 'Moderado');
});

test('mapa de calor: contagem por celula P x I, inerente e residual, sem avaliacao a parte', () => {
  const PI = (p, i) => [['Muito baixa', 'Baixa', 'Moderada', 'Alta', 'Muito alta'].indexOf(p), ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'].indexOf(i)];
  const ine = RR.mapaCalor(LISTA, 'inerente');
  let [p, i] = PI('Muito alta', 'Muito alto');
  assert.strictEqual(ine.contagem[p][i], 1, 'encerrado nao entra');
  [p, i] = PI('Alta', 'Muito alto');
  assert.strictEqual(ine.contagem[p][i], 1);
  assert.deepStrictEqual([ine.avaliados, ine.semAvaliacao], [3, 1]);
  const res = RR.mapaCalor(LISTA, 'residual');
  [p, i] = PI('Baixa', 'Moderado');
  assert.strictEqual(res.contagem[p][i], 1);
  assert.deepStrictEqual([res.avaliados, res.semAvaliacao], [1, 3]);
});

test('principais: maior carga primeiro, sem avaliacao fora', () => {
  const top = RR.principais(LISTA, PROCESSOS, {}, 'Moderado', 10);
  assert.deepStrictEqual(top.map((x) => [x.r.id, x.carga, x.nivel]), [['a', 75, 'Muito alto'], ['c', 40, 'Muito alto'], ['b', 16, 'Alto']]);
  assert.strictEqual(top[2].nivelResidual, 'Baixo');
  assert.strictEqual(RR.principais(LISTA, PROCESSOS, {}, 'Moderado', 1).length, 1);
});

test('tratamento: estrategias, acoes atrasadas pela regra da tela, sem resposta e aceites sem aprovador', () => {
  const t = RR.tratamento(LISTA, 'Moderado', HOJE);
  assert.deepStrictEqual(t.porEstrategia, { Mitigar: 1, Transferir: 0, Evitar: 0, Aceitar: 1, 'Não definida': 2 });
  assert.deepStrictEqual(t.acoes, { total: 2, concluidas: 1, emAndamento: 0, pendentes: 0, atrasadas: 1 });
  assert.strictEqual(t.pctAcoesConcluidas, 50);
  assert.deepStrictEqual(t.acoesAtrasadas.map((x) => [x.r.id, x.diasAtraso]), [['b', 10]]);
  assert.deepStrictEqual(t.semResposta.map((x) => x.id), ['a'], 'b tem plano; c aceito com justificativa');
  assert.strictEqual(t.aceites.length, 1);
  assert.ok(t.aceites[0].semAprovador);
  assert.strictEqual(t.aceitesSemAprovador, 1);
  const comAprov = RR.tratamento([Object.assign({}, LISTA[2], { aprovadorAceite: 'Diretoria' })], 'Moderado', HOJE);
  assert.strictEqual(comAprov.aceitesSemAprovador, 0);
});

test('monitoramento: reavaliacao vencida, sem data, KRI pelo callback e alertas', () => {
  const m = RR.monitoramento(LISTA, HOJE, (x) => x.id === 'b');
  assert.deepStrictEqual(m.reavaliacaoVencida.map((x) => [x.r.id, x.diasAtraso]), [['a', 19]]);
  assert.strictEqual(m.semReavaliacao, 2, 'c e d');
  assert.deepStrictEqual(m.kriForaDaMeta.map((x) => x.id), ['b']);
  assert.deepStrictEqual(m.alertas.map((x) => x.id), ['c']);
  assert.deepStrictEqual(RR.monitoramento(LISTA, HOJE).kriForaDaMeta, [], 'sem indicadores: nada acusado');
});

test('serie mensal do historico: ultimo retrato do mes, mudancas somadas, mes sem retrato = null', () => {
  const hist = [
    { dia: '2026-08-10', empresa: { carga: 50, contados: 3, impactoFinanceiro: 1000 }, mudancas: [{ tipo: 'novo' }] },
    { dia: '2026-08-31', empresa: { carga: 60, contados: 4, impactoFinanceiro: 2000 }, mudancas: [{ tipo: 'novo' }, { tipo: 'reavaliado' }] },
    { dia: '2026-10-19', empresa: { carga: 40, contados: 3, impactoFinanceiro: 1500 }, mudancas: [{ tipo: 'encerrado' }, { tipo: 'excluido' }] },
  ];
  const s = RR.serieMensalHistorico(hist, 3, HOJE);
  assert.deepStrictEqual(s.map((x) => x.mes), ['2026-08', '2026-09', '2026-10']);
  assert.deepStrictEqual([s[0].carga, s[0].contados, s[0].novos, s[0].sairam, s[0].dia], [60, 4, 2, 0, '2026-08-31']);
  assert.strictEqual(s[1].carga, null, 'setembro sem retrato: ausencia, nao zero');
  assert.deepStrictEqual([s[2].carga, s[2].sairam], [40, 2]);
});

test('destaques e indicadores da IA saem dos mesmos numeros', () => {
  const panorama = RR.panorama(LISTA, PROCESSOS, {}, 'Moderado');
  const d = {
    panorama,
    tratamento: RR.tratamento(LISTA, 'Moderado', HOJE),
    monitoramento: RR.monitoramento(LISTA, HOJE),
    principais: RR.principais(LISTA, PROCESSOS, {}, 'Moderado', 10),
    serie: [{ mes: '2026-09', carga: 100 }, { mes: '2026-10', carga: 131 }],
  };
  const txt = RR.destaques(d).join(' | ');
  assert.match(txt, /4 riscos ativos, carga de 131 pontos/);
  assert.match(txt, /3 riscos acima do apetite \(até Moderado\), 1 sem resposta definida/);
  assert.match(txt, /Carga subiu 31 pontos de set\/26 para out\/26/);
  assert.match(txt, /1 de 2 ações do plano concluídas; 1 atrasada/);
  assert.match(txt, /1 acima do apetite sem aprovador/);
  assert.match(txt, /1 reavaliação vencida/);
  const ia = RR.indicadoresParaIA(d);
  assert.strictEqual(ia.riscosAtivos, 4);
  assert.strictEqual(ia.acimaDoApetiteSemResposta, 1);
  assert.deepStrictEqual(ia.principais[0], { titulo: 'Ransomware', area: 'TI', nivel: 'Muito alto', nivelResidual: null, carga: 75, estrategia: '', status: 'Identificado' });
  assert.ok(!JSON.stringify(ia).includes('Sem alternativa'), 'justificativa (texto livre) nao vai para a IA');
  assert.ok(JSON.stringify(ia).length < 20000);
});

// ---- Recorte por area para o Gestor (20/10/2026) ----

test('serie mensal de uma area: linha da area no retrato e so as mudancas dela', () => {
  const hist = [
    { dia: '2026-10-19', empresa: { carga: 99, contados: 9 }, areas: [{ area: 'TI', carga: 40, contados: 2, impactoFinanceiro: 10 }, { area: 'RH', carga: 59, contados: 7 }],
      mudancas: [{ tipo: 'novo', area: 'TI' }, { tipo: 'novo', area: 'RH' }, { tipo: 'encerrado', area: 'RH' }] },
  ];
  const ti = RR.serieMensalHistorico(hist, 1, HOJE, 'TI')[0];
  assert.deepStrictEqual([ti.carga, ti.contados, ti.novos, ti.sairam], [40, 2, 1, 0]);
  const fin = RR.serieMensalHistorico(hist, 1, HOJE, 'Financeiro')[0];
  assert.deepStrictEqual([fin.carga, fin.contados], [0, 0], 'area sem linha no retrato: zero naquele dia');
});

test('recortarPorArea: so os riscos da area; da empresa so o agregado; nenhum titulo de outra area', () => {
  const minimos = LISTA.map((x) => RR.riscoMinimo(x, x.id === 'b'));
  assert.ok(!('descricao' in minimos[0]) && !('historicoReavaliacao' in minimos[0]), 'retrato v2 so com o que as contas leem');
  const base = {
    riscos: minimos, processos: PROCESSOS, critForn: {}, apetite: 'Moderado', hoje: HOJE,
    seriePorArea: { RH: [{ mes: '2026-10', carga: 16 }] },
    panoramaEmpresa: RR.panorama(LISTA, PROCESSOS, {}, 'Moderado'),
  };
  const rh = RR.recortarPorArea(base, 'RH');
  assert.strictEqual(rh.d.panorama.ativos, 1);
  assert.strictEqual(rh.d.panorama.carga, 16);
  assert.deepStrictEqual(rh.d.principais.map((x) => x.r.id), ['b']);
  assert.strictEqual(rh.d.tratamento.acoes.atrasadas, 1);
  assert.deepStrictEqual(rh.d.monitoramento.kriForaDaMeta.map((x) => x.id), ['b'], 'KRI resolvido na geracao');
  assert.deepStrictEqual(rh.d.serie, [{ mes: '2026-10', carga: 16 }]);
  assert.deepStrictEqual(rh.referenciaEmpresa, { ativos: 4, carga: 131, acimaDoApetite: 3, composicao: base.panoramaEmpresa.composicao, apetite: 'Moderado' });
  const json = JSON.stringify(rh);
  for (const outro of ['Ransomware', 'Fornecedor unico', 'Sem P e I']) assert.ok(!json.includes(outro), outro + ' e de outra area');
  const corp = RR.recortarPorArea(base, 'Corporativo (sem área)');
  assert.deepStrictEqual(corp.d.principais.map((x) => x.r.id), ['c'], 'risco sem area = Corporativo');
});

// ---- Filtros do relatorio (20/10/2026) ----

test('filtrar riscos: produto, area, responsavel, origem, categoria, nivel minimo e status', () => {
  const L = [
    r({ id: '1', produtoSoftwareId: 'p1', area: 'TI', responsavel: 'Ana', origem: 'Vulnerabilidade', categorias: ['Operacional'], probabilidade: 'Muito alta', impacto: 'Muito alto', status: 'Em Tratamento' }),
    r({ id: '2', produtoSoftwareId: 'p2', area: '', responsavel: '', origem: 'Fornecedor', categorias: ['Financeiro', 'Reputacional'], probabilidade: 'Moderada', impacto: 'Moderado' }),
    r({ id: '3', area: 'TI', responsavel: 'Ana', categoria: 'Financeiro' }),
  ];
  const ids = (f) => RR.filtrar(L, f).map((x) => x.id);
  assert.deepStrictEqual(ids({ produto: 'p1' }), ['1']);
  assert.deepStrictEqual(ids({ produto: RR.SEM }), ['3']);
  assert.deepStrictEqual(ids({ area: 'Corporativo (sem área)' }), ['2']);
  assert.deepStrictEqual(ids({ responsavel: RR.SEM }), ['2']);
  assert.deepStrictEqual(ids({ origem: 'Manual' }), ['3']);
  assert.deepStrictEqual(ids({ categoria: 'Financeiro' }), ['2', '3'], 'categoria antiga (string) tambem conta');
  assert.deepStrictEqual(ids({ nivelMinimo: 'Moderado' }), ['1', '2'], 'sem avaliacao fica fora');
  assert.deepStrictEqual(ids({ nivelMinimo: 'Muito alto' }), ['1']);
  assert.deepStrictEqual(ids({ status: 'Identificado' }), ['2', '3']);
  assert.deepStrictEqual(ids({ area: 'TI', responsavel: 'Ana', status: 'Em Tratamento' }), ['1']);
  assert.ok(RR.soFiltroDeArea({ area: 'TI' }));
  assert.ok(!RR.soFiltroDeArea({ area: 'TI', produto: 'p1' }));
  assert.ok(!RR.soFiltroDeArea({}));
  assert.strictEqual(RR.descreverFiltros({ produto: 'p1', nivelMinimo: 'Alto', categoria: 'Financeiro' }, (id) => ({ p1: 'ERP' }[id])),
    'Produto: ERP · Categoria: Financeiro · Alto ou mais grave');
  assert.strictEqual(RR.descreverFiltros({}), 'Empresa inteira');
});
