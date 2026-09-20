/**
 * Escape de HTML. Carregar ANTES de api.js e app.js.
 *
 * O projeto monta todo o HTML concatenando string com dado do banco, e nao
 * tinha nenhuma funcao de escape. Consequencia pratica: um nome de processo,
 * area ou fornecedor com aspas ou com "<" quebrava a renderizacao da tabela
 * (linhas desapareciam, botoes paravam de responder) e, no caso geral,
 * permitia executar script no navegador de qualquer pessoa que abrisse a tela
 * — inclusive do administrador.
 *
 * SAO DUAS FUNCOES porque sao dois contextos diferentes:
 *
 *   esc(v)   -> texto e valor de atributo entre aspas.
 *               `<td>${esc(p.processo)}</td>`
 *               `<input value="${esc(d.nome)}">`
 *
 *   escJs(v) -> valor que cai dentro de uma string JavaScript, que por sua vez
 *               esta dentro de um atributo HTML. So escapar HTML NAO resolve
 *               aqui: o navegador decodifica as entidades ANTES de o JS rodar,
 *               entao um apostrofo viraria apostrofo de novo e fecharia a
 *               string. escJs escapa primeiro para JS, depois para HTML.
 *               `onclick="abrir('${escJs(d.nome)}')"`
 *
 * Onde der, prefira passar o id em vez do nome no onclick — some o problema.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAPA_HTML = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  /** Texto ou valor de atributo. null/undefined viram string vazia. */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (ch) { return MAPA_HTML[ch]; });
  }

  /** Valor dentro de string JS dentro de atributo HTML. Escapa JS, depois HTML. */
  function escJs(v) {
    if (v === null || v === undefined) return '';
    var js = String(v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return esc(js);
  }

  /**
   * Valor dentro de uma string JS num bloco <script> gerado.
   *
   * Aqui NAO se escapa HTML: o conteudo de <script> nao passa pelo decodificador
   * de entidades, entao &#39; chegaria literal ao JS. O que importa e escapar
   * para JS e neutralizar "<", porque um "</script>" no meio do dado encerraria
   * o bloco antes da hora.
   */
  function escScript(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/</g, '\\x3c');
  }

  return { esc: esc, escJs: escJs, escScript: escScript };
});
