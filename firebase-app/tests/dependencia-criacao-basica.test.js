// "+ Criar" da aba Dependencias do processo (28/10/2026): _criarDependenciaBasica
// grava so o cadastro basico (o que a regra aceita do Operador de Processos) e
// devolve o existente quando ja ha um igual. api.js extraida com Firestore falso.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUB = path.join(__dirname, '..', 'public');
const apiSrc = fs.readFileSync(path.join(PUB, 'api.js'), 'utf8');

function extrair(nome) {
  const ini = apiSrc.search(new RegExp(`(async )?function ${nome}\\(`));
  assert.ok(ini >= 0, 'funcao nao encontrada: ' + nome);
  let i = apiSrc.indexOf('{', apiSrc.indexOf(')', ini));
  let prof = 0;
  for (; i < apiSrc.length; i++) {
    if (apiSrc[i] === '{') prof++;
    else if (apiSrc[i] === '}' && --prof === 0) break;
  }
  return apiSrc.slice(ini, i + 1);
}

function ambiente(docsIniciais) {
  const store = JSON.parse(JSON.stringify(docsIniciais || {}));
  let seq = 0;
  const col = (nome) => ({
    where: (campo, _op, valor) => ({
      get: async () => ({ docs: Object.entries(store[nome] || {}).filter(([, d]) => d[campo] === valor).map(([id, d]) => ({ id, data: () => d })) }),
    }),
    add: async (data) => { const id = 'novo' + (++seq); store[nome] = store[nome] || {}; store[nome][id] = data; return { id }; },
  });
  const ctx = { COLLECTION: { dependencias: 'dependencias' }, window: { USER_EMAIL: 'OP@fortestecnologia.com.br' }, _db: { collection: col } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'dependencia-duplicidade.js'), 'utf8'), ctx);
  vm.runInContext(extrair('_criarDependenciaBasica') + '\nthis._criarDependenciaBasica = _criarDependenciaBasica;', ctx);
  return { ctx, store };
}

test('grava so categoria, nome, criadoEm e criadoPor', async () => {
  const { ctx, store } = ambiente();
  const r = await ctx._criarDependenciaBasica({ categoria: 'Pessoas', nome: '  Zélia Nova ', perfis: ['admin'], drpSalvo: 'x' });
  assert.strictEqual(r.success, true);
  const doc = store.dependencias[r.id];
  assert.deepStrictEqual(Object.keys(doc).sort(), ['categoria', 'criadoEm', 'criadoPor', 'nome']);
  assert.strictEqual(doc.nome, 'Zélia Nova');
  assert.strictEqual(doc.criadoPor, 'op@fortestecnologia.com.br');
});

test('ja existe um igual na categoria: nao grava e devolve o existente', async () => {
  const { ctx, store } = ambiente({ dependencias: { f1: { categoria: 'Fornecedores', nome: 'Alfa Ltda' } } });
  const r = await ctx._criarDependenciaBasica({ categoria: 'Fornecedores', nome: 'alfa  ltda' });
  assert.strictEqual(r.duplicado, true);
  assert.strictEqual(r.id, 'f1');
  assert.strictEqual(Object.keys(store.dependencias).length, 1);
});

test('Pessoa homonima nao e duplicata (a regra de Pessoas e pelo e-mail)', async () => {
  const { ctx, store } = ambiente({ dependencias: { p1: { categoria: 'Pessoas', nome: 'Zélia Nova', email: 'zelia@fortestecnologia.com.br' } } });
  const r = await ctx._criarDependenciaBasica({ categoria: 'Pessoas', nome: 'Zélia Nova' });
  assert.ok(!r.duplicado);
  assert.strictEqual(Object.keys(store.dependencias).length, 2);
});

test('mesmo nome em outra categoria nao e duplicata', async () => {
  const { ctx, store } = ambiente({ dependencias: { p1: { categoria: 'Pessoas', nome: 'Sede' } } });
  const r = await ctx._criarDependenciaBasica({ categoria: 'Instalações', nome: 'Sede' });
  assert.ok(!r.duplicado);
  assert.strictEqual(Object.keys(store.dependencias).length, 2);
});

test('sem nome ou categoria: recusa', async () => {
  const { ctx } = ambiente();
  await assert.rejects(() => ctx._criarDependenciaBasica({ categoria: 'Pessoas', nome: '  ' }));
  await assert.rejects(() => ctx._criarDependenciaBasica({ nome: 'X' }));
});
