// ============================================================
// TABELA EDITAVEL - inserir/excluir linhas e colunas nas tabelas dos
// documentos gerados por IA (DRP, PCN, Roteiro de Teste).
//
// Carregado por URL absoluta nos tres popups (window.open + document.write,
// base about:blank -- mesmo motivo de drp-live.js/pcn-live.js). A barra fica
// FORA da area editavel, entao nunca entra no HTML salvo.
//
// Depois de cada mudanca de estrutura, dispara 'input' na area editavel com o
// cursor numa celula da tabela: e o que faz o DRP travar a secao com o
// cadeado, igual a uma edicao de texto (ver _buildDRPPage em app.js).
//
// So ASCII neste arquivo (acentos via \u): o popup do Roteiro de Teste nao
// declara charset.
// ============================================================
(function () {
  var IDS_AREA = ['drp-editavel', 'pcn-editavel', 'roteiro-conteudo'];
  var area = null;
  for (var i = 0; i < IDS_AREA.length && !area; i++) area = document.getElementById(IDS_AREA[i]);
  if (!area) return;

  var estilo = document.createElement('style');
  estilo.textContent =
    '.tabela-toolbar{position:absolute;z-index:70;display:none;align-items:center;gap:4px;flex-wrap:wrap;' +
    'background:#fff;border:1.5px solid #e0e0e0;border-radius:8px;padding:5px 8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);' +
    'font-family:"Segoe UI",Arial,sans-serif;font-size:8.5pt;color:#666}' +
    '.tabela-toolbar button{padding:3px 9px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#333;cursor:pointer;font-size:8.5pt}' +
    '.tabela-toolbar button:hover:not(:disabled){border-color:#d60014;color:#d60014}' +
    '.tabela-toolbar button:disabled{opacity:.4;cursor:not-allowed}' +
    '.tabela-toolbar .tt-excluir{color:#c62828}' +
    '.tabela-toolbar .tt-sep{width:1px;height:18px;background:#e0e0e0;margin:0 4px}' +
    '@media print{.tabela-toolbar{display:none!important}}';
  document.head.appendChild(estilo);

  var barra = document.createElement('div');
  barra.className = 'tabela-toolbar';
  barra.innerHTML =
    '<span>Linha:</span>' +
    '<button type="button" data-acao="linhaAcima">+ acima</button>' +
    '<button type="button" data-acao="linhaAbaixo">+ abaixo</button>' +
    '<button type="button" data-acao="excluirLinha" class="tt-excluir">Excluir</button>' +
    '<span class="tt-sep"></span>' +
    '<span>Coluna:</span>' +
    '<button type="button" data-acao="colunaEsquerda">+ esquerda</button>' +
    '<button type="button" data-acao="colunaDireita">+ direita</button>' +
    '<button type="button" data-acao="excluirColuna" class="tt-excluir">Excluir</button>';
  document.body.appendChild(barra);

  function celulaAtual() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var n = sel.getRangeAt(0).startContainer;
    if (n && n.nodeType !== 1) n = n.parentNode;
    var cel = n && n.closest ? n.closest('td,th') : null;
    return cel && area.contains(cel) ? cel : null;
  }

  function linhaDeCabecalho(tr) {
    if (tr.parentNode && tr.parentNode.tagName === 'THEAD') return true;
    for (var i = 0; i < tr.cells.length; i++) if (tr.cells[i].tagName !== 'TH') return false;
    return tr.cells.length > 0;
  }

  // Celula mesclada desalinha "a coluna N" entre as linhas -- nesse caso a
  // barra nao mexe na estrutura em vez de arriscar estragar a tabela.
  function temMescla(tabela) {
    var cs = tabela.querySelectorAll('td,th');
    for (var i = 0; i < cs.length; i++) {
      if ((cs[i].colSpan || 1) > 1 || (cs[i].rowSpan || 1) > 1) return true;
    }
    return false;
  }

  function linhasDeDados(tabela) {
    return Array.prototype.filter.call(tabela.rows, function (tr) { return !linhaDeCabecalho(tr); });
  }

  function novaCelula(tag, modelo) {
    var c = document.createElement(tag);
    if (modelo && modelo.getAttribute('style')) c.setAttribute('style', modelo.getAttribute('style'));
    c.innerHTML = '<br>';
    return c;
  }

  function novaLinha(modelo) {
    var tr = document.createElement('tr');
    for (var i = 0; i < modelo.cells.length; i++) tr.appendChild(novaCelula('td', linhaDeCabecalho(modelo) ? null : modelo.cells[i]));
    return tr;
  }

  function colocarCursor(cel) {
    if (!cel) return;
    var r = document.createRange();
    r.selectNodeContents(cel);
    r.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function estado(cel) {
    var tr = cel.parentNode;
    var tabela = cel.closest('table');
    var cab = linhaDeCabecalho(tr);
    var mescla = temMescla(tabela);
    return {
      tr: tr, tabela: tabela, cab: cab, mescla: mescla,
      idx: Array.prototype.indexOf.call(tr.cells, cel),
      podeLinhaAcima: !mescla && !cab,
      podeLinhaAbaixo: !mescla,
      podeExcluirLinha: !mescla && !cab && linhasDeDados(tabela).length > 1,
      podeColuna: !mescla,
      podeExcluirColuna: !mescla && tr.cells.length > 1,
    };
  }

  function executar(acao) {
    var cel = celulaAtual();
    if (!cel) return false;
    var e = estado(cel);
    var foco = null;

    if (acao === 'linhaAcima' && e.podeLinhaAcima) {
      var acima = novaLinha(e.tr);
      e.tr.parentNode.insertBefore(acima, e.tr);
      foco = acima.cells[e.idx];
    } else if (acao === 'linhaAbaixo' && e.podeLinhaAbaixo) {
      var abaixo = novaLinha(e.cab ? (linhasDeDados(e.tabela)[0] || e.tr) : e.tr);
      if (e.cab && e.tr.parentNode.tagName === 'THEAD') {
        // Abaixo do cabecalho = primeira linha de dados.
        var corpo = e.tabela.tBodies[0] || e.tabela.appendChild(document.createElement('tbody'));
        corpo.insertBefore(abaixo, corpo.firstChild);
      } else {
        e.tr.parentNode.insertBefore(abaixo, e.tr.nextSibling);
      }
      foco = abaixo.cells[e.idx];
    } else if (acao === 'excluirLinha' && e.podeExcluirLinha) {
      var dados = linhasDeDados(e.tabela);
      var pos = dados.indexOf(e.tr);
      var vizinha = dados[pos + 1] || dados[pos - 1];
      e.tr.parentNode.removeChild(e.tr);
      foco = vizinha && vizinha.cells[Math.min(e.idx, vizinha.cells.length - 1)];
    } else if ((acao === 'colunaEsquerda' || acao === 'colunaDireita') && e.podeColuna) {
      var desloc = acao === 'colunaDireita' ? 1 : 0;
      Array.prototype.forEach.call(e.tabela.rows, function (tr) {
        var ref = tr.cells[e.idx];
        var nova = novaCelula(linhaDeCabecalho(tr) ? 'th' : 'td', ref);
        tr.insertBefore(nova, tr.cells[e.idx + desloc] || null);
        if (tr === e.tr) foco = nova;
      });
    } else if (acao === 'excluirColuna' && e.podeExcluirColuna) {
      Array.prototype.forEach.call(e.tabela.rows, function (tr) {
        if (tr.cells[e.idx]) tr.removeChild(tr.cells[e.idx]);
      });
      foco = e.tr.cells[Math.min(e.idx, e.tr.cells.length - 1)];
    } else {
      return false;
    }

    colocarCursor(foco);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    atualizar();
    return true;
  }

  function atualizar() {
    var cel = celulaAtual();
    if (!cel) { barra.style.display = 'none'; return; }
    var e = estado(cel);
    var avisoMescla = e.mescla ? 'Tabela com células mescladas: edite o texto, mas a estrutura não pode ser alterada aqui.' : '';
    var regras = {
      linhaAcima: [e.podeLinhaAcima, avisoMescla || 'Não dá para inserir acima do cabeçalho.'],
      linhaAbaixo: [e.podeLinhaAbaixo, avisoMescla],
      excluirLinha: [e.podeExcluirLinha, avisoMescla || (e.cab ? 'O cabeçalho não pode ser excluído.' : 'A tabela precisa de pelo menos uma linha.')],
      colunaEsquerda: [e.podeColuna, avisoMescla],
      colunaDireita: [e.podeColuna, avisoMescla],
      excluirColuna: [e.podeExcluirColuna, avisoMescla || 'A tabela precisa de pelo menos uma coluna.'],
    };
    Array.prototype.forEach.call(barra.querySelectorAll('button'), function (b) {
      var r = regras[b.getAttribute('data-acao')];
      b.disabled = !r[0];
      b.title = r[0] ? '' : r[1];
    });
    barra.style.display = 'flex';
    var rt = e.tabela.getBoundingClientRect();
    var topo = Math.max(window.scrollY + 60, rt.top + window.scrollY - barra.offsetHeight - 6);
    barra.style.top = topo + 'px';
    barra.style.left = (rt.left + window.scrollX) + 'px';
  }

  // mousedown com preventDefault: o clique na barra nao tira o cursor da celula.
  barra.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  barra.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-acao]');
    if (b && !b.disabled) executar(b.getAttribute('data-acao'));
  });
  document.addEventListener('selectionchange', atualizar);
  window.addEventListener('scroll', atualizar);
  window.addEventListener('resize', atualizar);

  window.TabelaEditavel = { executar: executar, atualizar: atualizar };
})();
