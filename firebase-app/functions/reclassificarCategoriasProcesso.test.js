// Revisao das categorias dos processos (29/10/2026): scripts/reclassificar-categorias-processo.js (planejar puro).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar, RECLASSIFICACAO, CATEGORIA_APOIO } = require('./scripts/reclassificar-categorias-processo');

const LISTA = [['TI', 'Telefonia', 'processo-de-apoio'], ['DP', 'Admissão', 'intersetorial'], ['RH', 'Sumiu', 'intersetorial']];

test('planejar: muda por area + nome exato; quem ja esta certo nao muda; nome desconhecido aparece', () => {
  const procs = [
    { id: 't', area: 'TI', processo: 'Telefonia', categoriaId: 'processo-de-negocio' },
    { id: 'a', area: 'DP', processo: 'Admissão', categoriaId: 'intersetorial' },
    { id: 'x', area: 'RH', processo: 'sumiu', categoriaId: 'departamental' },
  ];
  const r = planejar(procs, ['departamental', 'intersetorial', 'processo-de-negocio'], LISTA);
  assert.deepStrictEqual(r.mudar, [{ id: 't', area: 'TI', processo: 'Telefonia', de: 'processo-de-negocio', para: 'processo-de-apoio' }]);
  assert.strictEqual(r.jaCertos, 1);
  assert.deepStrictEqual(r.naoEncontrados, ['RH · Sumiu'], 'nome so casa exato (maiusculas importam)');
  assert.strictEqual(r.criarCategoria, true);
});

test('planejar: categoria de apoio so e criada quando falta', () => {
  assert.strictEqual(planejar([], ['processo-de-apoio'], []).criarCategoria, false);
  assert.strictEqual(CATEGORIA_APOIO.id, 'processo-de-apoio');
  assert.ok(CATEGORIA_APOIO.finalidade && CATEGORIA_APOIO.criteriosIdentificacao && CATEGORIA_APOIO.exemplos);
});

test('lista: sem processo repetido e so com categorias conhecidas', () => {
  const chaves = RECLASSIFICACAO.map(([a, p]) => `${a}||${p}`);
  assert.strictEqual(new Set(chaves).size, chaves.length);
  RECLASSIFICACAO.forEach(([, , c]) => assert.ok(['departamental', 'intersetorial', 'processo-de-negocio', 'processo-de-apoio'].includes(c), c));
});
