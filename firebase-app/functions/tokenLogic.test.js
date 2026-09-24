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

test('salvarDependenciasBIA cria catálogo, vincula por id e atualiza processo', async () => {
  const seed = baseSeed();
  seed.tokens['b1'] = { token: 'b1', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  const res = await WRITE_ACTIONS.salvarDependenciasBIA(db, {
    token: 'b1',
    fornecedores: JSON.stringify([{ nome: 'AWS', id: null }]),
    sistemas: JSON.stringify([{ nome: 'ERP', id: null }]),
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

  // dependenciaItens carrega o id real do catalogo recem-criado, nao so o nome.
  assert.strictEqual(proc.dependenciaItens.length, 2);
  const aws = proc.dependenciaItens.find((it) => it.nome === 'AWS');
  assert.strictEqual(aws.categoria, 'Fornecedores');
  assert.ok(aws.id, 'AWS deveria ter ganhado um id real do catalogo');
  assert.strictEqual(db._store.dependencias[aws.id].nome, 'AWS');
});

test('salvarDependenciasBIA reaproveita id de item ja escolhido, sem criar duplicata', async () => {
  const seed = baseSeed();
  seed.dependencias['dep-aws'] = { categoria: 'Fornecedores', nome: 'AWS' };
  seed.tokens['b2'] = { token: 'b2', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarDependenciasBIA(db, {
    token: 'b2',
    fornecedores: JSON.stringify([{ nome: 'AWS', id: 'dep-aws' }]),
  });

  assert.strictEqual(Object.keys(db._store.dependencias).length, 1, 'nao deveria ter criado uma segunda entrada pra AWS');
  const proc = db._store.processos['ti__backup'];
  assert.strictEqual(proc.dependenciaItens[0].id, 'dep-aws');
});

test('salvarDependenciasBIA: Processos Internos nunca cria entrada no catálogo, mesmo sem id', async () => {
  const seed = baseSeed();
  seed.tokens['b3'] = { token: 'b3', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarDependenciasBIA(db, {
    token: 'b3',
    processos: JSON.stringify([{ nome: 'Processo Fantasma', id: null }]),
  });

  assert.strictEqual(Object.keys(db._store.dependencias).length, 0, 'nao deveria ter criado nada no catalogo de dependencias');
  const proc = db._store.processos['ti__backup'];
  const item = proc.dependenciaItens.find((it) => it.nome === 'Processo Fantasma');
  assert.strictEqual(item.id, null, 'sem processo real correspondente, fica sem vinculo -- nunca vira entrada solta');
});

test('validarTokenBIA exige prefixo _BIA_', async () => {
  const seed = baseSeed();
  seed.tokens['x'] = { token: 'x', area: 'TI', processo: 'Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);
  await assert.rejects(() => READ_ACTIONS.validarTokenBIA(db, 'x'), /inválido/);
});

test('validarTokenBIA devolve catalogo com id por item e a lista real de processos', async () => {
  const seed = baseSeed();
  seed.dependencias['dep-aws'] = { categoria: 'Fornecedores', nome: 'AWS' };
  seed.processos.rh__folha = { area: 'RH', processo: 'Folha' };
  seed.tokens['b4'] = { token: 'b4', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  const res = await READ_ACTIONS.validarTokenBIA(db, 'b4');
  assert.deepStrictEqual(res.catalogo.fornecedores, [{ id: 'dep-aws', nome: 'AWS' }]);
  // O proprio processo (Backup) fica de fora da lista de processos disponiveis.
  assert.strictEqual(res.catalogo.processos.length, 1);
  assert.strictEqual(res.catalogo.processos[0].nome, 'Folha');
  assert.deepStrictEqual(res.dependenciaItens, []);
});

test('validarTokenBIA devolve dependenciaItens ja gravados no processo', async () => {
  const seed = baseSeed();
  seed.processos.ti__backup.dependenciaItens = [{ categoria: 'Fornecedores', nome: 'AWS', id: 'dep-aws' }];
  seed.tokens['b5'] = { token: 'b5', area: 'TI', processo: '_BIA_Backup', usado: false, expiraEm: '2999-01-01' };
  const db = makeDb(seed);

  const res = await READ_ACTIONS.validarTokenBIA(db, 'b5');
  assert.deepStrictEqual(res.dependenciaItens, [{ categoria: 'Fornecedores', nome: 'AWS', id: 'dep-aws' }]);
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

// --- Regressao: a avaliacao apagava o RTO escolhido pelo gestor ---
// 11 processos tinham RTO que o calculo nunca produziria. Cada nova avaliacao
// sobrescrevia essa escolha pelo valor derivado do tier.
test('avaliacao por link NAO sobrescreve RTO ja definido pelo gestor', async () => {
  const seed = baseSeed();
  seed.processos.ti__backup.rto = '< 1 hora'; // escolha manual, fora da escala derivada
  seed.tokens.tk9 = { area: 'TI', processo: 'Backup', usado: false };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarRespostasToken(db, { token: 'tk9', scores: JSON.stringify({ 'Q1?': 4, 'Q2?': 4 }) });

  assert.strictEqual(db._store.processos.ti__backup.rto, '< 1 hora', 'a escolha do gestor foi apagada');
  assert.strictEqual(db._store.processos.ti__backup.tier, 'Tier 2 (Essencial)', 'o tier deve ser recalculado normalmente');
});

test('avaliacao por link preenche o RTO quando ele esta vazio', async () => {
  const seed = baseSeed();
  seed.tokens.tk10 = { area: 'TI', processo: 'Backup', usado: false };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarRespostasToken(db, { token: 'tk10', scores: JSON.stringify({ 'Q1?': 4, 'Q2?': 4 }) });

  const p = db._store.processos.ti__backup;
  assert.strictEqual(p.rto, '8h a 24h');
  assert.strictEqual(p.rtoOrigem, 'sugerido', 'fica marcado que veio do sistema, nao do gestor');
});

// --- Versao da regua de pesos (Fase 1) ---
// Sem o carimbo, mudar os pesos reescreve o significado de todo o historico:
// a curva do risco sobe porque a regua mudou, nao porque o risco mudou.
test('resposta por link carimba a versão da régua vigente', async () => {
  const seed = baseSeed();
  seed.config_regua = { atual: { versao: 7 } };
  seed.tokens.tkR = { area: 'TI', processo: 'Backup', usado: false };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarRespostasToken(db, { token: 'tkR', scores: JSON.stringify({ 'Q1?': 4 }) });

  const gravadas = Object.values(db._store.respostas_bia);
  assert.strictEqual(gravadas.length, 1);
  assert.strictEqual(gravadas[0].reguaVersao, 7);
});

test('sem régua registrada, a resposta fica na versão 1 em vez de falhar', async () => {
  const seed = baseSeed();
  seed.tokens.tkR2 = { area: 'TI', processo: 'Backup', usado: false };
  const db = makeDb(seed);

  await WRITE_ACTIONS.salvarRespostasToken(db, { token: 'tkR2', scores: JSON.stringify({ 'Q1?': 2 }) });

  assert.strictEqual(Object.values(db._store.respostas_bia)[0].reguaVersao, 1);
});
