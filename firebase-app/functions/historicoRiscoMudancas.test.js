// "O que moveu a curva no dia" (dica do Monitor de Risco): mudancas risco a risco
// entre o fim do dia anterior e o fim do dia. Sem Firestore (node --test).
const { test } = require('node:test');
const assert = require('node:assert');
const HR = require('./historicoRisco');

const medicao = (extra) => Object.assign({
  sujeitoTipo: 'risco',
  sujeitoId: 'r1',
  sujeitoRotulo: 'Risco',
  area: 'Financeiro',
  valor: 6,
  classificacao: 'Identificado',
  coletadoEm: '2026-09-10T12:00:00.000Z',
}, extra);

const DIA_ANT = '2026-09-19T23:59:59.999Z';
const DIA = '2026-09-20T23:59:59.999Z';
const reconstruir = (medicoes, dataAlvo) => HR.reconstruirEmData(medicoes, {}, {}, {}, dataAlvo);
const comMudancas = (medicoes) => HR.reconstruirComMudancas(medicoes, {}, {}, {}, DIA, DIA_ANT);
const somaCarga = (m) => m.reduce((t, x) => t + x.cargaDepois - x.cargaAntes, 0);

test('risco criado no dia entra como "novo", com a carga que somou', () => {
  const r = comMudancas([medicao({ sujeitoId: 'r1', sujeitoRotulo: 'Falha X', valor: 6, coletadoEm: '2026-09-20T10:00:00.000Z' })]);
  assert.strictEqual(r.mudancas.length, 1);
  const x = r.mudancas[0];
  assert.deepStrictEqual(
    { id: x.riscoId, titulo: x.titulo, tipo: x.tipo, de: x.cargaAntes, para: x.cargaDepois, area: x.area },
    { id: 'r1', titulo: 'Falha X', tipo: 'novo', de: 0, para: 12, area: 'Financeiro' }
  );
});

test('risco reavaliado para cima e para baixo', () => {
  const m = [
    medicao({ sujeitoId: 'sobe', sujeitoRotulo: 'Sobe', valor: 3, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'desce', sujeitoRotulo: 'Desce', valor: 9, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'sobe', sujeitoRotulo: 'Sobe', valor: 8, coletadoEm: '2026-09-20T09:00:00.000Z' }),
    medicao({ sujeitoId: 'desce', sujeitoRotulo: 'Desce', valor: 4, coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ];
  const por = Object.fromEntries(comMudancas(m).mudancas.map((x) => [x.riscoId, x]));
  assert.strictEqual(por.sobe.tipo, 'reavaliado');
  assert.deepStrictEqual([por.sobe.scoreAntes, por.sobe.scoreDepois, por.sobe.cargaAntes, por.sobe.cargaDepois], [3, 8, 6, 16]);
  assert.deepStrictEqual([por.desce.cargaAntes, por.desce.cargaDepois], [18, 8]);
});

test('encerrado e excluido saem da conta, cada um com o seu tipo', () => {
  const m = [
    medicao({ sujeitoId: 'enc', sujeitoRotulo: 'Enc', valor: 6, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'enc', sujeitoRotulo: 'Enc', valor: 6, classificacao: 'Encerrado', coletadoEm: '2026-09-20T09:00:00.000Z' }),
    medicao({ sujeitoId: 'exc', sujeitoRotulo: 'Exc', valor: 4, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'exc', sujeitoRotulo: 'Exc', valor: 4, classificacao: 'Excluído', coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ];
  const por = Object.fromEntries(comMudancas(m).mudancas.map((x) => [x.riscoId, x]));
  assert.strictEqual(por.enc.tipo, 'encerrado');
  assert.strictEqual(por.exc.tipo, 'excluido');
  assert.deepStrictEqual([por.enc.cargaAntes, por.enc.cargaDepois, por.exc.cargaAntes, por.exc.cargaDepois], [12, 0, 8, 0]);
});

test('risco que ganhou avaliacao no dia entra como "novo" (antes nao contava)', () => {
  const r = comMudancas([
    medicao({ sujeitoId: 'r1', valor: 0, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'r1', valor: 6, coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ]);
  assert.strictEqual(r.mudancas[0].tipo, 'novo');
  assert.strictEqual(r.mudancas[0].scoreAntes, null);
});

test('dia sem nenhuma mudanca devolve lista vazia', () => {
  assert.deepStrictEqual(comMudancas([medicao({ coletadoEm: '2026-09-10T00:00:00.000Z' })]).mudancas, []);
});

test('mudanca so do valor financeiro aparece, com a carga igual', () => {
  const r = comMudancas([
    medicao({ sujeitoId: 'r1', valor: 6, valorFinanceiro: 1000, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'r1', valor: 6, valorFinanceiro: 5000, coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ]);
  const x = r.mudancas[0];
  assert.strictEqual(x.cargaAntes, x.cargaDepois);
  assert.deepStrictEqual([x.financeiroAntes, x.financeiroDepois], [1000, 5000]);
});

test('primeiro dia do historico (nada antes) = todos "novo"', () => {
  const r = comMudancas([
    medicao({ sujeitoId: 'a', valor: 3, coletadoEm: '2026-09-20T01:00:00.000Z' }),
    medicao({ sujeitoId: 'b', valor: 6, coletadoEm: '2026-09-20T02:00:00.000Z' }),
  ]);
  assert.deepStrictEqual(r.mudancas.map((x) => x.tipo), ['novo', 'novo']);
});

test('a soma das variacoes e igual a variacao da carga da empresa (e de cada area)', () => {
  const m = [
    medicao({ sujeitoId: 'a', area: 'TI', valor: 3, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'a', area: 'TI', valor: 9, coletadoEm: '2026-09-20T09:00:00.000Z' }),
    medicao({ sujeitoId: 'b', area: 'RH', valor: 6, coletadoEm: '2026-09-20T10:00:00.000Z' }),
    medicao({ sujeitoId: 'c', area: 'RH', valor: 4, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'c', area: 'RH', valor: 4, classificacao: 'Encerrado', coletadoEm: '2026-09-20T11:00:00.000Z' }),
  ];
  const antes = reconstruir(m, DIA_ANT);
  const depois = comMudancas(m);
  assert.strictEqual(somaCarga(depois.mudancas), depois.empresa.carga - antes.empresa.carga);
  const cargaDa = (r, area) => ((r.areas.find((a) => a.area === area) || {}).carga) || 0;
  ['TI', 'RH'].forEach((area) => {
    assert.strictEqual(somaCarga(depois.mudancas.filter((x) => x.area === area)), cargaDa(depois, area) - cargaDa(antes, area), area);
  });
});

test('ordenadas pelo tamanho da variacao de carga', () => {
  const r = comMudancas([
    medicao({ sujeitoId: 'pequeno', sujeitoRotulo: 'P', valor: 1, coletadoEm: '2026-09-20T01:00:00.000Z' }),
    medicao({ sujeitoId: 'grande', sujeitoRotulo: 'G', valor: 9, coletadoEm: '2026-09-20T02:00:00.000Z' }),
  ]);
  assert.deepStrictEqual(r.mudancas.map((x) => x.riscoId), ['grande', 'pequeno']);
});

test('titulo ausente (cai no id) vira rotulo neutro; usa o titulo de um dos lados se houver', () => {
  const semTitulo = comMudancas([
    medicao({ sujeitoId: 'xyz', sujeitoRotulo: 'xyz', valor: 6, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'xyz', sujeitoRotulo: 'xyz', valor: 6, classificacao: 'Excluído', coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ]);
  assert.strictEqual(semTitulo.mudancas[0].titulo, '(risco sem título)');
  const comTituloAntes = comMudancas([
    medicao({ sujeitoId: 'xyz', sujeitoRotulo: 'Falha Y', valor: 6, coletadoEm: '2026-09-10T00:00:00.000Z' }),
    medicao({ sujeitoId: 'xyz', sujeitoRotulo: 'xyz', valor: 6, classificacao: 'Excluído', coletadoEm: '2026-09-20T09:00:00.000Z' }),
  ]);
  assert.strictEqual(comTituloAntes.mudancas[0].titulo, 'Falha Y');
});

test('o retrato devolvido leva `mudancas` e NAO leva a lista interna `riscos`', () => {
  const r = comMudancas([medicao({ coletadoEm: '2026-09-20T09:00:00.000Z' })]);
  assert.ok(Array.isArray(r.mudancas));
  assert.ok(!('riscos' in r));
  assert.strictEqual(r.empresa.carga, 12);
});

test('os numeros do retrato sao os mesmos de reconstruirEmData (a curva nao muda)', () => {
  const m = [
    medicao({ sujeitoId: 'a', valor: 6, coletadoEm: '2026-09-20T09:00:00.000Z' }),
    medicao({ sujeitoId: 'b', area: 'RH', valor: 3, coletadoEm: '2026-09-12T09:00:00.000Z' }),
  ];
  const puro = reconstruir(m, DIA);
  const com = comMudancas(m);
  assert.deepStrictEqual(com.empresa, puro.empresa);
  assert.deepStrictEqual(com.areas, puro.areas);
  assert.strictEqual(com.foraPorStatus, puro.foraPorStatus);
});

test('fim do dia e dia anterior (usados no calculo do baseline)', () => {
  const RR = require('./retratoRisco');
  assert.strictEqual(RR.fimDoDiaISO('2026-09-20'), '2026-09-20T23:59:59.999Z');
  assert.strictEqual(RR.diaAnterior('2026-09-20'), '2026-09-19');
  assert.strictEqual(RR.diaAnterior('2026-10-01'), '2026-09-30');
  assert.strictEqual(RR.diaAnterior('2026-01-01'), '2025-12-31');
});
