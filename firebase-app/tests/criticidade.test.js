// Testes da regra unica de criticidade (node --test, sem emulador/Java).
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../public/criticidade.js');

const { TIER } = C;

test('limiares: 12 e acima e Tier 1, 6 a 11 e Tier 2, abaixo de 6 e Tier 3', () => {
  assert.strictEqual(C.tierPorScore(12), TIER.T1);
  assert.strictEqual(C.tierPorScore(21), TIER.T1);
  assert.strictEqual(C.tierPorScore(11), TIER.T2);
  assert.strictEqual(C.tierPorScore(6), TIER.T2);
  assert.strictEqual(C.tierPorScore(5), TIER.T3);
  assert.strictEqual(C.tierPorScore(0), TIER.T3);
});

// A decisao de 19/09/2026. Era aqui que as telas divergiam.
test('processo sem avaliacao mostra Pendente, nunca Tier 3', () => {
  assert.strictEqual(C.tierDoProcesso({ score: 0 }), TIER.PENDENTE);
  assert.strictEqual(C.tierDoProcesso({}), TIER.PENDENTE);
  assert.strictEqual(C.tierDoProcesso(undefined), TIER.PENDENTE);
  assert.strictEqual(C.tierDoProcesso({ avaliado: false, score: 0 }), TIER.PENDENTE);
});

test('processo avaliado com score 0 e Tier 3, nao Pendente', () => {
  // Respondeu tudo "N/A". Diferente de nunca ter respondido.
  assert.strictEqual(C.tierDoProcesso({ avaliado: true, score: 0 }), TIER.T3);
});

test('tier fixado a mao vale so quando nao ha avaliacao', () => {
  assert.strictEqual(C.tierDoProcesso({ tierManual: TIER.T1 }), TIER.T1);
  // Avaliado: o score manda, o manual nao sobrepoe.
  assert.strictEqual(C.tierDoProcesso({ avaliado: true, score: 3, tierManual: TIER.T1 }), TIER.T3);
});

// A divergencia concreta que existia: app.js:1336 x 1383 x 2168 x 6075.
test('o mesmo processo recebe o mesmo rotulo por qualquer caminho', () => {
  const casos = [
    { avaliado: true, score: 14 },
    { avaliado: true, score: 8 },
    { avaliado: true, score: 2 },
    { score: 0 },
    { tierManual: TIER.T2 },
  ];
  for (const p of casos) {
    const t = C.tierDoProcesso(p);
    assert.strictEqual(C.corDoTier(p), C.corDoTier(t), 'cor diverge para ' + JSON.stringify(p));
    assert.ok(C.ehTier(p, t), 'ehTier diverge para ' + JSON.stringify(p));
    // O rotulo curto tem que ser prefixo do longo (ou o proprio Pendente).
    assert.ok(t.startsWith(C.tierCurto(p)), 'rotulo curto diverge para ' + JSON.stringify(p));
  }
});

test('Pendente tem cor propria, diferente de Tier 3', () => {
  assert.notStrictEqual(C.corDoTier(TIER.PENDENTE), C.corDoTier(TIER.T3));
});

test('score em texto nao quebra a regra', () => {
  assert.strictEqual(C.tierDoProcesso({ avaliado: true, score: '14' }), TIER.T1);
  assert.strictEqual(C.tierDoProcesso({ score: 'abc' }), TIER.PENDENTE);
});

// Trava os limiares contra as copias do servidor, que nao podem importar este
// arquivo (tokenLogic.js roda em Node no Cloud Functions, Code.gs no Apps
// Script). Se alguem mudar um limiar aqui e esquecer la, este teste avisa.
test('limiares continuam 12 e 6 (copias do servidor dependem disso)', () => {
  assert.strictEqual(C.LIMIAR_TIER_1, 12);
  assert.strictEqual(C.LIMIAR_TIER_2, 6);
});

// --- RTO: decisao de 20/09/2026 ---
// As opcoes do campo RTO no formulario (app.js, select #fRTO). Se alguem mudar
// as faixas la, este teste quebra aqui — que e o lugar certo para descobrir.
const OPCOES_RTO_DO_FORMULARIO = ['< 1 hora', '< 4 horas', '4h a 8h', '8h a 24h', '> 24 horas'];

test('todo RTO sugerido existe entre as opcoes do formulario', () => {
  // O bug: Tier 2 devolvia "4h a 24 horas", que nao existe no select. O campo
  // voltava em branco ao reabrir, e 14 processos ficaram assim.
  for (const tier of [TIER.T1, TIER.T2, TIER.T3]) {
    const rto = C.rtoSugerido(tier);
    assert.ok(
      OPCOES_RTO_DO_FORMULARIO.includes(rto),
      `"${rto}" (${tier}) nao existe no formulario — o campo vai aparecer vazio`
    );
  }
});

test('Tier 2 sugere a faixa mais larga, nao a mais apertada', () => {
  // De proposito: a faixa antiga ia de 4h a 24h. Escolher "4h a 8h" criaria um
  // compromisso de recuperacao que ninguem assumiu.
  assert.strictEqual(C.rtoSugerido(TIER.T2), '8h a 24h');
});
