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
const constante = (nome) => apiSrc.match(new RegExp(`const ${nome} = [^;]*;`))[0];

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
  const src = [constante('_CAMPOS_PROCESSO'), constante('CATEGORIA_PROCESSO_PADRAO'), constante('_ID_CATEGORIA_LEGADA'),
    ...['_slug', '_processoKey', '_nomeComparavel', '_categoriaIdDoProcesso', '_listaContatos', '_linksLidos', '_ehDeContinuidade', '_marcarTierManual', '_acharProcessoId', '_salvarProcesso', '_lerProcessos'].map(extrair)]
    .join('\n');
  vm.runInContext(src + '\nthis._salvarProcesso = _salvarProcesso; this._lerProcessos = _lerProcessos; this._ehDeContinuidade = _ehDeContinuidade;', ctx);
  return { ctx, store };
}

test('leitura tolerante: processo legado e de Continuidade e Processo de Negocio', async () => {
  const { ctx } = ambiente({
    ti__folha: { area: 'TI', processo: 'Folha' },
    rh__ponto: { area: 'RH', processo: 'Ponto', categoriaId: 'nova-cat', categoria: 'Departamental', continuidade: false, criadorId: 'ana',
      links: [{ titulo: 'Wiki', url: 'https://wiki' }, { titulo: 'ruim', url: 'javascript:alert(1)' }, null] },
    x__y: { area: 'X', processo: 'Y', categoria: 'Inventada' },
    rh__adm: { area: 'RH', processo: 'Adm', categoria: 'intersetorial' },
  });
  const ps = JSON.parse(JSON.stringify(await ctx._lerProcessos()));
  const por = (id) => ps.find((p) => p.id === id);
  // Categoria pelo id (29/10/2026): o gravado vence; nome antigo vira o id fixo; sem nada, o padrao.
  assert.strictEqual(por('ti__folha').categoriaId, 'processo-de-negocio');
  assert.strictEqual(por('rh__ponto').categoriaId, 'nova-cat');
  assert.strictEqual(por('rh__adm').categoriaId, 'intersetorial');
  assert.ok(!('categoria' in por('ti__folha')), 'o nome antigo nao e mais exposto');
  assert.strictEqual(por('ti__folha').continuidade, true);
  assert.deepStrictEqual(por('ti__folha').links, []);
  assert.strictEqual(por('rh__ponto').continuidade, false);
  assert.strictEqual(por('rh__ponto').criadorId, 'ana');
  assert.deepStrictEqual(por('rh__ponto').links, [{ titulo: 'Wiki', url: 'https://wiki' }], 'so http(s)');
  assert.strictEqual(por('x__y').categoriaId, 'processo-de-negocio', 'nome desconhecido cai no padrao');
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
    area: 'RH', processo: 'Admissão', categoriaId: 'intersetorial', criadorId: 'bruno', aprovadorId: 'ana', continuidade: false,
    links: [{ titulo: ' Proc ', url: ' https://wiki/a ' }, { titulo: 'x', url: 'ftp://nao' }],
  });
  assert.strictEqual(r.id, 'rh__admissao');
  const d = store.processos.rh__admissao;
  assert.strictEqual(d.categoriaId, 'intersetorial');
  assert.strictEqual(d.continuidade, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.links)), [{ titulo: 'Proc', url: 'https://wiki/a' }]);
  assert.strictEqual(d.criadoPor, 'op@fortestecnologia.com.br');
  assert.strictEqual(d.criadoEm, d.atualizadoEm);
});

test('editar processo existente nao reescreve criadoEm; categoria vazia e recusada', async () => {
  const { ctx, store } = ambiente({ ti__folha: { area: 'TI', processo: 'Folha', criadoEm: '2026-01-01', criadoPor: 'antigo@x' } });
  await ctx._salvarProcesso({ id: 'ti__folha', continuidade: true });
  assert.strictEqual(store.processos.ti__folha.criadoEm, '2026-01-01');
  assert.strictEqual(store.processos.ti__folha.criadoPor, 'antigo@x');
  await assert.rejects(() => ctx._salvarProcesso({ id: 'ti__folha', categoriaId: '' }), /categoria/);
});

// Categorias de Processo (29/10/2026): mesmo leitor/gravador das listas de Contrato, com os 3 textos.
test('categorias: grava finalidade, criterios e exemplos; nome repetido (sem caixa/acento) e recusado', async () => {
  const store = { categorias_processo: { 'processo-de-negocio': { nome: 'Processo de Negócio', ordem: 3 } } };
  const ctx = {
    window: { USER_EMAIL: 'op@x' },
    _getAll: async (col) => Object.entries(store[col] || {}).map(([id, d]) => ({ id, ...d })),
    _db: { collection: (col) => ({
      add: async (d) => { store[col]['n1'] = d; return { id: 'n1' }; },
      doc: (id) => ({ set: async (d) => { store[col][id] = { ...store[col][id], ...d }; } }),
    }) },
  };
  vm.createContext(ctx);
  vm.runInContext([constante('CAMPOS_CATEGORIA_PROCESSO'), ...['_nomeComparavel', '_lerListaContrato', '_salvarListaContrato'].map(extrair)].join('\n')
    + '\nthis.ler = () => _lerListaContrato("categorias_processo", CAMPOS_CATEGORIA_PROCESSO); this.salvar = (c) => _salvarListaContrato("categorias_processo", CAMPOS_CATEGORIA_PROCESSO, c);', ctx);
  await ctx.salvar({ nome: ' Estratégico ', finalidade: 'F', criteriosIdentificacao: 'C', exemplos: 'E', ativo: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify((await ctx.ler()).find((c) => c.id === 'n1'))), {
    id: 'n1', nome: 'Estratégico', ativo: true, ordem: store.categorias_processo.n1.ordem, criadoEm: store.categorias_processo.n1.criadoEm,
    atualizadoEm: store.categorias_processo.n1.atualizadoEm, finalidade: 'F', criteriosIdentificacao: 'C', exemplos: 'E',
  });
  await assert.rejects(() => ctx.salvar({ nome: 'processo de negocio' }), /Já existe/);
});
