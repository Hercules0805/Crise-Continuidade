/**
 * Menu lateral (DECISÃO 23/10/2026 — protótipo A, "árvore acordeão").
 *
 * O markup fica em index.html (grupos .nav-group > .nav-group-label + .nav-itens,
 * subníveis .nav-sub > .nav-sub-label + .nav-sub-itens, telas .nav-link[data-page]).
 * Este arquivo só dá o comportamento:
 *  - permissão: esconde telas que o perfil não vê e subníveis/grupos que ficaram vazios;
 *  - acordeão: um grupo aberto por vez; o grupo e o subnível da tela atual abrem sozinhos;
 *  - recolher: a barra vira coluna de ícones (estado lembrado no navegador) e o grupo
 *    abre num painel flutuante; em tela estreita (até 1024px) o menu vira gaveta.
 * A busca de telas e o route() continuam lendo os próprios .nav-link (sem outra lista).
 */
(function () {
  var CHAVE_RECOLHIDO = 'grc360.menuRecolhido';
  var LARGURA_GAVETA = 1024;
  var _escolhaSub = {}; // subnível aberto/fechado pelo usuário: chave -> true/false
  var _timerFlyout = null;

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
  function visivel(el) { return el.style.display !== 'none'; }
  function ehGaveta() { return window.matchMedia ? window.matchMedia('(max-width: ' + LARGURA_GAVETA + 'px)').matches : false; }
  function recolhido() { return document.body.classList.contains('menu-recolhido') && !ehGaveta(); }

  function lerRecolhido() { try { return localStorage.getItem(CHAVE_RECOLHIDO) === '1'; } catch (e) { return false; } }
  function gravarRecolhido(v) { try { localStorage.setItem(CHAVE_RECOLHIDO, v ? '1' : '0'); } catch (e) { /* sem armazenamento: só não lembra */ } }

  // ---- Permissão: telas do perfil; subníveis e grupos vazios somem ----
  function aplicarPerfil(podeVer) {
    $$('#menuLateral .nav-link[data-page]').forEach(function (a) {
      a.style.display = podeVer(a.dataset.page) ? '' : 'none';
    });
    $$('#menuLateral .nav-sub').forEach(function (s) {
      s.style.display = $$('.nav-link', s).some(visivel) ? '' : 'none';
    });
    $$('#menuLateral .nav-group').forEach(function (g) {
      g.style.display = $$('.nav-link', g).some(visivel) ? '' : 'none';
    });
    var rodape = $('#menuLateral .menu-rodape');
    if (rodape) rodape.style.display = $$('.nav-group', rodape).some(visivel) ? '' : 'none';
  }

  // ---- Abrir/fechar ----
  function abrirGrupo(g, aberto) {
    g.classList.toggle('open', aberto);
    var b = $('.nav-group-label', g);
    if (b) b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }
  function abrirSub(s, aberto) {
    s.classList.toggle('open', aberto);
    var b = $('.nav-sub-label', s);
    if (b) b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }
  // Em grupo com até 2 subníveis (Riscos) eles começam abertos; com mais
  // (Configurações), fechados -- abre só o da tela atual. O clique do usuário vale por cima.
  function subAbertoPorPadrao(s) {
    var g = s.closest('.nav-group');
    return $$('.nav-sub', g).filter(visivel).length <= 2;
  }
  function ajustarSubs(g) {
    $$('.nav-sub', g).forEach(function (s) {
      var temAtivo = !!$('.nav-link.active', s);
      var chave = s.dataset.sub;
      abrirSub(s, temAtivo || (chave in _escolhaSub ? _escolhaSub[chave] : subAbertoPorPadrao(s)));
    });
  }

  /** Tela atual: destaca o item e abre o grupo e o subnível dele (fecha os outros). */
  function marcarAtivo(page) {
    $$('#menuLateral .nav-link').forEach(function (a) {
      var ativo = a.dataset.page === page;
      a.classList.toggle('active', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('#menuLateral .nav-group').forEach(function (g) {
      var tem = !!$('.nav-link.active', g);
      g.classList.toggle('has-active', tem);
      abrirGrupo(g, tem);
      ajustarSubs(g);
    });
    $$('#menuLateral .nav-sub').forEach(function (s) { s.classList.toggle('has-active', !!$('.nav-link.active', s)); });
    fecharFlyout();
    fecharGaveta();
  }

  // ---- Recolher ----
  function aplicarRecolhido(v) {
    document.body.classList.toggle('menu-recolhido', v);
    var rot = v ? 'Expandir menu' : 'Recolher menu';
    $$('[data-menu-recolher]').forEach(function (b) {
      b.setAttribute('aria-label', rot);
      b.setAttribute('title', rot);
      var t = $('.rot', b);
      if (t) t.textContent = rot;
    });
    fecharFlyout();
  }
  function alternar() {
    if (ehGaveta()) {
      if (document.body.classList.contains('menu-gaveta-aberta')) fecharGaveta(); else abrirGaveta();
      return;
    }
    var v = !document.body.classList.contains('menu-recolhido');
    gravarRecolhido(v);
    aplicarRecolhido(v);
  }

  // ---- Painel flutuante (menu recolhido) ----
  function flyout() {
    var f = document.getElementById('menuFlyout');
    if (!f) {
      f = document.createElement('div');
      f.id = 'menuFlyout';
      f.className = 'menu-flyout';
      f.setAttribute('role', 'menu');
      f.addEventListener('mouseenter', function () { clearTimeout(_timerFlyout); });
      f.addEventListener('mouseleave', function () { _timerFlyout = setTimeout(fecharFlyout, 250); });
      f.addEventListener('click', function (e) { if (e.target.closest('a')) fecharFlyout(); });
      document.body.appendChild(f);
    }
    return f;
  }
  function abrirFlyout(g) {
    var f = flyout();
    var rotulo = $('.nav-group-label .rot', g).textContent.trim();
    var html = '<div class="menu-flyout__titulo">' + rotulo + '</div>';
    // Cópias com outra classe (não .nav-link): route() e a busca leem só o menu.
    Array.prototype.forEach.call($('.nav-itens', g).children, function (el) {
      if (!visivel(el)) return;
      if (el.classList.contains('nav-sub')) {
        html += '<div class="menu-flyout__secao">' + $('.nav-sub-label .rot', el).textContent.trim() + '</div>';
        $$('.nav-link', el).filter(visivel).forEach(function (a) { html += copia(a); });
      } else if (el.classList.contains('nav-link')) {
        html += copia(el);
      }
    });
    f.innerHTML = html;
    f.dataset.grupo = g.dataset.group;
    f.classList.add('open');
    var r = $('.nav-group-label', g).getBoundingClientRect();
    f.style.left = (r.right + 8) + 'px';
    f.style.top = Math.max(8, Math.min(r.top, window.innerHeight - f.offsetHeight - 8)) + 'px';
  }
  function copia(a) {
    return '<a href="' + a.getAttribute('href') + '" role="menuitem" class="menu-flyout__link' + (a.classList.contains('active') ? ' active' : '') + '">' + a.textContent.trim() + '</a>';
  }
  function fecharFlyout() {
    var f = document.getElementById('menuFlyout');
    if (f) { f.classList.remove('open'); f.dataset.grupo = ''; }
  }

  // ---- Gaveta (tela estreita) ----
  function abrirGaveta() { document.body.classList.add('menu-gaveta-aberta'); }
  function fecharGaveta() { document.body.classList.remove('menu-gaveta-aberta'); }

  function iniciar() {
    var menu = document.getElementById('menuLateral');
    if (!menu || menu.dataset.iniciado) return; // ouvintes uma vez só
    menu.dataset.iniciado = '1';
    aplicarRecolhido(lerRecolhido());
    menu.addEventListener('click', function (e) {
      var gb = e.target.closest('.nav-group-label');
      if (gb) {
        var g = gb.closest('.nav-group');
        if (recolhido()) {
          var f = document.getElementById('menuFlyout');
          if (f && f.classList.contains('open') && f.dataset.grupo === g.dataset.group) fecharFlyout(); else abrirFlyout(g);
          return;
        }
        var abrir = !g.classList.contains('open');
        $$('#menuLateral .nav-group.open').forEach(function (x) { abrirGrupo(x, false); });
        abrirGrupo(g, abrir);
        if (abrir) ajustarSubs(g);
        return;
      }
      var sb = e.target.closest('.nav-sub-label');
      if (sb) {
        var s = sb.closest('.nav-sub');
        var v = !s.classList.contains('open');
        _escolhaSub[s.dataset.sub] = v;
        abrirSub(s, v);
        return;
      }
      if (e.target.closest('[data-menu-buscar]')) {
        // Recolhido: a lupa expande o menu e já põe o cursor na busca.
        gravarRecolhido(false);
        aplicarRecolhido(false);
        var input = document.getElementById('navBuscaInput');
        if (input) setTimeout(function () { input.focus(); }, 50);
      }
    });
    menu.addEventListener('mouseover', function (e) {
      var gb = e.target.closest('.nav-group-label');
      if (!gb || !recolhido()) return;
      clearTimeout(_timerFlyout);
      var g = gb.closest('.nav-group');
      var f = document.getElementById('menuFlyout');
      if (!f || !f.classList.contains('open') || f.dataset.grupo !== g.dataset.group) abrirFlyout(g);
    });
    menu.addEventListener('mouseleave', function () { if (recolhido()) _timerFlyout = setTimeout(fecharFlyout, 250); });
    $$('[data-menu-recolher]').forEach(function (b) { b.addEventListener('click', alternar); });
    var veu = document.getElementById('menuVeu');
    if (veu) veu.addEventListener('click', fecharGaveta);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#menuFlyout') && !e.target.closest('#menuLateral .nav-group-label')) fecharFlyout();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var f = document.getElementById('menuFlyout');
      if ((f && f.classList.contains('open')) || document.body.classList.contains('menu-gaveta-aberta')) {
        fecharFlyout();
        fecharGaveta();
        e.preventDefault(); // não fecha também um drawer aberto por baixo
      }
    }, true); // captura: roda antes do Esc geral do app.js (que fecha drawers)
  }

  window.MenuLateral = {
    iniciar: iniciar,
    aplicarPerfil: aplicarPerfil,
    marcarAtivo: marcarAtivo,
    alternar: alternar,
    fecharFlyout: fecharFlyout,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
