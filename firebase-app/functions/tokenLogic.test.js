// Testes da lógica de token (node --test). Usa um mock de Firestore em memória,
// então roda sem emulador/Java.
const { test } = require('node:test');
const assert = require('node:assert');
const {
  READ_ACTIONS,
  WRITE_ACTIONS,
  TokenError,
  processoKey,
} = require('./tokenLogic');

const { validarToken } = READ_ACTIONS;

// ---- Mock mínimo de Firestore ----
function makeDb(seed) {
  // seed: { collectionName: { docId: data } }
  const store = JSON.parse(JSON.stringify(seed || {}));
  let autoId = 0;

  function docRef(col, id) {
    return {
      id,
      async get() {
        const data = store[col] && store[col][id];
        return {
          exists: data !== undefined,
          id,
          data: () => data,
          ref: docRef(col, id),
        };
      },
      async set(patch, opts) {
        store[col] = store[col] || {};
        if (opts && opts.merge && store[col][id]) {
          store[col][id] = { ...store[col][id], ...patch };
        } else {
          store[col][id] = { ...patch };
        }
      },
      async delete() {
        if (store[col]) delete store[col][id];
      },
    };
  }

  function collection(col) {
    const filters = [];
    let lim = Infinity;
    const api = {
      doc: (id) => docRef(col, id),
      async add(data) {
        const id = '_auto_' + ++autoId;
        store[col] = store[col] || {};
        store[col][id] = { ...data };
        return docRef(col, id);
      },
      where(field, _op, value) {
        filters.push([field, value]);
        return api;
      },
      limit(n) {
        lim = n;
        return api;
      },
      async get() {
        const entries = Object.entries(store[col] || {});
        let docs = entries
          .filter(([, data]) => filters.every(([f, v]) => data[f] === v))
          .map(([id, data]) => ({ id, data: () => data, exists: true, ref: docRef(col, id) }));
        if (lim !== Infinity) docs = docs.slice(0, lim);
        return { empty: docs.length === 0, docs };
      },
    };
    return api;
  }

  return { collection, _store: store };
}

function baseSeed() {
  return {
    perguntas: {
      p1: { pergunta: 'Q1?', ativa: true, ordem: 1 },
      p2: { pergunta: 'Q2?', ativa: true, ordem: 2 },
    },
    areas: { 'area-ti': { nome: 'TI', responsavel: 'Fulano', email: 'ti@x.com' } },
    processos: { ti__backup: { area: 'TI', processo: 'Backup', dependencia: '' } },
    dependencias: {},
    componentes: {},
    respostas_bia: {},
    tokens: {},
  };
}

test('validarToken rejeita token inexistente', async () => {
  const db = makeDb(baseSeed());
  await assert.rejects(() => validarToken(db, 'nao-existe'), TokenError);
});

test('validarToken rejeita token usado', async () => {
  const seed = baseSeed();
  seed.tokens['tk1'] = { token: 'tk1', area: 'TI', processo: 'Backup', usado: true, expiraEm: '2999-01-01' };
  const db = makeDb(seed);
  await assert.rejects(() => validarToken(db, 'tk1'), /já foi utilizado/);
});

test('validarToken rejeita token expirado', async () => {
  const seed = baseSeed();
  seed.tokens['tk1'] = { token: 'tk1', area: 'TI', processo: 'Backup', usado: false, expiraEm: '2000-01-01' };
  const db = makeDb(seed);
  await assert.rejects(() => validarToken(db, 'tk1'), /expirou/);
});

test('salvarRespostasToken grava resposta, tier e marca usado', async () => {
  const seed = baseSeed();
  seed.tokens['tk1'] = { token: 'tk1', area: 'TI', processo: 'Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  const res = await WRITE_ACTIONS.salvarRespostasToken(db, {
    token: 'tk1',
    nome: 'Zé',
    scores: JSON.stringify({ 'Q1?': 8, 'Q2?': 4 }),
  });
  assert.strictEqual(res.success, true);

  // resposta gravada com score 12 -> Tier 1
  const respostas = Object.values(db._store.respostas_bia);
  assert.strictEqual(respostas.length, 1);
  assert.strictEqual(respostas[0].score, 12);
  assert.strictEqual(respostas[0].tier, 'Tier 1 (Crítico)');
  // processo atualizado
  assert.strictEqual(db._store.processos['ti__backup'].tier, 'Tier 1 (Crítico)');
  // token marcado usado
  assert.strictEqual(db._store.tokens['tk1'].usado, true);

  // segundo uso do mesmo token é rejeitado
  await assert.rejects(() => WRITE_ACTIONS.salvarRespostasToken(db, { token: 'tk1', scores: '{}' }), /já foi utilizado/);
});

test('salvarDependenciasBIA cria catálogo e atualiza processo', async () => {
  const seed = baseSeed();
  seed.tokens['b1'] = { token: 'b1', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  const res = await WRITE_ACTIONS.salvarDependenciasBIA(db, {
    token: 'b1',
    fornecedores: JSON.stringify(['AWS']),
    sistemas: JSON.stringify(['ERP']),
    impacto: 'Parada total',
    rto: '2h',
  });
  assert.strictEqual(res.success, true);

  const deps = Object.values(db._store.dependencias).map((d) => d.nome).sort();
  assert.deepStrictEqual(deps, ['AWS', 'ERP']);
  const proc = db._store.processos['ti__backup'];
  assert.ok(proc.dependencia.includes('AWS'));
  assert.strictEqual(proc.descricao, 'Parada total');
  assert.strictEqual(proc.rto, '2h');
  assert.strictEqual(db._store.tokens['b1'].usado, true);
});

test('validarTokenBIA exige prefixo _BIA_', async () => {
  const seed = baseSeed();
  seed.tokens['x'] = { token: 'x', area: 'TI', processo: 'Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);
  await assert.rejects(() => READ_ACTIONS.validarTokenBIA(db, 'x'), /inválido/);
});

test('salvarComponentesDRP grava drpComponentes no processo', async () => {
  const seed = baseSeed();
  seed.tokens['d1'] = { token: 'd1', area: 'TI', processo: '_DRP_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);
  const res = await WRITE_ACTIONS.salvarComponentesDRP(db, { token: 'd1', componentes: JSON.stringify(['comp-1']) });
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(db._store.processos['ti__backup'].drpComponentes, ['comp-1']);
  assert.strictEqual(db._store.tokens['d1'].usado, true);
});

test('processoKey estável', () => {
  assert.strictEqual(processoKey('TI', 'Backup'), 'ti__backup');
});

// --- Regressao: o token de area nao pode gravar fora da propria area ---
// Um link _AREA_ da area TI recebia `area` e `processo` do corpo da requisicao
// e gravava onde mandassem, reescrevendo o tier de qualquer processo da empresa.
test('salvarRespostasArea ignora processo de outra area', async () => {
  const seed = baseSeed();
  seed.processos.rh__folha = { area: 'RH', processo: 'Folha' };
  seed.tokens['tok-area'] = { area: 'TI', processo: '_AREA_', usado: false };
  const db = makeDb(seed);

  const res = await WRITE_ACTIONS.salvarRespostasArea(db, {
    token: 'tok-area',
    nome: 'Fulano',
    respostas: [{ area: 'RH', processo: 'Folha', scores: { 'Q1?': 4, 'Q2?': 4 } }],
  });

  assert.strictEqual(res.total, 0);
  assert.strictEqual(res.ignorados, 1);
  assert.strictEqual(Object.keys(db._store.respostas_bia).length, 0);
  // O processo de RH nao pode ter recebido tier nenhum.
  assert.strictEqual(db._store.processos.rh__folha.tier, undefined);
  // Envio integralmente recusado nao queima o token.
  assert.strictEqual(db._store.tokens['tok-area'].usado, false);
});

test('salvarRespostasArea grava na area do token e ignora a area enviada', async () => {
  const seed = baseSeed();
  seed.processos.rh__folha = { area: 'RH', processo: 'Folha' };
  seed.tokens['tok-area'] = { area: 'TI', processo: '_AREA_', usado: false };
  const db = makeDb(seed);

  // O corpo mente a area, mas nomeia um processo que existe em TI.
  const res = await WRITE_ACTIONS.salvarRespostasArea(db, {
    token: 'tok-area',
    nome: 'Fulano',
    respostas: [{ area: 'RH', processo: 'Backup', scores: { 'Q1?': 4, 'Q2?': 4 } }],
  });

  assert.strictEqual(res.total, 1);
  const gravadas = Object.values(db._store.respostas_bia);
  assert.strictEqual(gravadas.length, 1);
  assert.strictEqual(gravadas[0].area, 'TI');
  assert.strictEqual(gravadas[0].processo, 'Backup');
  assert.strictEqual(db._store.processos.ti__backup.tier, 'Tier 2 (Essencial)'); // 4 + 4 = 8
  assert.strictEqual(db._store.tokens['tok-area'].usado, true);
});
