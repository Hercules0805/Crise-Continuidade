// Importacao de fornecedores por CSV (27/10/2026). Modulo puro, CSV SINTETICO
// (nunca a planilha real, que tem dados de contratos).
const { test } = require('node:test');
const assert = require('node:assert');
const IF = require('../public/importacao-fornecedores.js');

const CABECALHO = 'NUMERAÇÃO,EMPRESA CONTRATANTE,FORNECEDOR,CNPJ DO FORNECEDOR,DATA DE ASSINATURA,PRAZO,DESCRIÇÃO,SETOR RESPONSÁVEL,GESTOR,ÍNDICE DE REAJUSTE,MÊS DE REAJUSTE,ANÁLISE DO JURÍDICO,VALIDAÇÃO SEGURANÇA DA INFORMAÇÃO,ASSINADO?,CONTRATO ATIVO?';
const CSV = [
  CABECALHO,
  '10,EMPRESA X LTDA,ALFA SERVIÇOS LTDA.,11.111.111/0001-11,01/01/2020,"01/01/2020 A 01/01/2021, renova automaticamente",Limpeza predial,ADMINISTRATIVO,Ana Souza,IGPM,janeiro,SIM,,SIM,SIM',
  '10.2,EMPRESA X LTDA,Alfa Serviços Ltda,11.111.111/0002-22,01/06/2021,12 meses,2º Aditivo de limpeza,ADMINISTRATIVO,Ana Souza,IGPM,janeiro,,,SIM,SIM',
  '10.10,EMPRESA X LTDA,ALFA SERVICOS LTDA,não consta,,12 meses,10º aditivo,ADMINISTRATIVO,Ana Souza,,,,,SIM,SIM',
  '20,EMPRESA X LTDA,BETA TELECOM,22.222.222/0001-22,05/05/2022,indeterminado,Link de internet,TI TECNOLOGIA,Carla Dias,IPCA,maio,,,SIM,SIM',
  '30,EMPRESA X LTDA,GAMA CONSULTORIA,não consta,,,Consultoria,SETOR QUE NAO EXISTE,Fulano Sem Cadastro,,,,,SIM,SIM',
  '40,EMPRESA X LTDA,DELTA JÁ CADASTRADA,33.333.333/0001-33,,,Algo,,,,,,,SIM,SIM',
  '50,EMPRESA X LTDA,EPSILON MESMO CNPJ,44.444.444/0001-44,,,Outro,,,,,,,SIM,SIM',
  '60,EMPRESA X LTDA,ZETA ERRADA,30.921.196/00001-18,,,Tamanho errado,,,,,,,SIM,SIM',
].join('\r\n');

const EXISTENTES = [
  { id: 'f-delta', nome: 'Delta já cadastrada', cnpj: '', ativo: true },
  { id: 'f-outro', nome: 'Outro Nome', cnpj: '44.444.444/0001-44', ativo: false },
];
const AREAS = [{ nome: 'Administrativo' }, { nome: 'TI Tecnologia' }];
const PESSOAS = [{ id: 'p1', nome: 'Ana Souza' }, { id: 'p3', nome: 'Carla Dias' }, { id: 'p4', nome: 'Carla Dias' }];

function previa(csv) {
  const { cabecalho, linhas } = IF.lerCsv(csv || CSV);
  const mapa = IF.mapear(cabecalho);
  return { mapa, ...IF.analisar(IF.registros(linhas, mapa), { existentes: EXISTENTES, areas: AREAS, pessoas: PESSOAS }) };
}
const item = (p, nome) => p.itens.find((i) => i.nome.toUpperCase().startsWith(nome));

test('mapeia as colunas da planilha pelo cabecalho (com acento e "?")', () => {
  const { mapa } = previa();
  assert.deepStrictEqual(Object.keys(mapa).sort(), IF.CAMPOS.map((c) => c.chave).sort());
  assert.strictEqual(mapa.fornecedor, 2);
  assert.strictEqual(mapa.cnpj, 3);
  assert.strictEqual(mapa.descricao, 6);
  assert.deepStrictEqual(IF.faltando(IF.mapear(['Qualquer', 'Coisa'])).map((c) => c.chave), ['fornecedor']);
});

test('aditivos do mesmo fornecedor (nome com/sem acento, ponto, maiuscula) viram UM item, linhas na ordem da numeracao', () => {
  const p = previa();
  assert.strictEqual(p.contagem.linhas, 8);
  assert.strictEqual(p.contagem.fornecedores, 6);
  const alfa = item(p, 'ALFA');
  assert.strictEqual(alfa.linhas.length, 3);
  assert.deepStrictEqual(alfa.linhas.map((l) => l.numeracao), ['10', '10.2', '10.10'], '10.10 vem depois de 10.2');
  assert.strictEqual(alfa.detalhes, 'Limpeza predial', 'descricao da linha de menor numeracao');
  assert.strictEqual(alfa.nome, 'ALFA SERVIÇOS LTDA.');
});

test('ja existe na base: por nome (ativo ou inativo) e por CNPJ valido -- nao importa', () => {
  const p = previa();
  const delta = item(p, 'DELTA');
  assert.strictEqual(delta.situacao, 'existe');
  assert.deepStrictEqual(delta.existente, { id: 'f-delta', nome: 'Delta já cadastrada', ativo: true });
  const eps = item(p, 'EPSILON');
  assert.strictEqual(eps.situacao, 'existe', 'mesmo CNPJ de um fornecedor inativo');
  assert.strictEqual(eps.existente.ativo, false);
  assert.strictEqual(p.contagem.existentes, 2);
  assert.strictEqual(p.contagem.novos, 4);
});

test('CNPJ a revisar: ausente, tamanho errado, divergente entre linhas; o primeiro valido e usado', () => {
  const p = previa();
  const alfa = item(p, 'ALFA');
  assert.strictEqual(alfa.cnpj, '11.111.111/0001-11');
  assert.strictEqual(alfa.cnpjRevisar, true);
  assert.match(alfa.motivoCnpj, /diferente entre as linhas/);
  const gama = item(p, 'GAMA');
  assert.strictEqual(gama.cnpj, '');
  assert.match(gama.motivoCnpj, /ausente ou com tamanho errado/);
  const zeta = item(p, 'ZETA');
  assert.strictEqual(zeta.cnpj, '', '15 digitos nao e CNPJ');
  assert.strictEqual(item(p, 'BETA').cnpjRevisar, false);
  assert.strictEqual(p.contagem.cnpjRevisar, 3);
});

test('setor casa com Area cadastrada; gestor casa com Pessoa unica (homonimo e sem cadastro nao casam)', () => {
  const p = previa();
  const alfa = item(p, 'ALFA');
  assert.deepStrictEqual(alfa.areasRelacionadas, ['Administrativo']);
  assert.deepStrictEqual(alfa.pessoasRelacionadas, [{ id: 'p1', nome: 'Ana Souza', papel: 'Gestor (anterior ao contrato)' }]);
  const beta = item(p, 'BETA');
  assert.deepStrictEqual(beta.areasRelacionadas, ['TI Tecnologia']);
  assert.deepStrictEqual(beta.pessoasRelacionadas, [], 'Carla Dias tem homonimo: nao chuta');
  const gama = item(p, 'GAMA');
  assert.deepStrictEqual([gama.areasRelacionadas, gama.pessoasRelacionadas], [[], []]);
});

test('registro para importar: so os campos do fornecedor e TODAS as linhas da planilha como referencia', () => {
  const p = previa();
  const r = IF.paraImportar(item(p, 'ALFA'), 'Planilha.csv');
  assert.deepStrictEqual(Object.keys(r).sort(), ['areasRelacionadas', 'cnpj', 'detalhes', 'importacao', 'nome', 'pessoasRelacionadas']);
  assert.ok(!('ativo' in r), 'o ativo:false e gravado pela api.js, nao vem da tela');
  assert.strictEqual(r.importacao.origem, 'Planilha.csv');
  assert.strictEqual(r.importacao.linhas.length, 3);
  assert.strictEqual(r.importacao.linhas[0].prazo, '01/01/2020 A 01/01/2021, renova automaticamente', 'virgula dentro de aspas');
  assert.strictEqual(r.importacao.linhas[2].cnpj, 'não consta', 'o valor original fica');
  assert.match(r.importacao.cnpjRevisar, /diferente/);
});

test('separador ";" (Excel pt-BR) e BOM tambem funcionam', () => {
  const csv = '﻿' + CSV.split('\r\n').map((l) => l.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ';')).join('\n');
  const p = previa(csv);
  assert.strictEqual(p.contagem.fornecedores, 6);
  assert.strictEqual(item(p, 'ALFA').linhas[0].prazo, '01/01/2020 A 01/01/2021, renova automaticamente');
});

test('sem existentes, tudo e novo; linha sem nome de fornecedor e ignorada', () => {
  const csv = CABECALHO + '\n1,X,,11.111.111/0001-11,,,,,,,,,,,\n2,X,NOVO,,,,,,,,,,,,';
  const { cabecalho, linhas } = IF.lerCsv(csv);
  const r = IF.analisar(IF.registros(linhas, IF.mapear(cabecalho)), {});
  assert.deepStrictEqual([r.contagem.linhas, r.contagem.novos], [1, 1]);
});
