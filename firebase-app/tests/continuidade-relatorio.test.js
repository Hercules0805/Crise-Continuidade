// Relatorio de Status de Continuidade (27/10/2026): a conta (modulo puro).
const { test } = require('node:test');
const assert = require('node:assert');
const CRel = require('../public/continuidade-relatorio.js');
const CC = require('../public/conformidade-continuidade.js');
const CD = require('../public/cadeia-dependencias.js');
const CR = require('../public/criticidade.js');

const HOJE = '2026-10-27';
const v = (data) => JSON.stringify([{ versao: 1, data }]);

const PROCESSOS = [
  // Tier 1, homologado, com PCN; DRP parcial (SRV-01 com DRP, Oracle sem), via Servico.
  { id: 'p1', area: 'TI', processo: 'Folha', avaliado: true, score: 15, biaUltimaEm: '2026-09-01', biaHomologacao: { em: '2026-09-02', por: 'x' }, pcnSalvo: v('2026-09-10'),
    dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }] },
  // Tier 3 avaliado, falta homologar; instalacao sem DRP (nao e critica).
  { id: 'p2', area: 'RH', processo: 'Admissão', avaliado: true, score: 3, biaUltimaEm: '2026-10-01', dependenciaItens: [{ categoria: 'Instalações', id: 'sede', nome: 'Sede' }] },
  // Pendente, sem BIA.
  { id: 'p3', area: 'RH', processo: 'Ponto' },
  // Tier 2 com BIA vencido, sem PCN, fornecedor sem DRP.
  { id: 'p4', area: 'TI', processo: 'Backup', avaliado: true, score: 8, biaUltimaEm: '2024-01-01', dependenciaItens: [{ categoria: 'Fornecedores', id: 'f2', nome: 'Nuvem' }] },
];
const DEPS = [
  { id: 'srv', categoria: 'Servidor', nome: 'SRV-01', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }], drpSalvo: v('2026-06-01'),
    drpEstrategiasTeste: [{ cenario: 'Tabletop', frequencia: 'Semestral' }], drpRegistrosTeste: [{ data: '2026-01-10' }] },
  { id: 'db', categoria: 'Banco de Dados', nome: 'Oracle' },
  { id: 'sede', categoria: 'Instalações', nome: 'Sede' },
  { id: 'f2', categoria: 'Fornecedores', nome: 'Nuvem' },
  { id: 'fx', categoria: 'Fornecedores', nome: 'Velho', ativo: false, drpSalvo: v('2026-06-01') },
  { id: 'ana', categoria: 'Pessoas', nome: 'Ana', email: 'ana@x' },
  { id: 'pi', categoria: 'Processos Internos', nome: 'Compras' },
  { id: 'app', categoria: 'Sistemas', nome: 'Legado', drpSalvo: v('2026-05-01') },
];
const SERVICOS = [{ id: 's1', nome: 'Portal', dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] }];
const base = (extra) => Object.assign({ processos: PROCESSOS, dependencias: DEPS, servicos: SERVICOS, ciclos: null, hoje: HOJE }, extra || {});

test('cobertura: BIA, PCN e DRP da empresa', () => {
  const d = CRel.dadosRelatorio(base());
  const c = d.cobertura;
  assert.strictEqual(c.processos.total, 4);
  assert.deepStrictEqual(c.processos.porTier, { [CR.TIER.T1]: 1, [CR.TIER.T2]: 1, [CR.TIER.T3]: 1, [CR.TIER.PENDENTE]: 1 });
  assert.deepStrictEqual(
    { r: c.bia.realizados, h: c.bia.homologados, n: c.bia.naoAvaliados, v: c.bia.vencidos, a: c.bia.aHomologar, pr: c.bia.pctRealizados, ph: c.bia.pctHomologados },
    { r: 3, h: 1, n: 1, v: 1, a: 1, pr: 75, ph: 25 });
  assert.deepStrictEqual({ com: c.bcp.comPcn, crit: c.bcp.criticos, ok: c.bcp.criticosComPcn, sem: c.bcp.criticosSemPcn, pct: c.bcp.pctCriticos }, { com: 1, crit: 2, ok: 1, sem: 1, pct: 50 });
  const dd = c.drp.dependencias;
  assert.deepStrictEqual({ t: dd.total, com: dd.comDrp, crit: dd.criticas, critCom: dd.criticasComDrp, emDia: dd.criticasEmDia, at: dd.testesAtrasados },
    { t: 5, com: 2, crit: 3, critCom: 1, emDia: 1, at: 1 }, 'Pessoas, Processos Internos e fornecedor inativo fora');
  assert.deepStrictEqual({ crit: c.drp.processos.criticos, parcial: c.drp.processos.parcial, sem: c.drp.processos.semDrp }, { crit: 2, parcial: 1, sem: 1 });
});

test('bate com a Conformidade e com os status do processo', () => {
  const d = CRel.dadosRelatorio(base());
  const ativos = DEPS.filter((x) => x.ativo !== false);
  const aval = CC.avaliar({ processos: PROCESSOS, dependencias: ativos, hoje: HOJE, tierDe: CR.tierDoProcesso,
    cadeiaDoProcesso: (p) => CD.cadeiaDoProcesso({ processo: p, dependencias: ativos, servicos: SERVICOS }) });
  assert.strictEqual(d.cobertura.drp.dependencias.criticas, aval.indicadores.depsCriticas);
  assert.strictEqual(d.cobertura.drp.dependencias.criticasEmDia, aval.indicadores.drpEmDia);
  assert.strictEqual(d.cobertura.bcp.criticos, aval.indicadores.criticos);
  assert.strictEqual(d.pendencias.total, aval.pendencias.length);
  assert.strictEqual(d.revisoes.aHomologar.length, aval.indicadores.aHomologar);
  PROCESSOS.forEach((p) => {
    const st = CC.statusDosPlanos(p, { tier: CR.tierDoProcesso(p), cadeia: CD.cadeiaDoProcesso({ processo: p, dependencias: ativos, servicos: SERVICOS }), hoje: HOJE });
    if (p.id === 'p1') assert.strictEqual(st.drp.codigo, 'parcial');
    if (p.id === 'p4') assert.strictEqual(st.bia.codigo, 'vencido');
  });
});

test('pendencias, revisoes e testes', () => {
  const d = CRel.dadosRelatorio(base());
  assert.strictEqual(d.pendencias.total, 7);
  assert.deepStrictEqual(d.pendencias.porTipo, { bia: 2, pcn: 1, drp: 2, homologacao: 1, 'teste-drp': 1 });
  assert.strictEqual(d.pendencias.itens[0].situacao, 'vencido', 'mais grave primeiro');
  assert.deepStrictEqual(d.revisoes.vencidas.map((x) => x.nome), ['Backup']);
  assert.deepStrictEqual(d.revisoes.testes.map((x) => x.nome), ['SRV-01']);
  assert.deepStrictEqual(d.revisoes.testes[0].processos, ['Folha']);
  assert.deepStrictEqual(d.revisoes.aHomologar.map((x) => x.nome), ['Admissão']);
  assert.deepStrictEqual(d.revisoes.vencendo, []);
});

test('por area e por categoria', () => {
  const d = CRel.dadosRelatorio(base());
  assert.deepStrictEqual(d.porArea.map((a) => [a.area, a.processos, a.pctBia, a.criticos, a.pctPcn, a.pctDrp, a.pendencias]),
    [['RH', 2, 50, 0, null, null, 2], ['TI', 2, 100, 2, 50, 0, 2]]);
  assert.deepStrictEqual(d.porCategoria.map((x) => [x.categoria, x.total, x.comDrp, x.criticas, x.criticasSemDrp, x.testeAtrasado, x.semFrequencia]), [
    ['Banco de Dados', 1, 0, 1, 1, 0, 0],
    ['Fornecedores', 1, 0, 1, 1, 0, 0],
    ['Servidor', 1, 1, 1, 0, 1, 0],
    ['Instalações', 1, 0, 0, 0, 0, 0],
    ['Sistemas', 1, 1, 0, 0, 0, 1],
  ]);
});

test('recorte por area: so os processos dela e as dependencias da cadeia deles', () => {
  const d = CRel.dadosRelatorio(base({ area: 'TI' }));
  assert.strictEqual(d.cobertura.processos.total, 2);
  assert.deepStrictEqual(d.cobertura.drp.dependencias.total, 3, 'SRV-01, Oracle e Nuvem; Sede e Legado fora');
  assert.deepStrictEqual(d.porArea.map((a) => a.area), ['TI']);
  assert.ok(!d.porCategoria.some((x) => x.categoria === 'Sistemas' || x.categoria === 'Instalações'));
  assert.strictEqual(d.pendencias.total, 5);
});

test('evolucao contra a edicao anterior: melhora, piora e igual', () => {
  const atual = CRel.dadosRelatorio(base()).indicadores;
  assert.strictEqual(CRel.variacao(atual, null), null);
  const ev = CRel.variacao(atual, { geradoEm: '2026-10-01T10:00:00Z', indicadores: Object.assign({}, atual, { biaRealizadosPct: 50, pendencias: 4, pcnCriticosPct: 50 }) });
  const por = Object.fromEntries(ev.itens.map((x) => [x.chave, x]));
  assert.strictEqual(ev.desde, '2026-10-01');
  assert.deepStrictEqual([por.biaRealizadosPct.delta, por.biaRealizadosPct.tendencia], [25, 'melhora']);
  assert.deepStrictEqual([por.pendencias.delta, por.pendencias.tendencia], [3, 'piora']);
  assert.strictEqual(por.pcnCriticosPct.tendencia, 'igual');
  const dest = CRel.destaques(CRel.dadosRelatorio(base()), ev);
  assert.match(dest.join(' '), /Desde 01\/10\/2026: BIA realizado \+25 p\.p\.; Pendências \+3/);
});

test('indicadoresParaIA: so agregados e pendencias de topo, sem e-mail nem descricao', () => {
  const d = CRel.dadosRelatorio(base());
  const ia = CRel.indicadoresParaIA(d, null, 'Empresa inteira');
  assert.strictEqual(ia.escopo, 'Empresa inteira');
  assert.strictEqual(ia.bia.pctRealizados, 75);
  assert.ok(ia.principaisPendencias.length <= 10);
  const json = JSON.stringify(ia);
  assert.ok(!json.includes('ana@x'));
  assert.ok(!/descricao/i.test(json));
});

test('sem processos no escopo: destaque unico e nada quebra', () => {
  const d = CRel.dadosRelatorio(base({ area: 'Inexistente' }));
  assert.strictEqual(d.cobertura.processos.total, 0);
  assert.strictEqual(d.cobertura.bia.pctRealizados, null);
  assert.deepStrictEqual(CRel.destaques(d, null), ['Nenhum processo no escopo.']);
});
