// Testes das acoes autenticadas (node --test, mock de Firestore em memoria).
const { test } = require('node:test');
const assert = require('node:assert');
const { READ_ACTIONS, WRITE_ACTIONS, AppError, processoKey } = require('./appLogic');
const drpSecoes = require('./drpSecoes');

function makeDb(seed) {
  const store = JSON.parse(JSON.stringify(seed || {}));
  function docRef(col, id) {
    return {
      id,
      async get() {
        const data = store[col] && store[col][id];
        return { exists: data !== undefined, id, data: () => data };
      },
      async set(patch, opts) {
        store[col] = store[col] || {};
        store[col][id] = (opts && opts.merge && store[col][id])
          ? { ...store[col][id], ...patch }
          : { ...patch };
      },
    };
  }
  // Suporte minimo a colecao inteira e filtro de igualdade — o bastante para
  // gerarPCN (dependencias/componentes inteiros, respostas por area+processo).
  function colRef(col, filtros) {
    return {
      doc: (id) => docRef(col, id),
      where(campo, _op, valor) {
        return colRef(col, [...(filtros || []), [campo, valor]]);
      },
      async get() {
        const todos = Object.entries(store[col] || {}).map(([id, data]) => ({ id, data: () => data }));
        const filtrados = (filtros || []).length
          ? todos.filter((d) => filtros.every(([campo, valor]) => d.data()[campo] === valor))
          : todos;
        return { docs: filtrados };
      },
    };
  }
  return { collection: (col) => colRef(col), _store: store };
}

function ctx(over) {
  let n = 0;
  return {
    email: 'analista@fortestecnologia.com.br',
    baseUrl: 'https://bia-forte-2025.web.app',
    novoUuid: () => 'uuid-' + ++n,
    ...over,
  };
}

// Quem chama e admin por padrao: PCN, links e DRP conferem o perfil no
// servidor (23/10/2026). Testes de recusa trocam config_perfis.
const seed = () => ({
  processos: { ti__backup: { area: 'TI', processo: 'Backup' } },
  tokens: {},
  config_perfis: { 'analista@fortestecnologia.com.br': { perfis: ['admin'] } },
});

test('gerarLink cria token com prefixo e validade por tipo', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.gerarLink(db, { tipo: 'bia', area: 'TI', processo: 'Backup' }, ctx());
  assert.strictEqual(r.success, true);
  const t = db._store.tokens[r.token];
  assert.strictEqual(t.area, 'TI');
  assert.strictEqual(t.processo, '_BIA_Backup');
  assert.strictEqual(t.usado, false);
  // BIA vale 14 dias.
  const dias = Math.round((new Date(t.expiraEm) - new Date(t.criadoEm)) / 86400000);
  assert.strictEqual(dias, 14);
});

test('gerarLink de area usa o marcador _AREA_ e dispensa processo', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.gerarLink(db, { tipo: 'area', area: 'TI' }, ctx());
  assert.strictEqual(db._store.tokens[r.token].processo, '_AREA_');
  assert.ok(r.link.includes('avaliar-area.html'));
});

test('gerarLink registra quem gerou', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.gerarLink(db, { tipo: 'avaliacao', area: 'TI', processo: 'Backup' }, ctx());
  assert.strictEqual(db._store.tokens[r.token].criadoPor, 'analista@fortestecnologia.com.br');
});

test('gerarLink recusa tipo desconhecido e campo faltando', async () => {
  const db = makeDb(seed());
  await assert.rejects(() => WRITE_ACTIONS.gerarLink(db, { tipo: 'xpto', area: 'TI' }, ctx()), AppError);
  await assert.rejects(() => WRITE_ACTIONS.gerarLink(db, { tipo: 'bia', area: 'TI' }, ctx()), AppError);
});

// O link NAO deve sair por e-mail: essa parte ficou no Apps Script ate a
// decisao de infraestrutura. Se alguem acrescentar envio aqui sem tratar isso,
// este teste passa a ser o lugar de rever a decisao.
test('gerarLink devolve o link e nao tenta enviar e-mail', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.gerarLink(db, { tipo: 'levantamento', area: 'TI', processo: 'Backup', email: 'x@y.com' }, ctx());
  assert.ok(r.link.startsWith('https://bia-forte-2025.web.app/pcn-levantamento.html?token='));
  assert.strictEqual(r.enviadoPorEmail, undefined);
});

// 'drp' saiu do mapa de tipos (23/09/2026): "Componentes do Serviço" se
// fundiu em Dependencias, o link separado de DRP ficou redundante.
test('gerarLink recusa o tipo "drp", aposentado', async () => {
  const db = makeDb(seed());
  await assert.rejects(() => WRITE_ACTIONS.gerarLink(db, { tipo: 'drp', area: 'TI', processo: 'Backup' }, ctx()), AppError);
});

test('salvarPCN acrescenta versao sem apagar as anteriores', async () => {
  const s = seed();
  s.processos.ti__backup.pcnSalvo = JSON.stringify([{ versao: 1, html: '<p>v1</p>' }]);
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup', html: '<p>v2</p>' }, ctx());
  assert.strictEqual(r.versao, 2);
  const versoes = JSON.parse(db._store.processos.ti__backup.pcnSalvo);
  assert.strictEqual(versoes.length, 2);
  assert.strictEqual(versoes[0].html, '<p>v1</p>');
  assert.strictEqual(versoes[1].autor, 'analista@fortestecnologia.com.br');
});

test('salvarPCN comeca do zero quando o campo esta corrompido', async () => {
  const s = seed();
  s.processos.ti__backup.pcnSalvo = 'isso nao e json';
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup', html: '<p>v1</p>' }, ctx());
  assert.strictEqual(r.versao, 1);
});

test('salvarPCN e excluirPCN recusam processo inexistente', async () => {
  const db = makeDb(seed());
  await assert.rejects(() => WRITE_ACTIONS.salvarPCN(db, { area: 'RH', processo: 'Folha', html: 'x' }, ctx()), AppError);
  await assert.rejects(() => WRITE_ACTIONS.excluirPCN(db, { area: 'RH', processo: 'Folha' }, ctx()), AppError);
});

test('excluirPCN limpa as versoes', async () => {
  const s = seed();
  s.processos.ti__backup.pcnSalvo = JSON.stringify([{ versao: 1 }]);
  const db = makeDb(s);
  await WRITE_ACTIONS.excluirPCN(db, { area: 'TI', processo: 'Backup' }, ctx());
  assert.strictEqual(db._store.processos.ti__backup.pcnSalvo, '');
});

test('getLevantamentoPCN devolve nulo para processo sem levantamento', async () => {
  const db = makeDb(seed());
  const r = await READ_ACTIONS.getLevantamentoPCN(db, { area: 'TI', processo: 'Backup' });
  assert.strictEqual(r.levantamento, null);
});

// --- gerarPCN (Gemini) ---

function mockFetchGemini(texto) {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }),
  });
  return () => { global.fetch = original; };
}

test('gerarPCN calcula score/tier a partir da resposta mais recente e devolve o html do Gemini', async () => {
  const s = seed();
  s.respostas_bia = {
    r1: { area: 'TI', processo: 'Backup', score: 4, timestamp: '2026-01-01T00:00:00.000Z' },
    r2: { area: 'TI', processo: 'Backup', score: 14, timestamp: '2026-02-01T00:00:00.000Z' },
  };
  const db = makeDb(s);
  const restore = mockFetchGemini('<h1>PCN gerado</h1>');
  try {
    const r = await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.pcn, '<h1>PCN gerado</h1>');
    assert.strictEqual(r.score, 14);
    assert.strictEqual(r.tier, 'Tier 1 (Crítico)');
    assert.strictEqual(r.processo, 'Backup');
    assert.strictEqual(r.area, 'TI');
  } finally { restore(); }
});

test('gerarPCN recusa sem a chave do Gemini configurada', async () => {
  const db = makeDb(seed());
  await assert.rejects(() => WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: '' })), AppError);
});

test('gerarPCN recusa processo inexistente', async () => {
  const db = makeDb(seed());
  await assert.rejects(() => WRITE_ACTIONS.gerarPCN(db, { id: 'nao-existe' }, ctx({ geminiApiKey: 'chave-teste' })), AppError);
});

test('gerarPCN vira AppError quando o Gemini responde com erro', async () => {
  const db = makeDb(seed());
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'indisponível' } }) });
  try {
    await assert.rejects(() => WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' })), AppError);
  } finally { global.fetch = original; }
});

test('gerarPCN resolve dependencias e contatos do catalogo no prompt', async () => {
  const s = seed();
  s.processos.ti__backup.dependencia = 'AWS';
  s.processos.ti__backup.bcpContatos = ['dep-aws'];
  s.dependencias = { 'dep-aws': { nome: 'AWS', categoria: 'Fornecedor', empresa: 'Amazon', telefone: '123', email: 'a@a.com' } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('AWS (Amazon)'));
    assert.ok(promptEnviado.includes('123'));
  } finally { global.fetch = original; }
});

test('gerarPCN busca dependencia por id quando dependenciaItens existe, mesmo com nomes duplicados em categorias diferentes', async () => {
  const s = seed();
  // Duas entradas com o MESMO nome, em categorias diferentes -- exatamente o
  // caso que buscar por nome nao consegue distinguir, e buscar por id sim.
  s.dependencias = {
    'dep-ti-pessoa': { nome: 'TI', categoria: 'Pessoas', empresa: 'Fulano de Tal' },
    'dep-ti-sistema': { nome: 'TI', categoria: 'Sistemas', empresa: 'Sistema Interno' },
  };
  s.processos.ti__backup.dependenciaItens = [
    { categoria: 'Sistemas', nome: 'TI', id: 'dep-ti-sistema' },
  ];
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Sistemas:** TI (Sistema Interno)'), 'deveria ter resolvido pelo id certo, nao pelo primeiro nome que bater');
    assert.ok(!promptEnviado.includes('Fulano de Tal'));
  } finally { global.fetch = original; }
});

test('gerarPCN cai na busca por nome (legado) quando o processo nao tem dependenciaItens', async () => {
  const s = seed();
  s.processos.ti__backup.dependencia = 'AWS';
  s.dependencias = { 'dep-aws': { nome: 'AWS', categoria: 'Fornecedor', empresa: 'Amazon' } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('AWS (Amazon)'));
  } finally { global.fetch = original; }
});

test('processoKey e igual a de tokenLogic e api.js', () => {
  assert.strictEqual(processoKey('Financeiro', 'Faturamento > Emissão de NFs'), 'financeiro__faturamento-emissao-de-nfs');
});

// --- Regressao: a pagina do PCN salvava direto no Apps Script, que foi
// fechado em 19/09. O erro que aparecia ao salvar era "Failed to fetch".
// Estas acoes substituem aquelas chamadas.
const { CAMPOS_EDITAVEIS_PCN } = require('./appLogic');

test('dadosPCN devolve o processo pedido com dependencias', async () => {
  const s = seed();
  // Servidor/Banco de Dados/etc. sao categoria de Dependencia agora --
  // "componentes" (colecao a parte) nao existe mais.
  s.dependencias = { d1: { nome: 'Fulano', categoria: 'Pessoa' }, d2: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  db.collection = ((orig) => (col) => {
    const api = orig(col);
    api.get = async () => ({
      docs: Object.entries(db._store[col] || {}).map(([id, data]) => ({ id, data: () => data })),
    });
    return api;
  })(db.collection);

  const r = await READ_ACTIONS.dadosPCN(db, { area: 'TI', processo: 'Backup' });
  assert.strictEqual(r.processo.processo, 'Backup');
  assert.strictEqual(r.dependencias.length, 2);
  assert.strictEqual(r.componentes, undefined);
});

test('salvarCamposPCN grava os campos da edicao inline', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.salvarCamposPCN(db, {
    area: 'TI', processo: 'Backup',
    bcpContatos: '["d1"]', bcpPapeisCrise: '{"Fulano":"Coordenador"}',
  }, ctx());
  assert.strictEqual(r.success, true);
  const p = db._store.processos.ti__backup;
  assert.strictEqual(p.bcpPapeisCrise, '{"Fulano":"Coordenador"}');
  assert.strictEqual(p.atualizadoPor, 'analista@fortestecnologia.com.br');
});

// A pagina do PCN e um documento montado a partir de conteudo de LLM. Se ela
// pudesse gravar qualquer campo, poderia reescrever area, tier e RTO.
test('salvarCamposPCN recusa campos fora da allowlist', async () => {
  const db = makeDb(seed());
  const r = await WRITE_ACTIONS.salvarCamposPCN(db, {
    area: 'TI', processo: 'Backup',
    bcpContatos: '["d1"]',
    tier: 'Tier 1 (Crítico)', rto: '< 4 horas', area_: 'RH',
  }, ctx());
  const p = db._store.processos.ti__backup;
  assert.strictEqual(p.tier, undefined, 'tier nao pode ser gravado daqui');
  assert.strictEqual(p.rto, undefined, 'rto nao pode ser gravado daqui');
  assert.ok(r.recusados.includes('tier'));
  assert.ok(r.recusados.includes('rto'));
});

test('salvarCamposPCN recusa chamada sem nenhum campo editavel', async () => {
  const db = makeDb(seed());
  await assert.rejects(
    () => WRITE_ACTIONS.salvarCamposPCN(db, { area: 'TI', processo: 'Backup' }, ctx()),
    AppError
  );
});

test('a allowlist da edicao inline cobre so contatos e papeis', () => {
  assert.deepStrictEqual(CAMPOS_EDITAVEIS_PCN, ['bcpContatos', 'bcpPapeisCrise']);
});

// --- salvarDrpDependencia: exportacao da Estrategia Tecnica de Recuperacao
// (tabela do PCN) de volta para o cadastro de Dependencias. A pagina do PCN
// nao tem SDK do Firestore, so fetch autenticado -- e por aqui que ela chega
// na colecao dependencias.
const { CAMPOS_DRP_DEPENDENCIA } = require('./appLogic');

test('salvarDrpDependencia grava RTO/RPO/Estrategia/Responsavel na dependencia', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarDrpDependencia(db, {
    dependenciaId: 'd1', estrategia: 'Warm Standby', rto: '4 horas', rpo: '1 hora', responsavel: 'Time de Infraestrutura',
  }, ctx());
  assert.strictEqual(r.success, true);
  const d = db._store.dependencias.d1;
  assert.strictEqual(d.estrategia, 'Warm Standby');
  assert.strictEqual(d.rto, '4 horas');
  assert.strictEqual(d.rpo, '1 hora');
  assert.strictEqual(d.responsavel, 'Time de Infraestrutura');
  // Composicao de Servicos: o texto tambem vira minutos.
  assert.strictEqual(d.rtoMin, 240);
  assert.strictEqual(d.rpoMin, 60);
  assert.strictEqual(d.atualizadoPor, 'analista@fortestecnologia.com.br');
  // Nome/categoria da dependencia nao sao tocados por esta acao.
  assert.strictEqual(d.nome, 'SRV-01');
  assert.strictEqual(d.categoria, 'Servidor');
});

test('salvarDrpDependencia rejeita dependencia inexistente', async () => {
  const db = makeDb(seed());
  await assert.rejects(
    () => WRITE_ACTIONS.salvarDrpDependencia(db, { dependenciaId: 'nao-existe', rto: '4 horas' }, ctx()),
    AppError
  );
});

test('salvarDrpDependencia recusa chamada sem nenhum campo informado', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.salvarDrpDependencia(db, { dependenciaId: 'd1' }, ctx()),
    AppError
  );
});

test('a allowlist do DRP cobre so os 4 campos de recuperacao', () => {
  assert.deepStrictEqual(CAMPOS_DRP_DEPENDENCIA, ['estrategia', 'rto', 'rpo', 'responsavel']);
});

// --- gerarDRP: perfil (Admin/Seguranca/TI) e a secao "Impactos Operacionais
// nos Processos", alimentada com os Processos de verdade que dependem da
// dependencia (mesmo criterio de vinculo do cliente, _processosVinculadosADependencia).
function seedAdmin(s) {
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['admin'] } };
  return s;
}

test('gerarDRP recusa quem nao tem perfil de Admin/Seguranca/TI', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['gestor'] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' })),
    AppError
  );
});

test('gerarDRP lista, na secao de Processos impactados, o processo vinculado por id com tier calculado do score real', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.processos.ti__backup.dependenciaItens = [{ categoria: 'Servidor', nome: 'SRV-01', id: 'd1' }];
  s.respostas_bia = { r1: { area: 'TI', processo: 'Backup', score: 14, timestamp: '2026-01-01T00:00:00.000Z' } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Backup (TI) — Tier 1 (Crítico)'), 'deveria listar o processo com o tier calculado do score');
  } finally { global.fetch = original; }
});

test('gerarDRP usa o tier manual quando o processo ainda nao foi avaliado (sem score)', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.processos.ti__backup.dependenciaItens = [{ categoria: 'Servidor', nome: 'SRV-01', id: 'd1' }];
  s.processos.ti__backup.tierManual = 'Tier 1 (Crítico)';
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Backup (TI) — Tier 1 (Crítico)'), 'deveria usar o tier manual, nao "Pendente" nem um tier calculado de score zero');
  } finally { global.fetch = original; }
});

test('gerarDRP marca "Pendente" quando o processo nao tem score nem tier manual', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.processos.ti__backup.dependenciaItens = [{ categoria: 'Servidor', nome: 'SRV-01', id: 'd1' }];
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Backup (TI) — Pendente'));
  } finally { global.fetch = original; }
});

test('gerarDRP mostra a mensagem de fallback quando nenhum processo esta vinculado', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Nenhum processo de negócio vinculado a esta dependência na base.'));
  } finally { global.fetch = original; }
});

test('gerarDRP: IA que estoura o limite de tempo vira mensagem clara, nao erro cru', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  const original = global.fetch;
  let sinal = null;
  global.fetch = async (_url, opts) => {
    sinal = opts.signal;
    const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e;
  };
  try {
    await assert.rejects(
      () => WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' })),
      (err) => err instanceof AppError && /demorou mais de 4 minutos/.test(err.message)
    );
    assert.ok(sinal, 'a chamada a IA deveria ir com limite de tempo (signal)');
  } finally { global.fetch = original; }
});

test('gerarDRP: outros erros de rede continuam com a mensagem de antes', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  const original = global.fetch;
  global.fetch = async () => { throw new Error('ECONNRESET'); };
  try {
    await assert.rejects(
      () => WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' })),
      (err) => err instanceof AppError && err.message === 'Erro ao gerar DRP: ECONNRESET'
    );
  } finally { global.fetch = original; }
});

test('gerarDRP lista os canais de suporte do fornecedor vinculado, em ordem de nivel', async () => {
  const s = seedAdmin(seed());
  s.dependencias = {
    d1: { nome: 'Internet', categoria: 'Infraestrutura', drpDependencias: [{ id: 'f1', nome: 'Operadora X', categoria: 'Fornecedores' }] },
    f1: { nome: 'Operadora X', categoria: 'Fornecedores', canaisSuporte: [
      { tipo: 'Portal de chamados', contato: 'https://suporte.x.com', nivel: 'N2', sla: '8h' },
      { tipo: 'Telefone/0800', contato: '0800 123 4567', horario: '24x7', nivel: 'N1', sla: '4h', observacao: 'contrato 99' },
    ] },
  };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    const n1 = promptEnviado.indexOf('- Operadora X — Telefone/0800 | Contato: 0800 123 4567 | Horário: 24x7 | Nível: N1 | SLA: 4h | Obs.: contrato 99');
    const n2 = promptEnviado.indexOf('- Operadora X — Portal de chamados | Contato: https://suporte.x.com');
    assert.ok(n1 !== -1 && n2 !== -1, 'os dois canais deveriam ir no prompt');
    assert.ok(n1 < n2, 'N1 antes de N2');
  } finally { global.fetch = original; }
});

test('gerarDRP avisa quando nenhum fornecedor vinculado tem canal de suporte', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(promptEnviado.includes('Nenhum canal de suporte cadastrado para os fornecedores vinculados.'));
  } finally { global.fetch = original; }
});

// --- Cadeado por secao (drpSecoes.js): secao ajustada pelo humano sobrevive
// a uma nova geracao.
test('gerarDRP preserva a secao bloqueada da ultima versao e devolve o cadeado', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.drp_conteudo = { d1: { versoes: [{
    versao: 1, data: '2026-10-01T00:00:00.000Z', autor: 'x',
    html: '<h2>2. Estratégia</h2><p>RTO 4h</p><h2>6. Runbook</h2><p>passo humano</p>',
    bloqueadas: ['6'],
  }] } };
  const db = makeDb(s);
  const original = global.fetch;
  let promptEnviado = '';
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '```html\n<h2>2. Estratégia</h2><p>RTO 2h</p><h2>6. Runbook</h2><p>passo IA</p>\n```' }] } }] }) };
  };
  try {
    const r = await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    // A secao de SLAs (montada pelo sistema, 15/10/2026) entra depois; o cadeado nao muda.
    const [antesDosSlas, secaoSlas] = r.drp.split('<h2>SLAs Contratados com Fornecedores</h2>');
    assert.strictEqual(antesDosSlas, '<h2>2. Estratégia</h2><p>RTO 2h</p><h2>6. Runbook</h2><p>passo humano</p>');
    assert.match(secaoSlas, /Nenhum contrato vigente/);
    assert.deepStrictEqual(r.bloqueadas, ['6']);
    // Contexto: a secao travada vai no prompt, e a nao travada nao.
    assert.ok(promptEnviado.includes('SEÇÕES JÁ REVISADAS POR UMA PESSOA'));
    assert.ok(promptEnviado.includes('<h2>6. Runbook</h2><p>passo humano</p>'));
    assert.ok(!promptEnviado.includes('RTO 4h'));
  } finally { global.fetch = original; }
});

test('gerarDRP troca o "(seção mantida)" devolvido pela IA pela secao revisada', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.drp_conteudo = { d1: { versoes: [{ versao: 1, html: '<h2>6. Runbook</h2><p>passo humano</p>', bloqueadas: ['6'] }] } };
  const db = makeDb(s);
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h2>2. Estratégia</h2><p>RTO 2h</p><h2>6. Runbook</h2><p>(seção mantida)</p>' }] } }] }) });
  try {
    const r = await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    // A secao de SLAs (montada pelo sistema, 15/10/2026) entra depois; o cadeado nao muda.
    const [antesDosSlas, secaoSlas] = r.drp.split('<h2>SLAs Contratados com Fornecedores</h2>');
    assert.strictEqual(antesDosSlas, '<h2>2. Estratégia</h2><p>RTO 2h</p><h2>6. Runbook</h2><p>passo humano</p>');
    assert.match(secaoSlas, /Nenhum contrato vigente/);
  } finally { global.fetch = original; }
});

test('gerarDRP sem secao travada nao manda o bloco de secoes revisadas', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.drp_conteudo = { d1: { versoes: [{ versao: 1, html: '<h2>6. Runbook</h2><p>x</p>' }] } };
  const db = makeDb(s);
  const original = global.fetch;
  let promptEnviado = '';
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  try {
    const r = await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(!promptEnviado.includes('SEÇÕES JÁ REVISADAS'));
    assert.deepStrictEqual(r.bloqueadas, []);
  } finally { global.fetch = original; }
});

test('salvarDRP guarda so as 5 ultimas versoes e continua a numeracao', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.drp_conteudo = { d1: { versoes: Array.from({ length: 19 }, (_, i) => ({ versao: i + 1, data: 'x', autor: 'a', html: 'v' + (i + 1) })) } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarDRP(db, { id: 'd1', html: '<p>nova</p>' }, ctx());
  const versoes = db._store.drp_conteudo.d1.versoes;
  assert.deepStrictEqual(versoes.map((v) => v.versao), [16, 17, 18, 19, 20]);
  assert.deepStrictEqual({ versao: r.versao, total: r.totalVersoes }, { versao: 20, total: 5 });
  assert.strictEqual(JSON.parse(db._store.dependencias.d1.drpSalvo).length, 5);
});

test('salvarDRP grava as secoes bloqueadas na versao nova', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  const db = makeDb(s);
  await WRITE_ACTIONS.salvarDRP(db, { id: 'd1', html: '<h2>6. X</h2>', bloqueadas: ['6', '6', ' 3 ', ''] }, ctx());
  assert.deepStrictEqual(db._store.drp_conteudo.d1.versoes[0].bloqueadas, ['6', '3']);
});

// --- Roteiro de Teste (aba "Gestao de Testes"): documento gerado via IA
// usando o DRP ja gerado como base, um por tipo de teste (categoria), com
// historico de versoes por categoria -- mesmo mecanismo do DRP.

test('gerarRoteiroTeste recusa quem nao tem perfil de Admin/Seguranca/TI', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor', drpSalvo: '[{"versao":1}]' } };
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['gestor'] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.gerarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)' }, ctx({ geminiApiKey: 'chave-teste' })),
    AppError
  );
});

test('gerarRoteiroTeste exige API Key do Gemini configurada', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', drpSalvo: '[{"versao":1}]' } };
  s.drp_conteudo = { d1: { versoes: [{ versao: 1, html: '<p>x</p>' }] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.gerarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)' }, ctx({ geminiApiKey: '' })),
    AppError
  );
});

test('gerarRoteiroTeste exige que o DRP ja tenha sido gerado', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } }; // sem drpSalvo
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.gerarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)' }, ctx({ geminiApiKey: 'chave-teste' })),
    AppError
  );
});

test('gerarRoteiroTeste usa o DRP salvo e a frequencia da Estrategia de Teste como contexto do prompt', async () => {
  const s = seedAdmin(seed());
  s.dependencias = {
    d1: {
      nome: 'SRV-01',
      categoria: 'Servidor',
      drpSalvo: JSON.stringify([{ versao: 1, data: '2026-01-01T00:00:00.000Z', autor: 'x' }]),
      drpEstrategiasTeste: [{ cenario: 'Tabletop (Exercício de Mesa)', frequencia: 'Semestral' }],
    },
  };
  s.drp_conteudo = { d1: { versoes: [{ versao: 1, html: '<h1>DRP de SRV-01</h1>' }] } };
  const db = makeDb(s);
  let promptEnviado = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h1>Roteiro</h1>' }] } }] }) };
  };
  try {
    const r = await WRITE_ACTIONS.gerarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.strictEqual(r.html, '<h1>Roteiro</h1>');
    assert.ok(promptEnviado.includes('Tabletop (Exercício de Mesa)'), 'deveria citar o tipo de teste escolhido');
    assert.ok(promptEnviado.includes('Semestral'), 'deveria citar a frequencia prevista da Estrategia de Teste');
    assert.ok(promptEnviado.includes('<h1>DRP de SRV-01</h1>'), 'deveria usar o HTML do DRP ja gerado como contexto');
  } finally { global.fetch = original; }
});

test('salvarRoteiroTeste + obterRoteiroTeste: empilha versao por categoria e grava so o metadado na dependencia', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01' } };
  const db = makeDb(s);
  await WRITE_ACTIONS.salvarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)', html: '<p>v1</p>' }, ctx());
  await WRITE_ACTIONS.salvarRoteiroTeste(db, { id: 'd1', categoria: 'Teste Paralelo', html: '<p>paralelo v1</p>' }, ctx());
  const r2 = await WRITE_ACTIONS.salvarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)', html: '<p>v2</p>' }, ctx());
  assert.strictEqual(r2.versao, 3);

  const lido = await READ_ACTIONS.obterRoteiroTeste(db, { id: 'd1' }, ctx());
  assert.strictEqual(lido.versoes.length, 3);
  assert.strictEqual(lido.versoes.filter((v) => v.categoria === 'Tabletop (Exercício de Mesa)').length, 2);

  const dep = (await db.collection('dependencias').doc('d1').get()).data();
  assert.strictEqual(dep.drpRoteirosTeste.length, 3);
  assert.ok(!dep.drpRoteirosTeste[0].html, 'metadado na dependencia nao deveria carregar o html');
});

test('excluirRoteiroTeste remove so as versoes da categoria pedida', async () => {
  const s = seedAdmin(seed());
  s.dependencias = { d1: { nome: 'SRV-01' } };
  const db = makeDb(s);
  await WRITE_ACTIONS.salvarRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)', html: '<p>v1</p>' }, ctx());
  await WRITE_ACTIONS.salvarRoteiroTeste(db, { id: 'd1', categoria: 'Teste Paralelo', html: '<p>paralelo v1</p>' }, ctx());
  await WRITE_ACTIONS.excluirRoteiroTeste(db, { id: 'd1', categoria: 'Tabletop (Exercício de Mesa)' }, ctx());

  const lido = await READ_ACTIONS.obterRoteiroTeste(db, { id: 'd1' }, ctx());
  assert.strictEqual(lido.versoes.length, 1);
  assert.strictEqual(lido.versoes[0].categoria, 'Teste Paralelo');
});

// --- importarVulnerabilidadeParaRisco: importacao MANUAL (botao na tela),
// sem checar limiar de CVSS nem Status da Correcao -- diferente do gatilho
// automatico riscoDeVulnerabilidade (index.js), que so roda em escrita no
// Firestore e respeita o limiar/status.

test('importarVulnerabilidadeParaRisco recusa quem nao tem perfil Admin/Seguranca', async () => {
  const s = seed();
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Sistema Y', cvss: 1, statusCorrecao: 'Pendente' } };
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['gestor'] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx()),
    AppError
  );
});

test('importarVulnerabilidadeParaRisco recusa TI -- mais restrito que o DRP (TI nao opera Vulnerabilidades)', async () => {
  const s = seed();
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Sistema Y' } };
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['ti'] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx()),
    AppError
  );
});

test('importarVulnerabilidadeParaRisco rejeita vulnerabilidade inexistente', async () => {
  const s = seedAdmin(seed());
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'nao-existe' }, ctx()),
    AppError
  );
});

test('importarVulnerabilidadeParaRisco cria o risco mesmo com severidade baixa e status Corrigida (decisao manual ignora os dois)', async () => {
  const s = seedAdmin(seed());
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Sistema Y', cvss: 1, statusCorrecao: 'Corrigida' } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx());
  assert.strictEqual(r.success, true);
  assert.ok(!r.jaExiste);

  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.strictEqual(riscoDoc.origem, 'Vulnerabilidade');
  assert.strictEqual(riscoDoc.vulnerabilidadeId, 'v1');
  assert.strictEqual(riscoDoc.categoria, 'Operacional');
  assert.strictEqual(riscoDoc.criadoPor, 'analista@fortestecnologia.com.br');
  assert.match(riscoDoc.descricao, /manualmente/);
});

test('importarVulnerabilidadeParaRisco usa o nome do Produto de Software vinculado no titulo', async () => {
  const s = seedAdmin(seed());
  s.produtos_software = { ps1: { nome: 'Fortes RH', ativo: true } };
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Área Restrita', produtoSoftwareId: 'ps1', cvss: 8 } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx());
  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.match(riscoDoc.titulo, /em Fortes RH \/ Área Restrita \(CVSS 8\)/);
});

test('importarVulnerabilidadeParaRisco: produto vinculado que nao existe mais cai so no texto do ativo', async () => {
  const s = seedAdmin(seed());
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Sistema Y', produtoSoftwareId: 'sumiu', cvss: 8 } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx());
  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.match(riscoDoc.titulo, /em Sistema Y \(CVSS 8\)/);
});

test('importarVulnerabilidadeParaRisco nao duplica quando ja existe risco aberto para a mesma vulnerabilidade', async () => {
  const s = seedAdmin(seed());
  s.vulnerabilidades = { v1: { nome: 'Falha X', produto: 'Sistema Y', cvss: 9.8, statusCorrecao: 'Aberto' } };
  s.riscos = { r1: { origem: 'Vulnerabilidade', vulnerabilidadeId: 'v1', status: 'Identificado' } };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.importarVulnerabilidadeParaRisco(db, { id: 'v1' }, ctx());
  assert.strictEqual(r.jaExiste, true);

  const riscosSnap = await db.collection('riscos').get();
  assert.strictEqual(riscosSnap.docs.length, 1, 'nao deveria ter criado um segundo risco');
});

// --- exportarRiscoDocumento: botao por registro dentro do visualizador do
// DRP/PCN (drp-live.js/pcn-live.js) -- essas paginas abrem em janela
// separada, so com fetch cru + token, entao precisam de uma Cloud Function
// (mesmo motivo de importarVulnerabilidadeParaRisco acima). Sem checagem de
// duplicata -- nem o picker de import em lote de PCN/DRP tem.

test('exportarRiscoDocumento recusa quem nao tem perfil Admin/Seguranca', async () => {
  const s = seed();
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['gestor'] } };
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.exportarRiscoDocumento(db, { titulo: 'Falha de energia' }, ctx()),
    AppError
  );
});

test('exportarRiscoDocumento exige titulo', async () => {
  const s = seedAdmin(seed());
  const db = makeDb(s);
  await assert.rejects(
    () => WRITE_ACTIONS.exportarRiscoDocumento(db, {}, ctx()),
    AppError
  );
});

test('exportarRiscoDocumento cria o risco com os campos default quando so titulo e informado', async () => {
  const s = seedAdmin(seed());
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.exportarRiscoDocumento(db, { titulo: 'Risco de Rota Física Compartilhada' }, ctx());
  assert.strictEqual(r.success, true);

  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.strictEqual(riscoDoc.titulo, 'Risco de Rota Física Compartilhada');
  assert.strictEqual(riscoDoc.descricao, 'Risco de Rota Física Compartilhada');
  assert.strictEqual(riscoDoc.status, 'Identificado');
  assert.strictEqual(riscoDoc.origem, 'Importado de documento');
  assert.strictEqual(riscoDoc.probabilidade, '');
  assert.strictEqual(riscoDoc.impacto, '');
  assert.strictEqual(riscoDoc.area, '');
  assert.strictEqual(riscoDoc.processoId, '');
  assert.deepStrictEqual(riscoDoc.planoAcao, []);
  assert.deepStrictEqual(riscoDoc.kris, []);
  assert.strictEqual(riscoDoc.criadoPor, 'analista@fortestecnologia.com.br');
});

test('exportarRiscoDocumento aceita o payload completo vindo do PCN (area/processo/probabilidade/impacto/mitigacao)', async () => {
  const s = seedAdmin(seed());
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.exportarRiscoDocumento(db, {
    origem: 'Importado de PCN',
    titulo: 'Falha de energia',
    descricao: 'Falha de energia',
    area: 'TI',
    processo: 'Backup',
    processoId: 'ti__backup',
    probabilidade: 'Alta',
    impacto: 'Crítico',
    estrategiaDescricao: 'Gerador e nobreak redundantes',
  }, ctx());

  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.strictEqual(riscoDoc.origem, 'Importado de PCN');
  assert.strictEqual(riscoDoc.area, 'TI');
  assert.strictEqual(riscoDoc.processoId, 'ti__backup');
  assert.strictEqual(riscoDoc.probabilidade, 'Alta');
  assert.strictEqual(riscoDoc.impacto, 'Crítico');
  assert.strictEqual(riscoDoc.estrategiaDescricao, 'Gerador e nobreak redundantes');
});

test('exportarRiscoDocumento aceita o payload do DRP (sem area/processo, com descricao embutindo a dependencia)', async () => {
  const s = seedAdmin(seed());
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.exportarRiscoDocumento(db, {
    origem: 'Importado de DRP',
    titulo: 'Custo de Operação',
    descricao: 'Risco residual identificado no DRP de "Internet - Fortes": Custo de Operação',
    probabilidade: 'Baixa',
    impacto: 'Moderado',
  }, ctx());

  const riscoDoc = (await db.collection('riscos').doc(r.id).get()).data();
  assert.strictEqual(riscoDoc.origem, 'Importado de DRP');
  assert.match(riscoDoc.descricao, /Internet - Fortes/);
  assert.strictEqual(riscoDoc.area, '');
  assert.strictEqual(riscoDoc.processo, '');
});

// ============================================================
// SLAs CONTRATADOS NO DRP (15/10/2026)
// ============================================================

function seedSla() {
  const s = seedAdmin(seed());
  s.dependencias = {
    d1: { nome: 'Qualys Cloud', categoria: 'Sistemas', rto: '4 horas', rpo: '1 hora',
      drpDependencias: [{ id: 'f2', nome: 'Operadora Y', categoria: 'Fornecedores' }] },
    f1: { nome: 'ICTS', categoria: 'Fornecedores' },
    f2: { nome: 'Operadora Y', categoria: 'Fornecedores' },
  };
  s.processos = { ti__scan: { area: 'TI', processo: 'Varredura', rto: '< 4 horas', rpo: '< 1 hora', dependenciaItens: [{ id: 'd1', nome: 'Qualys Cloud' }] } };
  s.status_contrato = { vig: { nome: 'Vigente', situacao: 'vigente' }, enc: { nome: 'Encerrado', situacao: 'encerrado' } };
  s.contratos = {
    c1: { codigo: 'CT-0001', objeto: 'Qualys VMDR', fornecedorId: 'f1', fornecedorNome: 'ICTS', statusId: 'vig', dataFim: '2027-05-14',
      dependenciasCobertasIds: ['d1'], valorMensal: 42156.76, valorGlobal: 505881.12,
      sla: { cobertura: '24x7', disponibilidadePct: 99.9, disponibilidadePeriodo: 'mensal', rtoMin: 480, rpoMin: 60,
        atendimento: [{ severidade: 'Crítica', respostaMin: 30 }], janelaManutencao: 'Domingo 02h-06h', penalidade: '10% de crédito por hora' } },
    c2: { codigo: 'CT-0002', objeto: 'Link dedicado', fornecedorId: 'f2', fornecedorNome: 'Operadora Y', statusId: 'vig', dataFim: '2027-01-31',
      valorMensal: 9999, sla: { rtoMin: 120 } },
    c3: { codigo: 'CT-0003', objeto: 'Contrato antigo', fornecedorId: 'f1', fornecedorNome: 'ICTS', statusId: 'enc',
      dependenciasCobertasIds: ['d1'], sla: { rtoMin: 60 } },
    c4: { codigo: 'CT-0004', objeto: 'Outro sistema', fornecedorId: 'f1', fornecedorNome: 'ICTS', statusId: 'vig',
      dependenciasCobertasIds: ['outra'], sla: { rtoMin: 60 } },
  };
  return s;
}

async function gerarDrpCapturando(s, respostaIa) {
  const db = makeDb(s);
  const original = global.fetch;
  let promptEnviado = '';
  global.fetch = async (_url, opts) => {
    promptEnviado = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: respostaIa }] } }] }) };
  };
  try {
    const r = await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    return { r, promptEnviado };
  } finally { global.fetch = original; }
}

test('gerarDRP manda ao prompt os SLAs do contrato que cobre a dependencia e do fornecedor vinculado', async () => {
  const { promptEnviado } = await gerarDrpCapturando(seedSla(), '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(promptEnviado.includes('### SLAs contratados com fornecedores'));
  assert.ok(promptEnviado.includes('CT-0001 — Qualys VMDR | Fornecedor: ICTS | Vigente até 14/05/2027'));
  assert.ok(promptEnviado.includes('RTO garantido: 8 h'));
  assert.ok(promptEnviado.includes('Disponibilidade: 99,9% por mês (até 43 min de parada por mês)'));
  assert.ok(promptEnviado.includes('Crítica: primeira resposta em 30 min'));
  assert.ok(promptEnviado.includes('CT-0002 — Link dedicado'), 'fornecedor em drpDependencias tambem entra');
  assert.ok(!promptEnviado.includes('CT-0003'), 'contrato encerrado nao entra');
  assert.ok(!promptEnviado.includes('CT-0004'), 'contrato que cobre outra dependencia nao entra');
});

test('gerarDRP nunca leva o valor do contrato (TI opera DRP e nao le contratos)', async () => {
  const { r, promptEnviado } = await gerarDrpCapturando(seedSla(), '<h2>1. Objetivo</h2><p>x</p>');
  ['42156', '42.156', '505881', '505.881', '9999', 'valorMensal', 'valorGlobal'].forEach((t) => {
    assert.ok(!promptEnviado.includes(t), `prompt nao pode conter ${t}`);
    assert.ok(!r.drp.includes(t), `DRP nao pode conter ${t}`);
  });
});

test('gerarDRP insere a secao de SLAs depois de Dependencias, com as incompatibilidades SLA x RTO', async () => {
  const ia = '<h1>DRP</h1><h2>8. Limitações</h2><p>a</p><h2>9. Dependências</h2><p>b</p><h2>10. Testes</h2><p>c</p>';
  const { r, promptEnviado } = await gerarDrpCapturando(seedSla(), ia);
  const ordem = drpSecoes.dividirSecoes(r.drp).secoes.map((x) => x.chave);
  assert.deepStrictEqual(ordem, ['8', '9', 'slas contratados com fornecedores', '10']);
  assert.match(r.drp, /RTO garantido 8 h &gt; exigido 4 h \(Processo Varredura \(TI\)\)/);
  assert.match(r.drp, /RTO garantido 8 h &gt; exigido 4 h \(Dependência Qualys Cloud\)/);
  assert.match(r.drp, /10% de crédito por hora/);
  assert.ok(promptEnviado.includes('Incompatibilidades SLA × RTO: RTO garantido 8 h > exigido 4 h'));
  assert.ok(promptEnviado.includes('NÃO crie uma seção chamada "SLAs Contratados com Fornecedores"'));
});

test('gerarDRP regrava a secao de SLAs mesmo travada, e tira o cadeado dela', async () => {
  const s = seedSla();
  s.drp_conteudo = { d1: { versoes: [{ versao: 1,
    html: '<h2>9. Dependências</h2><p>b</p><h2>SLAs Contratados com Fornecedores</h2><p>dado velho</p>',
    bloqueadas: ['slas contratados com fornecedores'] }] } };
  const { r } = await gerarDrpCapturando(s, '<h2>9. Dependências</h2><p>b</p>');
  assert.ok(!r.drp.includes('dado velho'));
  assert.ok(r.drp.includes('CT-0001'));
  assert.deepStrictEqual(r.bloqueadas, []);
});

test('obterSlasDependencia devolve os mesmos SLAs, sem valores, e recusa quem nao opera DRP', async () => {
  const db = makeDb(seedSla());
  const r = await READ_ACTIONS.obterSlasDependencia(db, { id: 'd1' }, ctx());
  assert.deepStrictEqual(r.contratos.map((c) => c.codigo), ['CT-0001', 'CT-0002']);
  assert.strictEqual(r.contratos[0].viaCobertura, true);
  assert.strictEqual(r.contratos[1].viaCobertura, false);
  assert.ok(!JSON.stringify(r).includes('valor'));
  assert.ok(r.contratos[0].incompatibilidades.some((i) => i.codigo === 'sla_rto_incompativel'));

  const s = seedSla();
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['gestor'] } };
  await assert.rejects(() => READ_ACTIONS.obterSlasDependencia(makeDb(s), { id: 'd1' }, ctx()), AppError);
});

// ============================================================
// E-MAIL DE TESTE (16/10/2026)
// ============================================================

test('enviarEmailTeste: so o Admin, vai para o proprio usuario, com o nome de remetente configurado', async () => {
  const s = seedAdmin(seed());
  s.config_notificacoes = { contratos: { modo: 'simulacao', remetenteNome: 'Contratos GRC360',
    servidor: { provedor: 'sendgrid', remetenteEmail: 'alertas@fortestecnologia.com.br' } } };
  const enviados = [];
  let opcoesTransporte = null;
  const c = ctx({ smtp: { usuario: 'apikey', senha: 'SG.x' }, criarEnviador: (o) => { opcoesTransporte = o; return async (m) => { enviados.push(m); }; } });
  const r = await WRITE_ACTIONS.enviarEmailTeste(makeDb(s), {}, c);
  assert.strictEqual(r.para, 'analista@fortestecnologia.com.br');
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].para, 'analista@fortestecnologia.com.br');
  assert.strictEqual(enviados[0].de, 'Contratos GRC360');
  assert.match(enviados[0].texto, /Modo atual: simulacao/);
  assert.match(enviados[0].html, /#contratos"/);
  // O transporte recebe o segredo E o servidor da configuracao (SendGrid + remetente verificado).
  assert.deepStrictEqual(opcoesTransporte, { usuario: 'apikey', senha: 'SG.x',
    servidor: { provedor: 'sendgrid', host: '', porta: null, remetenteEmail: 'alertas@fortestecnologia.com.br' } });

  const op = seed();
  op.config_perfis = { 'analista@fortestecnologia.com.br': { perfis: ['operador'] } };
  await assert.rejects(() => WRITE_ACTIONS.enviarEmailTeste(makeDb(op), {}, c), /Só o Administrador/);
});

test('enviarEmailTeste: falha do SMTP vira mensagem para a tela', async () => {
  const c = ctx({ criarEnviador: () => async () => { throw new Error('535 Username and Password not accepted'); } });
  await assert.rejects(() => WRITE_ACTIONS.enviarEmailTeste(makeDb(seedAdmin(seed())), {}, c), /Falha no envio: 535/);
});

test('enviarEmailTeste: sem segredo configurado o transporte real avisa o que falta', async () => {
  await assert.rejects(() => WRITE_ACTIONS.enviarEmailTeste(makeDb(seedAdmin(seed())), {}, ctx({ smtp: { usuario: 'pendente', senha: 'pendente' } })),
    /SMTP não configurado/);
});

// ============================================================
// CONTATOS DO DRP: gestor vem dos CONTRATOS; pessoas relacionadas (19/10/2026)
// ============================================================

function seedContatos() {
  const s = seedSla();
  // Pessoas do cadastro (e-mail/telefone/cargo vem daqui) e um gestor LEGADO no fornecedor.
  s.dependencias.p1 = { categoria: 'Pessoas', nome: 'Gabriel Fortes', detalhes: 'Analista de Segurança', telefone: '(85) 99999-0001', email: 'gabriel@fortestecnologia.com.br' };
  s.dependencias.p2 = { categoria: 'Pessoas', nome: 'Bruno Lima', detalhes: 'Compras', telefone: '(85) 99999-0002', email: 'bruno@fortestecnologia.com.br' };
  s.dependencias.p3 = { categoria: 'Pessoas', nome: 'Antigo Gestor', detalhes: 'Legado', telefone: '(85) 99999-0003', email: 'antigo@fortestecnologia.com.br' };
  s.dependencias.p4 = { categoria: 'Pessoas', nome: 'Gestor do Contrato Encerrado', detalhes: 'x', telefone: '(85) 99999-0004', email: 'enc@fortestecnologia.com.br' };
  s.dependencias.f1.gestoresContrato = [{ id: 'p3', nome: 'Antigo Gestor', telefone: '(85) 99999-0003', email: 'antigo@fortestecnologia.com.br' }];
  s.dependencias.f2.pessoasRelacionadas = [{ id: 'p2', nome: 'Bruno Lima', papel: 'Financeiro/Compras' }, { id: 'p-removida', nome: 'Saiu', papel: 'Outro' }];
  s.contratos.c1.gestor = { id: 'p1', nome: 'Gabriel Fortes' };
  s.contratos.c1.area = 'Segurança da Informação';
  s.contratos.c3.gestor = { id: 'p4', nome: 'Gestor do Contrato Encerrado' };
  return s;
}

test('contatos do DRP: gestor do contrato VIGENTE (do cadastro de Pessoas) e pessoas relacionadas com o papel', async () => {
  const { promptEnviado } = await gerarDrpCapturando(seedContatos(), '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(promptEnviado.includes('- Gabriel Fortes (Segurança da Informação) — Gestor do contrato CT-0001 — Analista de Segurança | Telefone: (85) 99999-0001 | E-mail: gabriel@fortestecnologia.com.br'));
  assert.ok(promptEnviado.includes('- Bruno Lima (Operadora Y) — Financeiro/Compras — Compras | Telefone: (85) 99999-0002 | E-mail: bruno@fortestecnologia.com.br'));
});

test('contatos do DRP: o gestor LEGADO do fornecedor e o gestor de contrato encerrado nao entram; pessoa removida e ignorada', async () => {
  const { promptEnviado } = await gerarDrpCapturando(seedContatos(), '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(!promptEnviado.includes('Antigo Gestor'), 'gestoresContrato legado nao vale mais');
  assert.ok(!promptEnviado.includes('Gestor do Contrato Encerrado'));
  assert.ok(!promptEnviado.includes('Saiu'));
});

test('contatos do DRP: contratos que nao cobrem a dependencia nem sao de fornecedor ligado nao trazem gestor', async () => {
  const s = seedContatos();
  s.contratos.c4.gestor = { id: 'p4', nome: 'Gestor do Contrato Encerrado' };
  const { promptEnviado } = await gerarDrpCapturando(s, '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(!promptEnviado.includes('CT-0004 —'));
  assert.ok(!promptEnviado.includes('Gestor do Contrato Encerrado'));
});

test('contatos do DRP: gestor do contrato sem cadastro (sem id) nao vira contato inventado; sem valores de contrato', async () => {
  const s = seedContatos();
  s.contratos.c1.gestor = { id: null, nome: 'Fulano Sem Cadastro' };
  const { promptEnviado, r } = await gerarDrpCapturando(s, '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(!promptEnviado.includes('Fulano Sem Cadastro'));
  ['42156', '505881', 'valorMensal'].forEach((t) => { assert.ok(!promptEnviado.includes(t)); assert.ok(!r.drp.includes(t)); });
});

test('contatos do DRP: falha ao ler os contratos nao derruba o DRP (segue sem gestores) e a secao de SLAs avisa', async () => {
  const s = seedContatos();
  const db = makeDb(s);
  const original = db.collection;
  db.collection = (col) => {
    if (col === 'contratos') return { get: async () => { throw new Error('sem permissao'); } };
    return original(col);
  };
  const orig = global.fetch;
  let promptEnviado = '';
  const erro = console.error;
  console.error = () => {};
  global.fetch = async (_u, o) => {
    promptEnviado = JSON.parse(o.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h2>9. Dependências</h2><p>b</p>' }] } }] }) };
  };
  try {
    const r = await WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.ok(!promptEnviado.includes('Gestor do contrato CT-0001'));
    assert.ok(promptEnviado.includes('Bruno Lima'), 'pessoas relacionadas continuam');
    assert.match(r.drp, /Não foi possível consultar os contratos/);
  } finally { global.fetch = orig; console.error = erro; }
});

// --- gerarResumoExecutivo (relatorios executivos, 20/10/2026) ---

function seedPerfil(perfis) {
  return { config_perfis: { 'analista@fortestecnologia.com.br': { perfis } } };
}

function capturarGemini(resposta, ok) {
  const original = global.fetch;
  const chamadas = [];
  global.fetch = async (url, opts) => {
    chamadas.push({ url, corpo: JSON.parse(opts.body) });
    return {
      ok: ok !== false,
      status: ok === false ? 500 : 200,
      json: async () => (ok === false ? { error: { message: 'quota' } } : { candidates: [{ content: { parts: [{ text: resposta }] } }] }),
    };
  };
  return { chamadas, restaurar: () => { global.fetch = original; } };
}

test('gerarResumoExecutivo: Admin/Seguranca geram; Gestor e TI sao recusados', async () => {
  for (const perfil of ['gestor', 'ti', 'operador']) {
    await assert.rejects(
      () => WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil([perfil])), { tipo: 'riscos', indicadores: { a: 1 } }, ctx({ geminiApiKey: 'k' })),
      /Seu perfil não pode/
    );
  }
  const g = capturarGemini(JSON.stringify({ paragrafos: ['P1'], recomendacoes: [] }));
  try {
    const r = await WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil(['seguranca'])), { tipo: 'vulnerabilidades', indicadores: { emAberto: 7 } }, ctx({ geminiApiKey: 'k' }));
    assert.deepStrictEqual(r.paragrafos, ['P1']);
  } finally { g.restaurar(); }
});

test('gerarResumoExecutivo: valida tipo, indicadores, tamanho e chave', async () => {
  const db = makeDb(seedPerfil(['admin']));
  await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'outro', indicadores: {} }, ctx({ geminiApiKey: 'k' })), /Tipo de relatório inválido/);
  await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'riscos' }, ctx({ geminiApiKey: 'k' })), /Indicadores do relatório ausentes/);
  await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'riscos', indicadores: { x: 'a'.repeat(20001) } }, ctx({ geminiApiKey: 'k' })), /grandes demais/);
  await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'riscos', indicadores: { a: 1 } }, ctx({ geminiApiKey: '' })), /API Key do Gemini/);
});

test('gerarResumoExecutivo: prompt leva os numeros e pede JSON; resposta vira texto puro limitado', async () => {
  const g = capturarGemini('```json\n' + JSON.stringify({ paragrafos: ['Situação.', '  ', 'Tendência.', 'extra', 'demais'], recomendacoes: ['R1', 'R2', 'R3', 'R4'] }) + '\n```');
  try {
    const r = await WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil(['admin'])), { tipo: 'riscos', indicadores: { riscosAtivos: 42, acimaDoApetite: 5 } }, ctx({ geminiApiKey: 'k' }));
    const enviado = g.chamadas[0].corpo;
    const prompt = enviado.contents[0].parts[0].text;
    assert.match(prompt, /"riscosAtivos":42/);
    assert.match(prompt, /Relatório Executivo de Riscos/);
    assert.match(prompt, /SOMENTE os números/);
    assert.strictEqual(enviado.generationConfig.responseMimeType, 'application/json');
    assert.deepStrictEqual(r.paragrafos, ['Situação.', 'Tendência.', 'extra'], 'vazios fora, no maximo 3');
    assert.deepStrictEqual(r.recomendacoes, ['R1', 'R2', 'R3']);
  } finally { g.restaurar(); }
});

test('gerarResumoExecutivo: resposta fora do formato ou erro da API viram AppError', async () => {
  const db = makeDb(seedPerfil(['admin']));
  for (const resp of ['não é json', JSON.stringify({ paragrafos: [] }), '']) {
    const g = capturarGemini(resp);
    try {
      await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'vulnerabilidades', indicadores: { a: 1 } }, ctx({ geminiApiKey: 'k' })), AppError);
    } finally { g.restaurar(); }
  }
  const g = capturarGemini('', false);
  try {
    await assert.rejects(() => WRITE_ACTIONS.gerarResumoExecutivo(db, { tipo: 'vulnerabilidades', indicadores: { a: 1 } }, ctx({ geminiApiKey: 'k' })), /Erro na API do Gemini: quota/);
  } finally { g.restaurar(); }
});

// --- serieRiscoPorEscopo (linha do tempo do Relatorio de Riscos, 20/10/2026) ---

test('serieRiscoPorEscopo: perfil, validacao e empresa x escopo com os mesmos insumos', async () => {
  const base = () => ({
    medicoes: {
      m1: { fonte: 'risco', sujeitoTipo: 'risco', sujeitoId: 'r1', sujeitoRotulo: 'A', area: 'TI', valor: 10, classificacao: 'Identificado', coletadoEm: '2026-01-05T10:00:00Z' },
      m2: { fonte: 'risco', sujeitoTipo: 'risco', sujeitoId: 'r2', sujeitoRotulo: 'B', area: 'RH', valor: 4, classificacao: 'Identificado', coletadoEm: '2026-01-06T10:00:00Z' },
    },
    riscos: { r1: { area: 'TI' }, r2: { area: 'RH' } },
  });
  await assert.rejects(() => WRITE_ACTIONS.serieRiscoPorEscopo(makeDb(Object.assign(base(), seedPerfil(['gestor']))), { meses: 6 }, ctx()), /Seu perfil não pode/);
  const db = makeDb(Object.assign(base(), seedPerfil(['seguranca'])));
  await assert.rejects(() => WRITE_ACTIONS.serieRiscoPorEscopo(db, { riscoIds: 'r1' }, ctx()), /Lista de riscos inválida/);
  await assert.rejects(() => WRITE_ACTIONS.serieRiscoPorEscopo(db, { riscoIds: new Array(5001).fill('x') }, ctx()), /grande demais/);
  const sem = await WRITE_ACTIONS.serieRiscoPorEscopo(db, { meses: 6 }, ctx());
  assert.strictEqual(sem.escopo, null, 'sem filtro: so a empresa');
  assert.strictEqual(sem.empresa.pontos.length, 6);
  const com = await WRITE_ACTIONS.serieRiscoPorEscopo(db, { meses: 12, riscoIds: ['r1'] }, ctx());
  const ultimoEmp = com.empresa.pontos[com.empresa.pontos.length - 1];
  const ultimoEsc = com.escopo.pontos[com.escopo.pontos.length - 1];
  assert.ok(ultimoEmp.carga > ultimoEsc.carga, 'a empresa inclui o risco de fora do escopo');
  assert.deepStrictEqual(ultimoEsc.areas.map((a) => a.area), ['TI']);
});

// --- PCN nos 4 Ps (Instalações, 21/10/2026) ---
test('gerarPCN: prompt traz as Instalações do processo (tipo, endereço, pessoas lotadas, alternativa) e os 4 Ps', async () => {
  const s = seed();
  s.dependencias = Object.assign({}, s.dependencias, {
    sede: { categoria: 'Instalações', nome: 'Sede SP', tipoInstalacao: 'Sede', endereco: 'Av. Paulista, 1000', instalacaoAlternativa: { id: 'filial', nome: 'Filial RJ' } },
    filial: { categoria: 'Instalações', nome: 'Filial RJ', tipoInstalacao: 'Filial', endereco: 'Rua do Ouvidor, 50' },
    dc: { categoria: 'Instalações', nome: 'Data center', tipoInstalacao: 'Data center' },
    ana: { categoria: 'Pessoas', nome: 'Ana', instalacao: { id: 'sede', nome: 'Sede SP' } },
    beto: { categoria: 'Pessoas', nome: 'Beto', instalacao: { id: 'sede', nome: 'Sede SP' } },
  });
  s.processos.ti__backup.dependenciaItens = [
    { categoria: 'Instalações', nome: 'Sede SP', id: 'sede' },
    { categoria: 'Instalações', nome: 'Data center', id: 'dc' },
  ];
  const db = makeDb(s);
  let prompt = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    prompt = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h1>PCN</h1>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
  } finally { global.fetch = original; }
  assert.match(prompt, /### Instalações \(4 Ps do BIA/);
  assert.match(prompt, /- \*\*Sede SP\*\* \(Sede\) — Av\. Paulista, 1000 \| Pessoas lotadas: 2 \| Instalação alternativa \(contingência\): Filial RJ \(Filial\) — Rua do Ouvidor, 50/);
  assert.match(prompt, /- \*\*Data center\*\* \(Data center\) \| Pessoas lotadas: 0 \| SEM instalação alternativa definida/);
  assert.match(prompt, /pelos 4 Ps do BIA/);
  assert.match(prompt, /NÃO inclua Fornecedores\/Pessoas\/Instalações nesta tabela/);
  assert.match(prompt, /NÃO invente nome nem endereço de local alternativo/);
});

test('gerarPCN e Sugerir com IA: Instalações agrupadas por papel (Site de Produção / Sustentação / não classificadas)', async () => {
  const s = seed();
  s.dependencias = Object.assign({}, s.dependencias, {
    sede: { categoria: 'Instalações', nome: 'Sede SP', tipoInstalacao: 'Sede' },
    aws: { categoria: 'Instalações', nome: 'Site AWS' },
    dc: { categoria: 'Instalações', nome: 'Data center', tipoInstalacao: 'Data center' },
  });
  s.processos.ti__backup.dependenciaItens = [
    { categoria: 'Instalações', nome: 'Sede SP', id: 'sede', papeis: ['producao', 'sustentacao'] },
    { categoria: 'Instalações', nome: 'Site AWS', id: 'aws', papeis: ['producao'] },
    { categoria: 'Instalações', nome: 'Data center', id: 'dc' },
  ];
  let prompt = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    prompt = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h1>PCN</h1>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(makeDb(s), { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
  } finally { global.fetch = original; }
  assert.match(prompt, /Site de Produção = onde a solução tecnológica roda/);
  assert.match(prompt, /#### Site de Produção\n- \*\*Sede SP\*\*[^\n]*\n- \*\*Site AWS\*\*[^\n]*\n#### Site de Sustentação\n- \*\*Sede SP\*\*[^\n]*\n#### Não classificadas\n- \*\*Data center\*\*/);

  s.config_perfis['analista@fortestecnologia.com.br'] = { perfis: ['admin'] };
  const { g } = await pedirIA(s, { alvo: 'processo-impacto', id: 'ti__backup' });
  const { dados } = dadosDoPrompt(g, 'DADOS DO PROCESSO (JSON):');
  assert.strictEqual(JSON.stringify(dados.instalacoes), JSON.stringify([
    { nome: 'Sede SP', papeis: ['Site de Produção', 'Site de Sustentação'] },
    { nome: 'Site AWS', papeis: ['Site de Produção'] },
    { nome: 'Data center' },
  ]));
});

// ---- Processo renomeado (21/10/2026) ----
// O id do documento e a chave de quando o processo foi criado: depois de
// renomear, processoKey(area, nome novo) nao acha nada. O id vem primeiro.
const seedRenomeado = () => ({
  processos: { ti__backup: { area: 'TI', processo: 'Backup Corporativo', nomesAnteriores: ['TI||Backup'] } },
  respostas_bia: {
    r1: { area: 'TI', processo: 'Backup', score: 14, timestamp: '2026-01-01T00:00:00.000Z' },
  },
  config_perfis: { 'analista@fortestecnologia.com.br': { perfis: ['admin'] } },
});

test('PCN de processo renomeado: salvarPCN, excluirPCN, dadosPCN e salvarCamposPCN acham pelo id', async () => {
  const db = makeDb(seedRenomeado());
  await WRITE_ACTIONS.salvarPCN(db, { id: 'ti__backup', area: 'TI', processo: 'Backup Corporativo', html: '<p>v1</p>' }, ctx());
  assert.strictEqual(JSON.parse(db._store.processos.ti__backup.pcnSalvo).length, 1);
  const r = await READ_ACTIONS.dadosPCN(db, { id: 'ti__backup', area: 'TI', processo: 'Backup Corporativo' });
  assert.strictEqual(r.processo.id, 'ti__backup');
  await WRITE_ACTIONS.salvarCamposPCN(db, { id: 'ti__backup', area: 'TI', processo: 'Backup Corporativo', bcpPapeisCrise: '{}' }, ctx());
  await WRITE_ACTIONS.excluirPCN(db, { id: 'ti__backup' }, ctx());
  assert.strictEqual(db._store.processos.ti__backup.pcnSalvo, '');
});

test('PCN de processo renomeado sem id (pagina antiga): cai na busca por area+nome', async () => {
  const db = makeDb(seedRenomeado());
  const r = await WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup Corporativo', html: '<p>v1</p>' }, ctx());
  assert.strictEqual(r.versao, 1);
  await assert.rejects(() => WRITE_ACTIONS.salvarPCN(db, { id: 'nao-existe', html: 'x' }, ctx()), AppError);
});

test('salvarCamposPCN grava bcpContatos como array, mesmo vindo como string JSON', async () => {
  const db = makeDb(seed());
  await WRITE_ACTIONS.salvarCamposPCN(db, { area: 'TI', processo: 'Backup', bcpContatos: '["d1","d2"]' }, ctx());
  assert.deepStrictEqual(db._store.processos.ti__backup.bcpContatos, ['d1', 'd2']);
  await WRITE_ACTIONS.salvarCamposPCN(db, { id: 'ti__backup', bcpContatos: ['d3'] }, ctx());
  assert.deepStrictEqual(db._store.processos.ti__backup.bcpContatos, ['d3']);
});

test('listaDeContatos le array, string JSON, vazio e lixo', () => {
  const { listaDeContatos } = require('./appLogic');
  assert.deepStrictEqual(listaDeContatos(['a', 'b']), ['a', 'b']);
  assert.deepStrictEqual(listaDeContatos('["a"]'), ['a']);
  assert.deepStrictEqual(listaDeContatos(''), []);
  assert.deepStrictEqual(listaDeContatos('nao e json'), []);
  assert.deepStrictEqual(listaDeContatos(undefined), []);
});

test('gerarPCN de processo renomeado usa o score do nome antigo e contatos gravados como string', async () => {
  const s = seedRenomeado();
  s.processos.ti__backup.bcpContatos = '["d1"]';
  s.dependencias = { d1: { nome: 'Fulano', categoria: 'Pessoas', telefone: '85 1234' } };
  const db = makeDb(s);
  let corpo = '';
  const original = global.fetch;
  global.fetch = async (_url, opts) => {
    corpo = opts.body;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h1>ok</h1>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
  } finally { global.fetch = original; }
  assert.match(corpo, /Fulano/);
  assert.match(corpo, /Tier 1/);
});

// ---- Processo -> Servico -> componentes (21/10/2026) ----
function capturarPrompt() {
  const original = global.fetch;
  const ref = { texto: '' };
  global.fetch = async (_url, opts) => {
    ref.texto = JSON.parse(opts.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<p>ok</p>' }] } }] }) };
  };
  ref.restaurar = () => { global.fetch = original; };
  return ref;
}

test('gerarDRP: processo ligado so via Servico (e componente) aparece em Processos impactados, com a ligacao', async () => {
  const s = seedAdmin(seed());
  s.dependencias = {
    srv: { nome: 'SRV-01', categoria: 'Servidor', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
    db: { nome: 'Oracle', categoria: 'Banco de Dados' },
  };
  s.servicos = { s1: { nome: 'Portal', dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] } };
  s.processos.ti__backup.dependenciaItens = [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }];
  const db = makeDb(s);
  const p = capturarPrompt();
  try {
    await WRITE_ACTIONS.gerarDRP(db, { id: 'db' }, ctx({ geminiApiKey: 'chave-teste' }));
  } finally { p.restaurar(); }
  assert.match(p.texto, /Backup \(TI\) — .*\| Ligação: Via serviço Portal \(via SRV-01\)/);
});

test('gerarPCN: Servicos do processo e a cadeia tecnica deles entram nas Dependencias Criticas', async () => {
  const s = seed();
  s.dependencias = {
    srv: { nome: 'SRV-01', categoria: 'Servidor', rto: '2 horas', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
    db: { nome: 'Oracle', categoria: 'Banco de Dados', estrategia: 'Backup & Restore' },
  };
  s.servicos = { s1: { nome: 'Portal', descricao: 'Portal do cliente', dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] } };
  s.processos.ti__backup.dependenciaItens = [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }];
  const db = makeDb(s);
  const p = capturarPrompt();
  try {
    await WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
  } finally { p.restaurar(); }
  assert.match(p.texto, /\*\*Servidor:\*\* SRV-01.*RTO: 2 horas.*Ligação: Via serviço Portal/);
  assert.match(p.texto, /\*\*Banco de Dados:\*\* Oracle.*Estratégia: Backup & Restore.*Ligação: Componente de SRV-01/);
  assert.match(p.texto, /### Serviços que suportam o processo[^#]*\*\*Portal\*\* — Portal do cliente/);
  assert.doesNotMatch(p.texto, /\*\*Serviços:\*\* Portal/, 'o servico nao vira linha de dependencia');
});

// ============================================================
// OPERADOR DE PROCESSOS (23/10/2026): opera PCN e links de BIA de todas as
// areas; le o DRP; nao altera DRP. Fecha as acoes de PCN que so conferiam
// dominio.
// ============================================================

const comPerfil = (perfis, extra) => {
  const s = seed();
  s.config_perfis = { 'analista@fortestecnologia.com.br': { perfis, ...(extra || {}) } };
  return s;
};

test('PCN: gestor, TI, operador administrativo e conta sem perfil sao recusados no servidor', async () => {
  for (const perfis of [['gestor'], ['ti'], ['operador'], []]) {
    const s = comPerfil(perfis, { area: 'TI' });
    s.processos.ti__backup.pcnSalvo = JSON.stringify([{ versao: 1 }]);
    const db = makeDb(s);
    await assert.rejects(() => WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup', html: 'x' }, ctx()), AppError, String(perfis));
    await assert.rejects(() => WRITE_ACTIONS.excluirPCN(db, { area: 'TI', processo: 'Backup' }, ctx()), AppError, String(perfis));
    await assert.rejects(() => WRITE_ACTIONS.salvarCamposPCN(db, { area: 'TI', processo: 'Backup', bcpPapeisCrise: '{}' }, ctx()), AppError);
    await assert.rejects(() => WRITE_ACTIONS.gerarPCN(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' })), AppError);
    assert.strictEqual(db._store.processos.ti__backup.pcnSalvo, JSON.stringify([{ versao: 1 }]), 'nada foi apagado');
  }
});

test('PCN: operador de processos salva, edita e exclui o PCN de qualquer area', async () => {
  const s = comPerfil(['operador_processos']);
  s.processos.rh__folha = { area: 'RH', processo: 'Folha' };
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarPCN(db, { area: 'RH', processo: 'Folha', html: '<p>v1</p>' }, ctx());
  assert.strictEqual(r.versao, 1);
  await WRITE_ACTIONS.salvarCamposPCN(db, { area: 'RH', processo: 'Folha', bcpPapeisCrise: '{}' }, ctx());
  await WRITE_ACTIONS.excluirPCN(db, { area: 'RH', processo: 'Folha' }, ctx());
  assert.strictEqual(db._store.processos.rh__folha.pcnSalvo, '');
});

test('salvarPCN guarda no maximo 5 versoes, sem recomecar a numeracao, e carimba a revisao', async () => {
  const s = seed();
  s.processos.ti__backup.pcnSalvo = JSON.stringify([1, 2, 3, 4, 5].map((v) => ({ versao: v, html: 'v' + v })));
  const db = makeDb(s);
  const r = await WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup', html: '<p>v6</p>' }, ctx());
  assert.strictEqual(r.versao, 6);
  const versoes = JSON.parse(db._store.processos.ti__backup.pcnSalvo);
  assert.deepStrictEqual(versoes.map((v) => v.versao), [2, 3, 4, 5, 6]);
  const rev = db._store.processos.ti__backup.pcnRevisao;
  assert.strictEqual(rev.revisadoPor, 'analista@fortestecnologia.com.br');
  assert.strictEqual(rev.ultimaEm, versoes[4].data);
});

test('salvarPCN preserva o aprovador ja registrado na revisao', async () => {
  const s = seed();
  s.processos.ti__backup.pcnRevisao = { aprovadoPor: 'Dono', aprovadoEm: '2026-01-01', ultimaEm: '2026-01-01' };
  const db = makeDb(s);
  await WRITE_ACTIONS.salvarPCN(db, { area: 'TI', processo: 'Backup', html: 'x' }, ctx());
  assert.strictEqual(db._store.processos.ti__backup.pcnRevisao.aprovadoPor, 'Dono');
});

test('DRP: operador de processos LE o DRP e os roteiros, mas nao salva, gera nem exporta parametros', async () => {
  const s = comPerfil(['operador_processos']);
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor' } };
  s.drp_conteudo = { d1: { versoes: [{ versao: 1, html: '<p>drp</p>' }] } };
  const db = makeDb(s);
  const r = await READ_ACTIONS.obterDRP(db, { id: 'd1' }, ctx());
  assert.strictEqual(r.versoes.length, 1);
  await READ_ACTIONS.obterRoteiroTeste(db, { id: 'd1' }, ctx());
  await assert.rejects(() => WRITE_ACTIONS.salvarDRP(db, { id: 'd1', html: 'x' }, ctx()), AppError);
  await assert.rejects(() => WRITE_ACTIONS.excluirDRP(db, { id: 'd1' }, ctx()), AppError);
  await assert.rejects(() => WRITE_ACTIONS.gerarDRP(db, { id: 'd1' }, ctx({ geminiApiKey: 'k' })), AppError);
  await assert.rejects(() => WRITE_ACTIONS.salvarDrpDependencia(db, { dependenciaId: 'd1', rto: '1 hora' }, ctx()), AppError);
  assert.strictEqual(db._store.dependencias.d1.rto, undefined);
});

test('DRP: gestor continua sem ler o conteudo do DRP', async () => {
  const s = comPerfil(['gestor'], { area: 'TI' });
  s.drp_conteudo = { d1: { versoes: [{ versao: 1 }] } };
  await assert.rejects(() => READ_ACTIONS.obterDRP(makeDb(s), { id: 'd1' }, ctx()), AppError);
});

test('salvarDRP carimba a revisao do DRP na dependencia', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'SRV-01', categoria: 'Servidor', drpRevisao: { aprovadoPor: 'Infra' } } };
  const db = makeDb(s);
  await WRITE_ACTIONS.salvarDRP(db, { id: 'd1', html: '<p>x</p>' }, ctx());
  const rev = db._store.dependencias.d1.drpRevisao;
  assert.strictEqual(rev.revisadoPor, 'analista@fortestecnologia.com.br');
  assert.ok(rev.ultimaEm);
  assert.strictEqual(rev.aprovadoPor, 'Infra');
});

test('gerarLink: operador de processos gera para qualquer area; gestor so para a propria', async () => {
  const op = makeDb(comPerfil(['operador_processos']));
  const r = await WRITE_ACTIONS.gerarLink(op, { tipo: 'bia', area: 'RH', processo: 'Folha' }, ctx());
  assert.strictEqual(r.success, true);

  const g = makeDb(comPerfil(['gestor'], { area: 'TI' }));
  await WRITE_ACTIONS.gerarLink(g, { tipo: 'bia', area: 'TI', processo: 'Backup' }, ctx());
  await assert.rejects(() => WRITE_ACTIONS.gerarLink(g, { tipo: 'bia', area: 'RH', processo: 'Folha' }, ctx()), AppError);

  for (const perfis of [['ti'], ['operador'], []]) {
    await assert.rejects(() => WRITE_ACTIONS.gerarLink(makeDb(comPerfil(perfis)), { tipo: 'bia', area: 'TI', processo: 'Backup' }, ctx()), AppError);
  }
});

test('gerarLink: gestor da area de cima gera para a area de baixo (areasGeridas); nao para outra', async () => {
  const g = makeDb(comPerfil(['gestor'], { area: 'TI', areasGeridas: ['TI', 'Infraestrutura'] }));
  const r = await WRITE_ACTIONS.gerarLink(g, { tipo: 'bia', area: 'Infraestrutura', processo: 'Rede' }, ctx());
  assert.strictEqual(r.success, true);
  await assert.rejects(() => WRITE_ACTIONS.gerarLink(g, { tipo: 'bia', area: 'RH', processo: 'Folha' }, ctx()), AppError);
});

test('gerarPCN: a area sai com o caminho da hierarquia', async () => {
  const s = seed();
  s.areas = { d: { nome: 'Diretoria' }, t: { nome: 'TI', areaPaiId: 'd' } };
  const original = global.fetch;
  let prompt = '';
  global.fetch = async (_url, req) => {
    prompt = JSON.parse(req.body).contents[0].parts[0].text;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '<h1>ok</h1>' }] } }] }) };
  };
  try {
    await WRITE_ACTIONS.gerarPCN(makeDb(s), { id: 'ti__backup' }, ctx({ geminiApiKey: 'chave-teste' }));
    assert.match(prompt, /\*\*Área:\*\* Diretoria › TI\n/);
  } finally { global.fetch = original; }
});

// ============================================================
// FORNECEDOR INATIVO (27/10/2026)
// ============================================================

test('dadosPCN nao oferece fornecedor inativo; outras categorias continuam', async () => {
  const s = seed();
  s.dependencias = {
    d1: { nome: 'Ativo', categoria: 'Fornecedores' },
    d2: { nome: 'Inativo', categoria: 'Fornecedores', ativo: false },
    d3: { nome: 'SRV-01', categoria: 'Servidor' },
  };
  const db = makeDb(s);
  db.collection = ((orig) => (col) => {
    const api = orig(col);
    api.get = async () => ({ docs: Object.entries(db._store[col] || {}).map(([id, data]) => ({ id, data: () => data })) });
    return api;
  })(db.collection);
  const r = await READ_ACTIONS.dadosPCN(db, { area: 'TI', processo: 'Backup' });
  assert.deepStrictEqual(r.dependencias.map((d) => d.nome).sort(), ['Ativo', 'SRV-01']);
});

test('DRP: fornecedor INATIVO ligado em drpDependencias nao entra nos contatos nem nos SLAs', async () => {
  const s = seedContatos();
  s.dependencias.f2.ativo = false;
  const { promptEnviado } = await gerarDrpCapturando(s, '<h2>1. Objetivo</h2><p>x</p>');
  assert.ok(!promptEnviado.includes('Bruno Lima'), 'pessoa relacionada do fornecedor inativo nao entra');
  assert.ok(!promptEnviado.includes('CT-0002 — Link dedicado'), 'contrato do fornecedor inativo nao vem pelo fornecedor');
  assert.ok(promptEnviado.includes('CT-0001 — Qualys VMDR'), 'contrato que cobre a dependencia continua');
});

// ---- Sugestao da Descricao do Impacto por IA (27/10/2026) ----
function seedImpacto(perfil) {
  const s = seed();
  s.config_perfis['analista@fortestecnologia.com.br'] = perfil;
  s.processos.ti__backup = {
    area: 'TI', processo: 'Backup', descricaoFuncional: 'Copia diária dos dados de clientes', rto: '< 4 horas', mtd: '24 horas',
    dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }, { categoria: 'Fornecedores', id: 'f1', nome: 'Nuvem SA' }],
    levantamentoPCN: JSON.stringify({ semSistema: 'Clientes ficam sem restaurar arquivos', outro: 'x' }),
  };
  s.servicos = { s1: { nome: 'Portal', descricao: 'Portal do cliente', dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] } };
  s.dependencias = { srv: { nome: 'SRV-01', categoria: 'Servidor' }, f1: { nome: 'Nuvem SA', categoria: 'Fornecedores' } };
  s.perguntas = { q1: { pergunta: 'Afeta clientes?', categoria: 'Impacto em Clientes' }, q2: { pergunta: 'Perda financeira?', categoria: 'Impacto Financeiro' } };
  s.respostas_bia = { r1: { area: 'TI', processo: 'Backup', score: 7, timestamp: '2026-10-01T00:00:00Z', scores: { 'Afeta clientes?': 4, 'Perda financeira?': 0 } } };
  s.riscos = { k1: { processoId: 'ti__backup', titulo: 'Ransomware no SRV-01', status: 'Identificado' }, k2: { processoId: 'ti__backup', titulo: 'Antigo', status: 'Encerrado' } };
  return s;
}

test('sugerirImpactoProcesso: quem edita o processo pede; gestor so da propria area; demais recusados', async () => {
  const resp = JSON.stringify({ texto: 'Sem este processo, os clientes ficam sem restaurar arquivos.' });
  for (const [perfil, ok] of [
    [{ perfis: ['admin'] }, true], [{ perfis: ['operador_processos'] }, true], [{ perfis: ['seguranca'] }, true],
    [{ perfis: ['gestor'], area: 'TI' }, true], [{ perfis: ['gestor'], area: 'RH' }, false], [{ perfis: ['ti'] }, false], [{ perfis: ['operador'] }, false],
  ]) {
    const db = makeDb(seedImpacto(perfil));
    const g = capturarGemini(resp);
    try {
      if (ok) {
        const r = await WRITE_ACTIONS.sugerirImpactoProcesso(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' }));
        assert.match(r.texto, /restaurar arquivos/, JSON.stringify(perfil));
      } else {
        await assert.rejects(() => WRITE_ACTIONS.sugerirImpactoProcesso(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' })), /não pode editar este processo/, JSON.stringify(perfil));
      }
    } finally { g.restaurar(); }
  }
});

test('sugerirImpactoProcesso: o prompt leva questionario por dimensao, servicos, cadeia, levantamento e riscos abertos; nada grava', async () => {
  const db = makeDb(seedImpacto({ perfis: ['admin'] }));
  const g = capturarGemini(JSON.stringify({ texto: 'ok' }));
  try {
    await WRITE_ACTIONS.sugerirImpactoProcesso(db, { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' }));
  } finally { g.restaurar(); }
  const corpo = g.chamadas[0].corpo;
  const prompt = corpo.contents[0].parts[0].text;
  assert.strictEqual(corpo.generationConfig.responseMimeType, 'application/json');
  const dados = JSON.parse(prompt.slice(prompt.indexOf('DADOS DO PROCESSO (JSON):') + 'DADOS DO PROCESSO (JSON):'.length));
  assert.deepStrictEqual(dados.impactoPorDimensao, { 'Impacto em Clientes': [{ pergunta: 'Afeta clientes?', nota: 4 }] }, 'so as respondidas, pela categoria');
  assert.deepStrictEqual(dados.servicos.map((s) => s.nome), ['Portal']);
  assert.ok(dados.dependenciasTecnicas.includes('Servidor: SRV-01'), 'cadeia pelo Servico');
  assert.deepStrictEqual(dados.fornecedores, ['Nuvem SA']);
  assert.deepStrictEqual(dados.levantamentoPCN, { semSistema: 'Clientes ficam sem restaurar arquivos' });
  assert.deepStrictEqual(dados.riscos, ['Ransomware no SRV-01'], 'encerrado fica fora');
  assert.strictEqual(dados.rto, '< 4 horas');
  assert.match(prompt, /Não invente/);
  assert.strictEqual(db._store.processos.ti__backup.descricao, undefined, 'so sugere; quem grava e a tela');
});

test('sugerirImpactoProcesso: sem chave, processo inexistente, formato invalido e erro da API viram AppError', async () => {
  await assert.rejects(() => WRITE_ACTIONS.sugerirImpactoProcesso(makeDb(seedImpacto({ perfis: ['admin'] })), { id: 'ti__backup' }, ctx({ geminiApiKey: '' })), /API Key do Gemini/);
  await assert.rejects(() => WRITE_ACTIONS.sugerirImpactoProcesso(makeDb(seedImpacto({ perfis: ['admin'] })), { id: 'nao' }, ctx({ geminiApiKey: 'k' })), /não encontrado/);
  let g = capturarGemini('{"outra":1}');
  try {
    await assert.rejects(() => WRITE_ACTIONS.sugerirImpactoProcesso(makeDb(seedImpacto({ perfis: ['admin'] })), { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' })), /fora do formato/);
  } finally { g.restaurar(); }
  g = capturarGemini('', false);
  try {
    await assert.rejects(() => WRITE_ACTIONS.sugerirImpactoProcesso(makeDb(seedImpacto({ perfis: ['admin'] })), { id: 'ti__backup' }, ctx({ geminiApiKey: 'k' })), /Erro na API do Gemini: quota/);
  } finally { g.restaurar(); }
});

// ---- Mais sugestoes por IA (sugerirTextoIA, 27/10/2026) ----
const dadosDoPrompt = (g, marcador) => {
  const prompt = g.chamadas[0].corpo.contents[0].parts[0].text;
  return { prompt, dados: JSON.parse(prompt.slice(prompt.indexOf(marcador) + marcador.length)) };
};

async function pedirIA(seedObj, data, resposta) {
  const db = makeDb(seedObj);
  const g = capturarGemini(resposta === undefined ? JSON.stringify({ texto: 'Sugestão.' }) : resposta);
  try {
    const r = await WRITE_ACTIONS.sugerirTextoIA(db, data, ctx({ geminiApiKey: 'k' }));
    return { r, g, db };
  } finally { g.restaurar(); }
}

test('sugerirTextoIA: alvo desconhecido e recusado', async () => {
  await assert.rejects(() => WRITE_ACTIONS.sugerirTextoIA(makeDb(seed()), { alvo: 'x', id: 'a' }, ctx({ geminiApiKey: 'k' })), /Sugestão inválida/);
});

test('sugerirTextoIA processo-funcional: mesmo recorte de quem edita; prompt sem notas/riscos; nada grava', async () => {
  for (const [perfil, ok] of [[{ perfis: ['operador_processos'] }, true], [{ perfis: ['gestor'], area: 'TI' }, true], [{ perfis: ['gestor'], area: 'RH' }, false], [{ perfis: ['ti'] }, false]]) {
    const p = pedirIA(seedImpacto(perfil), { alvo: 'processo-funcional', id: 'ti__backup' });
    if (ok) assert.strictEqual((await p).r.texto, 'Sugestão.');
    else await assert.rejects(() => p, /não pode editar este processo/, JSON.stringify(perfil));
  }
  const { g, db } = await pedirIA(seedImpacto({ perfis: ['admin'] }), { alvo: 'processo-funcional', id: 'ti__backup' });
  const { prompt, dados } = dadosDoPrompt(g, 'DADOS DO PROCESSO (JSON):');
  assert.match(prompt, /Descrição Funcional/);
  assert.match(prompt, /NÃO fale de impacto/);
  assert.strictEqual(dados.descricaoFuncional, 'Copia diária dos dados de clientes', 'texto atual vai no prompt');
  assert.deepStrictEqual(dados.servicos.map((s) => s.nome), ['Portal']);
  assert.deepStrictEqual(dados.fornecedores, ['Nuvem SA']);
  assert.strictEqual(dados.impactoPorDimensao, undefined);
  assert.strictEqual(dados.riscos, undefined);
  assert.strictEqual(db._store.processos.ti__backup.descricaoFuncional, 'Copia diária dos dados de clientes', 'nada grava');
});

test('sugerirTextoIA processo-impacto: atalho para sugerirImpactoProcesso', async () => {
  const { g } = await pedirIA(seedImpacto({ perfis: ['admin'] }), { alvo: 'processo-impacto', id: 'ti__backup' });
  assert.match(g.chamadas[0].corpo.contents[0].parts[0].text, /Descrição do Impacto para Indisponibilidade/);
});

test('sugerirTextoIA processo-impacto e processo-funcional: Produtos de Software do processo vao no prompt com a descricao', async () => {
  const comProdutos = () => {
    const s = seedImpacto({ perfis: ['admin'] });
    s.processos.ti__backup.dependenciaItens.push(
      { categoria: 'Produtos de Software', id: 'ps1', nome: 'Ponto (nome antigo)' },
      { categoria: 'Produtos de Software', id: 'apagado', nome: 'Fortes Legado' });
    s.produtos_software = { ps1: { nome: 'Fortes Ponto', descricao: 'Controle de ponto eletrônico dos clientes', endpoints: ['https://ponto.exemplo'] } };
    return s;
  };
  for (const alvo of ['processo-impacto', 'processo-funcional']) {
    const { g } = await pedirIA(comProdutos(), { alvo, id: 'ti__backup' });
    const { prompt, dados } = dadosDoPrompt(g, 'DADOS DO PROCESSO (JSON):');
    assert.strictEqual(JSON.stringify(dados.produtosSoftware), JSON.stringify([
      { nome: 'Fortes Ponto', descricao: 'Controle de ponto eletrônico dos clientes' },
      { nome: 'Fortes Legado' },
    ]), alvo);
    assert.doesNotMatch(prompt, /ponto\.exemplo/, 'endpoints fora do prompt');
    assert.match(prompt, /Produtos de Software Fortes|produtosSoftware/);
  }
});

test('sugerirTextoIA processo-processos: so ids do catalogo, sem o proprio nem os ja ligados; servicos em comum como pista', async () => {
  const comProcessos = (perfil) => {
    const s = seedImpacto(perfil);
    s.processos.ti__backup.dependenciaItens.push({ categoria: 'Processos Internos', id: 'rh__folha', nome: 'Folha' });
    s.processos.rh__folha = { area: 'RH', processo: 'Folha' };
    s.processos.ti__infra = { area: 'TI', processo: 'Gestão de Infra', descricaoFuncional: 'Mantém os servidores', dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }] };
    s.processos.fin__compras = { area: 'Financeiro', processo: 'Compras' };
    return s;
  };
  for (const [perfil, ok] of [[{ perfis: ['gestor'], area: 'TI' }, true], [{ perfis: ['gestor'], area: 'RH' }, false], [{ perfis: ['ti'] }, false]]) {
    const p = pedirIA(comProcessos(perfil), { alvo: 'processo-processos', id: 'ti__backup' }, JSON.stringify({ processos: [] }));
    if (ok) assert.deepStrictEqual((await p).r.processos, []);
    else await assert.rejects(() => p, /não pode editar este processo/, JSON.stringify(perfil));
  }
  const resposta = JSON.stringify({ processos: [
    { id: 'ti__infra', motivo: 'Recebe os servidores mantidos pela Infra' },
    { id: 'inventado', motivo: 'x' }, { id: 'ti__backup', motivo: 'o proprio' }, { id: 'rh__folha', motivo: 'ja ligado' }, { id: 'ti__infra', motivo: 'repetido' },
  ] });
  const { r, g } = await pedirIA(comProcessos({ perfis: ['admin'] }), { alvo: 'processo-processos', id: 'ti__backup' }, resposta);
  assert.strictEqual(JSON.stringify(r.processos), JSON.stringify([{ id: 'ti__infra', nome: 'Gestão de Infra', area: 'TI', motivo: 'Recebe os servidores mantidos pela Infra' }]));
  const { prompt, dados } = dadosDoPrompt(g, 'DADOS (JSON):');
  assert.match(prompt, /NÃO escolha processos que apenas dependem dele/);
  assert.deepStrictEqual(dados.catalogo.map((x) => x.id).sort(), ['fin__compras', 'ti__infra'], 'sem o proprio e sem o ja ligado');
  assert.deepStrictEqual(dados.catalogo.find((x) => x.id === 'ti__infra').servicosEmComum, ['Portal']);
  assert.strictEqual(dados.processo.processo, 'Backup');
});

function seedDrp(perfis) {
  const s = seed();
  s.config_perfis['analista@fortestecnologia.com.br'] = { perfis };
  s.dependencias = {
    db1: {
      nome: 'Banco ERP', categoria: 'Banco de Dados', detalhes: 'Base do ERP', estrategia: 'Backup em nuvem', rtoMin: 240, rpoMin: 60, responsavel: 'TI',
      componentes: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }],
      drpDependencias: [{ id: 'f1', nome: 'Nuvem SA', categoria: 'Fornecedores' }],
      drpRunbook: ['Restaurar o último backup'],
      drpEstrategiasTeste: [{ cenario: 'Tabletop (Exercício de Mesa)', frequencia: 'Semestral' }],
    },
    srv: { nome: 'SRV-01', categoria: 'Servidor' },
    app: { nome: 'ERP Web', categoria: 'Sistemas', componentes: [{ id: 'db1', nome: 'Banco ERP', categoria: 'Banco de Dados' }] },
    f1: { nome: 'Nuvem SA', categoria: 'Fornecedores' },
  };
  s.servicos = { s1: { nome: 'Faturamento', dependenciaItens: [{ id: 'db1', nome: 'Banco ERP', categoria: 'Banco de Dados' }] } };
  s.processos = { p1: { area: 'Financeiro', processo: 'Faturar', tierManual: 'Tier 1 (Crítico)', dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Faturamento' }] } };
  return s;
}

test('sugerirTextoIA dependencia-drp: Admin/SI/TI pedem; Operador de Processos e Gestor recusados', async () => {
  const resp = JSON.stringify({ runbook: ['Subir o SRV-01'] });
  for (const perfis of [['admin'], ['seguranca'], ['ti']]) {
    const { r } = await pedirIA(seedDrp(perfis), { alvo: 'dependencia-drp', id: 'db1' }, resp);
    assert.deepStrictEqual(r.listas.drpRunbook, ['Subir o SRV-01'], perfis[0]);
  }
  for (const perfis of [['operador_processos'], ['gestor']]) {
    await assert.rejects(() => pedirIA(seedDrp(perfis), { alvo: 'dependencia-drp', id: 'db1' }, resp), /não pode operar o DRP/, perfis[0]);
  }
});

test('sugerirTextoIA dependencia-drp: prompt com cadeia, processos e Tier; so itens novos; cenario fora da lista descartado', async () => {
  const resp = JSON.stringify({
    criteriosAcionamento: ['Banco fora do ar por mais de 1 hora', ' banco fora do ar  por mais de 1 hora ', ''],
    runbook: ['restaurar o último backup', 'Validar integridade da base'],
    limitacoes: 'nao e lista',
    estrategiasTeste: [
      { cenario: 'Tabletop (Exercício de Mesa)', frequencia: 'Semestral' },
      { cenario: 'Full Failover Test (Teste Completo)', frequencia: 'Anual' },
      { cenario: 'Teste inventado', frequencia: 'Mensal' },
    ],
  });
  const { r, g, db } = await pedirIA(seedDrp(['ti']), { alvo: 'dependencia-drp', id: 'db1' }, resp);
  const { prompt, dados } = dadosDoPrompt(g, 'DADOS DA DEPENDÊNCIA (JSON):');
  assert.match(prompt, /NÃO repita o que já está em "jaCadastrado"/);
  assert.deepStrictEqual(dados.processosQueDependem, [{ processo: 'Faturar', area: 'Financeiro', tier: 'Tier 1 (Crítico)', rto: '' }], 'pela cadeia (Servico)');
  assert.deepStrictEqual(dados.servicosQueAUsam, ['Faturamento']);
  assert.deepStrictEqual(dados.componentesDeQueDepende, ['Servidor: SRV-01']);
  assert.deepStrictEqual(dados.itensQueDependemDela, ['Sistemas: ERP Web']);
  assert.deepStrictEqual(dados.precisaParaRecuperar, ['Fornecedores: Nuvem SA']);
  assert.strictEqual(dados.rtoMinutos, 240);
  assert.deepStrictEqual(dados.jaCadastrado.runbook, ['Restaurar o último backup']);

  assert.deepStrictEqual(r.listas.drpCriteriosAcionamento, ['Banco fora do ar por mais de 1 hora'], 'repetido e vazio saem');
  assert.deepStrictEqual(r.listas.drpRunbook, ['Validar integridade da base'], 'o que ja esta cadastrado sai');
  assert.deepStrictEqual(r.listas.drpLimitacoes, []);
  assert.deepStrictEqual(r.estrategiasTeste, [{ cenario: 'Full Failover Test (Teste Completo)', frequencia: 'Anual' }]);
  assert.deepStrictEqual(db._store.dependencias.db1.drpRunbook, ['Restaurar o último backup'], 'nada grava');
});

test('sugerirTextoIA dependencia-drp: resposta que nao e objeto vira erro de formato', async () => {
  await assert.rejects(() => pedirIA(seedDrp(['admin']), { alvo: 'dependencia-drp', id: 'db1' }, '["x"]'), /fora do formato/);
  await assert.rejects(() => pedirIA(seedDrp(['admin']), { alvo: 'dependencia-drp', id: 'nao' }, '{}'), /Dependência não encontrada/);
});

test('sugerirTextoIA servico-descricao: Admin/SI; prompt com composicao, processos suportados, consumidores e responsaveis', async () => {
  const s = seedDrp(['seguranca']);
  s.servicos.s1.stakeholders = [{ id: 'pe1', nome: 'Ana' }];
  s.servicos.s1.responsaveisDesenvolvimento = [{ id: 'pe2', nome: 'Bruno' }];
  s.servicos.s1.consumidores = { areas: 'algumas', listaAreas: ['Financeiro'], clientes: true };
  s.servicos.s1.endpoints = [{ url: 'https://api.x', tipo: 'API', descricao: 'Emissão' }];
  s.servicos.s1.descricao = 'Emite notas';
  const { r, g } = await pedirIA(s, { alvo: 'servico-descricao', id: 's1' });
  assert.strictEqual(r.texto, 'Sugestão.');
  const { dados } = dadosDoPrompt(g, 'DADOS DO SERVIÇO (JSON):');
  assert.strictEqual(dados.descricaoAtual, 'Emite notas');
  assert.deepStrictEqual(dados.composicao, [{ item: 'Banco de Dados: Banco ERP', papel: 'Base do ERP', componentes: ['Servidor: SRV-01'] }]);
  assert.deepStrictEqual(dados.processosSuportados, [{ processo: 'Faturar', area: 'Financeiro', tier: 'Tier 1 (Crítico)' }]);
  assert.deepStrictEqual(dados.responsaveisSustentacao, ['Ana'], 'stakeholder antigo conta como Sustentação');
  assert.deepStrictEqual(dados.responsaveisDesenvolvimento, ['Bruno']);
  assert.deepStrictEqual(dados.consumidores, { areas: ['Financeiro'], clientes: true });
  assert.deepStrictEqual(dados.endpoints, ['API: Emissão'], 'sem a URL no prompt');
  assert.strictEqual(dados.stakeholders, undefined);
  for (const perfis of [['ti'], ['operador_processos']]) {
    await assert.rejects(() => pedirIA(seedDrp(perfis), { alvo: 'servico-descricao', id: 's1' }), /não pode editar Serviços/, perfis[0]);
  }
});

test('sugerirTextoIA servico-descricao: papel do vinculo no servico vence os detalhes do catalogo', async () => {
  const s = seedDrp(['admin']);
  s.servicos.s1.dependenciaItens[0].papel = 'Banco principal do faturamento';
  const { g } = await pedirIA(s, { alvo: 'servico-descricao', id: 's1' });
  const { dados } = dadosDoPrompt(g, 'DADOS DO SERVIÇO (JSON):');
  assert.strictEqual(dados.composicao[0].papel, 'Banco principal do faturamento');
});

test('sugerirTextoIA revisao-observacao: perfil por tipo de plano', async () => {
  for (const [perfis, tipo, ok] of [
    [['operador_processos'], 'bia', true], [['operador_processos'], 'pcn', true], [['operador_processos'], 'drp', false],
    [['ti'], 'drp', true], [['ti'], 'bia', false], [['gestor'], 'pcn', false],
  ]) {
    const p = pedirIA(seedDrp(perfis), { alvo: 'revisao-observacao', tipo, id: tipo === 'drp' ? 'db1' : 'p1' });
    if (ok) assert.strictEqual((await p).r.texto, 'Sugestão.');
    else await assert.rejects(() => p, /não registra revisão/, perfis[0] + ' ' + tipo);
  }
  await assert.rejects(() => pedirIA(seedDrp(['admin']), { alvo: 'revisao-observacao', tipo: 'x', id: 'p1' }), /Tipo de revisão inválido/);
});

test('sugerirTextoIA revisao-observacao: so o que veio depois da ultima revisao registrada', async () => {
  const s = seedDrp(['admin']);
  Object.assign(s.processos.p1, {
    biaHistoricoRevisao: [{ ultimaEm: '2026-03-01', observacao: 'Conferido com o dono' }, { ultimaEm: '2026-06-10', aprovadoPor: 'Carla' }],
    pcnHistoricoRevisao: [{ ultimaEm: '2026-06-10' }],
    pcnSalvo: JSON.stringify([{ versao: 1, data: '2026-05-01T10:00:00Z', autor: 'a', html: '<p>x</p>' }, { versao: 2, data: '2026-08-01T10:00:00Z', autor: 'b', html: '<p>y</p>' }]),
  });
  s.respostas_bia = {
    r1: { area: 'Financeiro', processo: 'Faturar', score: 5, timestamp: '2026-05-01T00:00:00Z' },
    r2: { processoId: 'p1', area: 'Financeiro', processo: 'Faturar', score: 9, timestamp: '2026-09-01T00:00:00Z' },
  };
  s.dependencias.db1.drpHistoricoRevisao = [{ ultimaEm: '2026-07-01' }];
  s.dependencias.db1.drpSalvo = JSON.stringify([{ versao: 3, data: '2026-08-15T00:00:00Z', autor: 'ti@x' }]);
  s.dependencias.db1.drpRegistrosTeste = [{ data: '2026-06-01', resultado: 'Sucesso' }, { data: '2026-09-20', resultado: 'Parcial', pendencias: 'Ajustar DNS' }];

  let { g } = await pedirIA(s, { alvo: 'revisao-observacao', tipo: 'bia', id: 'p1' });
  let { prompt, dados } = dadosDoPrompt(g, 'DADOS (JSON):');
  assert.match(prompt, /BIA \(Análise de Impacto\)/);
  assert.deepStrictEqual(dados.ultimaRevisaoRegistrada, { data: '2026-06-10', aprovadoPor: 'Carla', observacao: '' }, 'a mais recente');
  assert.deepStrictEqual(dados.respostasDesdeAUltimaRevisao.map((r) => r.data), ['2026-09-01'], 'a mesma resposta achada por duas chaves conta uma vez');
  assert.strictEqual(dados.respostaAnteriorAUltimaRevisao.score, 5);

  ({ g } = await pedirIA(s, { alvo: 'revisao-observacao', tipo: 'pcn', id: 'p1' }));
  ({ dados } = dadosDoPrompt(g, 'DADOS (JSON):'));
  assert.deepStrictEqual(dados.versoesDesdeAUltimaRevisao, [{ versao: 2, data: '2026-08-01', autor: 'b' }]);
  assert.ok(!JSON.stringify(dados).includes('<p>'), 'o HTML do plano nao vai');

  ({ g } = await pedirIA(s, { alvo: 'revisao-observacao', tipo: 'drp', id: 'db1' }));
  ({ dados } = dadosDoPrompt(g, 'DADOS (JSON):'));
  assert.deepStrictEqual(dados.versoesDesdeAUltimaRevisao.map((v) => v.versao), [3]);
  assert.deepStrictEqual(dados.testesDesdeAUltimaRevisao, [{ data: '2026-09-20', resultado: 'Parcial', pendencias: 'Ajustar DNS' }]);
});

// ---- Relatorio de Status de Continuidade: resumo por IA (27/10/2026) ----
test('gerarResumoExecutivo continuidade: Admin, SI e Operador de Processos; TI e Gestor recusados; prompt de continuidade', async () => {
  for (const perfil of ['ti', 'gestor', 'operador']) {
    await assert.rejects(
      () => WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil([perfil])), { tipo: 'continuidade', indicadores: { a: 1 } }, ctx({ geminiApiKey: 'k' })),
      /Seu perfil não pode/, perfil);
  }
  for (const perfil of ['admin', 'seguranca', 'operador_processos']) {
    const g = capturarGemini(JSON.stringify({ paragrafos: ['P1'], recomendacoes: ['R1'] }));
    try {
      const r = await WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil([perfil])), { tipo: 'continuidade', indicadores: { escopo: 'Empresa inteira', bia: { pctRealizados: 50 } } }, ctx({ geminiApiKey: 'k' }));
      assert.deepStrictEqual(r.paragrafos, ['P1'], perfil);
      const prompt = g.chamadas[0].corpo.contents[0].parts[0].text;
      assert.match(prompt, /analista sênior de continuidade de negócios/);
      assert.match(prompt, /Relatório de Status de Continuidade/);
      assert.match(prompt, /ISO 22301/);
      assert.match(prompt, /"pctRealizados":50/);
    } finally { g.restaurar(); }
  }
});

test('gerarResumoExecutivo riscos: o papel do prompt continua o de riscos', async () => {
  const g = capturarGemini(JSON.stringify({ paragrafos: ['P1'], recomendacoes: [] }));
  try {
    await WRITE_ACTIONS.gerarResumoExecutivo(makeDb(seedPerfil(['seguranca'])), { tipo: 'riscos', indicadores: { a: 1 } }, ctx({ geminiApiKey: 'k' }));
  } finally { g.restaurar(); }
  assert.match(g.chamadas[0].corpo.contents[0].parts[0].text, /analista sênior de riscos de segurança da informação/);
});

test('sugerirTextoIA servico-processos: Admin/SI; so ids do catalogo, sem os ja suportados; pistas de dependencia e area', async () => {
  const comProcessos = (perfis) => {
    const s = seedDrp(perfis);
    s.servicos.s1.consumidores = { areas: 'algumas', listaAreas: ['RH'], clientes: false };
    s.processos.p2 = { area: 'Financeiro', processo: 'Conciliar', dependenciaItens: [{ id: 'db1', nome: 'Banco ERP', categoria: 'Banco de Dados' }] };
    s.processos.p3 = { area: 'RH', processo: 'Folha' };
    s.processos.p4 = { area: 'Comercial', processo: 'Vender' };
    return s;
  };
  for (const perfis of [['ti'], ['operador_processos'], ['gestor']]) {
    await assert.rejects(() => pedirIA(comProcessos(perfis), { alvo: 'servico-processos', id: 's1' }, JSON.stringify({ processos: [] })), /não pode editar Serviços/, perfis[0]);
  }
  const resposta = JSON.stringify({ processos: [
    { id: 'p2', motivo: 'Concilia com os dados do Banco ERP' }, { id: 'p1', motivo: 'ja suporta' }, { id: 'inventado', motivo: 'x' }, { id: 'p2', motivo: 'repetido' },
  ] });
  const { r, g } = await pedirIA(comProcessos(['seguranca']), { alvo: 'servico-processos', id: 's1' }, resposta);
  assert.strictEqual(JSON.stringify(r.processos), JSON.stringify([{ id: 'p2', nome: 'Conciliar', area: 'Financeiro', motivo: 'Concilia com os dados do Banco ERP' }]));
  const { prompt, dados } = dadosDoPrompt(g, 'DADOS (JSON):');
  assert.match(prompt, /SUPORTA/);
  assert.deepStrictEqual(dados.catalogo.map((x) => x.id).sort(), ['p2', 'p3', 'p4'], 'sem o processo ja suportado');
  assert.deepStrictEqual(dados.catalogo.find((x) => x.id === 'p2').usaDependenciasDoServico, ['Banco ERP']);
  assert.strictEqual(dados.catalogo.find((x) => x.id === 'p3').areaConsumidora, true);
  assert.strictEqual(dados.catalogo.find((x) => x.id === 'p4').areaConsumidora, undefined);
  assert.deepStrictEqual(dados.servico.processosJaSuportados, ['Financeiro · Faturar']);
});
