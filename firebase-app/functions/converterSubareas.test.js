// Conversao das Subareas em areas filhas (29/10/2026): planejar() puro do script.
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar } = require('./scripts/converter-subareas-em-areas');

const BASE = () => ({
  areas: [
    { id: 'ti', nome: 'TI', subareas: [
      { id: 'sa1', nome: 'Infraestrutura', lider: { id: 'bia', nome: 'Bia' } },
      { id: 'sa2', nome: 'RH', lider: null },
    ] },
    { id: 'rh', nome: 'RH' },
    { id: 'fin', nome: 'Financeiro', subareas: [] },
  ],
  processos: [
    { id: 'p1', area: 'TI', processo: 'Backup', subarea: { id: 'sa1', nome: 'Infra' } },
    { id: 'p2', area: 'TI', processo: 'Deploy', subarea: null },
    { id: 'p3', area: 'TI', processo: 'Velho', subarea: { id: 'sumiu', nome: 'Redes' } },
    { id: 'p4', area: 'TI', processo: 'Sem campo' },
  ],
  riscos: [{ id: 'r1', area: 'TI', subarea: { id: 'sa1', nome: 'Infraestrutura' } }],
  pessoas: [
    { id: 'bia', nome: 'Bia Lima', email: 'bia@x', telefone: '(85) 1', areas: ['RH', 'TI'], subarea: { area: 'TI', id: 'sa1', nome: 'Infraestrutura' } },
    { id: 'ana', nome: 'Ana', areas: ['TI'], subarea: { area: 'TI', id: 'sa1', nome: 'Infraestrutura' } },
  ],
});

test('subarea vira area filha com o lider como responsavel; nome ja usado em outro lugar vira conflito', () => {
  const r = planejar(BASE());
  assert.deepStrictEqual(r.criar, [{ nome: 'Infraestrutura', areaPaiId: 'ti', responsavel: 'Bia Lima', email: 'bia@x', telefone: '(85) 1' }]);
  assert.deepStrictEqual(r.conflitos.map((c) => c.subarea), ['RH']);
  assert.deepStrictEqual(r.limparAreas, ['fin'], 'area com conflito guarda as subareas; sem conflito, limpa');
});

test('processos, riscos e pessoas vao para a nova area; subarea que sumiu so perde o campo', () => {
  const r = planejar(BASE());
  assert.deepStrictEqual(r.processos, [
    { id: 'p1', area: 'Infraestrutura', nomeAnterior: 'TI||Backup' },
    { id: 'p2', area: null, nomeAnterior: null },
    { id: 'p3', area: null, nomeAnterior: null },
  ]);
  assert.deepStrictEqual(r.riscos, [{ id: 'r1', area: 'Infraestrutura' }]);
  assert.deepStrictEqual(r.pessoas, [
    { id: 'bia', areas: ['RH', 'Infraestrutura'], setor: 'RH' },
    { id: 'ana', areas: ['Infraestrutura'], setor: 'Infraestrutura' },
  ]);
});

test('idempotente: area filha ja criada nao e criada de novo, mas os vinculos acertam', () => {
  const b = BASE();
  b.areas.push({ id: 'inf', nome: 'Infraestrutura', areaPaiId: 'ti' });
  const r = planejar(b);
  assert.deepStrictEqual(r.criar, []);
  assert.strictEqual(r.processos[0].area, 'Infraestrutura');
});
