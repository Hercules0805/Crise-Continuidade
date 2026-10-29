/**
 * Indicadores do Cadastro de Processos (29/10/2026), sem DOM: base do
 * Dashboard de Processos e dos Relatórios de Processos.
 *
 * Trabalha sobre o que API.getProcessosCadastro() devolve (todos os processos,
 * dentro e fora de Continuidade) e o cadastro de categorias_processo.
 * "Cadastro completo" = sem nenhuma pendência (descrição funcional, criador,
 * aprovador, links e categoria ativa).
 *
 * Exporta como módulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./areas-hierarquia'));
  } else {
    root.ProcessosIndicadores = factory(root.AreasHierarquia);
  }
}(typeof self !== 'undefined' ? self : this, function (AreasHierarquia) {
  'use strict';

  var DIA_MS = 24 * 60 * 60 * 1000;
  var JANELA_RECENTE_DIAS = 30;

  /** Pendências do cadastro, na ordem em que aparecem nas telas. */
  var PENDENCIAS = [
    { chave: 'semDescricao', rotulo: 'Sem descrição funcional' },
    { chave: 'semCriador', rotulo: 'Sem criador' },
    { chave: 'semAprovador', rotulo: 'Sem aprovador' },
    { chave: 'semLinks', rotulo: 'Sem links' },
    { chave: 'categoriaInativa', rotulo: 'Categoria inativa ou removida' },
  ];

  function _texto(v) { return v == null ? '' : String(v).trim(); }
  function _pct(parte, total) { return total > 0 ? Math.round((parte / total) * 100) : 0; }
  function _mapaCategorias(categorias) {
    var m = {};
    (categorias || []).forEach(function (c) { if (c && c.id != null) m[String(c.id)] = c; });
    return m;
  }
  function emContinuidade(p) { return !!p && p.continuidade !== false; }

  /** { semDescricao, semCriador, semAprovador, semLinks, categoriaInativa } (true = falta). */
  function pendenciasDoProcesso(p, opcoes) {
    var cats = (opcoes && opcoes._mapa) || _mapaCategorias(opcoes && opcoes.categorias);
    var cat = cats[String(p && p.categoriaId)];
    return {
      semDescricao: !_texto(p && p.descricaoFuncional),
      semCriador: !_texto(p && p.criadorId),
      semAprovador: !_texto(p && p.aprovadorId),
      semLinks: !(p && Array.isArray(p.links) && p.links.length),
      categoriaInativa: !cat || cat.ativo === false,
    };
  }

  function cadastroCompleto(p, opcoes) {
    var pend = pendenciasDoProcesso(p, opcoes);
    return !PENDENCIAS.some(function (x) { return pend[x.chave]; });
  }

  /**
   * Resumo do conjunto: total, Continuidade, por categoria (na ordem do
   * cadastro; categoria que não existe mais vira "(categoria removida)"),
   * pendências, completos, movimento nos últimos 30 dias e os 10 mais recentes.
   */
  function resumo(processos, opcoes) {
    var o = opcoes || {};
    var lista = processos || [];
    var mapa = _mapaCategorias(o.categorias);
    var ctx = { _mapa: mapa };
    var hoje = o.hojeISO ? new Date(o.hojeISO) : new Date();
    var limite = hoje.getTime() - JANELA_RECENTE_DIAS * DIA_MS;
    var recente = function (iso) { var t = iso ? Date.parse(iso) : NaN; return !isNaN(t) && t >= limite && t <= hoje.getTime() + DIA_MS; };

    var porCat = {};
    var pend = {};
    PENDENCIAS.forEach(function (x) { pend[x.chave] = 0; });
    var cont = 0, completos = 0, criados = 0, atualizados = 0;
    lista.forEach(function (p) {
      if (emContinuidade(p)) cont++;
      var id = String(p.categoriaId || '');
      porCat[id] = (porCat[id] || 0) + 1;
      var pp = pendenciasDoProcesso(p, ctx);
      var algum = false;
      PENDENCIAS.forEach(function (x) { if (pp[x.chave]) { pend[x.chave]++; algum = true; } });
      if (!algum) completos++;
      if (recente(p.criadoEm)) criados++;
      if (recente(p.atualizadoEm)) atualizados++;
    });
    var categorias = (o.categorias || []).map(function (c) { return { id: String(c.id), nome: c.nome, ativo: c.ativo !== false, n: porCat[String(c.id)] || 0 }; });
    Object.keys(porCat).forEach(function (id) {
      if (!mapa[id]) categorias.push({ id: id, nome: '(categoria removida)', ativo: false, n: porCat[id] });
    });
    var recentes = lista.filter(function (p) { return _texto(p.atualizadoEm); })
      .slice().sort(function (a, b) { return String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)); })
      .slice(0, 10);
    return {
      total: lista.length,
      emContinuidade: cont,
      pctContinuidade: _pct(cont, lista.length),
      porCategoria: categorias,
      pendencias: pend,
      completos: completos,
      pctCompletos: _pct(completos, lista.length),
      criados30d: criados,
      atualizados30d: atualizados,
      recentes: recentes,
    };
  }

  /**
   * Uma linha por área, na ordem da árvore (só as que têm processo, mais as
   * de cima delas para a árvore fazer sentido). Área que só existe nos
   * processos entra no fim, com foraDoCadastro.
   * Linha: { area, nivel, foraDoCadastro, total, continuidade, porCategoria: {id: n}, completos, pct, processos }.
   */
  function porArea(processos, areas, opcoes) {
    var ctx = { _mapa: _mapaCategorias(opcoes && opcoes.categorias) };
    var grupos = {};
    (processos || []).forEach(function (p) {
      var a = _texto(p.area) || '(sem área)';
      (grupos[a] = grupos[a] || []).push(p);
    });
    var lista = areas || [];
    var comProcesso = {};
    Object.keys(grupos).forEach(function (nome) {
      comProcesso[nome] = true;
      AreasHierarquia.ancestrais(lista, nome).forEach(function (x) { comProcesso[x.nome || x] = true; });
    });
    var linhas = [];
    var noCadastro = {};
    AreasHierarquia.ordemArvore(lista).forEach(function (x) {
      noCadastro[x.area.nome] = true;
      if (comProcesso[x.area.nome]) linhas.push(_linhaArea(x.area.nome, x.nivel, false, grupos[x.area.nome] || [], ctx));
    });
    Object.keys(grupos).filter(function (n) { return !noCadastro[n]; })
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .forEach(function (n) { linhas.push(_linhaArea(n, 0, true, grupos[n], ctx)); });
    return linhas;
  }

  function _linhaArea(nome, nivel, fora, procs, ctx) {
    var porCat = {};
    var completos = 0, cont = 0;
    procs.forEach(function (p) {
      var id = String(p.categoriaId || '');
      porCat[id] = (porCat[id] || 0) + 1;
      if (emContinuidade(p)) cont++;
      if (cadastroCompleto(p, ctx)) completos++;
    });
    return {
      area: nome, nivel: nivel, foraDoCadastro: fora, total: procs.length, continuidade: cont,
      porCategoria: porCat, completos: completos, pct: _pct(completos, procs.length),
      processos: procs.slice().sort(function (a, b) { return String(a.processo || '').localeCompare(String(b.processo || ''), 'pt-BR'); }),
    };
  }

  /**
   * Processos por pessoa (Criador/Aprovador), em ordem alfabética. Id que não
   * está mais em Pessoas vira { id, nome: '(pessoa removida)' }.
   * Devolve { pessoas: [{ pessoa, criador: [p], aprovador: [p] }], semCriador: [p], semAprovador: [p] }.
   */
  function porPessoa(processos, pessoas) {
    var mapa = {};
    (pessoas || []).forEach(function (x) { if (x && x.id != null) mapa[String(x.id)] = x; });
    var grupos = {};
    var semCriador = [], semAprovador = [];
    var grupo = function (id) {
      var k = String(id);
      if (!grupos[k]) grupos[k] = { pessoa: mapa[k] || { id: k, nome: '(pessoa removida)' }, criador: [], aprovador: [] };
      return grupos[k];
    };
    (processos || []).forEach(function (p) {
      if (_texto(p.criadorId)) grupo(p.criadorId).criador.push(p); else semCriador.push(p);
      if (_texto(p.aprovadorId)) grupo(p.aprovadorId).aprovador.push(p); else semAprovador.push(p);
    });
    var ordenar = function (l) { return l.sort(function (a, b) { return (String(a.area) + String(a.processo)).localeCompare(String(b.area) + String(b.processo), 'pt-BR'); }); };
    var lista = Object.keys(grupos).map(function (k) { var g = grupos[k]; ordenar(g.criador); ordenar(g.aprovador); return g; })
      // Pessoa removida vai para o fim.
      .sort(function (a, b) {
        var ra = mapa[String(a.pessoa.id)] ? 0 : 1, rb = mapa[String(b.pessoa.id)] ? 0 : 1;
        return (ra - rb) || String(a.pessoa.nome || '').localeCompare(String(b.pessoa.nome || ''), 'pt-BR');
      });
    return { pessoas: lista, semCriador: ordenar(semCriador), semAprovador: ordenar(semAprovador) };
  }

  return {
    PENDENCIAS: PENDENCIAS,
    JANELA_RECENTE_DIAS: JANELA_RECENTE_DIAS,
    emContinuidade: emContinuidade,
    pendenciasDoProcesso: pendenciasDoProcesso,
    cadastroCompleto: cadastroCompleto,
    resumo: resumo,
    porArea: porArea,
    porPessoa: porPessoa,
  };
}));
