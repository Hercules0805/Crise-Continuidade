// Carga da Lista Mestra (29/10/2026): scripts/importar-lista-mestra-processos.js (planejar, puro).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar, documentosDoCsv, limparNome, acharPessoa } = require('./scripts/importar-lista-mestra-processos');
const { processoKey } = require('./tokenLogic');

const CAB = 'SETOR,ARQUIVO,NOME DO ARQUIVO,CRIADOR,APROVADOR,VERSÃO\n';
const AREAS = ['Suporte Tecnologia', 'Financeiro', 'Comercial Corporativo', 'Departamento Pessoal', 'Relacionamento']
  .map((nome) => ({ nome }));
const PESSOAS = [
  { id: 'paulo', nome: 'Paulo Teixeira' }, { id: 'jorge', nome: 'Jorge Cysne' },
  { id: 'mika', nome: 'Mikaele Cavalcante' }, { id: 'fabi', nome: 'Fabiana Alves' }, { id: 'fabim', nome: 'Fabiana Mendonça' },
];
const AGORA = '2026-10-29T10:00:00.000Z';

test('csv: aspas com virgula e setor herdado da linha de cima', () => {
  const docs = documentosDoCsv(CAB + 'CS,NR.CS.001,"CANCELAMENTO, RETENÇÃO",Ana,Bia,1\n,MN.CS.002,OUTRO,Ana,Bia,1\n');
  assert.deepStrictEqual(docs.map((d) => [d.setor, d.codigo, d.nome]), [['CS', 'NR.CS.001', 'CANCELAMENTO, RETENÇÃO'], ['CS', 'MN.CS.002', 'OUTRO']]);
});

test('nome: tira o codigo e "MANUAL -", o ponto final, e vira titulo com siglas', () => {
  assert.strictEqual(limparNome('FLU.COM.002 - PROSPECÇÃO'), 'Prospecção');
  assert.strictEqual(limparNome('MN.ADC.002 - MANUAL - CANCELAMENTO'), 'Cancelamento');
  assert.strictEqual(limparNome('FL.ADC.001 - GESTÃO DE CONTRATO - MATRIZ.'), 'Gestão de Contrato - Matriz');
  assert.strictEqual(limparNome('INTEGRAÇÃO DO FORTES PONTO X FORTES AC'), 'Integração do Fortes Ponto x Fortes AC');
  assert.strictEqual(limparNome('MANUTENÇÃO BÁSICA DE BD FIREBIRD E MSSQL'), 'Manutenção Básica de BD Firebird e MSSQL');
  assert.strictEqual(limparNome('Pré Implantação'), 'Pré Implantação', 'com minusculas, fica como o autor escreveu');
});

test('pessoa: nome completo, so o primeiro nome se unico, "A/B" tenta cada um, e nunca adivinha', () => {
  assert.strictEqual(acharPessoa('PAULO TEIXEIRA', PESSOAS).id, 'paulo');
  assert.strictEqual(acharPessoa('JORGE', PESSOAS).id, 'jorge');
  assert.strictEqual(acharPessoa('Fabiana', PESSOAS), null, 'duas Fabianas: ambiguo');
  assert.strictEqual(acharPessoa('ALLAN/JORGE', PESSOAS).id, 'jorge');
  assert.strictEqual(acharPessoa('MIKAELE FREIRES', PESSOAS), null, 'outro sobrenome nao vira Mikaele Cavalcante');
});

test('agrupa MN/POP de mesmo nome na mesma area, Departamental fora de Continuidade, com os codigos', () => {
  const csv = CAB + 'NUVEM,MN.TN.010,CANCELAMENTO DE AMBIENTE NUVEM,João Morais,Paulo Teixeira,1\n'
    + ',POP.TN.002,CANCELAMENTO DE AMBIENTE NUVEM,João Morais,Erika Fladia,1\n'
    + 'COMERCIAL,FLU.COM.001,FLU.COM.001 - MACROFLUXO COMERCIAL,MIKAELE,ALLAN/MÔNICA,1\n';
  const r = planejar(csv, { areas: AREAS, pessoas: PESSOAS, processos: [] }, AGORA);
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.criar.length, 2);
  const canc = r.criar[0];
  assert.strictEqual(canc.id, processoKey('Suporte Tecnologia', 'Cancelamento de Ambiente Nuvem (MN.TN.010, POP.TN.002)'));
  assert.deepStrictEqual(canc.dados, {
    area: 'Suporte Tecnologia', processo: 'Cancelamento de Ambiente Nuvem (MN.TN.010, POP.TN.002)', categoriaId: 'departamental', continuidade: false,
    criadorId: '', aprovadorId: 'paulo', links: [], criadoEm: AGORA, criadoPor: 'importacao-lista-mestra', atualizadoEm: AGORA, atualizadoPor: 'importacao-lista-mestra',
  });
  assert.strictEqual(r.criar[1].dados.area, 'Comercial Corporativo');
  assert.strictEqual(r.criar[1].dados.criadorId, 'mika', 'MIKAELE: primeiro nome unico');
  assert.deepStrictEqual(r.semPessoa, { 'João Morais': 2, 'ALLAN/MÔNICA': 1 });
});

test('processo que ja existe (pelo codigo ou pelo nome) so e completado no vazio, e a carga e idempotente', () => {
  const csv = CAB + 'NUVEM,MN.TN.008,CRIAÇÃO DE AMBIENTE NUVEM,Wagner X,Paulo Teixeira,1\n'
    + 'CRE,MN.CRE.001,COBRANÇA,DANIELY,FABIANA ALVES,2\n'
    + 'DP,FLU.DP.004,FÉRIAS,EMILIO,JORGE,1\n';
  const processos = [
    { id: 'st', area: 'Suporte Tecnologia', processo: 'Criação de Ambiente Nuvem(MN.TN.008)', aprovadorId: 'outro' },
    { id: 'fin', area: 'Financeiro', processo: 'Cobrança' },
    { id: 'dp', area: 'Departamento Pessoal', processo: 'Férias', aprovadorId: 'jorge' },
  ];
  const r = planejar(csv, { areas: AREAS, pessoas: PESSOAS, processos }, AGORA);
  assert.strictEqual(r.criar.length, 0);
  assert.deepStrictEqual(r.completar.map((c) => [c.id, c.dados.aprovadorId]), [['fin', 'fabi']]);
  assert.strictEqual(r.existentes.length, 3);

  const depois = planejar(CAB + 'NUVEM,MN.TN.010,CANCELAMENTO DE AMBIENTE NUVEM,a,Paulo Teixeira,1\n', { areas: AREAS, pessoas: PESSOAS, processos: [] }, AGORA);
  const criados = depois.criar.map((c) => ({ id: c.id, ...c.dados }));
  const de = planejar(CAB + 'NUVEM,MN.TN.010,CANCELAMENTO DE AMBIENTE NUVEM,a,Paulo Teixeira,1\n', { areas: AREAS, pessoas: PESSOAS, processos: criados }, AGORA);
  assert.deepStrictEqual([de.criar.length, de.completar.length], [0, 0]);
});

test('setor sem mapeamento ou area inexistente sao erros', () => {
  const r = planejar(CAB + 'XPTO,A.B.1,ALGO,a,b,1\nTI,FLU.TI.001,MACROFLUXO,a,b,1\n', { areas: AREAS, pessoas: [], processos: [] }, AGORA);
  assert.deepStrictEqual(r.erros, ['Setor sem área no mapeamento: XPTO', 'Área "TI" (setor TI) não existe no cadastro.']);
});
