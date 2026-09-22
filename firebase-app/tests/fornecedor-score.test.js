const test = require('node:test');
const assert = require('node:assert');
const FS = require('../public/fornecedor-score.js');

const CRITERIOS = [
  { id: 'c1', nome: 'Certificação ISO 27001', peso: 3 },
  { id: 'c2', nome: 'Encarregado de dados (DPO)', peso: 2 },
  { id: 'c3', nome: 'Evidência de auditoria interna', peso: 1 },
];

const resp = (mapa) => mapa;

// ============================================================
// O SENTIDO DA NOTA — o erro que este modulo nao pode repetir
// ============================================================

const EVID = 'https://exemplo.com/evidencia';

test('a nota do fornecedor e CONFORMIDADE: maior e melhor', () => {
  assert.strictEqual(FS.SENTIDO, 'maiorMelhor');
  const tudoSim = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Sim', link: EVID }, c2: { resposta: 'Sim', link: EVID }, c3: { resposta: 'Sim', link: EVID } }));
  const tudoNao = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Não' }, c2: { resposta: 'Não' }, c3: { resposta: 'Não' } }));
  assert.strictEqual(tudoSim.nota, 100);
  assert.strictEqual(tudoNao.nota, 0);
  assert.ok(tudoSim.nota > tudoNao.nota, 'atender tudo tem que dar nota MAIOR que não atender nada');
});

test('o fornecedor bom fica verde e o ruim fica vermelho, nao o contrario', () => {
  assert.strictEqual(FS.faixaNota(100).rotulo, 'Adequado');
  assert.strictEqual(FS.faixaNota(0).rotulo, 'Crítico');
  assert.strictEqual(FS.faixaNota(95).cor, FS.faixaNota(90).cor);
});

test('risco abre com nota BAIXA, nunca com nota alta', () => {
  assert.strictEqual(FS.abreRisco(40, 70), true);
  assert.strictEqual(FS.abreRisco(95, 70), false);
  assert.strictEqual(FS.abreRisco(70, 70), false, 'exatamente no limiar ainda e aceitavel');
  assert.strictEqual(FS.abreRisco(69, 70), true);
});

// ============================================================
// AUSENCIA NAO E NOTA
// ============================================================

test('fornecedor sem nenhuma resposta nao tem nota — devolve null, nunca 0', () => {
  const r = FS.calcular(CRITERIOS, resp({}));
  assert.strictEqual(r.nota, null);
  assert.strictEqual(r.faixa.rotulo, 'Não avaliado');
  assert.strictEqual(r.completa, false);
  assert.deepStrictEqual(r.pendentes, ['c1', 'c2', 'c3']);
});

test('nota null nao abre risco — nao avaliado nao e o mesmo que reprovado', () => {
  assert.strictEqual(FS.abreRisco(null, 70), false);
  assert.strictEqual(FS.abreRisco(undefined, 70), false);
});

test('sem critério nenhum cadastrado a nota nao existe', () => {
  const r = FS.calcular([], resp({}));
  assert.strictEqual(r.nota, null);
  assert.strictEqual(r.completa, false, 'sem critério não há avaliação completa');
});

// ============================================================
// A CONTA
// ============================================================

test('a nota e a media ponderada dos pesos aproveitados', () => {
  // c1 Sim (3 de 3), c2 Não (0 de 2), c3 Sim (1 de 1) = 4 de 6 = 67
  const r = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Sim', link: EVID }, c2: { resposta: 'Não' }, c3: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(r.nota, 67);
});

test('Parcial vale metade do peso do criterio', () => {
  const r = FS.calcular([{ id: 'c1', peso: 4 }], resp({ c1: { resposta: 'Parcial', link: EVID } }));
  assert.strictEqual(r.nota, 50);
});

test('o peso manda: o mesmo Não pesa mais no critério mais importante', () => {
  const semIso = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Não' }, c2: { resposta: 'Sim', link: EVID }, c3: { resposta: 'Sim', link: EVID } }));
  const semAuditoria = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Sim', link: EVID }, c2: { resposta: 'Sim', link: EVID }, c3: { resposta: 'Não' } }));
  assert.ok(semIso.nota < semAuditoria.nota, 'faltar a ISO (peso 3) tem que doer mais que faltar auditoria (peso 1)');
  assert.strictEqual(semIso.nota, 50);   // 3 de 6
  assert.strictEqual(semAuditoria.nota, 83); // 5 de 6
});

test('critério sem peso definido vale 1', () => {
  assert.strictEqual(FS.PESO_PADRAO, 1);
  const r = FS.calcular([{ id: 'a' }, { id: 'b', peso: 1 }], resp({ a: { resposta: 'Sim', link: EVID }, b: { resposta: 'Não' } }));
  assert.strictEqual(r.nota, 50);
});

test('peso invalido ou negativo cai no padrao, sem quebrar a conta', () => {
  const r = FS.calcular([{ id: 'a', peso: -5 }, { id: 'b', peso: 'muito' }], resp({ a: { resposta: 'Sim', link: EVID }, b: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(r.nota, 100);
});

// ============================================================
// "NAO SE APLICA"
// ============================================================

test('Não se aplica sai da conta: nao da ponto nem tira ponto', () => {
  // c1 Sim, c2 Não se aplica, c3 Sim -> conta so c1 e c3 = 4 de 4 = 100
  const r = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'Sim', link: EVID }, c2: { resposta: 'Não se aplica' }, c3: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(r.nota, 100);
  assert.strictEqual(r.naoSeAplica, 1);
  assert.strictEqual(r.pesoConsiderado, 4);
  assert.strictEqual(r.completa, true, 'Não se aplica é resposta, não pendência');
});

test('tudo Não se aplica nao vira nota 100 — vira sem nota', () => {
  const r = FS.calcular(CRITERIOS, resp({
    c1: { resposta: 'Não se aplica' }, c2: { resposta: 'Não se aplica' }, c3: { resposta: 'Não se aplica' },
  }));
  assert.strictEqual(r.nota, null);
  assert.strictEqual(r.naoSeAplica, 3);
});

// ============================================================
// AVALIACAO PELA METADE
// ============================================================

test('responder so o criterio facil NAO da 100 limpo: a avaliacao fica incompleta', () => {
  const r = FS.calcular(CRITERIOS, resp({ c3: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(r.nota, 100);           // a nota do que foi respondido
  assert.strictEqual(r.completa, false);     // mas a tela e obrigada a avisar
  assert.deepStrictEqual(r.pendentes, ['c1', 'c2']);
  assert.strictEqual(r.respondidos, 1);
  assert.strictEqual(r.criteriosAtivos, 3);
});

test('resposta escrita errada conta como pendente, nao como Não', () => {
  const r = FS.calcular(CRITERIOS, resp({ c1: { resposta: 'sim senhor' }, c2: { resposta: '' }, c3: { resposta: 'Sim', link: EVID } }));
  assert.deepStrictEqual(r.pendentes, ['c1', 'c2']);
  assert.strictEqual(r.nota, 100, 'so c3 entrou na conta');
  assert.strictEqual(r.completa, false);
});

test('respostaValida aceita as quatro opcoes e recusa o resto', () => {
  ['Sim', 'Parcial', 'Não', 'Não se aplica'].forEach((v) => assert.strictEqual(FS.respostaValida(v), true, v));
  ['', 'sim', 'NAO', 'Talvez', null, undefined].forEach((v) => assert.strictEqual(FS.respostaValida(v), false, String(v)));
});

// ============================================================
// CRITERIO DESATIVADO
// ============================================================

test('critério desativado sai da conta, sem apagar a avaliacao antiga', () => {
  const criterios = [{ id: 'c1', peso: 1 }, { id: 'c2', peso: 1, ativo: false }];
  const r = FS.calcular(criterios, resp({ c1: { resposta: 'Sim', link: EVID }, c2: { resposta: 'Não' } }));
  assert.strictEqual(r.nota, 100);
  assert.strictEqual(r.criteriosAtivos, 1);
});

test('criterioAtivo trata ausencia do campo como ativo', () => {
  assert.strictEqual(FS.criterioAtivo({ id: 'x' }), true);
  assert.strictEqual(FS.criterioAtivo({ id: 'x', ativo: true }), true);
  assert.strictEqual(FS.criterioAtivo({ id: 'x', ativo: false }), false);
});

// ============================================================
// SUBCONJUNTO DE CRITERIOS (controles aplicaveis por fornecedor)
// ============================================================

test('calcular so considera os criterios do array recebido, nao um catalogo global implicito', () => {
  // Fornecedor de hardware, so 2 dos 3 controles do catalogo se aplicam a ele.
  const aplicaveis = CRITERIOS.filter((c) => c.id !== 'c2');
  const r = FS.calcular(aplicaveis, resp({ c1: { resposta: 'Sim', link: EVID }, c3: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(r.criteriosAtivos, 2, 'c2 nao entrou porque nao foi passado, nao porque foi respondido');
  assert.strictEqual(r.completa, true, 'nao pode pedir resposta de um controle que nao se aplica a este fornecedor');
  assert.strictEqual(r.nota, 100);
});

// ============================================================
// EVIDENCIA OBRIGATORIA (22/09/2026): Sim/Parcial sem link nao conta
// ============================================================

test('Sim sem link nao conta na nota -- cai em semEvidencia, nao em pendentes', () => {
  const r = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Sim' } }));
  assert.strictEqual(r.nota, null);
  assert.deepStrictEqual(r.semEvidencia, ['c1']);
  assert.deepStrictEqual(r.pendentes, [], 'respondeu, entao nao e "sem resposta"');
  assert.strictEqual(r.completa, false);
});

test('Parcial sem link tem o mesmo tratamento de Sim sem link', () => {
  const r = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Parcial' } }));
  assert.deepStrictEqual(r.semEvidencia, ['c1']);
  assert.strictEqual(r.completa, false);
});

test('Não sem link continua contando normalmente -- so Sim/Parcial exigem evidencia', () => {
  const r = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Não' } }));
  assert.strictEqual(r.nota, 0);
  assert.deepStrictEqual(r.semEvidencia, []);
  assert.strictEqual(r.completa, true);
});

test('Não se aplica sem link continua isento, como sempre', () => {
  const r = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Não se aplica' } }));
  assert.deepStrictEqual(r.semEvidencia, []);
  assert.strictEqual(r.naoSeAplica, 1);
  assert.strictEqual(r.completa, true);
});

test('completa fica false por falta de evidencia mesmo com pendentes vazio', () => {
  const r = FS.calcular(CRITERIOS, resp({
    c1: { resposta: 'Sim' }, // sem link
    c2: { resposta: 'Não' },
    c3: { resposta: 'Não se aplica' },
  }));
  assert.deepStrictEqual(r.pendentes, []);
  assert.deepStrictEqual(r.semEvidencia, ['c1']);
  assert.strictEqual(r.completa, false);
});

test('preencher o link depois faz o criterio passar a contar -- nao e "uma vez sem link, sempre sem link"', () => {
  const semLink = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Sim' } }));
  const comLink = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Sim', link: EVID } }));
  assert.strictEqual(semLink.nota, null);
  assert.strictEqual(comLink.nota, 100);
  assert.strictEqual(comLink.completa, true);
});

test('link so com espacos em branco conta como sem evidencia', () => {
  const r = FS.calcular([{ id: 'c1', peso: 1 }], resp({ c1: { resposta: 'Sim', link: '   ' } }));
  assert.deepStrictEqual(r.semEvidencia, ['c1']);
});

// ============================================================
// VALIDADE
// ============================================================

test('a avaliacao vale um ano', () => {
  assert.strictEqual(FS.VALIDADE_DIAS, 365);
  assert.strictEqual(FS.venceEm('2026-01-10'), '2027-01-10');
});

test('avaliacao de dois anos atras esta vencida; a de ontem nao', () => {
  const hoje = '2026-09-21T12:00:00.000Z';
  assert.strictEqual(FS.vencida('2024-09-21T12:00:00.000Z', hoje), true);
  assert.strictEqual(FS.vencida('2026-09-20T12:00:00.000Z', hoje), false);
  assert.strictEqual(FS.vencida('2025-09-21T12:00:00.000Z', hoje), false, 'exatamente 365 dias ainda vale');
  assert.strictEqual(FS.vencida('2025-09-20T12:00:00.000Z', hoje), true);
});

test('fornecedor nunca avaliado NAO e "vencido" — sao coisas diferentes', () => {
  assert.strictEqual(FS.vencida(null, '2026-09-21'), false);
  assert.strictEqual(FS.vencida('', '2026-09-21'), false);
  assert.strictEqual(FS.venceEm(null), null);
  assert.strictEqual(FS.venceEm('data ruim'), null);
});

// ============================================================
// FAIXAS
// ============================================================

test('as faixas da conformidade cobrem a escala inteira sem buraco', () => {
  assert.strictEqual(FS.faixaNota(100).rotulo, 'Adequado');
  assert.strictEqual(FS.faixaNota(90).rotulo, 'Adequado');
  assert.strictEqual(FS.faixaNota(89).rotulo, 'Aceitável');
  assert.strictEqual(FS.faixaNota(70).rotulo, 'Aceitável');
  assert.strictEqual(FS.faixaNota(69).rotulo, 'Insuficiente');
  assert.strictEqual(FS.faixaNota(50).rotulo, 'Insuficiente');
  assert.strictEqual(FS.faixaNota(49).rotulo, 'Crítico');
  assert.strictEqual(FS.faixaNota(0).rotulo, 'Crítico');
});

test('o limiar de risco padrao bate com a fronteira do Aceitavel', () => {
  assert.strictEqual(FS.LIMIAR_RISCO_PADRAO, 70);
  assert.strictEqual(FS.faixaNota(FS.LIMIAR_RISCO_PADRAO).rotulo, 'Aceitável');
  assert.strictEqual(FS.faixaNota(FS.LIMIAR_RISCO_PADRAO - 1).rotulo, 'Insuficiente');
});

test('limiar nao configurado cai no padrao', () => {
  assert.strictEqual(FS.abreRisco(60, undefined), true);
  assert.strictEqual(FS.abreRisco(80, 'qualquer coisa'), false);
});

test('listas nulas nao quebram', () => {
  assert.strictEqual(FS.calcular(null, null).nota, null);
  assert.strictEqual(FS.calcular(undefined, undefined).criteriosAtivos, 0);
});
