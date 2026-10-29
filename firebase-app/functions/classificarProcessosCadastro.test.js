// Cadastro de Processos (28/10/2026): scripts/classificar-processos-cadastro.js (planejar, puro).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar } = require('./scripts/classificar-processos-cadastro');

test('processo legado vira Processo de Negócio e de Continuidade', () => {
  assert.deepStrictEqual(planejar([{ id: 'ti__folha', area: 'TI', processo: 'Folha' }]), [
    { processoId: 'ti__folha', dados: { categoriaId: 'processo-de-negocio', continuidade: true } },
  ]);
});

test('so grava o campo que falta; o que ja foi classificado fica como esta', () => {
  const r = planejar([
    { id: 'a', categoria: 'Departamental', continuidade: false },
    { id: 'b', categoria: 'Intersetorial' },
    { id: 'c', continuidade: false },
  ]);
  assert.deepStrictEqual(r, [
    { processoId: 'b', dados: { continuidade: true } },
    { processoId: 'c', dados: { categoriaId: 'processo-de-negocio' } },
  ]);
});

test('idempotente: depois de gravado, nada a fazer', () => {
  const procs = [{ id: 'x' }, { id: 'y', categoria: 'Departamental' }];
  const depois = procs.map((p) => ({ ...p, ...(planejar([p])[0] || {}).dados }));
  assert.deepStrictEqual(planejar(depois), []);
});
