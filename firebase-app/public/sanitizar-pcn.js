/**
 * Sanitizacao do HTML do PCN.
 *
 * O conteudo do PCN e gerado pelo Gemini a partir dos campos do processo, e o
 * prompt manda explicitamente NAO mascarar nada. Quem conseguir gravar num
 * campo de processo — por exemplo pelo formulario externo de dependencias —
 * consegue plantar instrucao que volta como HTML. Esse HTML era inserido na
 * pagina com document.write e executava na sessao de quem abrisse o PCN, que
 * normalmente e o administrador. Ficava gravado e disparava de novo a cada
 * abertura.
 *
 * Aqui o conteudo passa a ser limpo ANTES de entrar na pagina.
 *
 * POR QUE NAO ISOLAR EM IFRAME, que seria mais forte: a pagina do PCN precisa
 * do proprio script para montar o indice lateral, trocar de versao e permitir
 * a edicao inline (pcn-live.js). Um iframe com sandbox exigiria reescrever
 * essas tres coisas para atravessar a fronteira. Fica registrado como o passo
 * seguinte; a sanitizacao cobre o risco agora sem quebrar o que funciona.
 *
 * Usa DOMPurify quando disponivel. Se a biblioteca nao carregar, cai numa
 * limpeza propria mais conservadora, que remove o essencial e AVISA — e o
 * chamador decide se segue.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Elementos que nunca fazem sentido num documento de PCN e que carregam risco.
  var TAGS_PROIBIDAS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'svg', 'math'];

  /**
   * Limpeza de emergencia, usada so quando DOMPurify nao esta disponivel.
   * Baseada em DOM, nao em expressao regular: o navegador faz o parse e a
   * gente remove nos e atributos: e bem mais dificil de burlar do que regex.
   */
  function _limpezaBasica(html) {
    var doc = document.implementation.createHTMLDocument('pcn');
    doc.body.innerHTML = String(html || '');

    TAGS_PROIBIDAS.forEach(function (tag) {
      Array.prototype.slice.call(doc.body.querySelectorAll(tag)).forEach(function (el) {
        el.parentNode.removeChild(el);
      });
    });

    Array.prototype.slice.call(doc.body.querySelectorAll('*')).forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var nome = attr.name.toLowerCase();
        var valor = String(attr.value || '').replace(/\s+/g, '').toLowerCase();
        // Qualquer manipulador de evento: onclick, onerror, onload...
        if (nome.indexOf('on') === 0) el.removeAttribute(attr.name);
        // URLs executaveis em href/src/action/formaction.
        else if (/^(href|src|action|formaction|xlink:href)$/.test(nome) && /^(javascript|data|vbscript):/.test(valor)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML;
  }

  /**
   * Devolve { html, usouFallback }. O chamador avisa o usuario quando
   * usouFallback for verdadeiro, porque ai a limpeza foi a caseira.
   */
  function sanitizarPCN(html) {
    var entrada = String(html || '');
    if (typeof DOMPurify !== 'undefined' && DOMPurify && typeof DOMPurify.sanitize === 'function') {
      return {
        html: DOMPurify.sanitize(entrada, {
          FORBID_TAGS: TAGS_PROIBIDAS,
          // style em atributo e usado pelo layout do PCN e nao executa sozinho.
          ALLOW_DATA_ATTR: false,
        }),
        usouFallback: false,
      };
    }
    return { html: _limpezaBasica(entrada), usouFallback: true };
  }

  return { sanitizarPCN: sanitizarPCN, _limpezaBasica: _limpezaBasica, TAGS_PROIBIDAS: TAGS_PROIBIDAS };
});
