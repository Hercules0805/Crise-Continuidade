// Cadastro de Processos (28/10/2026), camada de dados (api.js extraida com
// Firestore falso): leitura tolerante dos campos novos, limpeza na gravacao e
// o recorte de Continuidade (getProcessos) x cadastro geral (getProcessosCadastro).
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
const constante = (nome) => apiSrc.match(new RegExp(`const ${nome} = \\[[\\s\\S]*?\\];`))[0];

function ambiente(docs) {
  const store = { processos: JSON.parse(JSON.stringify(docs || {})) };
  const doc = (id) => ({
    get: async () => ({ exists: !!store.processos[id], data: () => store.processos[id] }),
    set: async (d) => { store.processos[id] = { ...(store.processos[id] || {}), ...d }; },
  });
  const ctx = {
    COLLECTION: { processos: 'processos' },
    window: { USER_EMAIL: 'OP@fortestecnologia.com.br' },
    firebase: { firestore: { FieldValue: { arrayUnion: (x) => ['arrayUnion', x] } } },
    _db: { collection: () => ({ doc, where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }) }) },
    _getAll: async () => Object.entries(store.processos).map(([id, d]) => ({ id, ...d })),
    _lerRespostasIndexadas: async () => ({}),
    _respostaDoProcesso: () => null,
  };
  vm.createContext(ctx);
  const src = [constante('_CATEGORIAS_PROCESSO'), constante('_CAMPOS_PROCESSO'),
    ...['_slug', '_processoKey', '_listaContatos', '_linksLidos', '_ehDeContinuidade', '_marcarTierManual', '_acharProcessoId', '_salvarProcesso', '_lerProcessos'].map(extrair)]
    .join('\n');
  vm.runInContext(src + '\nthis._salvarProcesso = _salvarProcesso; this._lerProcessos = _lerProcessos; this._ehDeContinuidade = _ehDeContinuidade;', ctx);
  return { ctx, store };
}

test('leitura tolerante: processo legado e de Continuidade e Processo de Negocio', async () => {
  const { ctx } = ambiente({
    ti__folha: { area: 'TI', processo: 'Folha' },
    rh__ponto: { area: 'RH', processo: 'Ponto', categoria: 'Departamental', continuidade: false, criadorId: 'ana',
      links: [{ titulo: 'Wiki', url: 'https://wiki' }, { titulo: 'ruim', url: 'javascript:alert(1)' }, null] },
    x__y: { area: 'X', processo: 'Y', categoria: 'Inventada' },
  });
  const ps = JSON.parse(JSON.stringify(await ctx._lerProcessos()));
  const por = (id) => ps.find((p) => p.id === id);
  assert.strictEqual(por('ti__folha').categoria, 'Processo de Negócio');
  assert.strictEqual(por('ti__folha').continuidade, true);
  assert.deepStrictEqual(por('ti__folha').links, []);
  assert.strictEqual(por('rh__ponto').continuidade, false);
  assert.strictEqual(por('rh__ponto').criadorId, 'ana');
  assert.deepStrictEqual(por('rh__ponto').links, [{ titulo: 'Wiki', url: 'https://wiki' }], 'so http(s)');
  assert.strictEqual(por('x__y').categoria, 'Processo de Negócio', 'categoria fora da lista vira a padrao');
});

test('recorte de Continuidade: getProcessos filtra continuidade false; getProcessosCadastro traz todos', async () => {
  const { ctx } = ambiente();
  assert.strictEqual(ctx._ehDeContinuidade({ continuidade: false }), false);
  assert.strictEqual(ctx._ehDeContinuidade({ continuidade: true }), true);
  assert.strictEqual(ctx._ehDeContinuidade({}), true, 'legado');
  assert.match(apiSrc, /getProcessos: \(\) => API\.get\('getProcessos'\)\.then\(\(ps\) => ps\.filter\(_ehDeContinuidade\)\)/);
  assert.match(apiSrc, /getProcessosPorArea: \(area\) => API\.get\('getProcessosPorArea', \{ area \}\)\.then\(\(ps\) => ps\.filter\(_ehDeContinuidade\)\)/);
  assert.match(apiSrc, /getProcessosCadastro: \(\) => API\.get\('getProcessos'\),/, 'mesmo cache: invalidar getProcessos vale para as duas');
});

test('gravar processo novo: campos do cadastro, links limpos, criadoEm/criadoPor', async () => {
  const { ctx, store } = ambiente();
  const r = await ctx._salvarProcesso({
    area: 'RH', processo: 'Admissão', categoria: 'Intersetorial', criadorId: 'bruno', aprovadorId: 'ana', continuidade: false,
    links: [{ titulo: ' Proc ', url: ' https://wiki/a ' }, { titulo: 'x', url: 'ftp://nao' }],
  });
  assert.strictEqual(r.id, 'rh__admissao');
  const d = store.processos.rh__admissao;
  assert.strictEqual(d.categoria, 'Intersetorial');
  assert.strictEqual(d.continuidade, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.links)), [{ titulo: 'Proc', url: 'https://wiki/a' }]);
  assert.strictEqual(d.criadoPor, 'op@fortestecnologia.com.br');
  assert.strictEqual(d.criadoEm, d.atualizadoEm);
});

test('editar processo existente nao reescreve criadoEm; categoria invalida e recusada', async () => {
  const { ctx, store } = ambiente({ ti__folha: { area: 'TI', processo: 'Folha', criadoEm: '2026-01-01', criadoPor: 'antigo@x' } });
  await ctx._salvarProcesso({ id: 'ti__folha', continuidade: true });
  assert.strictEqual(store.processos.ti__folha.criadoEm, '2026-01-01');
  assert.strictEqual(store.processos.ti__folha.criadoPor, 'antigo@x');
  await assert.rejects(() => ctx._salvarProcesso({ id: 'ti__folha', categoria: 'Outra' }), /Categoria/);
});
