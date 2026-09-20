// Testes das acoes autenticadas (node --test, mock de Firestore em memoria).
const { test } = require('node:test');
const assert = require('node:assert');
const { READ_ACTIONS, WRITE_ACTIONS, AppError, processoKey } = require('./appLogic');

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
  const r = await WRITE_ACTIONS.gerarLink(db, { tipo: 'drp', area: 'TI', processo: 'Backup', email: 'x@y.com' }, ctx());
  assert.ok(r.link.startsWith('https://bia-forte-2025.web.app/drp-componentes.html?token='));
  assert.strictEqual(r.enviadoPorEmail, undefined);
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

test('processoKey e igual a de tokenLogic e api.js', () => {
  assert.strictEqual(processoKey('Financeiro', 'Faturamento > Emissão de NFs'), 'financeiro__faturamento-emissao-de-nfs');
});

// --- Regressao: a pagina do PCN salvava direto no Apps Script, que foi
// fechado em 19/09. O erro que aparecia ao salvar era "Failed to fetch".
// Estas acoes substituem aquelas chamadas.
const { CAMPOS_EDITAVEIS_PCN } = require('./appLogic');

test('dadosPCN devolve o processo pedido com dependencias e componentes', async () => {
  const s = seed();
  s.dependencias = { d1: { nome: 'Fulano', categoria: 'Pessoa' } };
  s.componentes = { c1: { nome: 'SRV-01', tipo: 'Servidor' } };
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
  assert.strictEqual(r.dependencias.length, 1);
  assert.strictEqual(r.componentes.length, 1);
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
