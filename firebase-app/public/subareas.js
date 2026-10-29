/**
 * Subáreas (29/10/2026), sem DOM.
 *
 * A subárea mora DENTRO da Área (areas.subareas = [{id, nome, lider: {id, nome}|null}])
 * e só refina: processo, risco e pessoa continuam com `area` = área-mãe (gestor,
 * relatórios e processoKey não mudam) e ganham `subarea: {id, nome}` opcional.
 * O id é estável (renomear não quebra o vínculo); o nome no vínculo é cópia,
 * para exibir mesmo depois que a subárea for excluída.
 *
 * Cópia idêntica em functions/subareas.js (teste de paridade). Também exporta
 * como módulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Subareas = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _texto(v) { return String(v == null ? '' : v).trim(); }

  function normalizarNome(s) {
    return _texto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }

  function novoIdSubarea() {
    return 'sa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** {id, nome} de Pessoa, ou null. */
  function _refPessoa(p) {
    if (!p || typeof p !== 'object' || p.id == null || p.id === '') return null;
    return { id: String(p.id), nome: _texto(p.nome) };
  }

  /** [{id, nome, lider}]: sem nome vazio, sem nome repetido (o primeiro fica), id garantido. */
  function normalizarSubareas(lista) {
    var vistos = {};
    var saida = [];
    (Array.isArray(lista) ? lista : []).forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      var nome = _texto(s.nome);
      var chave = normalizarNome(nome);
      if (!chave || vistos[chave]) return;
      vistos[chave] = true;
      saida.push({ id: _texto(s.id) || novoIdSubarea(), nome: nome, lider: _refPessoa(s.lider) });
    });
    return saida;
  }

  /** {id, nome} do vínculo (processo/risco), ou null. */
  function normalizarRef(ref) {
    if (!ref || typeof ref !== 'object') return null;
    var id = _texto(ref.id);
    return id ? { id: id, nome: _texto(ref.nome) } : null;
  }

  function _area(areas, nomeArea) {
    var n = normalizarNome(nomeArea);
    if (!n) return null;
    var lista = Array.isArray(areas) ? areas : [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && normalizarNome(lista[i].nome) === n) return lista[i];
    }
    return null;
  }

  /** Subáreas da área (por nome), [] se a área não existe ou não tem. */
  function subareasDaArea(areas, nomeArea) {
    var a = _area(areas, nomeArea);
    return a && Array.isArray(a.subareas) ? a.subareas : [];
  }

  /**
   * Subárea atual do vínculo: {id, nome, lider, removida}. Nome atual pelo id;
   * id que não existe mais na área devolve a cópia do nome com removida=true.
   */
  function resolverSubarea(areas, nomeArea, ref) {
    var r = normalizarRef(ref);
    if (!r) return null;
    var lista = subareasDaArea(areas, nomeArea);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].id) === r.id) {
        return { id: r.id, nome: lista[i].nome, lider: lista[i].lider || null, removida: false };
      }
    }
    return { id: r.id, nome: r.nome, lider: null, removida: true };
  }

  /** "Área › Subárea" (só a área sem subárea; subárea removida marcada). */
  function rotuloArea(area, subarea) {
    var a = _texto(area);
    var s = subarea && _texto(subarea.nome);
    if (!s) return a;
    return (a ? a + ' › ' : '') + s + (subarea.removida ? ' (subárea removida)' : '');
  }

  /** Subáreas de todas as áreas onde a pessoa (id) é líder: [{area, subarea}]. */
  function subareasLideradas(areas, pessoaId) {
    var id = _texto(pessoaId);
    var saida = [];
    if (!id) return saida;
    (Array.isArray(areas) ? areas : []).forEach(function (a) {
      (a && Array.isArray(a.subareas) ? a.subareas : []).forEach(function (s) {
        if (s && s.lider && String(s.lider.id) === id) saida.push({ area: a.nome, subarea: s });
      });
    });
    return saida;
  }

  return {
    normalizarNome: normalizarNome,
    novoIdSubarea: novoIdSubarea,
    normalizarSubareas: normalizarSubareas,
    normalizarRef: normalizarRef,
    subareasDaArea: subareasDaArea,
    resolverSubarea: resolverSubarea,
    rotuloArea: rotuloArea,
    subareasLideradas: subareasLideradas,
  };
}));
