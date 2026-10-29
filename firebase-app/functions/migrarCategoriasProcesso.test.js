// Categorias de Processo (29/10/2026): scripts/migrar-categorias-processo.js (planejar, puro).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar, CATEGORIAS_INICIAIS } = require('./scripts/migrar-categorias-processo');

test('cria so as categorias de partida que faltam, todas com os 3 textos', () => {
  assert.deepStrictEqual(planejar([], []).criar.map((c) => c.id), ['departamental', 'intersetorial', 'processo-de-negocio']);
  assert.deepStrictEqual(planejar([], ['intersetorial']).criar.map((c) => c.id), ['departamental', 'processo-de-negocio']);
  CATEGORIAS_INICIAIS.forEach((c) => assert.ok(c.finalidade && c.criteriosIdentificacao && c.exemplos, c.id));
});

test('processo: nome antigo vira o id (sem caixa/acento), sem nome cai no padrao, e o campo antigo sai', () => {
  const r = planejar([
    { id: 'a', categoria: 'Departamental' },
    { id: 'b', categoria: 'processo de negocio' },
    { id: 'c' },
    { id: 'd', categoria: 'Inventada' },
  ], []);
  assert.deepStrictEqual(r.processos, [
    { processoId: 'a', categoriaId: 'departamental', apagarCategoria: true },
    { processoId: 'b', categoriaId: 'processo-de-negocio', apagarCategoria: true },
    { processoId: 'c', categoriaId: 'processo-de-negocio', apagarCategoria: false },
    { processoId: 'd', categoriaId: 'processo-de-negocio', apagarCategoria: true },
  ]);
});

test('categoriaId ja gravado prevalece; idempotente', () => {
  const r = planejar([{ id: 'x', categoriaId: 'nova', categoria: 'Departamental' }, { id: 'y', categoriaId: 'intersetorial' }], []);
  assert.deepStrictEqual(r.processos, [{ processoId: 'x', categoriaId: 'nova', apagarCategoria: true }]);
  assert.deepStrictEqual(planejar([{ id: 'x', categoriaId: 'nova' }], ['departamental', 'intersetorial', 'processo-de-negocio']), { criar: [], processos: [] });
});
