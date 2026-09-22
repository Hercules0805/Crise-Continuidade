const test = require('node:test');
const assert = require('node:assert');
const FC = require('../public/fornecedor-criticidade.js');

const COMPLETA_ZERO = { dados: 'nenhum', atividade: 'nenhuma', dependencia: 'nenhuma', transferenciaInternacional: 'nao' };
const COMPLETA_MAXIMA = { dados: 'sensiveis', atividade: 'core', dependencia: 'clientesParam', transferenciaInternacional: 'sim' };

// ============================================================
// O SENTIDO — o oposto do fornecedor-score.js, na mesma tela
// ============================================================

test('a criticidade e MAIOR e PIOR, o contrario da nota de conformidade', () => {
  assert.strictEqual(FC.SENTIDO, 'maiorPior');
});

test('score maximo e 2 + 3 + 3 + 1 = 9', () => {
  assert.strictEqual(FC.SCORE_MAXIMO, 9);
  assert.strictEqual(FC.calcular(COMPLETA_MAXIMA).score, 9);
});

// ============================================================
// "NENHUMA DAS ANTERIORES" E RESPOSTA VALIDA, NAO AUSENCIA
// ============================================================

test('as 4 perguntas respondidas com a opcao de menor score dao criticidade 0 de verdade', () => {
  const r = FC.calcular(COMPLETA_ZERO);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.completa, true);
  assert.strictEqual(r.faixa.rotulo, 'Baixa');
  assert.notStrictEqual(r.faixa.rotulo, 'Não avaliado', 'criticidade 0 respondida nao e a mesma coisa que nao avaliado');
});

test('faltando responder qualquer uma das 4 perguntas, a criticidade nao existe', () => {
  const semDados = FC.calcular({ atividade: 'core', dependencia: 'clientesParam', transferenciaInternacional: 'nao' });
  assert.strictEqual(semDados.score, null);
  assert.strictEqual(semDados.completa, false);
  assert.deepStrictEqual(semDados.pendentes, ['dados']);
  assert.strictEqual(semDados.faixa.rotulo, 'Não avaliado');
});

test('nenhuma pergunta respondida tambem nao tem criticidade', () => {
  const r = FC.calcular({});
  assert.strictEqual(r.score, null);
  assert.deepStrictEqual(r.pendentes, ['dados', 'atividade', 'dependencia', 'transferenciaInternacional']);
});

test('respostas nulas ou undefined nao quebram', () => {
  assert.strictEqual(FC.calcular(null).score, null);
  assert.strictEqual(FC.calcular(undefined).completa, false);
});

test('valor de opcao invalido (nao cadastrado na pergunta) conta como pendente', () => {
  const r = FC.calcular({ dados: 'chute-qualquer', atividade: 'core', dependencia: 'lockIn', transferenciaInternacional: 'nao' });
  assert.deepStrictEqual(r.pendentes, ['dados']);
  assert.strictEqual(r.score, null);
});

// ============================================================
// A CONTA
// ============================================================

test('a soma bate para uma combinacao no meio da escala', () => {
  // pessoais (1) + acesso (2) + empresaPara (2) + nao (0) = 5
  const r = FC.calcular({ dados: 'pessoais', atividade: 'acesso', dependencia: 'empresaPara', transferenciaInternacional: 'nao' });
  assert.strictEqual(r.score, 5);
});

test('cada pergunta e de escolha unica: so a chave da pergunta importa, nao a combinacao de opcoes', () => {
  // Trocar so a opcao da pergunta "dependencia" muda so a parcela dela.
  const base = { dados: 'nenhum', atividade: 'nenhuma', transferenciaInternacional: 'nao' };
  const comLockIn = FC.calcular({ ...base, dependencia: 'lockIn' });
  const comClientes = FC.calcular({ ...base, dependencia: 'clientesParam' });
  assert.strictEqual(comLockIn.score, 1);
  assert.strictEqual(comClientes.score, 3);
});

test('a pergunta de transferencia internacional e binaria: Sim soma 1, Nao soma 0', () => {
  const base = { dados: 'nenhum', atividade: 'nenhuma', dependencia: 'nenhuma' };
  const comSim = FC.calcular({ ...base, transferenciaInternacional: 'sim' });
  const comNao = FC.calcular({ ...base, transferenciaInternacional: 'nao' });
  assert.strictEqual(comSim.score, 1);
  assert.strictEqual(comNao.score, 0);
});

// ============================================================
// FAIXAS — limiares exatos, e o peso que cada uma vale no risco
// ============================================================

test('faixas: 0-2 Baixa, 3-5 Média, 6-9 Alta', () => {
  assert.strictEqual(FC.faixa(0).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(2).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(3).rotulo, 'Média');
  assert.strictEqual(FC.faixa(5).rotulo, 'Média');
  assert.strictEqual(FC.faixa(6).rotulo, 'Alta');
  assert.strictEqual(FC.faixa(8).rotulo, 'Alta');
  assert.strictEqual(FC.faixa(9).rotulo, 'Alta');
});

test('a pergunta nova so abriu o teto de Alta -- Baixa e Media ficam exatamente como antes', () => {
  // Fornecedor ja avaliado antes desta pergunta existir, score 8 (Alta, peso 3).
  // A pergunta nova nao pode reclassificar ninguem: 8 continua Alta e peso 3,
  // e o novo maximo (9) tambem e Alta e peso 3 -- nenhum 4o nivel de peso.
  assert.strictEqual(FC.faixa(8).rotulo, 'Alta');
  assert.strictEqual(FC.pesoPorScore(8), 3);
  assert.strictEqual(FC.faixa(9).rotulo, 'Alta');
  assert.strictEqual(FC.pesoPorScore(9), 3);
});

test('faixa sem score (null/undefined) e "Não avaliado", nunca Baixa', () => {
  assert.strictEqual(FC.faixa(null).rotulo, 'Não avaliado');
  assert.strictEqual(FC.faixa(undefined).rotulo, 'Não avaliado');
});

test('peso por faixa e 1/2/3 -- os mesmos 3 niveis que o Tier do BIA ja usa', () => {
  assert.strictEqual(FC.pesoPorScore(0), 1);
  assert.strictEqual(FC.pesoPorScore(2), 1);
  assert.strictEqual(FC.pesoPorScore(3), 2);
  assert.strictEqual(FC.pesoPorScore(5), 2);
  assert.strictEqual(FC.pesoPorScore(6), 3);
  assert.strictEqual(FC.pesoPorScore(8), 3);
  assert.strictEqual(FC.pesoPorScore(9), 3);
});

test('sem score, pesoPorScore devolve null -- quem chama decide o peso padrao', () => {
  assert.strictEqual(FC.pesoPorScore(null), null);
  assert.strictEqual(FC.pesoPorScore(undefined), null);
});

// ============================================================
// AS PERGUNTAS EM SI
// ============================================================

test('sao exatamente 4 perguntas, cada uma com uma opcao de valor 0', () => {
  assert.strictEqual(FC.PERGUNTAS.length, 4);
  FC.PERGUNTAS.forEach((p) => {
    const scores = p.opcoes.map((o) => o.score);
    assert.ok(scores.includes(0), `${p.chave} deveria ter uma opcao de score 0`);
  });
});

test('as chaves das perguntas sao dados, atividade, dependencia e transferenciaInternacional', () => {
  assert.deepStrictEqual(FC.PERGUNTAS.map((p) => p.chave), ['dados', 'atividade', 'dependencia', 'transferenciaInternacional']);
});
