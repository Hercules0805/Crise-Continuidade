// Troca de itens tecnicos diretos pela Instalacao que os contem (scripts/trocar-tecnicos-pela-instalacao.js, planejar).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar } = require('./scripts/trocar-tecnicos-pela-instalacao');

const SEDE = { id: 'sede', nome: 'Site Fortes', categoria: 'Instalações', componentes: [{ id: 'dc1', nome: 'DC-1', categoria: 'Instalações' }] };
const ENERGIA = { id: 'en', nome: 'Energia elétrica - Fortes', categoria: 'Infraestrutura' };
const NET = { id: 'net', nome: 'Internet - Fortes', categoria: 'Infraestrutura' };

test('poe os itens nos componentes da Instalacao e troca nos processos; preserva o resto; idempotente', () => {
  const processos = [
    { id: 'p1', dependenciaItens: [{ id: 'en', nome: 'Energia elétrica - Fortes', categoria: 'Infraestrutura' }, { id: 'net', nome: 'Internet - Fortes', categoria: 'Infraestrutura' }, { id: 'sf', nome: 'Sales Force', categoria: 'Sistemas' }] },
    { id: 'p2', dependenciaItens: [{ id: 'net', nome: 'Internet - Fortes', categoria: 'Infraestrutura' }, { categoria: 'Instalações', id: 'sede', nome: 'Site Fortes' }] },
    { id: 'p3', dependenciaItens: [{ id: 'sf', nome: 'Sales Force', categoria: 'Sistemas' }] },
  ];
  const r = planejar(SEDE, [ENERGIA, NET], processos);
  assert.deepStrictEqual(r.componentes.map((c) => c.id), ['dc1', 'en', 'net'], 'mantem o que ja havia');
  assert.deepStrictEqual(r.processos.map((m) => m.id), ['p1', 'p2'], 'p3 nao tem os itens');
  assert.deepStrictEqual(r.processos[0].dependenciaItens.map((it) => it.nome), ['Sales Force', 'Site Fortes']);
  assert.deepStrictEqual(r.processos[0].tirados, ['Energia elétrica - Fortes', 'Internet - Fortes']);
  assert.strictEqual(r.processos[1].dependenciaItens.filter((it) => it.id === 'sede').length, 1, 'nao duplica a Instalacao');

  const depois = processos.map((p) => { const m = r.processos.find((x) => x.id === p.id); return m ? { ...p, dependenciaItens: m.dependenciaItens } : p; });
  const r2 = planejar({ ...SEDE, componentes: r.componentes }, [ENERGIA, NET], depois);
  assert.strictEqual(r2.componentes, null);
  assert.deepStrictEqual(r2.processos, []);
});
