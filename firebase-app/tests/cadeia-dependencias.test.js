// Cadeia de dependencias (21/10/2026): Processo -> Servico -> dependencias tecnicas -> componentes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const CD = require('../public/cadeia-dependencias.js');

const ref = (d) => ({ id: d.id, nome: d.nome, categoria: d.categoria });
const DC = { id: 'dc', nome: 'Data center', categoria: 'Instalações' };
const DB = { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' };
const SRV = { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', componentes: [ref(DB), ref(DC)] };
const API = { id: 'api', nome: 'API Pix', categoria: 'API' };
const FORN = { id: 'forn', nome: 'Nuvem SA', categoria: 'Fornecedores' };
const ANA = { id: 'ana', nome: 'Ana', categoria: 'Pessoas' };
const DEPS = [DC, DB, SRV, API, FORN, ANA];
const PORTAL = { id: 's1', nome: 'Portal', dependenciaItens: [ref(SRV)] };
const LEGADO = { id: 's2', nome: 'Pagamentos', dependenciaItens: [ref(API)], processoIds: [{ id: 'p2', nome: 'Cobrança' }] };
const SERVICOS = [PORTAL, LEGADO];
const P1 = { id: 'p1', processo: 'Faturamento', dependenciaItens: [
  { categoria: 'Serviços', id: 's1', nome: 'Portal' }, ref(FORN), ref(ANA), ref(DB) /* tecnico direto: legado */,
] };
const P2 = { id: 'p2', processo: 'Cobrança', dependenciaItens: [] };
const P3 = { id: 'p3', processo: 'Arquivo', dependenciaItens: [{ nome: 'Oracle', categoria: 'Banco de Dados' }] };

test('functions/cadeiaDependencias.js e copia identica de public/cadeia-dependencias.js', () => {
  const pub = fs.readFileSync(path.join(__dirname, '..', 'public', 'cadeia-dependencias.js'), 'utf8');
  const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'cadeiaDependencias.js'), 'utf8');
  assert.strictEqual(fn, pub);
});

test('categorias diretas: 4 Ps e Servicos; tecnico e legado', () => {
  ['Serviços', 'Fornecedores', 'Pessoas', 'Instalações', 'Processos Internos'].forEach((c) => assert.ok(CD.categoriaPermitidaNoProcesso(c), c));
  ['Banco de Dados', 'Servidor', 'API', 'Sistemas', 'Infraestrutura', 'Segurança', 'Outros'].forEach((c) => assert.ok(!CD.categoriaPermitidaNoProcesso(c), c));
  assert.ok(CD.ehTecnicoDireto(ref(DB)));
  assert.ok(!CD.ehTecnicoDireto(ref(FORN)));
});

test('servicosDoProcesso / processosDoServico: item no processo e, ate migrar, o legado servico.processoIds', () => {
  assert.deepStrictEqual(CD.servicosDoProcesso(P1, SERVICOS).map((s) => s.id), ['s1']);
  assert.deepStrictEqual(CD.servicosDoProcesso(P2, SERVICOS).map((s) => s.id), ['s2'], 'legado processoIds');
  assert.deepStrictEqual(CD.processosDoServico(PORTAL, [P1, P2, P3]).map((p) => p.id), ['p1']);
  assert.deepStrictEqual(CD.processosDoServico(LEGADO, [P1, P2, P3]).map((p) => p.id), ['p2']);
  assert.deepStrictEqual(CD.servicosAusentesDoProcesso({ dependenciaItens: [{ categoria: 'Serviços', id: 'x', nome: 'Velho' }] }, SERVICOS).map((i) => i.nome), ['Velho']);
});

test('cadeiaDoProcesso: diretas (legado marcado), via servico e componentes; sem pessoas nem o proprio servico', () => {
  const c = CD.cadeiaDoProcesso({ processo: P1, servicos: SERVICOS, dependencias: DEPS });
  assert.deepStrictEqual(c.map((x) => [x.nome, x.origens, x.legado]), [
    ['Nuvem SA', ['Direta (BIA)'], false],
    ['Oracle', ['Direta (legado)', 'Componente de SRV-01'], true],
    ['SRV-01', ['Via serviço Portal'], false],
    ['Data center', ['Componente de SRV-01'], false],
  ]);
});

test('processosQueDependemDe: direto, legado por nome, via componente e via servico (inclusive o legado processoIds)', () => {
  const dados = { processos: [P1, P2, P3], servicos: SERVICOS, dependencias: DEPS };
  const db = CD.processosQueDependemDe('db', dados).map((x) => [x.processo.id, x.origens]);
  assert.deepStrictEqual(db, [
    ['p1', ['Direta', 'Via serviço Portal (via SRV-01)']],
    ['p3', ['Direta']],
  ]);
  assert.deepStrictEqual(CD.processosQueDependemDe('api', dados).map((x) => [x.processo.id, x.origens]), [['p2', ['Via serviço Pagamentos']]]);
  assert.deepStrictEqual(CD.processosQueDependemDe('nao-existe', dados), []);
});

test('servicosQueContem: sugestao de troca do item tecnico legado pelo servico que ja o contem', () => {
  assert.deepStrictEqual(CD.servicosQueContem('db', SERVICOS, DEPS).map((s) => s.id), ['s1']);
  assert.deepStrictEqual(CD.servicosQueContem('api', SERVICOS, DEPS).map((s) => s.id), ['s2']);
  assert.deepStrictEqual(CD.servicosQueContem('forn', SERVICOS, DEPS), []);
});

test('componentes em ciclo nao travam nem a cadeia nem o inverso', () => {
  const deps = [
    { id: 'a', categoria: 'Servidor', nome: 'A', componentes: [{ id: 'b' }] },
    { id: 'b', categoria: 'Servidor', nome: 'B', componentes: [{ id: 'a' }] },
  ];
  const s = { id: 's', nome: 'S', dependenciaItens: [{ id: 'a' }] };
  const p = { id: 'p', dependenciaItens: [{ categoria: 'Serviços', id: 's', nome: 'S' }] };
  assert.deepStrictEqual(CD.cadeiaDoProcesso({ processo: p, servicos: [s], dependencias: deps }).map((x) => x.nome), ['A', 'B']);
  assert.strictEqual(CD.processosQueDependemDe('b', { processos: [p], servicos: [s], dependencias: deps }).length, 1);
});
