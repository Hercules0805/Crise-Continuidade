const test = require('node:test');
const assert = require('node:assert');
const FC = require('../public/fornecedor-criticidade.js');

const COMPLETA_ZERO = {
  importanciaOperacional: 'baixa',
  tempoSemOperar: 'mais72h',
  substituibilidade: 'facil',
  dependenciaDados: 'semImpacto',
  acessoSistemas: 'nenhum',
  impactoClientes: 'nao',
};

const COMPLETA_MAXIMA = {
  importanciaOperacional: 'essencial',
  tempoSemOperar: 'ate4h',
  substituibilidade: 'nenhuma',
  dependenciaDados: 'critico',
  acessoSistemas: 'privilegiado',
  impactoClientes: 'direto',
};

// ============================================================
// O SENTIDO — o oposto do fornecedor-score.js, na mesma tela
// ============================================================

test('a criticidade e MAIOR e PIOR, o contrario da nota de conformidade', () => {
  assert.strictEqual(FC.SENTIDO, 'maiorPior');
});

test('score maximo e 6 perguntas x 3 = 18', () => {
  assert.strictEqual(FC.SCORE_MAXIMO, 18);
  assert.strictEqual(FC.calcular(COMPLETA_MAXIMA).score, 18);
});

// ============================================================
// A OPCAO DE MENOR SCORE E RESPOSTA VALIDA, NAO AUSENCIA
// ============================================================

test('as 6 perguntas respondidas com a opcao de menor score dao criticidade 0 de verdade', () => {
  const r = FC.calcular(COMPLETA_ZERO);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.completa, true);
  assert.strictEqual(r.faixa.rotulo, 'Baixa');
  assert.notStrictEqual(r.faixa.rotulo, 'Não avaliado', 'criticidade 0 respondida nao e a mesma coisa que nao avaliado');
});

test('faltando responder qualquer uma das 6 perguntas, a criticidade nao existe', () => {
  const semImportancia = FC.calcular({
    tempoSemOperar: 'ate24h',
    substituibilidade: 'poucas',
    dependenciaDados: 'trabalhosa',
    acessoSistemas: 'integracao',
    impactoClientes: 'limitado',
  });
  assert.strictEqual(semImportancia.score, null);
  assert.strictEqual(semImportancia.completa, false);
  assert.deepStrictEqual(semImportancia.pendentes, ['importanciaOperacional']);
  assert.strictEqual(semImportancia.faixa.rotulo, 'Não avaliado');
});

test('nenhuma pergunta respondida tambem nao tem criticidade', () => {
  const r = FC.calcular({});
  assert.strictEqual(r.score, null);
  assert.deepStrictEqual(r.pendentes, [
    'importanciaOperacional',
    'tempoSemOperar',
    'substituibilidade',
    'dependenciaDados',
    'acessoSistemas',
    'impactoClientes',
  ]);
});

test('respostas nulas ou undefined nao quebram', () => {
  assert.strictEqual(FC.calcular(null).score, null);
  assert.strictEqual(FC.calcular(undefined).completa, false);
});

test('valor de opcao invalido (nao cadastrado na pergunta) conta como pendente', () => {
  const r = FC.calcular({ ...COMPLETA_ZERO, importanciaOperacional: 'chute-qualquer' });
  assert.deepStrictEqual(r.pendentes, ['importanciaOperacional']);
  assert.strictEqual(r.score, null);
});

// ============================================================
// A CONTA
// ============================================================

test('a soma bate para uma combinacao no meio da escala', () => {
  // moderada(1) + ate24h(2) + comTempo(1) + pontual(1) + usuarioComum(1) + indireto(1) = 7
  const r = FC.calcular({
    importanciaOperacional: 'moderada',
    tempoSemOperar: 'ate24h',
    substituibilidade: 'comTempo',
    dependenciaDados: 'pontual',
    acessoSistemas: 'usuarioComum',
    impactoClientes: 'indireto',
  });
  assert.strictEqual(r.score, 7);
});

test('cada pergunta e de escolha unica: so a chave da pergunta importa, nao a combinacao de opcoes', () => {
  // Trocar so a opcao da pergunta "substituibilidade" muda so a parcela dela.
  const base = { ...COMPLETA_ZERO };
  delete base.substituibilidade;
  const facil = FC.calcular({ ...base, substituibilidade: 'facil' });
  const semAlternativa = FC.calcular({ ...base, substituibilidade: 'nenhuma' });
  assert.strictEqual(facil.score, 0);
  assert.strictEqual(semAlternativa.score, 3);
});

// ============================================================
// FAIXAS — limiares exatos, e o peso que cada uma vale no risco
// ============================================================

test('faixas: 0-6 Baixa, 7-12 Média, 13-18 Alta', () => {
  assert.strictEqual(FC.faixa(0).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(6).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(7).rotulo, 'Média');
  assert.strictEqual(FC.faixa(12).rotulo, 'Média');
  assert.strictEqual(FC.faixa(13).rotulo, 'Alta');
  assert.strictEqual(FC.faixa(18).rotulo, 'Alta');
});

test('faixa sem score (null/undefined) e "Não avaliado", nunca Baixa', () => {
  assert.strictEqual(FC.faixa(null).rotulo, 'Não avaliado');
  assert.strictEqual(FC.faixa(undefined).rotulo, 'Não avaliado');
});

test('peso por faixa e 1/2/3 -- os mesmos 3 niveis que o Tier do BIA ja usa', () => {
  assert.strictEqual(FC.pesoPorScore(0), 1);
  assert.strictEqual(FC.pesoPorScore(6), 1);
  assert.strictEqual(FC.pesoPorScore(7), 2);
  assert.strictEqual(FC.pesoPorScore(12), 2);
  assert.strictEqual(FC.pesoPorScore(13), 3);
  assert.strictEqual(FC.pesoPorScore(18), 3);
});

test('sem score, pesoPorScore devolve null -- quem chama decide o peso padrao', () => {
  assert.strictEqual(FC.pesoPorScore(null), null);
  assert.strictEqual(FC.pesoPorScore(undefined), null);
});

// ============================================================
// AS PERGUNTAS EM SI
// ============================================================

test('sao exatamente 6 perguntas, cada uma com uma opcao de valor 0', () => {
  assert.strictEqual(FC.PERGUNTAS.length, 6);
  FC.PERGUNTAS.forEach((p) => {
    const scores = p.opcoes.map((o) => o.score);
    assert.ok(scores.includes(0), `${p.chave} deveria ter uma opcao de score 0`);
  });
});

test('as chaves das perguntas sao todas operacionais, sem tipo de dado nem transferencia internacional', () => {
  assert.deepStrictEqual(FC.PERGUNTAS.map((p) => p.chave), [
    'importanciaOperacional',
    'tempoSemOperar',
    'substituibilidade',
    'dependenciaDados',
    'acessoSistemas',
    'impactoClientes',
  ]);
});
