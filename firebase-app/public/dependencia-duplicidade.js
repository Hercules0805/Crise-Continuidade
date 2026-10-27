/**
 * Duplicidade no catalogo de dependencias (27/10/2026), sem DOM.
 *
 * Duas dependencias sao duplicadas quando tem a MESMA categoria e o MESMO nome
 * normalizado (minusculas, sem acento, espacos colapsados). Para nao barrar
 * homonimos legitimos:
 *   - Pessoas: so duplica se o e-mail for igual (e nao vazio);
 *   - Fornecedores: alem do nome, duplica se o CNPJ (so digitos) for igual (e nao vazio).
 * O proprio registro (mesmo id) nunca conta como duplicado de si mesmo.
 *
 * Tambem exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DependenciaDuplicidade = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalizarNome(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function soDigitos(s) {
    return String(s == null ? '' : s).replace(/\D+/g, '');
  }

  function ehPessoa(d) { return d && d.categoria === 'Pessoas'; }
  function ehFornecedor(d) { return d && d.categoria === 'Fornecedores'; }

  /** Verdadeiro se `a` e `b` (ja de ids diferentes) sao o mesmo cadastro. */
  function saoDuplicadas(a, b) {
    if (!a || !b || a.categoria !== b.categoria) return false;
    if (ehPessoa(a)) {
      var ea = normalizarNome(a.email);
      return !!ea && ea === normalizarNome(b.email);
    }
    if (ehFornecedor(a)) {
      var ca = soDigitos(a.cnpj);
      if (ca && ca === soDigitos(b.cnpj)) return true;
    }
    var na = normalizarNome(a.nome);
    return !!na && na === normalizarNome(b.nome);
  }

  /** Primeiro registro de `lista` que duplica `candidato` (ignorando o mesmo id), ou null. */
  function acharDuplicada(lista, candidato) {
    if (!candidato || !Array.isArray(lista)) return null;
    var id = candidato.id == null ? '' : String(candidato.id);
    for (var i = 0; i < lista.length; i++) {
      var x = lista[i];
      if (!x) continue;
      if (id && String(x.id) === id) continue;
      if (saoDuplicadas(candidato, x)) return x;
    }
    return null;
  }

  /** Texto do aviso ao usuario. */
  function mensagem(existente) {
    var cat = existente && existente.categoria ? ' em ' + existente.categoria : '';
    return 'Já existe "' + (existente && existente.nome || '') + '"' + cat + '.';
  }

  return { normalizarNome: normalizarNome, soDigitos: soDigitos, saoDuplicadas: saoDuplicadas, acharDuplicada: acharDuplicada, mensagem: mensagem };
}));
