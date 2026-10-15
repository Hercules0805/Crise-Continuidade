const { test } = require('node:test');
const assert = require('node:assert');
const VC = require('./vulnerabilidadeContexto');

// Banco falso: colecoes -> { id: dados }.
function dbFalso(dados) {
  const leituras = [];
  const col = (nome) => ({
    doc: (id) => ({ get: async () => { leituras.push(`${nome}/${id}`); const d = (dados[nome] || {})[id]; return { exists: !!d, data: () => d }; } }),
    get: async () => { leituras.push(nome); return { docs: Object.entries(dados[nome] || {}).map(([id, d]) => ({ id, data: () => d })) }; },
  });
  return { collection: col, leituras };
}

test('limiar: lê config_regua/vulnerabilidade; ausente ou inválido cai no padrão 7', async () => {
  assert.strictEqual(await VC.lerLimiar(dbFalso({ config_regua: { vulnerabilidade: { limiarCvss: 8.5 } } })), 8.5);
  assert.strictEqual(await VC.lerLimiar(dbFalso({})), 7);
  assert.strictEqual(await VC.lerLimiar(dbFalso({ config_regua: { vulnerabilidade: { limiarCvss: 42 } } })), 7);
});

test('contexto: produto, processos afetados com o Tier vindo do BIA; sem dependência não lê processos', async () => {
  const db = dbFalso({
    produtos_software: { ps1: { nome: 'Fortes RH' } },
    processos: { p1: { processo: 'Folha', area: 'RH', dependenciaItens: [{ id: 'd1' }] } },
    respostas_bia: { b1: { area: 'RH', processo: 'Folha', score: 99, timestamp: '2026-10-01' } },
  });
  const ctx = await VC.contextoDaVulnerabilidade(db, { produtoSoftwareId: 'ps1', dependenciasAfetadas: [{ id: 'd1' }] });
  assert.strictEqual(ctx.produtoNome, 'Fortes RH');
  assert.strictEqual(ctx.limiar, 7);
  assert.deepStrictEqual(ctx.processosAfetados.map((p) => [p.id, p.area]), [['p1', 'RH']]);
  assert.match(ctx.processosAfetados[0].tier, /Tier 1/);

  const db2 = dbFalso({});
  await VC.contextoDaVulnerabilidade(db2, { dependenciasAfetadas: [] });
  assert.ok(!db2.leituras.includes('processos'), 'sem dependência afetada não lê a coleção de processos');
});

test('cache: várias vulnerabilidades em sequência leem limiar e processos uma vez só', async () => {
  const db = dbFalso({ processos: {}, respostas_bia: {} });
  const cache = {};
  await VC.contextoDaVulnerabilidade(db, { dependenciasAfetadas: [{ id: 'd1' }] }, cache);
  await VC.contextoDaVulnerabilidade(db, { dependenciasAfetadas: [{ id: 'd2' }] }, cache);
  assert.strictEqual(db.leituras.filter((l) => l === 'processos').length, 1);
  assert.strictEqual(db.leituras.filter((l) => l === 'config_regua/vulnerabilidade').length, 1);
});
