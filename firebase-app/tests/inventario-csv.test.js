// Inventario de software por CSV (Threat Intelligence, 26/10/2026).
const { test } = require('node:test');
const assert = require('node:assert');
const IC = require('../public/inventario-csv.js');

test('parseCsv: separador ; do Excel, BOM, aspas, "" e quebra de linha dentro de aspas', () => {
  const texto = '﻿Hostname;Software;Fabricante;Versão\r\nSRV01;"Chrome; Enterprise";"Google ""LLC""";120\r\n\r\nPC02;"Linha\nquebrada";X;1\n';
  const linhas = IC.parseCsv(texto);
  assert.strictEqual(linhas.length, 3, 'linha em branco fora');
  assert.deepStrictEqual(linhas[0], ['Hostname', 'Software', 'Fabricante', 'Versão']);
  assert.deepStrictEqual(linhas[1], ['SRV01', 'Chrome; Enterprise', 'Google "LLC"', '120']);
  assert.strictEqual(linhas[2][1], 'Linha\nquebrada');
});

test('detectarSeparador: ; , e tab', () => {
  assert.strictEqual(IC.detectarSeparador('a;b;c'), ';');
  assert.strictEqual(IC.detectarSeparador('a,b,"c;d"'), ',');
  assert.strictEqual(IC.detectarSeparador('a\tb\tc'), '\t');
});

test('autoMapear: nomes comuns de exportacao (pt e en) e mapeamento salvo vence', () => {
  assert.deepStrictEqual(IC.autoMapear(['Computer Name', 'Publisher', 'Display Name', 'Display Version', 'OS']),
    { host: 0, produto: 2, fabricante: 1, versao: 3, so: 4 });
  assert.deepStrictEqual(IC.autoMapear(['Nome da Máquina', 'Software', 'Fabricante', 'Versão']),
    { host: 0, produto: 1, fabricante: 2, versao: 3 });
  const salvo = { produto: 'Aplicação Instalada' };
  assert.strictEqual(IC.autoMapear(['Host', 'Software', 'Aplicação Instalada'], salvo).produto, 2);
  assert.deepStrictEqual(IC.faltando({ host: 0 }).map((c) => c.chave), ['produto']);
  assert.deepStrictEqual(IC.faltando({ produto: 1 }), [], 'so o software e obrigatorio');
});

test('consolidar: agrupa por fabricante+produto+versao, conta hosts unicos; sem host conta a instalacao, sem software descarta', () => {
  const mapa = { host: 0, produto: 1, fabricante: 2, versao: 3, so: 4 };
  const r = IC.consolidar([
    ['SRV01', 'Google Chrome', 'Google LLC', '120.0', 'Windows Server'],
    ['srv01', 'Google Chrome', 'Google LLC', '120.0', 'Windows Server'],
    ['PC02', 'Google Chrome', 'Google LLC', '120.0', 'Windows 11'],
    ['PC02', 'Google Chrome', 'Google LLC', '121.0', 'Windows 11'],
    ['', 'Sem host', 'X', '1', ''],
    ['PC03', '', 'X', '1', ''],
  ], mapa);
  assert.strictEqual(r.itens.length, 3, 'linha sem host entra');
  assert.deepStrictEqual(r.itens[2], { fabricante: 'X', produto: 'Sem host', versao: '1', qtdHosts: 1, hosts: [], sistemasOperacionais: [], extras: [] });
  assert.deepStrictEqual(r.itens[0], { fabricante: 'Google LLC', produto: 'Google Chrome', versao: '120.0', qtdHosts: 2, hosts: ['SRV01', 'PC02'], sistemasOperacionais: ['Windows Server', 'Windows 11'], extras: [] });
  assert.deepStrictEqual(r.resumo, { linhas: 6, descartadas: 1, hosts: 2, semHost: 1, softwares: 3 });
  assert.deepStrictEqual(IC.mapaPorNome(['H', 'S', 'F', 'V', 'O'], mapa), { host: 'H', produto: 'S', fabricante: 'F', versao: 'V', so: 'O', extras: [] });
});

test('pareceCodificacaoErrada detecta Windows-1252 lido como UTF-8', () => {
  assert.strictEqual(IC.pareceCodificacaoErrada('Vers�o'), true);
  assert.strictEqual(IC.pareceCodificacaoErrada('Versão'), false);
});

test('colunasIniciais: reconhecidas e extras salvas sobem marcadas; o resto comeca desmarcado com exemplo', () => {
  const cab = ['Computer Name', 'Display Name', 'Publisher', 'Display Version', 'IP', 'Usuário'];
  const linhas = [['', 'Chrome', 'Google', '120', '', 'ana'], ['PC1', 'Chrome', 'Google', '120', '10.0.0.1', 'ana']];
  const cols = IC.colunasIniciais(cab, linhas, { extras: ['ip'] });
  assert.deepStrictEqual(cols.map((c) => [c.nome, c.subir, c.papel]), [
    ['Computer Name', true, 'host'], ['Display Name', true, 'produto'], ['Publisher', true, 'fabricante'],
    ['Display Version', true, 'versao'], ['IP', true, 'extra'], ['Usuário', false, 'extra'],
  ]);
  assert.strictEqual(cols[0].exemplo, 'PC1', 'primeiro valor nao vazio');
});

test('escolhaDeColunas: papel repetido, obrigatorio faltando e desmarcada ignorada', () => {
  const base = [
    { indice: 0, nome: 'H', subir: true, papel: 'host' },
    { indice: 1, nome: 'S', subir: true, papel: 'produto' },
    { indice: 2, nome: 'IP', subir: true, papel: 'extra' },
    { indice: 3, nome: 'X', subir: false, papel: 'produto' },
  ];
  const ok = IC.escolhaDeColunas(base);
  assert.deepStrictEqual(ok, { mapa: { host: 0, produto: 1 }, extras: [{ indice: 2, nome: 'IP' }], erros: [] });
  const dup = IC.escolhaDeColunas(base.map((c) => (c.indice === 3 ? Object.assign({}, c, { subir: true }) : c)));
  assert.match(dup.erros[0], /mais de uma coluna/);
  const semHost = IC.escolhaDeColunas(base.map((c) => (c.indice === 0 ? Object.assign({}, c, { subir: false }) : c)));
  assert.deepStrictEqual(semHost.erros, [], 'hostname e opcional');
  const semSoftware = IC.escolhaDeColunas(base.map((c) => (c.indice === 1 ? Object.assign({}, c, { subir: false }) : c)));
  assert.deepStrictEqual(semSoftware.erros, ['Marque a coluna de Software / Produto.']);
});

test('consolidar leva as colunas extras: valores distintos por software; mapaPorNome guarda os nomes', () => {
  const mapa = { host: 0, produto: 1 };
  const extras = [{ indice: 2, nome: 'IP' }, { indice: 3, nome: 'Depto' }];
  const r = IC.consolidar([['PC1', 'Chrome', '10.0.0.1', ''], ['PC2', 'Chrome', '10.0.0.2', ''], ['PC2', 'Chrome', '10.0.0.2', '']], mapa, extras);
  assert.deepStrictEqual(r.itens[0].extras, [{ coluna: 'IP', valores: ['10.0.0.1', '10.0.0.2'] }], 'coluna vazia nao entra');
  assert.deepStrictEqual(IC.mapaPorNome(['H', 'S', 'IP', 'Depto'], mapa, extras), { host: 'H', produto: 'S', extras: ['IP', 'Depto'] });
});
