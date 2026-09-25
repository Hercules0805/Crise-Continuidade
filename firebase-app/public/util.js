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

  /**
   * Desabilita o botao, liga o spinner (classe .btn-loading, ja existe em
   * styles.css), roda fnAsync, e SEMPRE restaura o botao no finally --
   * inclusive se fnAsync jogar erro. Quem chama continua dono do try/catch e
   * do toast de sucesso/erro; o helper so cuida do estado visual do botao.
   */
  async function comBotaoCarregando(botao, fnAsync) {
    var btn = typeof botao === 'string' ? document.getElementById(botao) : botao;
    if (!btn) return fnAsync();
    var disabledOriginal = btn.disabled;
    btn.disabled = true;
    btn.classList.add('btn-loading');
    try {
      return await fnAsync();
    } finally {
      btn.disabled = disabledOriginal;
      btn.classList.remove('btn-loading');
    }
  }

  /**
   * Fabrica do estado de ordenacao de uma tabela -- substitui os pares
   * `xOrdenacao = {coluna, direcao}` / `ordenarX()` que cada tela repetia na
   * mao. comparadores[coluna], se existir, recebe (a, b, dir) com dir ja em
   * +1/-1 e e DONO de aplica-lo -- e assim que "nulo sempre por ultimo"
   * (score de Risco, nota de Fornecedor) nao inverte de lado ao clicar de
   * novo pra inverter a seta. Sem comparador pra coluna, cai no default:
   * string minuscula, pt-BR.
   */
  function criarOrdenacao(colunaInicial, direcaoInicial) {
    var estado = { coluna: colunaInicial, direcao: direcaoInicial || 'asc' };
    return {
      estado: estado,
      ordenar: function (coluna) {
        if (estado.coluna === coluna) estado.direcao = estado.direcao === 'asc' ? 'desc' : 'asc';
        else { estado.coluna = coluna; estado.direcao = 'asc'; }
      },
      aplicar: function (lista, comparadores) {
        comparadores = comparadores || {};
        var dir = estado.direcao === 'asc' ? 1 : -1;
        var cmp = comparadores[estado.coluna];
        return lista.slice().sort(function (a, b) {
          if (cmp) return cmp(a, b, dir);
          return dir * (a[estado.coluna] || '').toString().toLowerCase()
            .localeCompare((b[estado.coluna] || '').toString().toLowerCase(), 'pt-BR');
        });
      },
      atualizarSetas: function (prefixo, colunas) {
        colunas.forEach(function (col) {
          var el = document.getElementById(prefixo + col);
          if (el) el.textContent = col === estado.coluna ? (estado.direcao === 'asc' ? '▲' : '▼') : '';
        });
      },
    };
  }

  /** '12345678000190' | '12.345.678/0001-90' -> '12.345.678/0001-90'. Trunca em 14 digitos. */
  function formatarCNPJ(valor) {
    var d = String(valor || '').replace(/\D/g, '').slice(0, 14);
    var out = d.slice(0, 2);
    if (d.length > 2) out += '.' + d.slice(2, 5);
    if (d.length > 5) out += '.' + d.slice(5, 8);
    if (d.length > 8) out += '/' + d.slice(8, 12);
    if (d.length > 12) out += '-' + d.slice(12, 14);
    return out;
  }

  /**
   * Detecta fixo (10 digitos) vs celular (11) enquanto digita. Sem
   * preservacao de cursor no meio do texto -- primeira mascara do sistema,
   * sem precedente a manter; aceitavel pra campo curto digitado do inicio
   * pro fim.
   */
  function formatarTelefoneBR(valor) {
    var d = String(valor || '').replace(/\D/g, '').slice(0, 11);
    var fixo = d.length <= 10;
    var meio = fixo ? d.slice(2, 6) : d.slice(2, 7);
    var fim = fixo ? d.slice(6, 10) : d.slice(7, 11);
    var out = d.slice(0, 2) ? '(' + d.slice(0, 2) : '';
    if (d.length > 2) out += ') ' + meio;
    if (d.length > (fixo ? 6 : 7)) out += '-' + fim;
    return out;
  }

  return {
    esc: esc, escJs: escJs, escScript: escScript,
    comBotaoCarregando: comBotaoCarregando, criarOrdenacao: criarOrdenacao,
    formatarCNPJ: formatarCNPJ, formatarTelefoneBR: formatarTelefoneBR,
  };
});
