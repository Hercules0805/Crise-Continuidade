// Subáreas (29/10/2026): helper puro (public/subareas.js) e paridade com functions/subareas.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../public/subareas.js');

const AREAS = [
  { id: 'a1', nome: 'Tecnologia', subareas: [
    { id: 'sa1', nome: 'Infraestrutura', lider: { id: 'ana', nome: 'Ana' } },
    { id: 'sa2', nome: 'Desenvolvimento', lider: null },
  ] },
  { id: 'a2', nome: 'Financeiro' },
];

test('functions/subareas.js e copia identica de public/subareas.js', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'public', 'subareas.js'), 'utf8');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'subareas.js'), 'utf8');
  assert.strictEqual(fn, pub);
});

test('normalizarSubareas: corta nome, descarta vazio e repetido (sem acento/caixa), garante id, lider {id,nome}', () => {
  const r = S.normalizarSubareas([
    { id: 'x', nome: '  Infraestrutura ', lider: { id: 7, nome: 'Ana', email: 'a@x' } },
    { nome: 'INFRAESTRUTURA' },
    { nome: '   ' },
    { nome: 'Suporte', lider: { nome: 'sem id' } },
    null,
  ]);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], { id: 'x', nome: 'Infraestrutura', lider: { id: '7', nome: 'Ana' } });
  assert.strictEqual(r[1].nome, 'Suporte');
  assert.match(r[1].id, /^sa_/);
  assert.strictEqual(r[1].lider, null);
  assert.deepStrictEqual(S.normalizarSubareas(undefined), []);
});

test('resolverSubarea: nome atual pelo id; id que sumiu fica marcado como removida; sem ref -> null', () => {
  assert.deepStrictEqual(S.resolverSubarea(AREAS, 'Tecnologia', { id: 'sa1', nome: 'Infra (nome antigo)' }),
    { id: 'sa1', nome: 'Infraestrutura', lider: { id: 'ana', nome: 'Ana' }, removida: false });
  assert.deepStrictEqual(S.resolverSubarea(AREAS, 'tecnologia', { id: 'velho', nome: 'Redes' }),
    { id: 'velho', nome: 'Redes', lider: null, removida: true });
  assert.strictEqual(S.resolverSubarea(AREAS, 'Tecnologia', null), null);
  assert.strictEqual(S.resolverSubarea(AREAS, 'Tecnologia', { nome: 'sem id' }), null);
});

test('subareasDaArea, rotuloArea e subareasLideradas', () => {
  assert.deepStrictEqual(S.subareasDaArea(AREAS, 'Tecnologia').map((s) => s.id), ['sa1', 'sa2']);
  assert.deepStrictEqual(S.subareasDaArea(AREAS, 'Financeiro'), []);
  assert.deepStrictEqual(S.subareasDaArea(AREAS, 'Nenhuma'), []);
  assert.strictEqual(S.rotuloArea('Tecnologia', { nome: 'Infraestrutura' }), 'Tecnologia › Infraestrutura');
  assert.strictEqual(S.rotuloArea('Tecnologia', null), 'Tecnologia');
  assert.strictEqual(S.rotuloArea('Tecnologia', { nome: 'Redes', removida: true }), 'Tecnologia › Redes (subárea removida)');
  assert.deepStrictEqual(S.subareasLideradas(AREAS, 'ana').map((x) => [x.area, x.subarea.nome]), [['Tecnologia', 'Infraestrutura']]);
  assert.deepStrictEqual(S.subareasLideradas(AREAS, ''), []);
});
