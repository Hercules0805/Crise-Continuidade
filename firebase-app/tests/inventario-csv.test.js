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
});

test('consolidar: agrupa por fabricante+produto+versao, conta hosts unicos e descarta linha incompleta', () => {
  const mapa = { host: 0, produto: 1, fabricante: 2, versao: 3, so: 4 };
  const r = IC.consolidar([
    ['SRV01', 'Google Chrome', 'Google LLC', '120.0', 'Windows Server'],
    ['srv01', 'Google Chrome', 'Google LLC', '120.0', 'Windows Server'],
    ['PC02', 'Google Chrome', 'Google LLC', '120.0', 'Windows 11'],
    ['PC02', 'Google Chrome', 'Google LLC', '121.0', 'Windows 11'],
    ['', 'Sem host', 'X', '1', ''],
    ['PC03', '', 'X', '1', ''],
  ], mapa);
  assert.strictEqual(r.itens.length, 2);
  assert.deepStrictEqual(r.itens[0], { fabricante: 'Google LLC', produto: 'Google Chrome', versao: '120.0', qtdHosts: 2, hosts: ['SRV01', 'PC02'], sistemasOperacionais: ['Windows Server', 'Windows 11'] });
  assert.deepStrictEqual(r.resumo, { linhas: 6, descartadas: 2, hosts: 2, softwares: 2 });
  assert.deepStrictEqual(IC.mapaPorNome(['H', 'S', 'F', 'V', 'O'], mapa), { host: 'H', produto: 'S', fabricante: 'F', versao: 'V', so: 'O' });
});

test('pareceCodificacaoErrada detecta Windows-1252 lido como UTF-8', () => {
  assert.strictEqual(IC.pareceCodificacaoErrada('Vers�o'), true);
  assert.strictEqual(IC.pareceCodificacaoErrada('Versão'), false);
});
