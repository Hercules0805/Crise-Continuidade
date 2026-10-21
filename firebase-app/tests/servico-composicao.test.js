// Composicao de Servicos (21/10/2026): hierarquia e alerta de RTO/RPO/MTTR (public/servico-composicao.js).
const { test } = require('node:test');
const assert = require('node:assert');
const SC = require('../public/servico-composicao.js');

const H = 60;
const dep = (id, extra) => Object.assign({ id, nome: id.toUpperCase(), categoria: 'Infraestrutura' }, extra);
const ref = (id) => ({ id, nome: id.toUpperCase(), categoria: 'Infraestrutura' });

// Servico (RTO 4h) -> infra (2h) -> srv (3h) -> db (4h); servico -> infra2 (1h).
const DEPS = [
  dep('infra', { rtoMin: 2 * H, rpoMin: 30, mttrMin: H, componentes: [ref('srv')] }),
  dep('srv', { categoria: 'Servidor', rtoMin: 3 * H, rpoMin: 30, mttrMin: H, componentes: [ref('db')] }),
  dep('db', { categoria: 'Banco de Dados', rtoMin: 4 * H, rpoMin: 15, mttrMin: 2 * H }),
  dep('infra2', { rtoMin: 1 * H, rpoMin: 10, mttrMin: 30 }),
];
const SERVICO = { nome: 'Portal', rtoMin: 4 * H, rpoMin: 2 * H, mttrMin: 8 * H, dependenciaItens: [ref('infra'), ref('infra2')] };

test('parseDuracao: textos legados e selects do BIA', () => {
  assert.strictEqual(SC.parseDuracao('< 1 hora'), 60);
  assert.strictEqual(SC.parseDuracao('4h a 8h'), 480);
  assert.strictEqual(SC.parseDuracao('0 (nenhuma perda)'), 0);
  assert.strictEqual(SC.parseDuracao('30 min'), 30);
  assert.strictEqual(SC.parseDuracao('1 dia'), 1440);
  assert.strictEqual(SC.parseDuracao('Ex: 4 horas'), 240);
  assert.strictEqual(SC.parseDuracao('1,5 horas'), 90);
  assert.strictEqual(SC.parseDuracao('> 24 horas'), null);
  assert.strictEqual(SC.parseDuracao('rápido'), null);
  assert.strictEqual(SC.parseDuracao(''), null);
});

test('formatarDuracao / paraUnidade / deUnidade', () => {
  assert.strictEqual(SC.formatarDuracao(45), '45 min');
  assert.strictEqual(SC.formatarDuracao(240), '4 h');
  assert.strictEqual(SC.formatarDuracao(90), '1 h 30 min');
  assert.strictEqual(SC.formatarDuracao(2880), '2 d');
  assert.strictEqual(SC.formatarDuracao(1800), '1 d 6 h');
  assert.strictEqual(SC.formatarDuracao(null), '—');
  assert.deepStrictEqual(SC.paraUnidade(2880), { valor: 2, unidade: 'd' });
  assert.deepStrictEqual(SC.paraUnidade(240), { valor: 4, unidade: 'h' });
  assert.deepStrictEqual(SC.paraUnidade(90), { valor: 90, unidade: 'min' });
  assert.deepStrictEqual(SC.paraUnidade(null), { valor: '', unidade: 'h' });
  assert.strictEqual(SC.deUnidade('2', 'd'), 2880);
  assert.strictEqual(SC.deUnidade('1,5', 'h'), 90);
  assert.strictEqual(SC.deUnidade('', 'h'), null);
  assert.strictEqual(SC.deUnidade('-1', 'h'), null);
});

test('valorMin: campo numerico vence o texto legado; MTTR nao tem legado', () => {
  assert.strictEqual(SC.valorMin({ rtoMin: 30, rto: '4 horas' }, 'rto'), 30);
  assert.strictEqual(SC.valorMin({ rto: '4 horas' }, 'rto'), 240);
  assert.strictEqual(SC.valorMin({ mttr: '4 horas' }, 'mttr'), null);
  assert.strictEqual(SC.valorMin({ rtoMin: 0 }, 'rto'), 0);
});

test('montarGrafo: niveis pela maior distancia', () => {
  const g = SC.montarGrafo(SERVICO, DEPS);
  assert.strictEqual(g.nos.infra.nivel, 1);
  assert.strictEqual(g.nos.srv.nivel, 2);
  assert.strictEqual(g.nos.db.nivel, 3);
  assert.strictEqual(g.nos.infra2.nivel, 1);
  assert.deepStrictEqual(g.nos[SC.RAIZ].filhos, ['infra', 'infra2']);
  assert.strictEqual(g.ciclos.length, 0);
});

test('caminho critico: soma da cadeia, irmaos em paralelo', () => {
  const g = SC.montarGrafo(SERVICO, DEPS);
  const rto = SC.caminhoCritico(g, 'rto');
  assert.strictEqual(rto.soma, 9 * H);
  assert.deepStrictEqual(rto.caminho, ['infra', 'srv', 'db']);
  assert.strictEqual(rto.incompleto, false);
});

test('avaliarServico: alerta no RTO, RPO e MTTR dentro', () => {
  const av = SC.avaliarServico(SERVICO, DEPS);
  assert.strictEqual(av.status, 'alerta');
  assert.strictEqual(av.atributos.rto.excede, true);
  assert.strictEqual(av.atributos.rpo.excede, false);
  assert.strictEqual(av.atributos.rpo.soma, 75);
  assert.strictEqual(av.atributos.mttr.excede, false);
  assert.deepStrictEqual(SC.mensagensAlerta(av), ['RTO das dependências (caminho crítico) = 9 h > RTO do serviço = 4 h']);
});

test('avaliarServico: ok quando todos dentro do limite', () => {
  const av = SC.avaliarServico(Object.assign({}, SERVICO, { rtoMin: 10 * H }), DEPS);
  assert.strictEqual(av.status, 'ok');
});

test('valor ausente: incompleto, nao conta como zero escondido', () => {
  const deps = DEPS.map((d) => (d.id === 'db' ? Object.assign({}, d, { rtoMin: null }) : d));
  const av = SC.avaliarServico(Object.assign({}, SERVICO, { rtoMin: 10 * H }), deps);
  assert.strictEqual(av.atributos.rto.incompleto, true);
  assert.deepStrictEqual(av.atributos.rto.semValor, ['db']);
  assert.strictEqual(av.status, 'incompleto');
});

test('soma ja acima do limite e alerta mesmo incompleta', () => {
  const deps = DEPS.map((d) => (d.id === 'db' ? Object.assign({}, d, { rtoMin: null }) : d));
  const av = SC.avaliarServico(SERVICO, deps);
  assert.strictEqual(av.atributos.rto.soma, 5 * H);
  assert.strictEqual(av.status, 'alerta');
});

test('no compartilhado entre ramos aparece uma vez e pega o nivel mais fundo', () => {
  const deps = [
    dep('a', { rtoMin: 60, componentes: [ref('c')] }),
    dep('b', { rtoMin: 30, componentes: [ref('x')] }),
    dep('x', { rtoMin: 10, componentes: [ref('c')] }),
    dep('c', { rtoMin: 100 }),
  ];
  const g = SC.montarGrafo({ dependenciaItens: [ref('a'), ref('b')] }, deps);
  assert.strictEqual(SC.nosDependencia(g).length, 4);
  assert.strictEqual(g.nos.c.nivel, 3);
  assert.deepStrictEqual(g.nos.c.pais.sort(), ['a', 'x']);
  const cc = SC.caminhoCritico(g, 'rto');
  assert.strictEqual(cc.soma, 160);
  assert.deepStrictEqual(cc.caminho, ['a', 'c']);
});

test('ciclo: aresta marcada, sem recursao infinita, status incompleto', () => {
  const deps = [
    dep('a', { rtoMin: 10, componentes: [ref('b')] }),
    dep('b', { rtoMin: 10, componentes: [ref('a')] }),
  ];
  const s = { rtoMin: 100, rpoMin: 100, mttrMin: 100, dependenciaItens: [ref('a')] };
  const g = SC.montarGrafo(s, deps);
  assert.deepStrictEqual(g.ciclos, [['b', 'a']]);
  assert.strictEqual(SC.caminhoCritico(g, 'rto').soma, 20);
  assert.strictEqual(SC.avaliarServico(s, deps).status, 'incompleto');
});

test('status sem dependencias e sem parametros', () => {
  assert.strictEqual(SC.avaliarServico({ rtoMin: 60 }, DEPS).status, 'sem-dependencias');
  assert.strictEqual(SC.avaliarServico({ dependenciaItens: [ref('infra2')] }, DEPS).status, 'sem-parametros');
});

test('referencia legada so por nome e resolvida; id inexistente vira no ausente', () => {
  const g = SC.montarGrafo({ dependenciaItens: [{ nome: 'INFRA2' }, { id: 'sumiu', nome: 'Velho' }] }, DEPS);
  assert.ok(g.nos.infra2);
  assert.strictEqual(g.nos.sumiu.ausente, true);
});

test('ancestrais, descendentes, acimaDe e bloqueados', () => {
  assert.deepStrictEqual(SC.descendentes('infra', DEPS).sort(), ['db', 'srv']);
  assert.deepStrictEqual(SC.ancestrais('db', DEPS).sort(), ['infra', 'srv']);
  assert.deepStrictEqual(SC.bloqueadosComoComponente('srv', DEPS).sort(), ['infra', 'srv']);
  const acima = SC.acimaDe('infra', DEPS, [Object.assign({ id: 's1' }, SERVICO)]);
  assert.deepStrictEqual(acima.dependencias, []);
  assert.deepStrictEqual(acima.servicos.map((s) => s.id), ['s1']);
  assert.deepStrictEqual(SC.acimaDe('db', DEPS, []).dependencias.map((d) => d.id), ['srv']);
});

// ---- Relatorio de Composicao de Servicos ----
const PROCS = [{ id: 'p1', area: 'Financeiro', processo: 'Faturamento' }];
const SERVICOS = [
  Object.assign({ id: 's1', processoIds: [{ id: 'p1', nome: 'velho' }] }, SERVICO), // alerta RTO 9h > 4h
  { id: 's2', nome: 'Intranet', rtoMin: 10 * H, rpoMin: 10 * H, mttrMin: 10 * H, dependenciaItens: [ref('infra2')] }, // ok
  { id: 's3', nome: 'Novo', dependenciaItens: [] }, // sem dependencias
  { id: 's4', nome: 'Legado', rtoMin: 10 * H, rpoMin: 10 * H, mttrMin: 10 * H, dependenciaItens: [ref('solta')] },
];
const DEPS_REL = DEPS.concat([dep('solta', { categoria: 'API', rtoMin: 30 })]); // sem RPO/MTTR -> incompleto

test('filtrarServicos: escopo por servico, processo, status e categoria; ordem do mais grave', () => {
  assert.deepStrictEqual(SC.filtrarServicos(SERVICOS, DEPS_REL, {}).map((x) => x.servico.id), ['s1', 's4', 's3', 's2']);
  assert.deepStrictEqual(SC.filtrarServicos(SERVICOS, DEPS_REL, { processo: 'p1' }).map((x) => x.servico.id), ['s1']);
  assert.deepStrictEqual(SC.filtrarServicos(SERVICOS, DEPS_REL, { status: 'ok' }).map((x) => x.servico.id), ['s2']);
  assert.deepStrictEqual(SC.filtrarServicos(SERVICOS, DEPS_REL, { categoria: 'Banco de Dados' }).map((x) => x.servico.id), ['s1']);
  assert.deepStrictEqual(SC.filtrarServicos(SERVICOS, DEPS_REL, { servico: 's2' }).map((x) => x.servico.id), ['s2']);
});

test('descreverFiltros', () => {
  assert.strictEqual(SC.descreverFiltros({}), 'Empresa inteira');
  assert.strictEqual(SC.descreverFiltros({ servico: 's1', status: 'alerta', categoria: 'API' }, { servico: () => 'Portal' }),
    'Serviço: Portal · Composição: Alerta · Com dependência de API');
});

test('dadosRelatorio: totais, excedentes com a cadeia, sem valores e destaques; JSON puro', () => {
  const d = SC.dadosRelatorio(SERVICOS, DEPS_REL, PROCS, {});
  assert.deepStrictEqual(d.totais.porStatus, { alerta: 1, incompleto: 1, 'sem-parametros': 0, 'sem-dependencias': 1, ok: 1 });
  assert.deepStrictEqual(d.totais.excedem, { rto: 1, rpo: 0, mttr: 0 });
  assert.strictEqual(d.excedentes.length, 1);
  assert.deepStrictEqual(d.excedentes[0].cadeia.map((c) => c.nome), ['INFRA', 'SRV', 'DB']);
  assert.strictEqual(d.excedentes[0].soma, 9 * H);
  assert.deepStrictEqual(d.servicos[0].processos, ['Financeiro · Faturamento'], 'nome atual do processo, nao o gravado');
  assert.deepStrictEqual(d.semValores, [{ nome: 'SOLTA', categoria: 'API', faltam: ['RPO', 'MTTR'], servicos: ['Legado'] }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), d);
  const dst = SC.destaques(d);
  assert.match(dst[0], /^1 de 4 serviço\(s\) com dependências acima do limite \(RTO 1, RPO 0, MTTR 0\)/);
  assert.match(dst[1], /Maior estouro: Portal — RTO do caminho crítico 9 h contra limite de 4 h/);
  assert.deepStrictEqual(SC.destaques(SC.dadosRelatorio([], [], [], {})), ['Nenhum serviço no escopo.']);
});

// ---- Mapa de conexoes: layout em camadas ----
test('layoutCamadas: processos no topo, servico, dependencias pelo nivel; JSON puro', () => {
  const av = SC.avaliarServico(SERVICO, DEPS);
  const l = SC.layoutCamadas(av, [{ id: 'p1', nome: 'Faturamento' }]);
  const camada = (id) => l.nos.find((n) => n.id === id).camada;
  assert.strictEqual(camada('processo:p1'), 0);
  assert.strictEqual(camada(SC.RAIZ), 1);
  assert.strictEqual(camada('infra'), 2);
  assert.strictEqual(camada('infra2'), 2);
  assert.strictEqual(camada('srv'), 3);
  assert.strictEqual(camada('db'), 4);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(l)), l);
  // Cartoes nao se sobrepoem na mesma camada e cabem na largura.
  const c2 = l.nos.filter((n) => n.camada === 2).sort((a, b) => a.x - b.x);
  assert.ok(c2[1].x >= c2[0].x + c2[0].w);
  l.nos.forEach((n) => assert.ok(n.x >= 0 && n.x + n.w <= l.largura && n.y + n.h <= l.altura));
});

test('layoutCamadas: caminho critico marcado nos nos e arestas; sem processo o servico fica no topo', () => {
  const av = SC.avaliarServico(SERVICO, DEPS);
  const l = SC.layoutCamadas(av, []);
  assert.strictEqual(l.nos.find((n) => n.id === SC.RAIZ).camada, 0);
  const aresta = (de, para) => l.arestas.find((e) => e.de === de && e.para === para);
  assert.ok(aresta(SC.RAIZ, 'infra').criticos.includes('rto'));
  assert.ok(aresta('srv', 'db').criticos.includes('rto'));
  assert.deepStrictEqual(aresta(SC.RAIZ, 'infra2').criticos, []);
  assert.ok(l.nos.find((n) => n.id === 'db').criticos.includes('rto'));
  // infra2 tem os 3 valores; srv tambem; nenhum tracejado aqui
  assert.ok(l.nos.filter((n) => n.tipo === 'dependencia').every((n) => !n.semValor));
});

test('layoutCamadas: baricentro poe o filho embaixo do pai certo', () => {
  // s -> a, b ; a -> a1 ; b -> b1. Ordem inicial invertida nos filhos nao deve cruzar.
  const deps = [dep('a', { componentes: [ref('a1')] }), dep('b', { componentes: [ref('b1')] }), dep('a1'), dep('b1')];
  const av = SC.avaliarServico({ dependenciaItens: [ref('a'), ref('b')] }, deps);
  const l = SC.layoutCamadas(av, []);
  const x = (id) => l.nos.find((n) => n.id === id).x;
  assert.ok((x('a') < x('b')) === (x('a1') < x('b1')), 'sem cruzamento');
  assert.ok(l.nos.find((n) => n.id === 'a1').semValor, 'sem RTO/RPO/MTTR = tracejado');
});

test('dadosMapa: um mapa por servico do escopo, com destaques', () => {
  const d = SC.dadosMapa(SERVICOS, DEPS_REL, PROCS, { status: 'alerta' });
  assert.strictEqual(d.totais.servicos, 1);
  assert.strictEqual(d.mapas[0].nome, 'Portal');
  assert.ok(d.mapas[0].layout.nos.some((n) => n.id === 'processo:p1' && n.nome === 'Financeiro · Faturamento'));
  assert.match(SC.destaquesMapa(d)[1], /Portal: caminho crítico acima do limite em RTO/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), d);
});
