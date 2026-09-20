/**
 * Regra unica de criticidade do BIA.
 *
 * Antes desta peca, a regra estava reescrita em ~20 lugares (app.js em 15
 * pontos, api.js, Code.gs, tokenLogic.js). Os limiares batiam em todos, mas o
 * caso "ainda nao avaliado" divergia: a mesma situacao aparecia como
 * "Tier 3 (Suporte)" no resumo por area, "Pendente" no modal de detalhes e
 * "Nao avaliado" no dossie. Filtrar por Tier 3 trazia linhas cuja coluna Tier
 * dizia Pendente.
 *
 * DECISAO 19/09/2026: processo sem avaliacao mostra "Pendente", em toda tela.
 * Um processo critico que ninguem avaliou nao pode se esconder como Tier 3.
 *
 * Precedencia (preserva o comportamento dominante de antes):
 *   1. foi avaliado  -> tier pelo score
 *   2. nao avaliado, mas com tier fixado a mao -> esse tier
 *   3. nada disso -> Pendente
 *
 * Carregar ANTES de api.js e app.js. Tambem exporta como modulo CommonJS para
 * poder ser testada com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Criticidade = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMIAR_TIER_1 = 12;
  var LIMIAR_TIER_2 = 6;

  var TIER = {
    T1: 'Tier 1 (Crítico)',
    T2: 'Tier 2 (Essencial)',
    T3: 'Tier 3 (Suporte)',
    PENDENTE: 'Pendente',
  };

  var COR = {};
  COR[TIER.T1] = '#c62828';
  COR[TIER.T2] = '#f57c00';
  COR[TIER.T3] = '#1565c0';
  COR[TIER.PENDENTE] = '#999999';

  /** Um processo conta como avaliado quando existe resposta registrada. */
  function foiAvaliado(p) {
    if (!p) return false;
    return p.avaliado === true || Number(p.score) > 0;
  }

  /** Tier a partir do score isolado. Nao conhece "Pendente": use tierDoProcesso. */
  function tierPorScore(score) {
    var s = Number(score) || 0;
    if (s >= LIMIAR_TIER_1) return TIER.T1;
    if (s >= LIMIAR_TIER_2) return TIER.T2;
    return TIER.T3;
  }

  /** Tier do processo, ja considerando avaliacao ausente e tier fixado a mao. */
  function tierDoProcesso(p) {
    if (!p) return TIER.PENDENTE;
    if (foiAvaliado(p)) return tierPorScore(p.score);
    if (p.tierManual) return p.tierManual;
    return TIER.PENDENTE;
  }

  /** Cor do badge. Aceita o tier ou o proprio processo. */
  function corDoTier(tierOuProcesso) {
    var tier = typeof tierOuProcesso === 'string' ? tierOuProcesso : tierDoProcesso(tierOuProcesso);
    return COR[tier] || COR[TIER.PENDENTE];
  }

  /** Rotulo curto ("Tier 1"), para tabelas apertadas. */
  function tierCurto(tierOuProcesso) {
    var tier = typeof tierOuProcesso === 'string' ? tierOuProcesso : tierDoProcesso(tierOuProcesso);
    if (tier === TIER.PENDENTE) return TIER.PENDENTE;
    return tier.split(' (')[0];
  }

  /** true se o processo esta no tier pedido. Use nos filtros e contagens. */
  function ehTier(p, tier) {
    return tierDoProcesso(p) === tier;
  }

  /**
   * RTO sugerido a partir do tier.
   *
   * ATENCAO - defeito conhecido, ainda nao corrigido de proposito: o valor de
   * Tier 2 ("4h a 24 horas") NAO existe entre as opcoes do campo RTO do
   * formulario (app.js: "< 1 hora", "< 4 horas", "4h a 8h", "8h a 24h",
   * "> 24 horas"). Por isso, todo processo Tier 2 volta com o campo RTO em
   * branco ao ser reaberto. Corrigir exige decidir o valor certo e migrar os
   * registros ja gravados; ate la o comportamento fica igual ao de antes, para
   * nao mudar dado em silencio.
   */
  function rtoSugerido(tier) {
    if (tier === TIER.T1) return '< 4 horas';
    if (tier === TIER.T2) return '4h a 24 horas';
    return '> 24 horas';
  }

  return {
    LIMIAR_TIER_1: LIMIAR_TIER_1,
    LIMIAR_TIER_2: LIMIAR_TIER_2,
    TIER: TIER,
    foiAvaliado: foiAvaliado,
    tierPorScore: tierPorScore,
    tierDoProcesso: tierDoProcesso,
    corDoTier: corDoTier,
    tierCurto: tierCurto,
    ehTier: ehTier,
    rtoSugerido: rtoSugerido,
  };
});
