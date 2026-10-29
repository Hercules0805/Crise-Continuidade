// Autoria da gravacao do risco (22/10/2026): o aviso por e-mail separa o que
// uma pessoa fez (e-mail na hora) do que a automacao fez (resumo diario).
// _salvarRisco do api.js real, com Firestore falso.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'api.js'), 'utf8');

function extrair(re) {
  const ini = apiSrc.search(re);
  assert.ok(ini >= 0, 'nao encontrado: ' + re);
  const abre = apiSrc[apiSrc.indexOf('[', ini)] === '[' && /const _CAMPOS/.test(apiSrc.slice(ini, ini + 20)) ? '[' : '{';
  const fecha = abre === '[' ? ']' : '}';
  let i = apiSrc.indexOf(abre, abre === '{' ? apiSrc.indexOf(')', ini) : ini);
  let prof = 0;
  for (; i < apiSrc.length; i++) {
    if (apiSrc[i] === abre) prof++;
    else if (apiSrc[i] === fecha && --prof === 0) break;
  }
  return apiSrc.slice(ini, i + 1);
}

function ambiente() {
  const store = {};
  let seq = 0;
  const ctx = {
    COLLECTION: { riscos: 'riscos' },
    window: { USER_EMAIL: 'Ana@fortestecnologia.com.br' },
    Subareas: require('../public/subareas.js'),
    _db: { collection: () => ({
      doc: (id) => ({ set: async (data) => { store[id] = Object.assign(store[id] || {}, data); } }),
      add: async (data) => { const id = 'r' + (++seq); store[id] = data; return { id }; },
    }) },
  };
  vm.createContext(ctx);
  vm.runInContext(extrair(/const _CAMPOS_RISCO = \[/) + ';\n' + extrair(/async function _salvarRisco\(/) + '\nthis._salvarRisco = _salvarRisco;', ctx);
  return { ctx, store };
}

test('pessoa: criar e editar gravam atualizadoPor com o e-mail; nada de marca de automacao', async () => {
  const { ctx, store } = ambiente();
  const { id } = await ctx._salvarRisco({ titulo: 'X', status: 'Identificado' });
  assert.strictEqual(store[id].atualizadoPor, 'ana@fortestecnologia.com.br');
  assert.strictEqual(store[id].criadoPor, 'ana@fortestecnologia.com.br');
  assert.strictEqual(store[id].criadoPelaAutomacao, undefined);
  await ctx._salvarRisco({ id, status: 'Encerrado' });
  assert.strictEqual(store[id].atualizadoPor, 'ana@fortestecnologia.com.br');
});

test('automacao (indicador): cria com criadoPelaAutomacao e encerra com atualizadoPor automacao:indicador', async () => {
  const { ctx, store } = ambiente();
  const { id } = await ctx._salvarRisco({ titulo: 'Desvio', automacao: 'indicador' });
  assert.strictEqual(store[id].criadoPelaAutomacao, true);
  assert.strictEqual(store[id].atualizadoPor, 'automacao:indicador');
  assert.strictEqual(store[id].automacao, undefined, 'o parametro nao vira campo do risco');
  await ctx._salvarRisco({ id, status: 'Encerrado', automacao: 'indicador' });
  assert.strictEqual(store[id].atualizadoPor, 'automacao:indicador');
});
