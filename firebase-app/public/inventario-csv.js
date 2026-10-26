/**
 * Inventario de software por CSV (Threat Intelligence, 26/10/2026).
 *
 * O sistema de inventario exporta uma linha por software instalado em cada
 * host (hostname, software, fabricante, versao...). Ninguem cadastra isso a
 * mao no BIA: a Seguranca sobe o CSV na tela Threat Intelligence e este
 * modulo, no navegador, le o arquivo, acha as colunas pelo cabecalho e
 * consolida por fabricante + produto + versao (milhares de linhas viram
 * algumas centenas de softwares, cada um com os hosts onde esta). O servidor
 * (functions/threatIntelServico.js) grava e liga o host a Dependencia de
 * mesmo nome.
 *
 * Puro, sem DOM. Tambem exporta como CommonJS para o teste
 * (tests/inventario-csv.test.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InventarioCsv = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ordem = ordem dos selects do mapeamento. Sinonimos ja normalizados
  // (minusculas, sem acento, so letras e numeros).
  var CAMPOS = [
    { chave: 'host', rotulo: 'Hostname', obrigatorio: true,
      sinonimos: ['hostname', 'host', 'computador', 'computer', 'computername', 'nomedocomputador', 'maquina', 'nomedamaquina', 'machine', 'machinename', 'devicename', 'dispositivo', 'nomedodispositivo', 'ativo', 'asset', 'assetname', 'systemname', 'equipamento'] },
    { chave: 'produto', rotulo: 'Software / Produto', obrigatorio: true,
      sinonimos: ['software', 'produto', 'softwarename', 'nomedosoftware', 'product', 'productname', 'aplicativo', 'application', 'applicationname', 'programa', 'displayname', 'nome', 'name'] },
    { chave: 'fabricante', rotulo: 'Fabricante', obrigatorio: false,
      sinonimos: ['fabricante', 'publisher', 'vendor', 'manufacturer', 'editora', 'desenvolvedor', 'developer', 'fornecedor', 'softwarepublisher', 'empresa'] },
    { chave: 'versao', rotulo: 'Versão', obrigatorio: false,
      sinonimos: ['versao', 'version', 'softwareversion', 'displayversion', 'productversion', 'versaodosoftware'] },
    { chave: 'so', rotulo: 'Sistema operacional', obrigatorio: false,
      sinonimos: ['so', 'sistemaoperacional', 'os', 'operatingsystem', 'osname', 'sistema'] },
  ];

  var MAX_HOSTS_ITEM = 200;

  function _chave(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  }

  function _limpo(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  /** Separador mais provavel pela 1a linha, fora de aspas: ; (Excel pt-BR), tab ou ,. */
  function detectarSeparador(texto) {
    var linha = String(texto || '').split(/\r?\n/)[0] || '';
    var cont = { ';': 0, ',': 0, '\t': 0 };
    var aspas = false;
    for (var i = 0; i < linha.length; i++) {
      var c = linha[i];
      if (c === '"') aspas = !aspas;
      else if (!aspas && cont[c] !== undefined) cont[c]++;
    }
    if (cont[';'] >= cont[','] && cont[';'] >= cont['\t'] && cont[';'] > 0) return ';';
    if (cont['\t'] > cont[',']) return '\t';
    return ',';
  }

  /** Linhas do CSV (RFC 4180: aspas, "" dentro de aspas, quebra de linha dentro de aspas). Tira o BOM. */
  function parseCsv(texto, separador) {
    var s = String(texto || '').replace(/^﻿/, '');
    var sep = separador || detectarSeparador(s);
    var linhas = [];
    var linha = [];
    var campo = '';
    var aspas = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (aspas) {
        if (c === '"') {
          if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
        } else campo += c;
      } else if (c === '"') {
        aspas = true;
      } else if (c === sep) {
        linha.push(campo); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.some(function (x) { return x !== ''; })) linhas.push(linha);
        linha = [];
      } else campo += c;
    }
    linha.push(campo);
    if (linha.some(function (x) { return x !== ''; })) linhas.push(linha);
    return linhas;
  }

  /**
   * { host: indice, produto: indice, ... } pelo nome das colunas. Primeiro o
   * nome exato, depois "contem" (ex.: "Nome do Software (Display)"). Cada
   * coluna serve a um campo so. `salvo` (mapeamento por nome de coluna da
   * importacao anterior) vence quando a coluna existe.
   */
  function autoMapear(cabecalho, salvo) {
    var nomes = (cabecalho || []).map(_chave);
    var usado = {};
    var mapa = {};
    CAMPOS.forEach(function (campo) {
      var nomeSalvo = salvo && salvo[campo.chave] ? _chave(salvo[campo.chave]) : '';
      var idx = nomeSalvo ? nomes.indexOf(nomeSalvo) : -1;
      if (idx < 0) idx = nomes.findIndex(function (n, i) { return !usado[i] && campo.sinonimos.indexOf(n) >= 0; });
      if (idx < 0) {
        idx = nomes.findIndex(function (n, i) {
          return !usado[i] && n.length > 2 && campo.sinonimos.some(function (sin) { return sin.length > 3 && n.indexOf(sin) >= 0; });
        });
      }
      if (idx >= 0) { mapa[campo.chave] = idx; usado[idx] = true; }
    });
    return mapa;
  }

  /** Campos obrigatorios sem coluna. */
  function faltando(mapa) {
    return CAMPOS.filter(function (c) { return c.obrigatorio && !(mapa && mapa[c.chave] >= 0); });
  }

  /** Mapeamento por NOME de coluna (o que fica salvo para a proxima importacao). */
  function mapaPorNome(cabecalho, mapa) {
    var r = {};
    CAMPOS.forEach(function (c) {
      if (mapa && mapa[c.chave] >= 0) r[c.chave] = String(cabecalho[mapa[c.chave]] || '');
    });
    return r;
  }

  /**
   * Consolida as linhas (sem o cabecalho) por fabricante + produto + versao.
   * Devolve { itens: [{ fabricante, produto, versao, qtdHosts, hosts, sistemasOperacionais }],
   *           resumo: { linhas, descartadas, hosts, softwares } }.
   */
  function consolidar(linhas, mapa) {
    var porChave = {};
    var ordem = [];
    var hostsTodos = {};
    var descartadas = 0;
    var col = function (l, k) { return mapa[k] >= 0 ? _limpo(l[mapa[k]]) : ''; };
    (linhas || []).forEach(function (l) {
      var host = col(l, 'host');
      var produto = col(l, 'produto');
      if (!host || !produto) { descartadas++; return; }
      var fabricante = col(l, 'fabricante');
      var versao = col(l, 'versao');
      var k = [_chave(fabricante), _chave(produto), _chave(versao)].join('|');
      var item = porChave[k];
      if (!item) {
        item = porChave[k] = { fabricante: fabricante, produto: produto, versao: versao, _hosts: {}, qtdHosts: 0, hosts: [], _so: {} };
        ordem.push(k);
      }
      var hk = host.toLowerCase();
      if (!item._hosts[hk]) {
        item._hosts[hk] = true;
        item.qtdHosts++;
        if (item.hosts.length < MAX_HOSTS_ITEM) item.hosts.push(host);
      }
      hostsTodos[hk] = true;
      var so = col(l, 'so');
      if (so) item._so[so] = true;
    });
    var itens = ordem.map(function (k) {
      var x = porChave[k];
      return { fabricante: x.fabricante, produto: x.produto, versao: x.versao, qtdHosts: x.qtdHosts, hosts: x.hosts, sistemasOperacionais: Object.keys(x._so).slice(0, 20) };
    });
    return {
      itens: itens,
      resumo: { linhas: (linhas || []).length, descartadas: descartadas, hosts: Object.keys(hostsTodos).length, softwares: itens.length },
    };
  }

  /** Texto parece ter vindo em Windows-1252 lido como UTF-8 (caractere de substituicao)? */
  function pareceCodificacaoErrada(texto) {
    return /�/.test(String(texto || '').slice(0, 20000));
  }

  return {
    CAMPOS: CAMPOS,
    detectarSeparador: detectarSeparador,
    parseCsv: parseCsv,
    autoMapear: autoMapear,
    faltando: faltando,
    mapaPorNome: mapaPorNome,
    consolidar: consolidar,
    pareceCodificacaoErrada: pareceCodificacaoErrada,
  };
}));
