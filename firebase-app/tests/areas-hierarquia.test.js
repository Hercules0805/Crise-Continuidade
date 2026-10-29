// Áreas hierárquicas (29/10/2026): helper puro (public/areas-hierarquia.js) e paridade com functions/areasHierarquia.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('../public/areas-hierarquia.js');

const AREAS = [
  { id: 'dir', nome: 'Diretoria de Tecnologia', areaPaiId: null },
  { id: 'ti', nome: 'TI', areaPaiId: 'dir' },
  { id: 'infra', nome: 'Infraestrutura', areaPaiId: 'ti' },
  { id: 'sis', nome: 'Sistemas', areaPaiId: 'ti' },
  { id: 'rh', nome: 'RH' },
];

test('functions/areasHierarquia.js e copia identica de public/areas-hierarquia.js', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'public', 'areas-hierarquia.js'), 'utf8');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'areasHierarquia.js'), 'utf8');
  assert.strictEqual(fn, pub);
});

test('pai, filhas, descendentes, ancestrais e caminho', () => {
  assert.strictEqual(H.pai(AREAS, 'TI').nome, 'Diretoria de Tecnologia');
  assert.strictEqual(H.pai(AREAS, 'RH'), null);
  assert.deepStrictEqual(H.filhas(AREAS, 'TI').map((a) => a.nome), ['Infraestrutura', 'Sistemas']);
  assert.deepStrictEqual(H.descendentes(AREAS, 'Diretoria de Tecnologia'), ['Diretoria de Tecnologia', 'TI', 'Infraestrutura', 'Sistemas']);
  assert.deepStrictEqual(H.descendentes(AREAS, 'Fora do cadastro'), ['Fora do cadastro']);
  assert.deepStrictEqual(H.descendentes(AREAS, ''), []);
  assert.deepStrictEqual(H.ancestrais(AREAS, 'Infraestrutura'), ['TI', 'Diretoria de Tecnologia']);
  assert.strictEqual(H.caminho(AREAS, 'Infraestrutura'), 'Diretoria de Tecnologia › TI › Infraestrutura');
  assert.strictEqual(H.caminho(AREAS, 'RH'), 'RH');
});

test('bloqueadasComoPai: a propria e as de baixo; escopoDoGestor', () => {
  assert.deepStrictEqual(H.bloqueadasComoPai(AREAS, 'ti').sort(), ['infra', 'sis', 'ti']);
  assert.deepStrictEqual(H.bloqueadasComoPai(AREAS, 'rh'), ['rh']);
  assert.deepStrictEqual(H.escopoDoGestor(AREAS, 'TI'), ['TI', 'Infraestrutura', 'Sistemas']);
  assert.deepStrictEqual(H.escopoDoGestor(AREAS, ''), []);
});

test('ordemArvore: raizes em ordem alfabetica, cada uma seguida das de baixo, com o nivel', () => {
  assert.deepStrictEqual(H.ordemArvore(AREAS).map((x) => `${x.nivel}:${x.area.nome}`),
    ['0:Diretoria de Tecnologia', '1:TI', '2:Infraestrutura', '2:Sistemas', '0:RH']);
});

test('dado circular nao trava: descendentes, ancestrais e arvore param no repetido', () => {
  const ciclo = [{ id: 'a', nome: 'A', areaPaiId: 'b' }, { id: 'b', nome: 'B', areaPaiId: 'a' }, { id: 'c', nome: 'C', areaPaiId: 'c' }];
  assert.deepStrictEqual(H.descendentes(ciclo, 'A'), ['A', 'B']);
  assert.deepStrictEqual(H.ancestrais(ciclo, 'A'), ['B']);
  assert.strictEqual(H.pai(ciclo, 'C'), null, 'pai de si mesma nao conta');
  assert.deepStrictEqual(H.ordemArvore(ciclo).map((x) => x.area.nome).sort(), ['A', 'B', 'C']);
});

test('mesmaLista', () => {
  assert.ok(H.mesmaLista(['a', 'b'], ['a', 'b']));
  assert.ok(!H.mesmaLista(['a', 'b'], ['b', 'a']));
  assert.ok(H.mesmaLista(undefined, []));
});
