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

// ---- Produtos de Software e pessoas herdadas (28/10/2026) ----
const PESSOAS_HER = [
  { id: 'ana', categoria: 'Pessoas', nome: 'Ana', techLead: true, techLeadProdutos: ['ps1'], productOwner: true, productOwnerProdutos: ['ps1'] },
  { id: 'bia', categoria: 'Pessoas', nome: 'Bia', liderSuporte: true, liderSuporteProdutos: ['ps1'] },
  { id: 'caio', categoria: 'Pessoas', nome: 'Caio', teamLead: true, teamLeadProdutos: ['ps2'] },
  { id: 'davi', categoria: 'Pessoas', nome: 'Davi' },
];
const SERVICOS_HER = [{ id: 's1', nome: 'Portal', stakeholders: [{ id: 'davi', nome: 'Davi' }, { id: 'ana', nome: 'Ana' }] }];
const prod = (id, nome) => ({ categoria: 'Produtos de Software', id, nome });
const plano = (x) => JSON.parse(JSON.stringify(x));

test('produto: categoria permitida no processo e fora da cadeia (sem DRP)', () => {
  assert.ok(CD.categoriaPermitidaNoProcesso('Produtos de Software'));
  assert.ok(!CD.ehTecnicoDireto(prod('ps1', 'Fortes Ponto')));
  const cadeia = CD.cadeiaDoProcesso({ processo: { id: 'p', dependenciaItens: [prod('ps1', 'Fortes Ponto')] }, dependencias: [], servicos: [] });
  assert.strictEqual(cadeia.length, 0);
});

test('sincronizar: produto herda as 4 funcoes; servico herda stakeholders; pessoa em duas origens tem as duas', () => {
  const r = CD.sincronizarPessoasHerdadas([prod('ps1', 'Fortes Ponto'), { categoria: 'Serviços', id: 's1', nome: 'Portal' }], { pessoas: PESSOAS_HER, servicos: SERVICOS_HER });
  const pessoas = r.itens.filter((it) => it.categoria === 'Pessoas');
  assert.deepStrictEqual(pessoas.map((p) => p.id), ['ana', 'bia', 'davi']);
  assert.deepStrictEqual(plano(pessoas[0].herdadoDe), [
    { tipo: 'produto', id: 'ps1', nome: 'Fortes Ponto', funcoes: ['Tech Lead', 'Product Owner'] },
    { tipo: 'servico', id: 's1', nome: 'Portal', funcoes: ['Stakeholder'] },
  ]);
  assert.deepStrictEqual(plano(pessoas[1].herdadoDe[0].funcoes), ['Liderança de Suporte']);
  assert.strictEqual(pessoas[0].manual, undefined, 'so herdada');
  assert.deepStrictEqual(r.adicionadas, ['Ana', 'Bia', 'Davi']);
});

test('sincronizar: tirar a origem tira a herdada e mantem a manual e a antiga; manual que tambem e herdada fica marcada', () => {
  const antiga = { categoria: 'Pessoas', id: 'caio', nome: 'Caio' };
  const primeira = CD.sincronizarPessoasHerdadas([prod('ps1', 'Fortes Ponto'), { categoria: 'Pessoas', id: 'bia', nome: 'Bia' }, antiga], { pessoas: PESSOAS_HER, servicos: [] });
  const bia = primeira.itens.find((it) => it.id === 'bia');
  assert.strictEqual(bia.manual, true, 'ja estava escolhida a mao');
  assert.ok(bia.herdadoDe.length);
  const semProduto = primeira.itens.filter((it) => it.categoria !== 'Produtos de Software');
  const r = CD.sincronizarPessoasHerdadas(semProduto, { pessoas: PESSOAS_HER, servicos: [] });
  assert.deepStrictEqual(r.itens.map((it) => it.id), ['bia', 'caio'], 'Ana (so herdada) saiu');
  assert.deepStrictEqual(r.removidas, ['Ana']);
  assert.strictEqual(r.itens[0].herdadoDe, undefined, 'Bia perdeu a origem, continua manual');
  assert.deepStrictEqual(r.itens[1], antiga, 'pessoa antiga continua igual');
});

test('sincronizar: mudanca no produto aparece na proxima sincronizacao; sem mudanca, nada muda', () => {
  const itens = CD.sincronizarPessoasHerdadas([prod('ps1', 'Fortes Ponto')], { pessoas: PESSOAS_HER, servicos: [] }).itens;
  const igual = CD.sincronizarPessoasHerdadas(itens, { pessoas: PESSOAS_HER, servicos: [] });
  assert.deepStrictEqual([igual.adicionadas, igual.removidas, igual.alteradas], [[], [], 0]);
  const mudou = PESSOAS_HER.map((p) => (p.id === 'bia' ? { ...p, liderSuporte: false } : p.id === 'davi' ? { ...p, teamLead: true, teamLeadProdutos: ['ps1'] } : p));
  const r = CD.sincronizarPessoasHerdadas(itens, { pessoas: mudou, servicos: [] });
  assert.deepStrictEqual([r.adicionadas, r.removidas], [['Davi'], ['Bia']]);
});
