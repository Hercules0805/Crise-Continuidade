/**
 * Campo de escolha com busca (29/10/2026).
 *
 * Aprimora um <select> de cadastro (Pessoas, Áreas, Processos...) com um campo
 * onde se digita para filtrar: sem acento, por qualquer parte do texto, com os
 * <optgroup> como grupos, ↑/↓/Enter/Esc e o trecho digitado destacado.
 *
 * O <select> CONTINUA sendo a fonte da verdade: fica no DOM (escondido, mesmo
 * id), as funções de popular continuam reescrevendo as <option>, os coletores
 * leem select.value e a escolha dispara `change` (os onchange de sempre
 * funcionam). Repopular o select ou fazer `sel.value = x` no código atualiza o
 * campo sozinho.
 *
 * Ligação: `<select data-busca>`. ComboboxBusca.observar(document.body)
 * aprimora todo select marcado que aparecer na página.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ComboboxBusca = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITE = 50;
  var SEP_INFO = ' — ';
  var seq = 0;

  function norm(t) {
    if (typeof normalizarBusca === 'function') return normalizarBusca(t); // eslint-disable-line no-undef
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function escHtml(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Texto com o termo destacado (comparação sem acento, mantendo o texto original). */
  function destacar(texto, termo) {
    if (!termo) return escHtml(texto);
    var mapa = [];
    var normal = '';
    for (var i = 0; i < texto.length; i++) {
      var n = norm(texto.charAt(i));
      if (texto.charAt(i) === ' ') n = ' ';
      for (var k = 0; k < n.length; k++) { normal += n.charAt(k); mapa.push(i); }
    }
    var pos = normal.indexOf(termo);
    if (pos < 0) return escHtml(texto);
    var ini = mapa[pos];
    var fim = mapa[pos + termo.length - 1] + 1;
    return escHtml(texto.slice(0, ini)) + '<mark>' + escHtml(texto.slice(ini, fim)) + '</mark>' + escHtml(texto.slice(fim));
  }

  function aprimorar(sel) {
    if (!sel || sel.tagName !== 'SELECT') return null;
    if (sel._comboBusca) return sel._comboBusca;
    var doc = sel.ownerDocument;
    var win = doc.defaultView;
    var id = 'comboBusca' + (++seq);

    var caixa = doc.createElement('div');
    caixa.className = 'combo-busca';
    if (sel.style.flex) caixa.style.flex = sel.style.flex;
    if (sel.style.width) caixa.style.width = sel.style.width;
    var campo = doc.createElement('input');
    campo.type = 'search';
    campo.className = 'combo-busca__campo';
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-autocomplete', 'list');
    campo.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-controls', id + '-lista');
    campo.setAttribute('autocomplete', 'off');
    campo.style.cssText = sel.style.cssText;
    campo.style.width = '100%';
    campo.style.boxSizing = 'border-box';
    campo.style.display = '';
    campo.style.paddingRight = '30px'; // espaço do "×"
    if (sel.getAttribute('aria-label')) campo.setAttribute('aria-label', sel.getAttribute('aria-label'));
    if (sel.id) {
      // O <label for="id"> passa a apontar para o campo de busca.
      var rot = doc.querySelector('label[for="' + sel.id + '"]');
      if (rot) { campo.id = sel.id + '__busca'; rot.setAttribute('for', campo.id); }
    }
    var limpar = doc.createElement('button');
    limpar.type = 'button';
    limpar.className = 'combo-busca__limpar';
    limpar.setAttribute('aria-label', 'Limpar');
    limpar.title = 'Limpar';
    limpar.innerHTML = '&times;';
    limpar.hidden = true;
    var lista = doc.createElement('div');
    lista.className = 'combo-busca__lista';
    lista.id = id + '-lista';
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    caixa.appendChild(campo);
    caixa.appendChild(limpar);
    caixa.appendChild(lista);
    sel.parentNode.insertBefore(caixa, sel);
    sel.classList.add('combo-busca__select');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');

    var itens = [];
    var vazio = null;
    var visiveis = [];
    var ativo = -1;
    var digitou = false;

    function ler() {
      itens = [];
      vazio = null;
      Array.prototype.forEach.call(sel.options, function (op) {
        var texto = op.textContent || '';
        var grupo = op.parentNode && op.parentNode.tagName === 'OPTGROUP' ? op.parentNode.label : '';
        var item = { value: op.value, texto: texto, grupo: grupo, disabled: op.disabled, chave: norm(texto + ' ' + (op.getAttribute('data-busca') || '')) };
        if (op.value === '' && !vazio) vazio = item; else itens.push(item);
      });
      campo.placeholder = vazio ? vazio.texto : 'Buscar...';
    }

    function mostrarAtual() {
      var op = sel.options[sel.selectedIndex];
      var tem = sel.value !== '' && !!op;
      campo.value = tem ? op.textContent : '';
      limpar.hidden = !(tem && vazio && !sel.disabled);
      digitou = false;
    }

    function espelhar() {
      campo.disabled = sel.disabled;
      caixa.style.display = sel.style.display === 'none' || sel.hidden ? 'none' : '';
      if (sel.disabled) limpar.hidden = true;
    }

    function fechar() {
      lista.hidden = true;
      campo.setAttribute('aria-expanded', 'false');
      campo.removeAttribute('aria-activedescendant');
      ativo = -1;
    }

    function marcarAtivo() {
      var opcoes = lista.querySelectorAll('.combo-busca__opcao');
      Array.prototype.forEach.call(opcoes, function (el, i) {
        var sim = i === ativo;
        el.setAttribute('aria-selected', sim ? 'true' : 'false');
        el.classList.toggle('combo-busca__opcao--ativa', sim);
        if (sim) {
          campo.setAttribute('aria-activedescendant', el.id);
          if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function abrir() {
      if (sel.disabled) return;
      var termo = digitou ? norm(campo.value) : '';
      var candidatos = itens.filter(function (x) { return !x.disabled && (!termo || x.chave.indexOf(termo) >= 0); });
      visiveis = candidatos.slice(0, LIMITE);
      var html = '';
      var grupo = null;
      visiveis.forEach(function (x, i) {
        if (x.grupo !== grupo) {
          grupo = x.grupo;
          if (grupo) html += '<div class="combo-busca__grupo" role="presentation">' + escHtml(grupo) + '</div>';
        }
        var corte = x.texto.indexOf(SEP_INFO);
        var principal = corte >= 0 ? x.texto.slice(0, corte) : x.texto;
        var info = corte >= 0 ? x.texto.slice(corte + SEP_INFO.length) : '';
        html += '<div class="combo-busca__opcao' + (x.value === sel.value ? ' combo-busca__opcao--atual' : '') + '" role="option" id="' + id + '-op' + i + '" data-i="' + i + '" aria-selected="false">'
          + '<span class="combo-busca__nome">' + destacar(principal, termo) + '</span>'
          + (info ? '<span class="combo-busca__info">' + destacar(info, termo) + '</span>' : '')
          + '</div>';
      });
      if (!visiveis.length) html = '<div class="combo-busca__vazio">' + (itens.length ? 'Nada encontrado.' : 'Nenhuma opção disponível.') + '</div>';
      else if (candidatos.length > LIMITE) html += '<div class="combo-busca__mais">+ ' + (candidatos.length - LIMITE) + ' — continue digitando para filtrar</div>';
      lista.innerHTML = html;
      lista.hidden = false;
      campo.setAttribute('aria-expanded', 'true');
      ativo = termo && visiveis.length ? 0 : -1;
      marcarAtivo();
    }

    function escolher(i) {
      var x = visiveis[i];
      if (!x) return;
      sel.value = x.value;
      sel.dispatchEvent(new win.Event('change', { bubbles: true }));
      fechar();
      // Campo de "adicionar": o handler devolve o select para vazio -- o texto
      // some e o foco fica para a próxima escolha.
      mostrarAtual();
    }

    campo.addEventListener('focus', function () {
      if (campo.select) campo.select();
      abrir();
    });
    campo.addEventListener('input', function () { digitou = true; abrir(); });
    campo.addEventListener('keydown', function (e) {
      var n = visiveis.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (lista.hidden) { abrir(); return; }
        if (!n) return;
        ativo = e.key === 'ArrowDown' ? (ativo + 1) % n : (ativo <= 0 ? n - 1 : ativo - 1);
        marcarAtivo();
      } else if (e.key === 'Enter') {
        if (!lista.hidden) {
          e.preventDefault();
          if (ativo >= 0) escolher(ativo);
        }
      } else if (e.key === 'Escape') {
        if (!lista.hidden) {
          e.preventDefault();
          e.stopPropagation();
          fechar();
          mostrarAtual();
        }
      } else if (e.key === 'Tab') {
        fechar();
        mostrarAtual();
      }
    });
    campo.addEventListener('blur', function () {
      win.setTimeout(function () {
        if (doc.activeElement === campo) return;
        fechar();
        mostrarAtual();
      }, 150);
    });
    lista.addEventListener('mousedown', function (e) {
      e.preventDefault(); // não deixa o blur fechar antes da escolha
      var el = e.target.closest ? e.target.closest('.combo-busca__opcao') : null;
      if (el) escolher(Number(el.getAttribute('data-i')));
    });
    limpar.addEventListener('click', function () {
      sel.value = '';
      sel.dispatchEvent(new win.Event('change', { bubbles: true }));
      mostrarAtual();
      campo.focus();
    });

    // `sel.value = x` / `sel.selectedIndex = n` no código atualizam o texto.
    ['value', 'selectedIndex'].forEach(function (prop) {
      var d = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, prop);
      if (!d || !d.set) return;
      Object.defineProperty(sel, prop, {
        configurable: true,
        get: function () { return d.get.call(this); },
        set: function (v) { d.set.call(this, v); if (doc.activeElement !== campo) mostrarAtual(); },
      });
    });
    // Repopular o select (innerHTML) ou trocar disabled/visibilidade.
    var obs = new win.MutationObserver(function () {
      ler();
      espelhar();
      if (doc.activeElement === campo && !lista.hidden) abrir();
      else mostrarAtual();
    });
    obs.observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'style', 'hidden', 'label'] });

    ler();
    espelhar();
    mostrarAtual();
    var api = {
      campo: campo,
      lista: lista,
      atualizar: function () { ler(); espelhar(); mostrarAtual(); },
      abrir: function () { abrir(); },
      escolher: escolher,
    };
    sel._comboBusca = api;
    return api;
  }

  /** Aprimora os select[data-busca] já presentes e os que aparecerem depois. */
  function observar(raiz) {
    if (!raiz || !raiz.querySelectorAll) return null;
    var win = (raiz.ownerDocument || raiz).defaultView || raiz.defaultView;
    Array.prototype.forEach.call(raiz.querySelectorAll('select[data-busca]'), aprimorar);
    if (!win || !win.MutationObserver) return null;
    var obs = new win.MutationObserver(function (mudancas) {
      mudancas.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (no) {
          if (no.nodeType !== 1) return;
          if (no.matches && no.matches('select[data-busca]')) aprimorar(no);
          if (no.querySelectorAll) Array.prototype.forEach.call(no.querySelectorAll('select[data-busca]'), aprimorar);
        });
      });
    });
    obs.observe(raiz, { childList: true, subtree: true });
    return obs;
  }

  return { aprimorar: aprimorar, observar: observar, destacar: destacar, LIMITE: LIMITE };
}));
