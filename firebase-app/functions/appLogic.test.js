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

const seed = () => ({
  processos: { ti__backup: { area: 'TI', processo: 'Backup' } },
  tokens: {},
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
