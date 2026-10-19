const { test } = require('node:test');
const assert = require('node:assert');
const { planejarRelacionados, PAPEL_MIGRADO } = require('./relacionadosFornecedor');

const PESSOAS = [
  { id: 'p1', nome: 'Ana Souza' },
  { id: 'p2', nome: 'Bruno Lima' },
  { id: 'p3', nome: 'Carla Dias' },
  { id: 'p4', nome: 'Carla Dias' }, // homonimo
];

test('gestor com id vira pessoa relacionada com o papel da migracao; o nome vem do cadastro', () => {
  const r = planejarRelacionados({ gestoresContrato: [{ id: 'p1', nome: 'ana s.' }] }, PESSOAS);
  assert.deepStrictEqual(r.patch.pessoasRelacionadas, [{ id: 'p1', nome: 'Ana Souza', papel: PAPEL_MIGRADO }]);
  assert.strictEqual(PAPEL_MIGRADO, 'Gestor (anterior ao contrato)');
  assert.deepStrictEqual(r.patch.areasRelacionadas, []);
});

test('setor vira area relacionada', () => {
  const r = planejarRelacionados({ setor: 'Jurídico' }, PESSOAS);
  assert.deepStrictEqual(r.patch.areasRelacionadas, ['Jurídico']);
  assert.deepStrictEqual(r.adicionadas, ['área Jurídico']);
});

test('gestor sem id: acha a Pessoa pelo nome (sem acento/maiuscula), so se houver um unico homonimo', () => {
  const unico = planejarRelacionados({ gestoresContrato: [{ id: null, nome: 'BRUNO  lima' }] }, PESSOAS);
  assert.deepStrictEqual(unico.patch.pessoasRelacionadas, [{ id: 'p2', nome: 'Bruno Lima', papel: PAPEL_MIGRADO }]);
  const homonimo = planejarRelacionados({ gestoresContrato: [{ id: null, nome: 'Carla Dias' }] }, PESSOAS);
  assert.deepStrictEqual(homonimo.patch.pessoasRelacionadas, [{ id: null, nome: 'Carla Dias', papel: PAPEL_MIGRADO }], 'ambiguo: nao chuta');
  assert.match(homonimo.adicionadas[0], /sem cadastro/);
  const ausente = planejarRelacionados({ gestoresContrato: [{ id: null, nome: 'Zélia' }] }, PESSOAS);
  assert.strictEqual(ausente.patch.pessoasRelacionadas[0].id, null);
});

test('so o texto legado (gestorContrato) e usado quando nao ha a lista nova', () => {
  const legado = planejarRelacionados({ gestorContrato: 'Ana Souza' }, PESSOAS);
  assert.deepStrictEqual(legado.patch.pessoasRelacionadas, [{ id: 'p1', nome: 'Ana Souza', papel: PAPEL_MIGRADO }]);
  const comLista = planejarRelacionados({ gestorContrato: 'Fantasma', gestoresContrato: [{ id: 'p2', nome: 'Bruno Lima' }] }, PESSOAS);
  assert.deepStrictEqual(comLista.patch.pessoasRelacionadas.map((p) => p.nome), ['Bruno Lima'], 'o legado espelha o 1o da lista: nao duplica');
});

test('IDEMPOTENTE: o que ja esta relacionado nao e acrescentado de novo; nada a fazer = null', () => {
  const f = { setor: 'TI', gestoresContrato: [{ id: 'p1', nome: 'Ana Souza' }] };
  const primeiro = planejarRelacionados(f, PESSOAS);
  const depois = { ...f, ...primeiro.patch };
  assert.strictEqual(planejarRelacionados(depois, PESSOAS), null);
  assert.strictEqual(planejarRelacionados({}, PESSOAS), null);
  assert.strictEqual(planejarRelacionados({ gestoresContrato: [], gestorContrato: '  ', setor: ' ' }, PESSOAS), null);
});

test('preserva o que ja estava relacionado (papel escolhido por uma pessoa nao e sobrescrito)', () => {
  const f = {
    setor: 'RH', areasRelacionadas: ['TI'],
    pessoasRelacionadas: [{ id: 'p1', nome: 'Ana Souza', papel: 'Aprovador/Patrocinador' }],
    gestoresContrato: [{ id: 'p1', nome: 'Ana Souza' }, { id: 'p2', nome: 'Bruno Lima' }],
  };
  const r = planejarRelacionados(f, PESSOAS);
  assert.deepStrictEqual(r.patch.pessoasRelacionadas, [
    { id: 'p1', nome: 'Ana Souza', papel: 'Aprovador/Patrocinador' },
    { id: 'p2', nome: 'Bruno Lima', papel: PAPEL_MIGRADO },
  ]);
  assert.deepStrictEqual(r.patch.areasRelacionadas, ['TI', 'RH']);
  assert.strictEqual(r.adicionadas.length, 2);
});

test('nao apaga os campos antigos: o patch so tem os campos relacionados', () => {
  const r = planejarRelacionados({ setor: 'TI', gestorContrato: 'Ana Souza' }, PESSOAS);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ['areasRelacionadas', 'pessoasRelacionadas']);
});
