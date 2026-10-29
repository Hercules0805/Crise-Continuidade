// Motivacao da nota do Questionario do BIA (29/10/2026), camada de dados
// (api.js extraida com Firestore falso): salvarRespostas grava so a motivacao
// de pergunta ativa e respondida, curta; a leitura devolve o que foi gravado.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'api.js'), 'utf8');

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

function ambiente(respostasGravadas) {
  const gravadas = [];
  const ctx = {
    COLLECTION: { respostas: 'respostas_bia', processos: 'processos' },
    window: { USER_EMAIL: 'ana@fortestecnologia.com.br' },
    _lerPerguntas: async () => [
      { pergunta: 'Afeta clientes?', ativa: true }, { pergunta: 'Multa?', ativa: true }, { pergunta: 'Velha?', ativa: false },
    ],
    _versaoReguaAtual: async () => 1,
    _calcularTier: () => 'Tier 2',
    _calcularRTO: () => '24 horas',
    _acharProcessoId: async () => null,
    _getAll: async () => respostasGravadas || [],
    _db: { collection: () => ({ add: async (d) => { gravadas.push(d); return { id: 'r' }; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(['_salvarRespostas', '_lerRespostasIndexadas'].map(extrair).join('\n')
    + '\nthis._salvarRespostas = _salvarRespostas; this._lerRespostasIndexadas = _lerRespostasIndexadas;', ctx);
  return { ctx, gravadas };
}

test('salvarRespostas: motivacao so de pergunta ativa e respondida, cortada em 200; justificativasIA filtrada', async () => {
  const { ctx, gravadas } = ambiente();
  await ctx._salvarRespostas({
    area: 'TI', processo: 'Backup', processoId: 'p1',
    scores: { 'Afeta clientes?': 4 },
    justificativas: { 'Afeta clientes?': '  ' + 'x'.repeat(250), 'Multa?': 'sem nota', 'Velha?': 'inativa', 'Inventada?': 'y' },
    justificativasIA: ['Afeta clientes?', 'Multa?'],
  });
  const g = JSON.parse(JSON.stringify(gravadas[0]));
  assert.deepStrictEqual(Object.keys(g.justificativas), ['Afeta clientes?']);
  assert.strictEqual(g.justificativas['Afeta clientes?'].length, 200);
  assert.deepStrictEqual(g.justificativasIA, ['Afeta clientes?']);
});

test('salvarRespostas sem motivacao nao grava os campos; leitura devolve vazio no legado', async () => {
  const { ctx, gravadas } = ambiente();
  await ctx._salvarRespostas({ area: 'TI', processo: 'Backup', scores: { 'Multa?': 1 } });
  assert.ok(!('justificativas' in gravadas[0]) && !('justificativasIA' in gravadas[0]));

  const leitura = ambiente([
    { area: 'TI', processo: 'Backup', processoId: 'p1', timestamp: '2026-10-02', scores: { 'Multa?': 1 }, justificativas: { 'Multa?': 'Sem multa' }, justificativasIA: ['Multa?'] },
    { area: 'RH', processo: 'Folha', timestamp: '2026-10-01', scores: {} },
  ]);
  const { porId, porChave } = JSON.parse(JSON.stringify(await leitura.ctx._lerRespostasIndexadas()));
  assert.deepStrictEqual(porId.p1.justificativas, { 'Multa?': 'Sem multa' });
  assert.deepStrictEqual(porId.p1.justificativasIA, ['Multa?']);
  assert.deepStrictEqual(porChave['RH||Folha'].justificativas, {});
  assert.deepStrictEqual(porChave['RH||Folha'].justificativasIA, []);
});
