// Testes do livro de medicoes (node --test).
const { test } = require('node:test');
const assert = require('node:assert');
const { medicaoDeRespostaBia, idDaMedicao, FONTE, ESCALA } = require('./medicoes');

const respostaOk = () => ({
  area: 'TI',
  processo: 'Backup',
  score: 14,
  tier: 'Tier 1 (Crítico)',
  timestamp: '2026-05-06T17:48:14.000Z',
  respondente: 'fulano@fortestecnologia.com.br',
  reguaVersao: 3,
});

test('resposta de BIA vira uma medição com os campos do livro', () => {
  const m = medicaoDeRespostaBia('resp-1', respostaOk());
  assert.strictEqual(m.sujeitoTipo, 'processo');
  assert.strictEqual(m.sujeitoId, 'TI||Backup');
  assert.strictEqual(m.area, 'TI');
  assert.strictEqual(m.fonte, FONTE.BIA);
  assert.strictEqual(m.escala, ESCALA.SCORE_BIA);
  assert.strictEqual(m.valor, 14);
  assert.strictEqual(m.coletadoEm, '2026-05-06T17:48:14.000Z');
  assert.strictEqual(m.origemId, 'resp-1');
});

// Sem isso, mudar os pesos reescreve o significado de toda a curva em silêncio.
test('a medição carrega a versão da régua que a pontuou', () => {
  assert.strictEqual(medicaoDeRespostaBia('r', respostaOk()).reguaVersao, 3);
  const semRegua = { ...respostaOk(), reguaVersao: undefined };
  assert.strictEqual(medicaoDeRespostaBia('r', semRegua).reguaVersao, 1, 'sem régua registrada, versão 1');
});

test('a classificação fica congelada no momento da medição', () => {
  // Se a regra de tier mudar depois, o ponto antigo continua dizendo o que
  // valia quando foi medido.
  assert.strictEqual(medicaoDeRespostaBia('r', respostaOk()).classificacao, 'Tier 1 (Crítico)');
});

test('validade do BIA é de um ano a partir da coleta', () => {
  const m = medicaoDeRespostaBia('r', respostaOk());
  const dias = Math.round((new Date(m.validoAte) - new Date(m.coletadoEm)) / 86400000);
  assert.strictEqual(dias, 365);
});

// Melhor não registrar do que registrar um ponto que a curva não sabe posicionar.
test('resposta sem data, sem score ou sem processo não vira medição', () => {
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), timestamp: null }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), timestamp: 'nao-e-data' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), score: undefined }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), score: 'abc' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), processo: '' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', { ...respostaOk(), area: '  ' }), null);
  assert.strictEqual(medicaoDeRespostaBia('r', null), null);
});

test('score zero é medição válida — diferente de não ter score', () => {
  const m = medicaoDeRespostaBia('r', { ...respostaOk(), score: 0 });
  assert.ok(m, 'score 0 é um valor medido, não ausência de valor');
  assert.strictEqual(m.valor, 0);
});

// A chave estavel e o que impede a mesma resposta virar dois pontos na curva
// se o gatilho rodar de novo — Cloud Functions nao garante execucao unica.
test('a mesma resposta sempre gera o mesmo id de medição', () => {
  assert.strictEqual(idDaMedicao(FONTE.BIA, 'resp-1'), idDaMedicao(FONTE.BIA, 'resp-1'));
  assert.notStrictEqual(idDaMedicao(FONTE.BIA, 'resp-1'), idDaMedicao(FONTE.BIA, 'resp-2'));
  assert.notStrictEqual(idDaMedicao(FONTE.BIA, 'x'), idDaMedicao(FONTE.INDICADOR, 'x'));
});

// --- Lancamento mensal de indicador ---
const { medicaoDeLancamento } = require('./medicoes');

const lancOk = () => ({
  indicadorId: 'ind-1',
  indicadorNome: '% de patches no prazo',
  mes: '2026-03',
  desempenho: 92,
  lancadoPor: 'analista@fortestecnologia.com.br',
});

test('lançamento vira medição posicionada no mês de referência', () => {
  const m = medicaoDeLancamento('ind-1__2026-03', lancOk());
  assert.strictEqual(m.sujeitoTipo, 'indicador');
  assert.strictEqual(m.valor, 92);
  assert.strictEqual(m.periodo, '2026-03');
  // A medição é sobre o mês, não sobre o instante em que alguém digitou.
  assert.strictEqual(m.coletadoEm, '2026-03-01T00:00:00.000Z');
});

test('indicador não pertence a área, então só admin lê a medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', lancOk()).area, '');
});

// O mes em formato livre era aceito e virava chave do historico, corrompendo
// o "ultimo mes". Na medicao, formato invalido nao entra na curva.
test('mês em formato livre não vira medição', () => {
  for (const mes of ['março/2026', 'jan-26', '2026', '2026-13', '2026-00', '']) {
    assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), mes }), null, `aceitou "${mes}"`);
  }
  assert.ok(medicaoDeLancamento('x', { ...lancOk(), mes: '2026-12' }));
});

test('lançamento sem desempenho não vira medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: null }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: 'abc' }), null);
  assert.ok(medicaoDeLancamento('x', { ...lancOk(), desempenho: 0 }), 'zero é valor medido');
});

test('validade do indicador é de 45 dias', () => {
  const m = medicaoDeLancamento('x', lancOk());
  const dias = Math.round((new Date(m.validoAte) - new Date(m.coletadoEm)) / 86400000);
  assert.strictEqual(dias, 45);
});

test('quem lançou fica registrado na medição', () => {
  assert.strictEqual(medicaoDeLancamento('x', lancOk()).registradoPor, 'analista@fortestecnologia.com.br');
});

// Number(null) e Number('') valem ZERO em JavaScript. Sem guarda, um mes sem
// dado virava medicao de 0% — pior que a ausencia, porque 0% parece desempenho
// pessimo em vez de "nao medido".
test('ausência de valor não vira medição de zero', () => {
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: null }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: '' }), null);
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: undefined }), null);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: null }), null);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: '' }), null);
  // E zero de verdade continua sendo medição.
  assert.strictEqual(medicaoDeLancamento('x', { ...lancOk(), desempenho: 0 }).valor, 0);
  assert.strictEqual(medicaoDeRespostaBia('x', { ...respostaOk(), score: 0 }).valor, 0);
});

// --- Risco -> medicao ---
const { medicaoDeRisco, scoreDeRisco } = require('./medicoes');

const riscoOk = () => ({
  titulo: 'Queda de link',
  area: 'TI',
  probabilidade: 'Média',
  impacto: 'Alto',
  status: 'Identificado',
  atualizadoEm: '2026-09-20T12:00:00.000Z',
  atualizadoPor: 'analista@fortestecnologia.com.br',
});

test('score do risco é recalculado no servidor, não aceito do cliente', () => {
  // O cliente mandou 99; o que entra na curva é 2 x 3 = 6.
  const m = medicaoDeRisco('r1', { ...riscoOk(), score: 99 }, null);
  assert.strictEqual(m.valor, 6);
});

test('escala do PCN não é reconhecida e não vira medição', () => {
  // A tabela de riscos do PCN usa Baixo/Médio/Alto para probabilidade; o
  // registro usa Baixa/Média/Alta. Registrar número errado é pior que não
  // registrar — o log avisa e alguém corrige a origem.
  assert.strictEqual(scoreDeRisco('Médio', 'Alto'), null);
  assert.strictEqual(medicaoDeRisco('r', { ...riscoOk(), probabilidade: 'Médio' }, null), null);
  assert.strictEqual(medicaoDeRisco('r', { ...riscoOk(), impacto: 'Médio' }, null), null);
});

test('reavaliação que muda o score vira ponto novo', () => {
  const antes = riscoOk();
  const depois = { ...riscoOk(), impacto: 'Crítico' };  // 2 x 4 = 8
  const m = medicaoDeRisco('r1', depois, antes);
  assert.ok(m);
  assert.strictEqual(m.valor, 8);
});

test('mudança de status também vira ponto', () => {
  const m = medicaoDeRisco('r1', { ...riscoOk(), status: 'Tratado' }, riscoOk());
  assert.ok(m);
  assert.strictEqual(m.classificacao, 'Tratado');
});

// Sem isso, cada salvamento de uma vírgula na descrição viraria um ponto.
test('salvar sem mexer no risco NÃO gera ponto', () => {
  assert.strictEqual(medicaoDeRisco('r1', { ...riscoOk(), descricao: 'texto novo' }, riscoOk()), null);
});

test('primeira medição (sem anterior) usa dataUltimaReavaliacao quando presente -- nao inventa um ponto no presente pra risco antigo do backfill', () => {
  const m = medicaoDeRisco('r1', { ...riscoOk(), dataUltimaReavaliacao: '2020-01-01' }, null);
  assert.strictEqual(m.coletadoEm, '2020-01-01');
});

test('reavaliação de risco já existente usa atualizadoEm, NUNCA a dataUltimaReavaliacao presa de uma aba diferente', () => {
  // dataUltimaReavaliacao ficou gravada de uma reavaliação de ontem e é
  // reenviada em todo salvamento (mesmo edições que não passam por aquela
  // aba); usá-la aqui dataria o ponto novo ANTES do ponto anterior --
  // exatamente o bug real: editar só o Impacto Financeiro hoje escondeu o
  // valor novo atrás de uma medição de ontem "mais recente" por engano.
  const antes = riscoOk();
  const depois = {
    ...riscoOk(),
    impactoFinanceiro: 450000,
    dataUltimaReavaliacao: '2026-09-22',
    atualizadoEm: '2026-09-23T01:54:07.217Z',
  };
  const m = medicaoDeRisco('r1', depois, antes);
  assert.ok(m);
  assert.strictEqual(m.coletadoEm, '2026-09-23T01:54:07.217Z');
});

test('a medição guarda probabilidade e impacto do momento', () => {
  const m = medicaoDeRisco('r1', riscoOk(), null);
  assert.strictEqual(m.probabilidade, 'Média');
  assert.strictEqual(m.impacto, 'Alto');
  assert.strictEqual(m.area, 'TI');
});

// --- Risco excluido -> medicao de fechamento ---
const { medicaoDeExclusaoRisco } = require('./medicoes');

test('exclusão de risco gera medição de fechamento com classificação Excluído', () => {
  const m = medicaoDeExclusaoRisco('r1', riscoOk());
  assert.ok(m);
  assert.strictEqual(m.classificacao, 'Excluído');
  assert.strictEqual(m.sujeitoId, 'r1');
  assert.strictEqual(m.area, 'TI');
});

test('sem risco anterior (nada a fechar), não gera medição', () => {
  assert.strictEqual(medicaoDeExclusaoRisco('r1', null), null);
});

test('todas as combinações da escala dão score entre 1 e 12', () => {
  for (const p of ['Baixa', 'Média', 'Alta']) {
    for (const i of ['Baixo', 'Moderado', 'Alto', 'Crítico']) {
      const s = scoreDeRisco(p, i);
      assert.ok(s >= 1 && s <= 12, `${p} x ${i} = ${s}`);
    }
  }
});

// ============================================================
// FORNECEDOR -> MEDICAO
// ============================================================

const medicoes = require('./medicoes');

const avaliacao = (extra) => Object.assign({
  fornecedorId: 'f1',
  fornecedorNome: 'Datacenter Alfa',
  nota: 82,
  completa: true,
  criteriosVersao: 3,
  avaliadoEm: '2026-09-21T10:00:00.000Z',
  avaliadoPor: 'hercules@fortestecnologia.com.br',
}, extra);

test('avaliacao de fornecedor vira medicao de conformidade', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao());
  assert.strictEqual(m.sujeitoTipo, 'fornecedor');
  assert.strictEqual(m.sujeitoId, 'f1');
  assert.strictEqual(m.sujeitoRotulo, 'Datacenter Alfa');
  assert.strictEqual(m.fonte, medicoes.FONTE.FORNECEDOR);
  assert.strictEqual(m.escala, medicoes.ESCALA.CONFORMIDADE);
  assert.strictEqual(m.valor, 82);
  assert.strictEqual(m.reguaVersao, 3);
  assert.strictEqual(m.origemColecao, 'avaliacoes_fornecedor');
  assert.strictEqual(m.origemId, 'av1');
});

test('a medicao do fornecedor carrega o sentido: maior e MELHOR', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao());
  assert.strictEqual(m.sentido, medicoes.SENTIDO.MAIOR_MELHOR);
  assert.notStrictEqual(m.sentido, medicoes.SENTIDO.MAIOR_PIOR);
});

test('a medicao do fornecedor NAO grava a faixa — ela vive em um lugar so', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ nota: 95 }));
  assert.strictEqual(m.faixa, undefined);
  assert.strictEqual(m.classificacao, 'completa', 'classificacao diz se a avaliacao esta completa, nao a faixa');
});

test('avaliacao incompleta vira medicao, mas marcada como incompleta', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ completa: false }));
  assert.strictEqual(m.classificacao, 'incompleta');
  assert.strictEqual(m.valor, 82);
});

test('nota zero vira medicao — zero e "nao atende nada", que e uma medicao real', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ nota: 0 }));
  assert.ok(m, 'nota 0 tem que virar medicao');
  assert.strictEqual(m.valor, 0);
});

test('avaliacao SEM nota nao vira medicao — ausencia nao e zero na curva', () => {
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ nota: null })), null);
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ nota: '' })), null);
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ nota: undefined })), null);
});

test('avaliacao sem fornecedor ou com data invalida nao vira medicao', () => {
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ fornecedorId: '' })), null);
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao({ avaliadoEm: 'ontem' })), null);
  assert.strictEqual(medicoes.medicaoDeAvaliacaoFornecedor('av1', null), null);
});

test('a avaliacao de fornecedor vale um ano', () => {
  const m = medicoes.medicaoDeAvaliacaoFornecedor('av1', avaliacao());
  assert.strictEqual(medicoes.VALIDADE_DIAS[medicoes.FONTE.FORNECEDOR], 365);
  assert.strictEqual(m.validoAte.slice(0, 10), '2027-09-21');
});

test('cada avaliacao e um ponto proprio: o id da medicao segue o id da avaliacao', () => {
  assert.strictEqual(medicoes.idDaMedicao(medicoes.FONTE.FORNECEDOR, 'av1'), 'fornecedor__av1');
  assert.notStrictEqual(
    medicoes.idDaMedicao(medicoes.FONTE.FORNECEDOR, 'av1'),
    medicoes.idDaMedicao(medicoes.FONTE.FORNECEDOR, 'av2'),
  );
});
