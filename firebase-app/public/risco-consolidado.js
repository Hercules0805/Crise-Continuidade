/**
 * Regra unica do numero de risco consolidado (por area e da empresa).
 *
 * O sistema ja media risco de um em um. O que faltava era a resposta para
 * "qual o risco da area X?" e "qual o risco da empresa?" — a pergunta que o
 * comite faz e que hoje era respondida a olho, contando linhas vermelhas na
 * tela.
 *
 * DECISOES 21/09/2026 (tomadas pelo Hercules, nao inferidas):
 *
 *   1. A conta e MEDIA PONDERADA PELA CRITICIDADE. Cada risco pesa conforme o
 *      Tier do processo ligado a ele. Risco em processo Tier 1 pesa 3, Tier 2
 *      pesa 2, Tier 3 pesa 1. Risco corporativo (sem processo) e risco em
 *      processo ainda Pendente pesam 2 — o meio da escala, para que a falta de
 *      avaliacao nao empurre o numero nem para cima nem para baixo.
 *      E isso que liga o BIA ao registro de riscos: o BIA ja mediu o quanto doi
 *      se o processo parar, e esse peso entra na conta do risco.
 *
 *   2. ENTRAM OS RISCOS EM ABERTO E OS ACEITOS. Sai apenas o Encerrado.
 *      Risco aceito continua existindo — a empresa so decidiu conviver com ele,
 *      e um numero que cai quando alguem aceita risco mentiria para o comite.
 *
 *   3. A ESCALA E 0 A 100, convertida do score individual (1 a 12) por
 *      score / 12 * 100. As faixas sao as mesmas do risco individual, so
 *      reescritas na nova escala (9 de 12 = 75; 6 = 50; 3 = 25), para que area
 *      e risco individual nunca digam cores diferentes da mesma situacao.
 *      Ausencia de risco e 0; o menor risco possivel e 8. Zero significa
 *      "nada registrado", nunca "risco minimo".
 *
 * O QUE ESTE NUMERO NAO DIZ: risco sem probabilidade ou sem impacto preenchido
 * nao tem score e fica FORA da conta. Isso empurra o numero para baixo. Por
 * isso `semAvaliacao` volta junto em toda resposta — a tela e obrigada a
 * mostrar quantos riscos ficaram de fora, senao o numero engana.
 *
 * Carregar ANTES de app.js e DEPOIS de criticidade.js. Tambem exporta como
 * modulo CommonJS para poder ser testada com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./criticidade.js'));
  } else {
    root.RiscoConsolidado = factory(root.Criticidade);
  }
}(typeof self !== 'undefined' ? self : this, function (Criticidade) {
  'use strict';

  var PESO_PROBABILIDADE = { 'Baixa': 1, 'Média': 2, 'Alta': 3 };
  var PESO_IMPACTO = { 'Baixo': 1, 'Moderado': 2, 'Alto': 3, 'Crítico': 4 };
  var SCORE_MAXIMO = 12;

  var PESO_TIER = {};
  PESO_TIER[Criticidade.TIER.T1] = 3;
  PESO_TIER[Criticidade.TIER.T2] = 2;
  PESO_TIER[Criticidade.TIER.T3] = 1;

  /** Risco corporativo, ou em processo ainda nao avaliado: meio da escala. */
  var PESO_PADRAO = 2;

  /** Unico status que fica fora da conta (decisao 2 acima). */
  var STATUS_FORA = ['Encerrado'];

  /** Rotulo das areas dos riscos que nasceram sem area (ex.: desvio de indicador). */
  var AREA_CORPORATIVA = 'Corporativo (sem área)';

  /**
   * Score do risco, 1 a 12, recalculado de probabilidade x impacto.
   *
   * Nunca usa o campo `score` gravado: ele vinha do navegador e podia divergir
   * da escala. Devolve null quando falta um dos dois — ausencia nao e risco
   * baixo, e um null obriga quem chama a decidir o que fazer com o buraco.
   */
  function scoreDoRisco(r) {
    var p = PESO_PROBABILIDADE[String((r && r.probabilidade) || '').trim()];
    var i = PESO_IMPACTO[String((r && r.impacto) || '').trim()];
    if (!p || !i) return null;
    return p * i;
  }

  /** Faixas do score individual, de 1 a 12. */
  function faixaScore(n) {
    if (n >= 9) return { rotulo: 'Crítico', cor: '#c62828', fundo: '#ffebee' };
    if (n >= 6) return { rotulo: 'Alto', cor: '#e65100', fundo: '#fff3e0' };
    if (n >= 3) return { rotulo: 'Moderado', cor: '#f57c00', fundo: '#fff8e1' };
    return { rotulo: 'Baixo', cor: '#2e7d32', fundo: '#e8f5e9' };
  }

  /** Faixas do numero consolidado, de 0 a 100 — as mesmas de faixaScore. */
  function faixaConsolidado(n) {
    if (n === null || n === undefined) return { rotulo: 'Sem dado', cor: '#999', fundo: '#f5f5f5' };
    if (n <= 0) return { rotulo: 'Sem risco registrado', cor: '#999', fundo: '#f5f5f5' };
    if (n >= 75) return { rotulo: 'Crítico', cor: '#c62828', fundo: '#ffebee' };
    if (n >= 50) return { rotulo: 'Alto', cor: '#e65100', fundo: '#fff3e0' };
    if (n >= 25) return { rotulo: 'Moderado', cor: '#f57c00', fundo: '#fff8e1' };
    return { rotulo: 'Baixo', cor: '#2e7d32', fundo: '#e8f5e9' };
  }

  /** 1..12 -> 0..100. O menor risco possivel da 8; so a ausencia da 0. */
  function paraEscala100(media) {
    if (media === null || media === undefined) return 0;
    return Math.round((Number(media) / SCORE_MAXIMO) * 100);
  }

  function contaNoConsolidado(r) {
    var s = String((r && r.status) || 'Identificado').trim();
    return STATUS_FORA.indexOf(s) === -1;
  }

  /** Peso do risco = criticidade do processo ligado a ele. */
  function pesoDoRisco(r, processosPorId) {
    var id = r && r.processoId;
    if (!id) return PESO_PADRAO;
    var p = processosPorId && processosPorId[String(id)];
    if (!p) return PESO_PADRAO;
    var peso = PESO_TIER[Criticidade.tierDoProcesso(p)];
    return peso || PESO_PADRAO;
  }

  function areaDoRisco(r) {
    var a = String((r && r.area) || '').trim();
    return a || AREA_CORPORATIVA;
  }

  function _indexarProcessos(processos) {
    var mapa = {};
    (processos || []).forEach(function (p) {
      if (p && p.id !== undefined && p.id !== null) mapa[String(p.id)] = p;
    });
    return mapa;
  }

  function _resultado(area, acumulado) {
    var media = acumulado.pesos > 0 ? acumulado.produto / acumulado.pesos : null;
    var numero = acumulado.pesos > 0 ? paraEscala100(media) : 0;
    return {
      area: area,
      numero: numero,
      media: media,
      faixa: faixaConsolidado(acumulado.pesos > 0 ? numero : 0),
      contados: acumulado.contados,
      semAvaliacao: acumulado.semAvaliacao,
      pesoTotal: acumulado.pesos,
      piorScore: acumulado.pior,
    };
  }

  function _novoAcumulado() {
    return { produto: 0, pesos: 0, contados: 0, semAvaliacao: 0, pior: null };
  }

  /**
   * Numero consolidado por area e da empresa.
   *
   * O numero da empresa e a media ponderada de TODOS os riscos, nao a media das
   * areas: assim uma area com 2 riscos nao pesa igual a uma com 40.
   */
  function consolidar(riscos, processos) {
    var processosPorId = _indexarProcessos(processos);
    var porArea = {};
    var empresa = _novoAcumulado();
    var foraPorStatus = 0;

    (riscos || []).forEach(function (r) {
      if (!contaNoConsolidado(r)) { foraPorStatus += 1; return; }
      var area = areaDoRisco(r);
      if (!porArea[area]) porArea[area] = _novoAcumulado();
      var acc = porArea[area];

      var score = scoreDoRisco(r);
      if (score === null) {
        acc.semAvaliacao += 1;
        empresa.semAvaliacao += 1;
        return;
      }
      var peso = pesoDoRisco(r, processosPorId);
      acc.produto += score * peso;
      acc.pesos += peso;
      acc.contados += 1;
      if (acc.pior === null || score > acc.pior) acc.pior = score;

      empresa.produto += score * peso;
      empresa.pesos += peso;
      empresa.contados += 1;
      if (empresa.pior === null || score > empresa.pior) empresa.pior = score;
    });

    var areas = Object.keys(porArea)
      .map(function (a) { return _resultado(a, porArea[a]); })
      .sort(function (x, y) { return y.numero - x.numero || x.area.localeCompare(y.area); });

    return {
      empresa: _resultado('Empresa', empresa),
      areas: areas,
      foraPorStatus: foraPorStatus,
    };
  }

  return {
    PESO_PROBABILIDADE: PESO_PROBABILIDADE,
    PESO_IMPACTO: PESO_IMPACTO,
    PESO_TIER: PESO_TIER,
    PESO_PADRAO: PESO_PADRAO,
    STATUS_FORA: STATUS_FORA,
    AREA_CORPORATIVA: AREA_CORPORATIVA,
    SCORE_MAXIMO: SCORE_MAXIMO,
    scoreDoRisco: scoreDoRisco,
    faixaScore: faixaScore,
    faixaConsolidado: faixaConsolidado,
    paraEscala100: paraEscala100,
    contaNoConsolidado: contaNoConsolidado,
    pesoDoRisco: pesoDoRisco,
    areaDoRisco: areaDoRisco,
    consolidar: consolidar,
  };
}));
