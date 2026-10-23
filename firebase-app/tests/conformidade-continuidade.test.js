const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const CC = require('../public/conformidade-continuidade.js');

const HOJE = '2026-10-23';
const pcn = (data) => JSON.stringify([{ versao: 1, data, autor: 'x' }]);

test('functions/conformidadeContinuidade.js e copia identica de public/conformidade-continuidade.js', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'public', 'conformidade-continuidade.js'), 'utf8');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'conformidadeContinuidade.js'), 'utf8');
  assert.strictEqual(fn, pub, 'o deploy de Functions nao empacota public/: as duas copias tem que andar juntas');
});

// ---- Ciclo ----

test('statusCiclo: vigente, vencendo (dentro do aviso), vencido e sem registro', () => {
  assert.strictEqual(CC.statusCiclo('2026-06-01', 12, 30, HOJE).status, 'vigente');
  const vencendo = CC.statusCiclo('2025-11-10T12:00:00.000Z', 12, 30, HOJE);
  assert.strictEqual(vencendo.status, 'vencendo');
  assert.strictEqual(vencendo.proxima, '2026-11-10');
  assert.strictEqual(vencendo.dias, 18);
  const vencido = CC.statusCiclo('2025-10-01', 12, 30, HOJE);
  assert.strictEqual(vencido.status, 'vencido');
  assert.ok(vencido.dias < 0);
  assert.strictEqual(CC.statusCiclo('', 12, 30, HOJE).status, 'sem-registro');
  assert.strictEqual(CC.statusCiclo('lixo', 12, 30, HOJE).status, 'sem-registro');
});

test('proximaRevisao soma meses sem estourar o fim do mes', () => {
  assert.strictEqual(CC.proximaRevisao('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(CC.proximaRevisao('2027-12-15', 3), '2028-03-15');
  assert.strictEqual(CC.proximaRevisao('', 12), null);
});

test('normalizarCiclos: invalido cai no padrao; aviso 0 e permitido', () => {
  assert.deepStrictEqual(CC.normalizarCiclos(null), CC.CICLOS_PADRAO);
  assert.deepStrictEqual(CC.normalizarCiclos({ biaMeses: '6', pcnMeses: -1, drpMeses: 'x', avisoDias: 0 }),
    { biaMeses: 6, pcnMeses: 12, drpMeses: 12, avisoDias: 0 });
});

test('ultima revisao: PCN usa pcnRevisao ou a ultima versao; BIA a mais nova entre resposta e revisao manual', () => {
  assert.strictEqual(CC.ultimaRevisaoPcn({ pcnSalvo: pcn('2026-01-05T10:00:00Z') }), '2026-01-05');
  assert.strictEqual(CC.ultimaRevisaoPcn({ pcnSalvo: pcn('2026-01-05'), pcnRevisao: { ultimaEm: '2026-03-01' } }), '2026-03-01');
  assert.strictEqual(CC.ultimaRevisaoBia({ biaUltimaEm: '2026-02-01', biaRevisao: { ultimaEm: '2025-12-01' } }), '2026-02-01');
  assert.strictEqual(CC.ultimaRevisaoDrp({ drpSalvo: JSON.stringify([{ versao: 3, data: '2026-04-04' }]) }), '2026-04-04');
});

// ---- Teste de DRP ----

test('diasDaFrequencia entende os textos comuns e "a cada N"', () => {
  assert.strictEqual(CC.diasDaFrequencia('Semestral'), 182);
  assert.strictEqual(CC.diasDaFrequencia('anual'), 365);
  assert.strictEqual(CC.diasDaFrequencia('Trimestral'), 90);
  assert.strictEqual(CC.diasDaFrequencia('a cada 2 meses'), 60);
  assert.strictEqual(CC.diasDaFrequencia('15 dias'), 15);
  assert.strictEqual(CC.diasDaFrequencia('quando der'), null);
  assert.strictEqual(CC.diasDaFrequencia(''), null);
});

test('testeDrp: vale a menor frequencia; atrasado, em dia, nunca testado, sem frequencia', () => {
  const estr = [{ cenario: 'A', frequencia: 'Anual' }, { cenario: 'B', frequencia: 'Semestral' }];
  assert.strictEqual(CC.testeDrp({ drpEstrategiasTeste: estr, drpRegistrosTeste: [{ data: '2026-01-10' }] }, HOJE).status, 'atrasado');
  assert.strictEqual(CC.testeDrp({ drpEstrategiasTeste: estr, drpRegistrosTeste: [{ data: '2026-01-10' }, { data: '2026-09-01' }] }, HOJE).status, 'em-dia');
  assert.strictEqual(CC.testeDrp({ drpEstrategiasTeste: estr }, HOJE).status, 'nunca-testado');
  assert.strictEqual(CC.testeDrp({ drpEstrategiasTeste: [{ cenario: 'A' }] }, HOJE).status, 'sem-frequencia');
  // Registro legado (drpTestes) ainda conta.
  assert.strictEqual(CC.testeDrp({ drpTestes: { dataUltimoTeste: '2026-10-01', frequenciaEsperada: 'Mensal' } }, HOJE).status, 'em-dia');
});

// ---- Divergencias ----

test('divergencias: status "Realizado" sem o plano existir', () => {
  const dv = CC.divergencias({ biaHomologada: 'BIA Realizado', bcpStatus: 'BCP Realizado', drpStatus: 'DRP Realizado' }, [{ id: 'd1' }]);
  assert.deepStrictEqual(dv.map((x) => x.campo), ['biaHomologada', 'bcpStatus', 'drpStatus']);
  assert.deepStrictEqual(CC.divergencias({ biaHomologada: 'BIA Realizado', avaliado: true, bcpStatus: 'BCP Realizado', pcnSalvo: pcn('2026-01-01'), drpStatus: 'DRP Realizado' }, []), []);
  assert.deepStrictEqual(CC.divergencias({ bcpStatus: 'BCP Pendente' }, []), []);
});

// ---- Avaliacao do conjunto ----

function cenario() {
  const deps = [
    { id: 'd1', nome: 'ERP', drpSalvo: JSON.stringify([{ versao: 1, data: '2025-09-01' }]), drpEstrategiasTeste: [{ frequencia: 'Anual' }] },
    { id: 'd2', nome: 'Banco', drpSalvo: '' },
    { id: 'd3', nome: 'Wiki', drpSalvo: '' },
  ];
  const processos = [
    // Tier 1 com PCN em dia, BIA em dia; usa d1 (DRP vencido, nunca testado) e d2 (sem DRP).
    { id: 'p1', processo: 'Faturamento', area: 'Financeiro', tier: 'Tier 1 (Crítico)', avaliado: true, biaUltimaEm: '2026-05-01', pcnSalvo: pcn('2026-05-01'), drpStatus: 'DRP Realizado', cadeia: ['d1', 'd2'] },
    // Tier 2 sem PCN, BIA vencido.
    { id: 'p2', processo: 'Folha', area: 'RH', tier: 'Tier 2 (Importante)', avaliado: true, biaUltimaEm: '2025-01-01', cadeia: [] },
    // Tier 3 sem BIA, usa d3 (sem DRP mas nao critico), status BCP mentiroso.
    { id: 'p3', processo: 'Wiki interna', area: 'TI', tier: 'Tier 3 (Suporte)', bcpStatus: 'BCP Realizado', cadeia: ['d3'] },
  ];
  return {
    processos,
    dependencias: deps,
    hoje: HOJE,
    tierDe: (p) => p.tier,
    cadeiaDoProcesso: (p) => p.cadeia.map((id) => ({ id, dep: deps.find((d) => d.id === id) })),
  };
}

test('avaliar: indicadores de BIA, PCN (Tier 1/2) e DRP (dependencias criticas)', () => {
  const { indicadores: i } = CC.avaliar(cenario());
  assert.strictEqual(i.processos, 3);
  assert.strictEqual(i.biaEmDia, 1);
  assert.strictEqual(i.biaPct, 33);
  assert.strictEqual(i.criticos, 2);
  assert.strictEqual(i.pcnEmDia, 1);
  assert.strictEqual(i.pcnPct, 50);
  assert.strictEqual(i.depsCriticas, 2, 'd1 e d2 (cadeia do Tier 1); d3 so aparece em Tier 3');
  assert.strictEqual(i.drpEmDia, 0);
  assert.strictEqual(i.drpPct, 0);
  assert.strictEqual(i.testesAtrasados, 1);
  assert.strictEqual(i.divergencias, 2, 'drpStatus do p1 e bcpStatus do p3');
});

test('avaliar: lista as pendencias certas, vencido primeiro', () => {
  const { pendencias } = CC.avaliar(cenario());
  const chaves = pendencias.map((p) => `${p.tipo}:${p.situacao}:${p.id}`);
  assert.deepStrictEqual(chaves.slice().sort(), [
    'bia:faltando:p3',
    'bia:vencido:p2',
    'divergencia:divergente:p1',
    'divergencia:divergente:p3',
    'drp:faltando:d2',
    'drp:vencido:d1',
    'pcn:faltando:p2',
    'teste-drp:atrasado:d1',
  ]);
  assert.strictEqual(pendencias[0].situacao, 'vencido');
  const d2 = pendencias.find((p) => p.id === 'd2');
  assert.deepStrictEqual(d2.processos, ['Faturamento']);
  assert.strictEqual(pendencias.find((p) => p.tipo === 'pcn').mensagem, 'Tier 2 sem PCN');
  assert.ok(!pendencias.some((p) => p.id === 'd3' && p.tipo === 'drp'), 'dependencia so de Tier 3 nao e cobrada');
});

test('avaliar: sem processos nao divide por zero', () => {
  const r = CC.avaliar({ processos: [], dependencias: [], hoje: HOJE });
  assert.strictEqual(r.indicadores.biaPct, null);
  assert.strictEqual(r.indicadores.pcnPct, null);
  assert.deepStrictEqual(r.pendencias, []);
});

test('contar agrupa por situacao e por tipo', () => {
  const c = CC.contar(CC.avaliar(cenario()).pendencias);
  assert.strictEqual(c.total, 8);
  assert.strictEqual(c.porTipo.divergencia, 2);
  assert.strictEqual(c.porSituacao.faltando, 3);
});

test('avaliar: somenteCadeia (recorte do gestor) ignora DRP de dependencia fora da cadeia', () => {
  const c = cenario();
  c.dependencias.push({ id: 'd9', nome: 'Outro', drpSalvo: JSON.stringify([{ versao: 1, data: '2024-01-01' }]) });
  assert.ok(CC.avaliar(c).pendencias.some((p) => p.id === 'd9'), 'visao corporativa cobra');
  c.somenteCadeia = true;
  assert.ok(!CC.avaliar(c).pendencias.some((p) => p.id === 'd9'), 'recorte do gestor nao cobra');
  assert.ok(CC.avaliar(c).pendencias.some((p) => p.id === 'd1' && p.tipo === 'drp'), 'o da cadeia continua');
});
