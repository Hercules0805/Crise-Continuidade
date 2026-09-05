/**
 * Testes das regras de Tier/RTO e da regra "última resposta vence" por
 * area||processo. Espelham a lógica de Code.gs (_calcularTier/_calcularRTO e
 * a indexação em getProcessos) que o api.js reimplementa no cliente.
 *
 *   npx ts-node src/__test-tier.ts
 */
import * as assert from 'assert';

function calcularTier(score: number): string {
  if (score >= 12) return 'Tier 1 (Crítico)';
  if (score >= 6) return 'Tier 2 (Essencial)';
  return 'Tier 3 (Suporte)';
}

function calcularRTO(tier: string): string {
  if (tier === 'Tier 1 (Crítico)') return '< 4 horas';
  if (tier === 'Tier 2 (Essencial)') return '4h a 24 horas';
  return '> 24 horas';
}

// Última resposta por area||processo (mesma regra do _lerRespostasIndexadas)
function ultimaPorChave(respostas: Array<{ area: string; processo: string; timestamp: string; score: number; tier: string }>) {
  const ordenadas = [...respostas].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const idx: Record<string, { score: number; tier: string }> = {};
  ordenadas.forEach((r) => {
    const key = `${r.area}||${r.processo}`;
    if (!idx[key]) idx[key] = { score: r.score, tier: r.tier };
  });
  return idx;
}

let passed = 0;
function ok(name: string, fn: () => void) { fn(); passed++; console.log(`  ok  ${name}`); }

ok('tier: fronteiras 12/6', () => {
  assert.strictEqual(calcularTier(12), 'Tier 1 (Crítico)');
  assert.strictEqual(calcularTier(13), 'Tier 1 (Crítico)');
  assert.strictEqual(calcularTier(11), 'Tier 2 (Essencial)');
  assert.strictEqual(calcularTier(6), 'Tier 2 (Essencial)');
  assert.strictEqual(calcularTier(5), 'Tier 3 (Suporte)');
  assert.strictEqual(calcularTier(0), 'Tier 3 (Suporte)');
});

ok('rto: mapeamento por tier', () => {
  assert.strictEqual(calcularRTO('Tier 1 (Crítico)'), '< 4 horas');
  assert.strictEqual(calcularRTO('Tier 2 (Essencial)'), '4h a 24 horas');
  assert.strictEqual(calcularRTO('Tier 3 (Suporte)'), '> 24 horas');
});

ok('última resposta vence por area||processo', () => {
  const respostas = [
    { area: 'TI', processo: 'Backup', timestamp: '2024-01-01T10:00:00Z', score: 4, tier: 'Tier 3 (Suporte)' },
    { area: 'TI', processo: 'Backup', timestamp: '2024-03-01T10:00:00Z', score: 13, tier: 'Tier 1 (Crítico)' },
    { area: 'RH', processo: 'Folha', timestamp: '2024-02-01T10:00:00Z', score: 7, tier: 'Tier 2 (Essencial)' },
  ];
  const idx = ultimaPorChave(respostas);
  assert.strictEqual(idx['TI||Backup'].score, 13);
  assert.strictEqual(idx['TI||Backup'].tier, 'Tier 1 (Crítico)');
  assert.strictEqual(idx['RH||Folha'].score, 7);
});

console.log(`\n${passed} testes de tier/RTO OK`);
