/**
 * Áreas hierárquicas (29/10/2026), sem DOM.
 *
 * Só existem Áreas; cada uma pode ficar abaixo de outra (areas.areaPaiId = id
 * da área de cima, null = raiz), em qualquer profundidade. Os cadastros
 * continuam apontando a área pelo NOME -- a hierarquia só diz quem está abaixo
 * de quem. O Gestor de uma área enxerga a dela e todas as de baixo
 * (config_perfis.areasGeridas, calculado no servidor com escopoDoGestor).
 *
 * Dado circular (A abaixo de B abaixo de A) nunca trava: cada caminhada para
 * no primeiro repetido.
 *
 * Cópia idêntica em functions/areasHierarquia.js (teste de paridade). Também
 * exporta como módulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AreasHierarquia = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEP_CAMINHO = ' › ';

  function _lista(areas) { return (Array.isArray(areas) ? areas : []).filter(function (a) { return a && a.nome; }); }
  function _id(a) { return a && a.id != null ? String(a.id) : ''; }
  function _paiId(a) { return a && a.areaPaiId != null && a.areaPaiId !== '' ? String(a.areaPaiId) : ''; }

  function _porNome(areas, nome) {
    var n = String(nome == null ? '' : nome);
    var l = _lista(areas);
    for (var i = 0; i < l.length; i++) if (l[i].nome === n) return l[i];
    return null;
  }
  function _porId(areas, id) {
    var l = _lista(areas);
    for (var i = 0; i < l.length; i++) if (_id(l[i]) === String(id)) return l[i];
    return null;
  }

  /** Área de cima (objeto), ou null. Pai que aponta para si mesmo não conta. */
  function pai(areas, nome) {
    var a = _porNome(areas, nome);
    var p = a && _paiId(a) ? _porId(areas, _paiId(a)) : null;
    return p && p !== a ? p : null;
  }

  /** Áreas logo abaixo (objetos), em ordem alfabética. */
  function filhas(areas, nome) {
    var a = _porNome(areas, nome);
    if (!a || !_id(a)) return [];
    return _lista(areas).filter(function (x) { return x !== a && _paiId(x) === _id(a); })
      .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });
  }

  /** Nomes da área e de todas as de baixo (a própria primeiro). Área desconhecida: só o nome. */
  function descendentes(areas, nome) {
    var n = String(nome == null ? '' : nome);
    if (!n) return [];
    var saida = [n];
    var vistos = {};
    vistos[n] = true;
    (function descer(atual) {
      filhas(areas, atual).forEach(function (f) {
        if (vistos[f.nome]) return;
        vistos[f.nome] = true;
        saida.push(f.nome);
        descer(f.nome);
      });
    }(n));
    return saida;
  }

  /** Nomes das áreas de cima, da mais próxima à raiz. */
  function ancestrais(areas, nome) {
    var saida = [];
    var vistos = {};
    vistos[String(nome)] = true;
    var p = pai(areas, nome);
    while (p && !vistos[p.nome]) {
      vistos[p.nome] = true;
      saida.push(p.nome);
      p = pai(areas, p.nome);
    }
    return saida;
  }

  /** "Diretoria › TI › Infraestrutura" (só o nome, se não tem área de cima). */
  function caminho(areas, nome) {
    if (!nome) return '';
    return ancestrais(areas, nome).reverse().concat([String(nome)]).join(SEP_CAMINHO);
  }

  /** Ids que não podem ser a área de cima de `id`: ela mesma e as de baixo (evita ciclo). */
  function bloqueadasComoPai(areas, id) {
    var a = _porId(areas, id);
    if (!a) return id ? [String(id)] : [];
    return descendentes(areas, a.nome).map(function (n) { return _id(_porNome(areas, n)); }).filter(Boolean);
  }

  /**
   * [{area, nivel}] em ordem de árvore: raízes em ordem alfabética, cada uma
   * seguida das de baixo. Área presa num ciclo (sem raiz) entra no fim, nível 0.
   */
  function ordemArvore(areas) {
    var l = _lista(areas);
    var saida = [];
    var vistos = {};
    function visitar(a, nivel) {
      if (vistos[a.nome]) return;
      vistos[a.nome] = true;
      saida.push({ area: a, nivel: nivel });
      filhas(l, a.nome).forEach(function (f) { visitar(f, nivel + 1); });
    }
    l.filter(function (a) { return !pai(l, a.nome); })
      .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); })
      .forEach(function (a) { visitar(a, 0); });
    l.filter(function (a) { return !vistos[a.nome]; })
      .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); })
      .forEach(function (a) { visitar(a, 0); });
    return saida;
  }

  /** Áreas que o Gestor enxerga: a dele e as de baixo. Sem área: nenhuma. */
  function escopoDoGestor(areas, areaDoGestor) {
    return areaDoGestor ? descendentes(areas, areaDoGestor) : [];
  }

  /** Mesmos itens, mesma ordem (comparar antes de regravar areasGeridas). */
  function mesmaLista(a, b) {
    var x = Array.isArray(a) ? a : [];
    var y = Array.isArray(b) ? b : [];
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  return {
    SEP_CAMINHO: SEP_CAMINHO,
    pai: pai,
    filhas: filhas,
    descendentes: descendentes,
    ancestrais: ancestrais,
    caminho: caminho,
    bloqueadasComoPai: bloqueadasComoPai,
    ordemArvore: ordemArvore,
    escopoDoGestor: escopoDoGestor,
    mesmaLista: mesmaLista,
  };
}));
