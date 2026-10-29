// Indicadores do Cadastro de Processos (29/10/2026): public/processos-indicadores.js (puro).
const { test } = require('node:test');
const assert = require('node:assert');
const PI = require('../public/processos-indicadores.js');

const CATS = [
  { id: 'departamental', nome: 'Departamental', ativo: true },
  { id: 'intersetorial', nome: 'Intersetorial', ativo: false },
  { id: 'processo-de-negocio', nome: 'Processo de Negócio', ativo: true },
];
const COMPLETO = { descricaoFuncional: 'x', criadorId: 'ana', aprovadorId: 'bia', links: [{ url: 'https://a' }], categoriaId: 'departamental' };

test('pendencias por campo; completo so sem nenhuma', () => {
  assert.deepStrictEqual(PI.pendenciasDoProcesso(COMPLETO, { categorias: CATS }),
    { semDescricao: false, semCriador: false, semAprovador: false, semLinks: false, categoriaInativa: false });
  assert.strictEqual(PI.cadastroCompleto(COMPLETO, { categorias: CATS }), true);
  const p = { descricaoFuncional: '  ', criadorId: '', links: [], categoriaId: 'intersetorial' };
  assert.deepStrictEqual(PI.pendenciasDoProcesso(p, { categorias: CATS }),
    { semDescricao: true, semCriador: true, semAprovador: true, semLinks: true, categoriaInativa: true });
  assert.strictEqual(PI.pendenciasDoProcesso({ ...COMPLETO, categoriaId: 'sumiu' }, { categorias: CATS }).categoriaInativa, true, 'removida');
});

test('resumo: totais, Continuidade, por categoria (com removida), pendencias, 30 dias e recentes', () => {
  const procs = [
    { ...COMPLETO, id: 'a', continuidade: true, criadoEm: '2026-10-20T10:00:00Z', atualizadoEm: '2026-10-28T10:00:00Z' },
    { id: 'b', categoriaId: 'processo-de-negocio', continuidade: false, criadoEm: '2026-08-01T10:00:00Z', atualizadoEm: '2026-10-29T08:00:00Z' },
    { id: 'c', categoriaId: 'sumiu', criadoEm: '2026-01-01T00:00:00Z' },
  ];
  const r = PI.resumo(procs, { categorias: CATS, hojeISO: '2026-10-29T12:00:00Z' });
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.emContinuidade, 2, 'continuidade ausente conta como de Continuidade');
  assert.strictEqual(r.pctContinuidade, 67);
  assert.deepStrictEqual(r.porCategoria.map((c) => [c.id, c.n]), [['departamental', 1], ['intersetorial', 0], ['processo-de-negocio', 1], ['sumiu', 1]]);
  assert.strictEqual(r.porCategoria[3].nome, '(categoria removida)');
  assert.deepStrictEqual(r.pendencias, { semDescricao: 2, semCriador: 2, semAprovador: 2, semLinks: 2, categoriaInativa: 1 });
  assert.strictEqual(r.completos, 1);
  assert.strictEqual(r.pctCompletos, 33);
  assert.strictEqual(r.criados30d, 1);
  assert.strictEqual(r.atualizados30d, 2);
  assert.deepStrictEqual(r.recentes.map((p) => p.id), ['b', 'a'], 'mais novo primeiro; sem data fica de fora');
});

test('porArea: ordem da arvore, com as de cima, e area fora do cadastro no fim', () => {
  const areas = [{ id: '1', nome: 'Financeiro' }, { id: '2', nome: 'Contas a Pagar', areaPaiId: '1' }, { id: '3', nome: 'RH' }];
  const procs = [
    { area: 'Contas a Pagar', processo: 'Pagar', ...COMPLETO },
    { area: 'Contas a Pagar', processo: 'Conciliar', continuidade: false, categoriaId: 'departamental' },
    { area: 'Velha', processo: 'X', categoriaId: 'processo-de-negocio' },
  ];
  const l = PI.porArea(procs, areas, { categorias: CATS });
  assert.deepStrictEqual(l.map((x) => [x.area, x.nivel, x.total, x.foraDoCadastro]),
    [['Financeiro', 0, 0, false], ['Contas a Pagar', 1, 2, false], ['Velha', 0, 1, true]], 'RH sem processo fica de fora');
  const cp = l[1];
  assert.deepStrictEqual([cp.continuidade, cp.completos, cp.pct, cp.porCategoria.departamental], [1, 1, 50, 2]);
  assert.deepStrictEqual(cp.processos.map((p) => p.processo), ['Conciliar', 'Pagar']);
});

test('porPessoa: criador e aprovador por pessoa, removida, e os sem pessoa', () => {
  const procs = [
    { area: 'TI', processo: 'B', criadorId: 'ana', aprovadorId: 'bia' },
    { area: 'TI', processo: 'A', criadorId: 'ana', aprovadorId: 'sumiu' },
    { area: 'RH', processo: 'C' },
  ];
  const r = PI.porPessoa(procs, [{ id: 'ana', nome: 'Ana' }, { id: 'bia', nome: 'Bia' }]);
  assert.deepStrictEqual(r.pessoas.map((g) => [g.pessoa.nome, g.criador.length, g.aprovador.length]),
    [['Ana', 2, 0], ['Bia', 0, 1], ['(pessoa removida)', 0, 1]]);
  assert.deepStrictEqual(r.pessoas[0].criador.map((p) => p.processo), ['A', 'B']);
  assert.deepStrictEqual([r.semCriador.length, r.semAprovador.length], [1, 1]);
});
