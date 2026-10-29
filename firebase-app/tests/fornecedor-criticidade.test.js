const test = require('node:test');
const assert = require('node:assert');
const FC = require('../public/fornecedor-criticidade.js');

// Perguntas/opcoes de teste no mesmo molde do PERGUNTAS_SEED (6 perguntas
// operacionais, 4 opcoes cada, scores 0-3) -- desde a DECISAO 08/10/2026 as
// perguntas sao cadastraveis (Firestore), entao calcular()/faixa() recebem a
// lista de perguntas ATIVAS como parametro em vez de ler um array fixo do
// modulo. `id` aqui faz o papel do id do documento Firestore; a resposta
// grava o INDICE da opcao escolhida (nao mais um slug), porque a ordem das
// opcoes e a unica referencia estavel que o cadastro ja da de graca.
const PERGUNTAS_TESTE = [
  { id: 'importanciaOperacional', texto: 'importância', opcoes: [{ rotulo: 'Baixa', score: 0 }, { rotulo: 'Moderada', score: 1 }, { rotulo: 'Alta', score: 2 }, { rotulo: 'Essencial', score: 3 }] },
  { id: 'tempoSemOperar', texto: 'tempo sem operar', opcoes: [{ rotulo: 'Mais de 72h', score: 0 }, { rotulo: 'Até 72h', score: 1 }, { rotulo: 'Até 24h', score: 2 }, { rotulo: 'Até 4h', score: 3 }] },
  { id: 'substituibilidade', texto: 'substituibilidade', opcoes: [{ rotulo: 'Fácil', score: 0 }, { rotulo: 'Com tempo', score: 1 }, { rotulo: 'Poucas', score: 2 }, { rotulo: 'Nenhuma', score: 3 }] },
  { id: 'dependenciaDados', texto: 'dependência de dados', opcoes: [{ rotulo: 'Sem impacto', score: 0 }, { rotulo: 'Pontual', score: 1 }, { rotulo: 'Trabalhosa', score: 2 }, { rotulo: 'Crítico', score: 3 }] },
  { id: 'acessoSistemas', texto: 'acesso a sistemas', opcoes: [{ rotulo: 'Nenhum', score: 0 }, { rotulo: 'Usuário comum', score: 1 }, { rotulo: 'Integração', score: 2 }, { rotulo: 'Privilegiado', score: 3 }] },
  { id: 'impactoClientes', texto: 'impacto a clientes', opcoes: [{ rotulo: 'Não', score: 0 }, { rotulo: 'Indireto', score: 1 }, { rotulo: 'Limitado', score: 2 }, { rotulo: 'Direto', score: 3 }] },
];

// Resposta = indice da opcao escolhida (0 = menor score, 3 = maior).
const COMPLETA_ZERO = {
  importanciaOperacional: 0, tempoSemOperar: 0, substituibilidade: 0,
  dependenciaDados: 0, acessoSistemas: 0, impactoClientes: 0,
};

const COMPLETA_MAXIMA = {
  importanciaOperacional: 3, tempoSemOperar: 3, substituibilidade: 3,
  dependenciaDados: 3, acessoSistemas: 3, impactoClientes: 3,
};

// ============================================================
// O SENTIDO — o oposto do fornecedor-score.js, na mesma tela
// ============================================================

test('a criticidade e MAIOR e PIOR, o contrario da nota de conformidade', () => {
  assert.strictEqual(FC.SENTIDO, 'maiorPior');
});

test('score maximo e a soma do maior score de cada pergunta ativa', () => {
  assert.strictEqual(FC.scoreMaximoDe(PERGUNTAS_TESTE), 18);
  assert.strictEqual(FC.calcular(PERGUNTAS_TESTE, COMPLETA_MAXIMA).score, 18);
  assert.strictEqual(FC.calcular(PERGUNTAS_TESTE, COMPLETA_MAXIMA).scoreMaximo, 18);
});

test('scoreMaximoDe reage a menos perguntas ativas -- remover 1 pergunta tira os 3 pontos dela do total', () => {
  assert.strictEqual(FC.scoreMaximoDe(PERGUNTAS_TESTE.slice(0, 5)), 15);
  assert.strictEqual(FC.scoreMaximoDe([]), 0);
});

// ============================================================
// A OPCAO DE MENOR SCORE E RESPOSTA VALIDA, NAO AUSENCIA
// ============================================================

test('as 6 perguntas respondidas com a opcao de menor score dao criticidade 0 de verdade', () => {
  const r = FC.calcular(PERGUNTAS_TESTE, COMPLETA_ZERO);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.completa, true);
  assert.strictEqual(r.faixa.rotulo, 'Baixa');
  assert.notStrictEqual(r.faixa.rotulo, 'Não avaliado', 'criticidade 0 respondida nao e a mesma coisa que nao avaliado');
});

test('faltando responder qualquer uma das perguntas ativas, a criticidade nao existe', () => {
  const { importanciaOperacional, ...semImportancia } = COMPLETA_ZERO;
  const r = FC.calcular(PERGUNTAS_TESTE, semImportancia);
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.completa, false);
  assert.deepStrictEqual(r.pendentes, ['importanciaOperacional']);
  assert.strictEqual(r.faixa.rotulo, 'Não avaliado');
});

test('nenhuma pergunta respondida tambem nao tem criticidade', () => {
  const r = FC.calcular(PERGUNTAS_TESTE, {});
  assert.strictEqual(r.score, null);
  assert.deepStrictEqual(r.pendentes, PERGUNTAS_TESTE.map((p) => p.id));
});

test('sem nenhuma pergunta ativa, tambem nao ha criticidade (nao e Baixa por omissao)', () => {
  const r = FC.calcular([], {});
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.completa, false);
  assert.strictEqual(r.faixa.rotulo, 'Não avaliado');
});

test('respostas nulas ou undefined nao quebram', () => {
  assert.strictEqual(FC.calcular(PERGUNTAS_TESTE, null).score, null);
  assert.strictEqual(FC.calcular(PERGUNTAS_TESTE, undefined).completa, false);
});

test('valor de opcao invalido (indice fora do array) conta como pendente', () => {
  const r = FC.calcular(PERGUNTAS_TESTE, { ...COMPLETA_ZERO, importanciaOperacional: 99 });
  assert.deepStrictEqual(r.pendentes, ['importanciaOperacional']);
  assert.strictEqual(r.score, null);
});

// ============================================================
// A CONTA
// ============================================================

test('a soma bate para uma combinacao no meio da escala', () => {
  // moderada(1) + ate24h(2) + comTempo(1) + pontual(1) + usuarioComum(1) + indireto(1) = 7
  const r = FC.calcular(PERGUNTAS_TESTE, {
    importanciaOperacional: 1,
    tempoSemOperar: 2,
    substituibilidade: 1,
    dependenciaDados: 1,
    acessoSistemas: 1,
    impactoClientes: 1,
  });
  assert.strictEqual(r.score, 7);
});

test('cada pergunta e de escolha unica: so a pergunta importa, nao a combinacao de opcoes', () => {
  // Trocar so a opcao da pergunta "substituibilidade" muda so a parcela dela.
  const base = { ...COMPLETA_ZERO };
  delete base.substituibilidade;
  const facil = FC.calcular(PERGUNTAS_TESTE, { ...base, substituibilidade: 0 });
  const semAlternativa = FC.calcular(PERGUNTAS_TESTE, { ...base, substituibilidade: 3 });
  assert.strictEqual(facil.score, 0);
  assert.strictEqual(semAlternativa.score, 3);
});

// ============================================================
// FAIXAS — proporcionais ao score maximo (DECISAO 08/10/2026), nao mais
// numeros fixos: adicionar/remover pergunta ou opcao nao descalibra o corte.
// ============================================================

test('faixas com o score maximo de hoje (18): mesmos cortes de sempre, 0-6 Baixa, 7-12 Média, 13-18 Alta', () => {
  assert.strictEqual(FC.faixa(0, 18).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(6, 18).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(7, 18).rotulo, 'Média');
  assert.strictEqual(FC.faixa(12, 18).rotulo, 'Média');
  assert.strictEqual(FC.faixa(13, 18).rotulo, 'Alta');
  assert.strictEqual(FC.faixa(18, 18).rotulo, 'Alta');
});

test('faixas reescalam com um score maximo diferente -- mesma proporcao, cortes diferentes', () => {
  // Maximo 15 (5 perguntas): corte de Alta e 15*(13/18) ≈ 10.83, de Média e 15*(7/18) ≈ 5.83.
  assert.strictEqual(FC.faixa(5, 15).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(6, 15).rotulo, 'Média');
  assert.strictEqual(FC.faixa(10, 15).rotulo, 'Média');
  assert.strictEqual(FC.faixa(11, 15).rotulo, 'Alta');
});

test('faixa sem score (null/undefined) e "Não avaliado", nunca Baixa', () => {
  assert.strictEqual(FC.faixa(null, 18).rotulo, 'Não avaliado');
  assert.strictEqual(FC.faixa(undefined, 18).rotulo, 'Não avaliado');
});

test('faixa com score maximo zero/ausente nao quebra e nao vira Alta por acidente', () => {
  assert.strictEqual(FC.faixa(0, 0).rotulo, 'Baixa');
  assert.strictEqual(FC.faixa(5, undefined).rotulo, 'Baixa');
});

test('peso por faixa e 1/2/3 -- os mesmos 3 niveis que o Tier do BIA ja usa', () => {
  assert.strictEqual(FC.pesoPorScore(0, 18), 1);
  assert.strictEqual(FC.pesoPorScore(6, 18), 1);
  assert.strictEqual(FC.pesoPorScore(7, 18), 2);
  assert.strictEqual(FC.pesoPorScore(12, 18), 2);
  assert.strictEqual(FC.pesoPorScore(13, 18), 3);
  assert.strictEqual(FC.pesoPorScore(18, 18), 3);
});

test('sem score, pesoPorScore devolve null -- quem chama decide o peso padrao', () => {
  assert.strictEqual(FC.pesoPorScore(null, 18), null);
  assert.strictEqual(FC.pesoPorScore(undefined, 18), null);
});

// ============================================================
// O SEED INICIAL (usado so pelo script de migracao, nao por calcular/faixa)
// ============================================================

test('o seed inicial tem exatamente 6 perguntas, cada uma com uma opcao de score 0 e uma de score 3', () => {
  assert.strictEqual(FC.PERGUNTAS_SEED.length, 6);
  FC.PERGUNTAS_SEED.forEach((p) => {
    const scores = p.opcoes.map((o) => o.score);
    assert.ok(scores.includes(0), `"${p.texto}" deveria ter uma opcao de score 0`);
    assert.ok(scores.includes(3), `"${p.texto}" deveria ter uma opcao de score 3`);
  });
});

test('o seed inicial soma 18 de score maximo (6 perguntas x 3)', () => {
  assert.strictEqual(FC.scoreMaximoDe(FC.PERGUNTAS_SEED.map((p, i) => Object.assign({ id: 'seed' + i }, p))), 18);
});

// --- Criticidade efetiva (29/10/2026): processo Tier 1 torna o fornecedor Alta ---
test('efetiva: sem processo critico e a regra do questionario (completa ? score : null)', () => {
  const av = { completaCriticidade: true, scoreCriticidade: 3, scoreMaximoCriticidade: 18 };
  const e = FC.efetiva(av, []);
  assert.strictEqual(e.automatica, false);
  assert.strictEqual(e.score, 3);
  assert.strictEqual(e.faixa.rotulo, 'Baixa');
  assert.strictEqual(FC.pesoEfetivo(e), 1);
  const incompleta = FC.efetiva({ completaCriticidade: false, scoreCriticidade: 15, scoreMaximoCriticidade: 18 }, []);
  assert.strictEqual(incompleta.score, null);
  assert.strictEqual(incompleta.faixa.rotulo, 'Não avaliado');
  assert.strictEqual(FC.pesoEfetivo(incompleta), null);
});

test('efetiva: dependencia de processo Tier 1 e Alta automatica, mesmo Baixa ou sem avaliacao', () => {
  const procs = [{ processo: { id: 'p1', processo: 'Folha' }, origens: ['Direta'] }];
  const baixa = FC.efetiva({ completaCriticidade: true, scoreCriticidade: 1, scoreMaximoCriticidade: 18 }, procs);
  assert.strictEqual(baixa.automatica, true);
  assert.strictEqual(baixa.faixa.rotulo, 'Alta');
  assert.strictEqual(baixa.score, 1); // o questionario fica como referencia
  assert.strictEqual(FC.pesoEfetivo(baixa), 3);
  const sem = FC.efetiva(null, procs);
  assert.strictEqual(sem.automatica, true);
  assert.strictEqual(FC.pesoEfetivo(sem), 3);
});
