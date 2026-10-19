const { test } = require('node:test');
const assert = require('node:assert');
const CC = require('./contratoCiclo');

const HOJE = '2026-10-15';
const VIG = { situacao: 'vigente', hoje: HOJE };
const contrato = (extra) => Object.assign({
  dataInicio: '2026-01-01', dataFim: '2026-12-31', vigenciaMeses: 12,
  gestor: { id: 'p1', nome: 'Ana' },
}, extra);
const codigos = (l) => l.map((a) => a.codigo);

// ============================================================
// DATAS
// ============================================================

test('vigencia de 01/01 a 31/12 e 12 meses', () => {
  assert.strictEqual(CC.vigenciaEmMeses('2026-01-01', '2026-12-31'), 12);
  assert.strictEqual(CC.vigenciaEmMeses('2026-03-15', '2027-03-14'), 12);
});

test('vigencia sem datas validas e null, nao zero', () => {
  assert.strictEqual(CC.vigenciaEmMeses('', '2026-12-31'), null);
  assert.strictEqual(CC.vigenciaEmMeses('2026-12-31', '2026-01-01'), null);
});

test('fim pela vigencia e o ultimo dia do periodo (inclusivo)', () => {
  assert.strictEqual(CC.fimPelaVigencia('2026-01-01', 12), '2026-12-31');
  assert.strictEqual(CC.fimPelaVigencia('2026-01-31', 1), '2026-02-27');
  assert.strictEqual(CC.vigenciaEmMeses('2026-01-31', '2026-02-27'), 1);
});

test('somar meses em 31 cai no ultimo dia do mes', () => {
  assert.strictEqual(CC.somarMeses('2026-01-31', 1), '2026-02-28');
});

test('data-limite do aviso e fim menos a antecedencia', () => {
  assert.strictEqual(CC.dataLimiteAviso(contrato({ avisoCancelamentoDias: 30 })), '2026-12-01');
});

test('situacao vem da lista configuravel, nao do nome do status', () => {
  const lista = [{ id: 's1', nome: 'Ativo', situacao: 'vigente' }, { id: 's2', nome: 'Ativo antigo', situacao: 'encerrado' }];
  assert.strictEqual(CC.situacaoDoStatus('s2', lista), 'encerrado');
  assert.strictEqual(CC.situacaoDoStatus('x', lista), '');
});

// ============================================================
// ALERTAS
// ============================================================

test('contrato que nao esta vigente nao alerta', () => {
  const c = contrato({ dataFim: '2026-10-20', gestor: null });
  assert.deepStrictEqual(CC.calcularAlertas(c, { situacao: 'pre', hoje: HOJE }), []);
  assert.deepStrictEqual(CC.calcularAlertas(c, { situacao: 'encerrado', hoje: HOJE }), []);
  assert.deepStrictEqual(CC.calcularAlertas(c, { situacao: '', hoje: HOJE }), []);
});

test('vence em 20 dias: faixa de 30, nivel perigo', () => {
  const a = CC.calcularAlertas(contrato({ dataFim: '2026-11-04' }), VIG);
  const v = a.find((x) => x.codigo === 'vence_em');
  assert.strictEqual(v.dias, 20);
  assert.strictEqual(v.faixa, 30);
  assert.strictEqual(v.nivel, 'perigo');
});

test('vence em 75 dias: faixa de 90, nivel info; mais de 90 nao alerta', () => {
  assert.strictEqual(CC.calcularAlertas(contrato({ dataFim: '2026-12-29' }), VIG).find((x) => x.codigo === 'vence_em').faixa, 90);
  assert.ok(!codigos(CC.calcularAlertas(contrato({ dataFim: '2027-06-30' }), VIG)).includes('vence_em'));
});

test('fim no passado e vencido', () => {
  const a = CC.calcularAlertas(contrato({ dataFim: '2026-10-01' }), VIG);
  assert.ok(codigos(a).includes('vencido'));
  assert.ok(!codigos(a).includes('vence_em'));
});

test('renovacao automatica com aviso: janela aberta 30 dias antes da data-limite', () => {
  // fim 04/12, aviso 30 -> limite 04/11 -> faltam 20 dias
  const c = contrato({ dataFim: '2026-12-04', renovacaoAutomatica: true, avisoCancelamentoDias: 30 });
  const j = CC.calcularAlertas(c, VIG).find((x) => x.codigo === 'janela_cancelamento');
  assert.strictEqual(j.dias, 20);
});

test('passou da data-limite do aviso: vai renovar', () => {
  // fim 04/11, aviso 30 -> limite 05/10 -> ja passou
  const c = contrato({ dataFim: '2026-11-04', renovacaoAutomatica: true, avisoCancelamentoDias: 30 });
  assert.ok(codigos(CC.calcularAlertas(c, VIG)).includes('aviso_perdido'));
});

test('sem renovacao automatica ou com cancelamento a qualquer momento, o aviso nao alerta', () => {
  const base = { dataFim: '2026-12-04', avisoCancelamentoDias: 30 };
  assert.ok(!codigos(CC.calcularAlertas(contrato(base), VIG)).includes('janela_cancelamento'));
  const qq = contrato(Object.assign({ renovacaoAutomatica: true, cancelamentoQualquerMomento: true }, base));
  assert.ok(!codigos(CC.calcularAlertas(qq, VIG)).includes('janela_cancelamento'));
});

test('reajuste no mes atual e no proximo; dezembro vira janeiro', () => {
  assert.ok(codigos(CC.calcularAlertas(contrato({ mesReajuste: 10 }), VIG)).includes('reajuste_proximo'));
  assert.ok(codigos(CC.calcularAlertas(contrato({ mesReajuste: 11 }), VIG)).includes('reajuste_proximo'));
  assert.ok(!codigos(CC.calcularAlertas(contrato({ mesReajuste: 12 }), VIG)).includes('reajuste_proximo'));
  const dez = { situacao: 'vigente', hoje: '2026-12-10' };
  assert.ok(codigos(CC.calcularAlertas(contrato({ dataFim: '2027-12-31', mesReajuste: 1 }), dez)).includes('reajuste_proximo'));
});

test('sem gestor alerta', () => {
  assert.ok(codigos(CC.calcularAlertas(contrato({ gestor: { nome: ' ' } }), VIG)).includes('sem_gestor'));
  assert.ok(!codigos(CC.calcularAlertas(contrato(), VIG)).includes('sem_gestor'));
});

test('valor global diferente de mensal x vigencia acima de 10% alerta', () => {
  assert.ok(CC.valoresDivergentes(contrato({ valorMensal: 1000, valorGlobal: 15000 })));
  assert.ok(!CC.valoresDivergentes(contrato({ valorMensal: 1000, valorGlobal: 12500 })));
  assert.ok(!CC.valoresDivergentes(contrato({ valorMensal: 1000 })));
});

// ============================================================
// RENOVACAO AUTOMATICA
// ============================================================

test('proxima renovacao comeca no dia seguinte ao fim e dura a vigencia', () => {
  assert.deepStrictEqual(CC.proximaRenovacao(contrato()), { dataUltimaRenovacao: '2027-01-01', dataFim: '2027-12-31' });
});

test('renovacao automatica so quando vigente, ligada e vencida', () => {
  const venc = contrato({ dataInicio: '2025-10-01', dataFim: '2026-09-30', renovacaoAutomatica: true });
  assert.deepStrictEqual(CC.renovacaoAutomaticaDevida(venc, VIG), { dataUltimaRenovacao: '2026-10-01', dataFim: '2027-09-30', ciclos: 1 });
  assert.strictEqual(CC.renovacaoAutomaticaDevida(Object.assign({}, venc, { renovacaoAutomatica: false }), VIG), null);
  assert.strictEqual(CC.renovacaoAutomaticaDevida(venc, { situacao: 'encerrado', hoje: HOJE }), null);
  assert.strictEqual(CC.renovacaoAutomaticaDevida(contrato({ renovacaoAutomatica: true }), VIG), null);
});

test('fim muito antigo aplica varios ciclos de uma vez', () => {
  const c = { dataInicio: '2023-01-01', dataFim: '2023-12-31', vigenciaMeses: 12, renovacaoAutomatica: true };
  const r = CC.renovacaoAutomaticaDevida(c, VIG);
  assert.strictEqual(r.ciclos, 3);
  assert.strictEqual(r.dataFim, '2026-12-31');
});

test('sem vigencia conhecida nao renova (nao inventa prazo)', () => {
  const c = { dataFim: '2026-09-30', renovacaoAutomatica: true };
  assert.strictEqual(CC.renovacaoAutomaticaDevida(c, VIG), null);
});

test('alertasIguais ignora a ordem', () => {
  const a = [{ codigo: 'x', rotulo: '1' }, { codigo: 'y', rotulo: '2' }];
  assert.ok(CC.alertasIguais(a, [a[1], a[0]]));
  assert.ok(!CC.alertasIguais(a, [a[0]]));
});

// ============================================================
// SLA (15/10/2026)
// ============================================================

test('horasDoRto: opcoes do BIA viram o limite superior em horas', () => {
  assert.strictEqual(CC.horasDoRto('< 1 hora'), 1);
  assert.strictEqual(CC.horasDoRto('< 4 horas'), 4);
  assert.strictEqual(CC.horasDoRto('4h a 8h'), 8);
  assert.strictEqual(CC.horasDoRto('8h a 24h'), 24);
  assert.strictEqual(CC.horasDoRto('24 horas'), 24);
  assert.strictEqual(CC.horasDoRto('0 (nenhuma perda)'), 0);
  assert.strictEqual(CC.horasDoRto('> 24 horas'), null, 'sem limite: nao compara');
});

test('horasDoRto: texto livre da dependencia; ilegivel e null', () => {
  assert.strictEqual(CC.horasDoRto('4 horas'), 4);
  assert.strictEqual(CC.horasDoRto('4h'), 4);
  assert.strictEqual(CC.horasDoRto('30 min'), 0.5);
  assert.strictEqual(CC.horasDoRto('1 dia'), 24);
  assert.strictEqual(CC.horasDoRto('2 dias'), 48);
  assert.strictEqual(CC.horasDoRto('1,5 hora'), 1.5);
  assert.strictEqual(CC.horasDoRto('rápido'), null);
  assert.strictEqual(CC.horasDoRto(''), null);
  assert.strictEqual(CC.horasDoRto(null), null);
});

test('normalizarSla: objeto canonico, minutos inteiros >= 0, enums validos', () => {
  const s = CC.normalizarSla({
    cobertura: 'xx', atendimento: [{ severidade: 'Alta', respostaMin: '60', solucaoMin: 999 }],
    disponibilidadePct: 120, rtoMin: '240.4', rpoMin: '', penalidade: '  10% ',
  });
  assert.strictEqual(s.cobertura, '');
  assert.deepStrictEqual(s.atendimento.map((a) => a.severidade), ['Crítica', 'Alta', 'Média', 'Baixa']);
  assert.deepStrictEqual(s.atendimento[1], { severidade: 'Alta', respostaMin: 60 });
  assert.ok(!('solucaoMin' in s.atendimento[1]), 'tempo de solucao nao faz parte do SLA');
  assert.strictEqual(s.disponibilidadePct, null, 'acima de 100% e invalido');
  assert.strictEqual(s.disponibilidadePeriodo, 'mensal');
  assert.strictEqual(s.rtoMin, 240);
  assert.strictEqual(s.rpoMin, null);
  assert.strictEqual(s.penalidade, '10%');
  assert.strictEqual(CC.temSla(s), true);
  assert.strictEqual(CC.temSla({}), false);
  assert.strictEqual(CC.temSla(null), false);
});

test('formatarDuracao e indisponibilidade permitida', () => {
  assert.strictEqual(CC.formatarDuracao(30), '30 min');
  assert.strictEqual(CC.formatarDuracao(240), '4 h');
  assert.strictEqual(CC.formatarDuracao(90), '1 h 30 min');
  assert.strictEqual(CC.formatarDuracao(1440), '1 dia');
  assert.strictEqual(CC.formatarDuracao(2880), '2 dias');
  assert.strictEqual(CC.formatarDuracao(null), '');
  assert.strictEqual(CC.indisponibilidadePermitida(99.9, 'mensal'), 43);
  assert.strictEqual(CC.indisponibilidadePermitida(99.5, 'anual'), 2628);
  assert.strictEqual(CC.indisponibilidadePermitida(null, 'mensal'), null);
});

test('compararSlaComRto: RTO garantido maior que o exigido e incompatibilidade (perigo)', () => {
  const itens = CC.compararSlaComRto({ rtoMin: 480 }, [{ origem: 'Processo Folha', tipo: 'processo', rto: '< 4 horas' }]);
  assert.strictEqual(itens.length, 1);
  assert.strictEqual(itens[0].codigo, 'sla_rto_incompativel');
  assert.strictEqual(itens[0].nivel, 'perigo');
  assert.strictEqual(itens[0].exigidoMin, 240);
  assert.strictEqual(itens[0].garantidoMin, 480);
  assert.match(itens[0].rotulo, /8 h > exigido 4 h \(Processo Folha\)/);
});

test('compararSlaComRto: dentro do exigido nao alerta; RTO sem limite ou ilegivel nao alerta', () => {
  assert.deepStrictEqual(CC.compararSlaComRto({ rtoMin: 240 }, [{ origem: 'A', rto: '< 4 horas' }]), []);
  assert.deepStrictEqual(CC.compararSlaComRto({ rtoMin: 9999 }, [{ origem: 'A', rto: '> 24 horas' }]), []);
  assert.deepStrictEqual(CC.compararSlaComRto({}, [{ origem: 'A', rto: 'quando der' }]), []);
});

test('compararSlaComRto: sem RTO garantido avisa; RPO incompativel; tempo de atendimento nao gera alerta', () => {
  const sla = { atendimento: [{ severidade: 'Crítica', respostaMin: 600, solucaoMin: 600 }], rpoMin: 120 };
  const itens = CC.compararSlaComRto(sla, [{ origem: 'ERP', tipo: 'dependencia', rto: '4 horas', rpo: '1 hora' }]);
  assert.deepStrictEqual(itens.map((i) => i.codigo).sort(), ['sla_rpo_incompativel', 'sla_sem_rto']);
  const resumo = CC.resumirComparacaoSla(itens.concat(itens.filter((i) => i.codigo === 'sla_sem_rto')));
  const semRto = resumo.find((r) => r.codigo === 'sla_sem_rto');
  assert.match(semRto.rotulo, /\(2\)$/);
  assert.match(semRto.titulo, /ERP/);
});
