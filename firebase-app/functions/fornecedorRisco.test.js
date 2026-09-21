const { test } = require('node:test');
const assert = require('node:assert');
const FR = require('./fornecedorRisco');

const HOJE = '2026-09-21T12:00:00.000Z';
const FORNECEDOR = { id: 'f1', nome: 'Datacenter Alfa', empresa: 'Alfa S.A.' };
const aval = (extra) => Object.assign({ fornecedorId: 'f1', fornecedorNome: 'Datacenter Alfa', nota: 40 }, extra);
const riscoAberto = (extra) => Object.assign({ id: 'r1', fornecedor: 'f1', origem: 'Fornecedor', status: 'Identificado' }, extra);

const decidir = (o) => FR.decidir(Object.assign({ fornecedor: FORNECEDOR, riscos: [], limiar: 70, hoje: HOJE }, o));

// ============================================================
// ABRIR
// ============================================================

test('nota abaixo do limiar abre risco', () => {
  const d = decidir({ avaliacao: aval({ nota: 40 }) });
  assert.strictEqual(d.acao, 'abrir');
  assert.strictEqual(d.risco.origem, 'Fornecedor');
  assert.strictEqual(d.risco.fornecedor, 'f1');
  assert.match(d.risco.titulo, /Datacenter Alfa/);
  assert.match(d.risco.titulo, /40/);
});

test('o risco nasce na categoria da lista fechada do registro de riscos', () => {
  const d = decidir({ avaliacao: aval() });
  assert.strictEqual(d.risco.categoria, 'Regulatório/Legal');
  // Se alguem trocar por 'Fornecedores', o campo abre vazio na tela e o
  // proximo salvamento apaga a categoria em silencio.
  assert.notStrictEqual(d.risco.categoria, 'Fornecedores');
});

test('o risco nasce SEM impacto — quem decide o quanto dói é gente', () => {
  const d = decidir({ avaliacao: aval() });
  assert.strictEqual(d.risco.impacto, undefined);
  assert.ok(d.risco.probabilidade, 'a probabilidade vem da nota');
});

test('nota muito baixa sugere probabilidade Alta; pouco abaixo do limiar, Média', () => {
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 30 }) }).risco.probabilidade, 'Alta');
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 65 }) }).risco.probabilidade, 'Média');
});

test('nota zero abre risco — zero e nota real, nao ausencia', () => {
  const d = decidir({ avaliacao: aval({ nota: 0 }) });
  assert.strictEqual(d.acao, 'abrir');
});

test('o risco do fornecedor entra como corporativo, sem area', () => {
  assert.strictEqual(decidir({ avaliacao: aval() }).risco.area, '');
});

// ============================================================
// NAO DUPLICAR
// ============================================================

test('nota ruim de novo NAO abre segundo risco para o mesmo fornecedor', () => {
  const d = decidir({ avaliacao: aval({ nota: 35 }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /já existe risco aberto/);
});

test('risco aberto de OUTRO fornecedor nao impede abrir o deste', () => {
  const d = decidir({ avaliacao: aval({ nota: 35 }), riscos: [riscoAberto({ id: 'r9', fornecedor: 'f2' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco do fornecedor criado a mao (origem diferente) nao impede o automatico', () => {
  const d = decidir({ avaliacao: aval({ nota: 35 }), riscos: [riscoAberto({ origem: 'Manual' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco automatico ja Encerrado ou Aceito nao conta como aberto', () => {
  ['Encerrado', 'Aceito'].forEach((status) => {
    const d = decidir({ avaliacao: aval({ nota: 35 }), riscos: [riscoAberto({ status })] });
    assert.strictEqual(d.acao, 'abrir', `status ${status} nao deveria bloquear`);
  });
});

// ============================================================
// ENCERRAR
// ============================================================

test('nota de volta ao aceitavel encerra o risco automatico', () => {
  const d = decidir({ avaliacao: aval({ nota: 90 }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'encerrar');
  assert.deepStrictEqual(d.ids, ['r1']);
  assert.strictEqual(d.patch.status, 'Encerrado');
  assert.strictEqual(d.patch.dataEncerramento, '2026-09-21');
  assert.match(d.patch.justificativaEncerramento, /90/);
});

test('encerra TODOS os automaticos abertos, se houver mais de um', () => {
  const d = decidir({ avaliacao: aval({ nota: 90 }), riscos: [riscoAberto(), riscoAberto({ id: 'r2' })] });
  assert.deepStrictEqual(d.ids, ['r1', 'r2']);
});

test('nota boa sem risco aberto nao faz nada', () => {
  const d = decidir({ avaliacao: aval({ nota: 90 }) });
  assert.strictEqual(d.acao, 'nada');
});

test('o risco criado a mao NAO e encerrado pelo servidor', () => {
  const d = decidir({ avaliacao: aval({ nota: 90 }), riscos: [riscoAberto({ origem: 'Manual' })] });
  assert.strictEqual(d.acao, 'nada');
});

// ============================================================
// LIMIAR
// ============================================================

test('exatamente no limiar ainda e aceitavel', () => {
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 70 }) }).acao, 'nada');
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 69 }) }).acao, 'abrir');
});

test('limiar configurado e respeitado', () => {
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 80 }), limiar: 95 }).acao, 'abrir');
  assert.strictEqual(decidir({ avaliacao: aval({ nota: 40 }), limiar: 10 }).acao, 'nada');
});

test('limiar ausente ou fora de 0 a 100 cai no padrao 70', () => {
  assert.strictEqual(FR.LIMIAR_RISCO_PADRAO, 70);
  [undefined, null, '', 'muito', -5, 200].forEach((lim) => {
    assert.strictEqual(decidir({ avaliacao: aval({ nota: 65 }), limiar: lim }).acao, 'abrir', `limiar ${lim}`);
    assert.strictEqual(decidir({ avaliacao: aval({ nota: 75 }), limiar: lim }).acao, 'nada', `limiar ${lim}`);
  });
});

// ============================================================
// AUSENCIA DE NOTA
// ============================================================

test('avaliacao SEM nota nao abre nem encerra nada', () => {
  [null, undefined, ''].forEach((nota) => {
    const d = decidir({ avaliacao: aval({ nota }), riscos: [riscoAberto()] });
    assert.strictEqual(d.acao, 'nada', `nota ${nota}`);
    assert.match(d.motivo, /sem nota/);
  });
});

test('avaliacao sem nota NAO encerra risco aberto — ausencia nao e melhora', () => {
  const d = decidir({ avaliacao: aval({ nota: null }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'nada');
});

test('avaliacao sem fornecedor nao faz nada', () => {
  const d = decidir({ avaliacao: aval({ fornecedorId: '' }) });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /sem fornecedor/);
});

test('abaixoDoLimiar nunca trata ausencia como zero', () => {
  assert.strictEqual(FR.abaixoDoLimiar(null, 70), false);
  assert.strictEqual(FR.abaixoDoLimiar('', 70), false);
  assert.strictEqual(FR.abaixoDoLimiar(undefined, 70), false);
  assert.strictEqual(FR.abaixoDoLimiar(0, 70), true);
});

test('listas nulas nao quebram', () => {
  assert.deepStrictEqual(FR.riscosAbertosDoFornecedor(null, 'f1'), []);
  assert.deepStrictEqual(FR.riscosAbertosDoFornecedor([riscoAberto()], ''), []);
});
