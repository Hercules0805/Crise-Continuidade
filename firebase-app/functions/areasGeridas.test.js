// Areas hierarquicas (29/10/2026): escopo do gestor (config_perfis.areasGeridas).
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('./areasGeridas');

const AREAS = [
  { id: 'd', nome: 'Diretoria' }, { id: 't', nome: 'TI', areaPaiId: 'd' },
  { id: 'i', nome: 'Infra', areaPaiId: 't' }, { id: 'r', nome: 'RH' },
];

test('areasGeridasDoPerfil: a area e as de baixo; sem area, nenhuma', () => {
  assert.deepStrictEqual(G.areasGeridasDoPerfil(AREAS, { area: 'TI' }), ['TI', 'Infra']);
  assert.deepStrictEqual(G.areasGeridasDoPerfil(AREAS, { area: 'Diretoria' }), ['Diretoria', 'TI', 'Infra']);
  assert.deepStrictEqual(G.areasGeridasDoPerfil(AREAS, {}), []);
});

test('ajustesAreasGeridas: so os que mudam (sem laco com o gatilho)', () => {
  const ajustes = G.ajustesAreasGeridas(AREAS, [
    { id: 'a', area: 'TI', areasGeridas: ['TI', 'Infra'] },
    { id: 'b', area: 'TI' },
    { id: 'c', area: 'RH', areasGeridas: ['RH', 'Velha'] },
    { id: 'd' },
    { id: 'e', areasGeridas: ['TI'] },
  ]);
  assert.deepStrictEqual(ajustes, [
    { id: 'b', areasGeridas: ['TI', 'Infra'] },
    { id: 'c', areasGeridas: ['RH'] },
    { id: 'e', areasGeridas: [] },
  ]);
});

function makeDb(store) {
  return {
    _store: store,
    collection: (col) => ({
      get: async () => ({ docs: Object.entries(store[col] || {}).map(([id, d]) => ({ id, data: () => d })) }),
      doc: (id) => ({ set: async (patch) => { store[col][id] = { ...(store[col][id] || {}), ...patch }; } }),
    }),
  };
}

test('recalcularTodos grava so o necessario; recalcularPerfil recalcula um', async () => {
  const db = makeDb({
    areas: Object.fromEntries(AREAS.map((a) => [a.id, a])),
    config_perfis: { 'g@x': { area: 'TI' }, 'h@x': { area: 'RH', areasGeridas: ['RH'] } },
  });
  assert.strictEqual(await G.recalcularTodos(db), 1);
  assert.deepStrictEqual(db._store.config_perfis['g@x'].areasGeridas, ['TI', 'Infra']);
  assert.strictEqual(await G.recalcularTodos(db), 0, 'segunda passada nao grava nada');
  assert.strictEqual(await G.recalcularPerfil(db, 'h@x', { area: 'Diretoria', areasGeridas: ['RH'] }), true);
  assert.deepStrictEqual(db._store.config_perfis['h@x'].areasGeridas, ['Diretoria', 'TI', 'Infra']);
  assert.strictEqual(await G.recalcularPerfil(db, 'x@x', null), false);
});
