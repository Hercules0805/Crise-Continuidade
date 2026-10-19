const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A regra do ciclo de vida do contrato roda na tela (public/) e na varredura
// diaria (functions/). Sao duas copias porque cada deploy so leva a sua pasta;
// se divergirem, o painel e a varredura passam a discordar sobre o que vence.
test('public/contrato-ciclo.js e functions/contratoCiclo.js sao identicos', () => {
  const ler = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
  assert.strictEqual(ler('public/contrato-ciclo.js'), ler('functions/contratoCiclo.js'),
    'As duas copias divergiram: altere uma e copie para a outra.');
});

test('a copia do navegador carrega como CommonJS', () => {
  const CC = require('../public/contrato-ciclo.js');
  assert.strictEqual(typeof CC.calcularAlertas, 'function');
  assert.deepStrictEqual(CC.SITUACOES, ['pre', 'vigente', 'expirada', 'encerrado']);
});

test('situação "Vigência expirada": existe, tem status padrão, e NÃO é vigente (sem alerta, sem renovação automática)', () => {
  const CC = require('../public/contrato-ciclo.js');
  assert.strictEqual(CC.SITUACAO.EXPIRADA, 'expirada');
  assert.ok(CC.PADROES.status.some((x) => x.nome === 'Vigência expirada' && x.situacao === 'expirada'));
  const lista = [{ id: 's-exp', nome: 'Vigência expirada', situacao: 'expirada' }];
  assert.strictEqual(CC.situacaoDoStatus('s-exp', lista), 'expirada');
  const c = { dataInicio: '2025-01-01', dataFim: '2026-01-31', renovacaoAutomatica: true, avisoCancelamentoDias: 30, valorMensal: 100 };
  assert.deepStrictEqual(CC.calcularAlertas(c, { situacao: 'expirada', hoje: '2026-10-16' }), []);
  assert.strictEqual(CC.renovacaoAutomaticaDevida(c, { situacao: 'expirada', hoje: '2026-10-16' }), null);
});
