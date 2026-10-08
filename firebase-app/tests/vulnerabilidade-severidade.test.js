const test = require('node:test');
const assert = require('node:assert');
const VS = require('../public/vulnerabilidade-severidade.js');

test('o sentido e MAIOR e PIOR', () => {
  assert.strictEqual(VS.SENTIDO, 'maiorPior');
});

// ============================================================
// faixaPorCVSS -- bandas padrao NVD
// ============================================================

test('bandas NVD: 9-10 Critica, 7-8.9 Alta, 4-6.9 Media, 0.1-3.9 Baixa', () => {
  assert.strictEqual(VS.faixaPorCVSS(9.8), 'Crítica');
  assert.strictEqual(VS.faixaPorCVSS(9), 'Crítica');
  assert.strictEqual(VS.faixaPorCVSS(8.9), 'Alta');
  assert.strictEqual(VS.faixaPorCVSS(7), 'Alta');
  assert.strictEqual(VS.faixaPorCVSS(6.9), 'Média');
  assert.strictEqual(VS.faixaPorCVSS(4), 'Média');
  assert.strictEqual(VS.faixaPorCVSS(3.9), 'Baixa');
  assert.strictEqual(VS.faixaPorCVSS(0.1), 'Baixa');
});

test('CVSS 0 e informado de verdade (Baixa), nao ausencia', () => {
  assert.strictEqual(VS.faixaPorCVSS(0), 'Baixa');
});

test('CVSS ausente/invalido devolve null, nao uma faixa', () => {
  assert.strictEqual(VS.faixaPorCVSS(null), null);
  assert.strictEqual(VS.faixaPorCVSS(undefined), null);
  assert.strictEqual(VS.faixaPorCVSS(''), null);
  assert.strictEqual(VS.faixaPorCVSS('não se aplica'), null);
});

// ============================================================
// faixa(vuln) -- CVSS manda; severidadeManual so e fallback
// ============================================================

test('com CVSS valido, a faixa vem do CVSS mesmo que severidadeManual diga outra coisa', () => {
  const f = VS.faixa({ cvss: 9.8, severidadeManual: 'Baixa' });
  assert.strictEqual(f.rotulo, 'Crítica');
});

test('sem CVSS, cai para severidadeManual (ex.: "Não se aplica" na planilha original)', () => {
  const f = VS.faixa({ cvss: null, severidadeManual: 'Alta' });
  assert.strictEqual(f.rotulo, 'Alta');
});

test('sem CVSS e sem severidadeManual, "Não informado"', () => {
  const f = VS.faixa({});
  assert.strictEqual(f.rotulo, 'Não informado');
  assert.strictEqual(f.cor, '#999');
});

test('severidadeManual fora da lista fechada e tratada como ausente', () => {
  const f = VS.faixa({ severidadeManual: 'xpto' });
  assert.strictEqual(f.rotulo, 'Não informado');
});

test('cada faixa valida tem cor/fundo proprios (tokens --risk-*)', () => {
  VS.FAIXAS.forEach((rotulo) => {
    const f = VS.faixa({ severidadeManual: rotulo });
    assert.strictEqual(f.rotulo, rotulo);
    assert.ok(f.cor.startsWith('var(--risk-'), `faixa ${rotulo} deveria usar um token --risk-*`);
  });
});
