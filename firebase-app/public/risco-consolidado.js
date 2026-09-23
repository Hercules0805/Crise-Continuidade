/**
 * Regra unica da carga de risco consolidada (por area e da empresa).
 *
 * O sistema ja media risco de um em um. O que faltava era a resposta para
 * "quanto risco a area X carrega?" e "quanto risco a empresa carrega?" — a
 * pergunta do comite, antes respondida a olho, contando linhas vermelhas.
 *
 * HISTORICO DESTA REGRA — ela ja nasceu errada uma vez, e o erro importa:
 *
 *   Na primeira versao (21/09/2026) a conta era MEDIA ponderada. No teste, o
 *   Hercules acrescentou um risco menor numa area que tinha um risco de 100 e
 *   o numero da area CAIU de 100 para 80. Estava certo aritmeticamente: media
 *   de 100 e 60 e 80. Estava errado como medida de risco. Um numero que cai
 *   quando se acrescenta risco premia nao registrar, e deixa qualquer pessoa
 *   baixar o risco da propria area cadastrando riscos pequenos.
 *
 *   Media dilui — inclusive a ponderada. Foi erro de especificacao, nao de
 *   codigo. Por isso a regra abaixo tem um teste de MONOTONICIDADE: acrescentar
 *   risco nunca pode baixar a carga. Se alguem voltar a media um dia, o teste
 *   quebra e conta o porque.
 *
 * DECISOES 21/09/2026 (tomadas pelo Hercules, nao inferidas):
 *
 *   1. A conta e SOMA PONDERADA, SEM TETO. Cada risco entra com
 *      score x peso e os pontos se acumulam. Sem teto o numero nunca satura:
 *      vinte riscos moderados nao podem empatar com uma catastrofe, que e o que
 *      acontece com qualquer escala fechada em 100.
 *
 *   2. O PESO E A CRITICIDADE DO PROCESSO ligado ao risco: Tier 1 pesa 3,
 *      Tier 2 pesa 2, Tier 3 pesa 1. Risco corporativo (sem processo) e risco em
 *      processo ainda Pendente pesam 2 — o meio da escala, para que a falta de
 *      avaliacao nao empurre o numero nem para cima nem para baixo. E isso que
 *      liga o BIA ao registro de riscos.
 *
 *   3. ENTRAM OS RISCOS EM ABERTO E OS ACEITOS. Sai apenas o Encerrado.
 *      Risco aceito continua existindo — a empresa so decidiu conviver com ele,
 *      e um numero que cai quando alguem aceita risco mentiria para o comite.
 *
 * O QUE A SOMA CUSTA, e precisa aparecer na tela: sem teto nao existe faixa
 * absoluta. "312" nao e bom nem ruim por si. O que se le e a COMPOSICAO
 * (quantos criticos, altos, moderados, baixos) e a VARIACAO no tempo. A cor
 * nunca vem do total.
 *
 * O QUE A SOMA DA DE GRACA: a carga da empresa e exatamente a soma das cargas
 * das areas. Da para conferir na mao, somando a coluna — coisa que media
 * ponderada nao permitia.
 *
 * O QUE ESTE NUMERO NAO DIZ: risco sem probabilidade ou sem impacto nao tem
 * score e fica FORA da soma, o que a puxa para baixo. Por isso `semAvaliacao`
 * volta em toda resposta — a tela e obrigada a mostrar quantos ficaram de fora.
 *
 * DECISAO 22/09/2026: risco de fornecedor (sem processo) passa a pesar pela
 * CRITICIDADE DO FORNECEDOR (fornecedor-criticidade.js), do mesmo jeito que
 * risco de processo ja pesa pelo Tier do BIA. Fornecedor sem avaliacao de
 * criticidade continua caindo no peso padrao (2) — mesma regra do processo
 * Pendente acima.
 *
 * Carregar ANTES de app.js e DEPOIS de criticidade.js e fornecedor-
 * criticidade.js. Tambem exporta como modulo CommonJS para poder ser testada
 * com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./criticidade.js'), require('./fornecedor-criticidade.js'));
  } else {
    root.RiscoConsolidado = factory(root.Criticidade, root.FornecedorCriticidade);
  }
}(typeof self !== 'undefined' ? self : this, function (Criticidade, FornecedorCriticidade) {
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

  /** Quanto um risco pode somar, no pior caso: score 12 x peso 3. */
  var CARGA_MAXIMA_POR_RISCO = 36;

  /** Unico status que fica fora da conta (decisao 3 acima). */
  var STATUS_FORA = ['Encerrado'];

  /** Area dos riscos que nasceram sem area (ex.: desvio de indicador). */
  var AREA_CORPORATIVA = 'Corporativo (sem área)';

  var FAIXAS = ['Crítico', 'Alto', 'Moderado', 'Baixo'];

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

  function contaNoConsolidado(r) {
    var s = String((r && r.status) || 'Identificado').trim();
    return STATUS_FORA.indexOf(s) === -1;
  }

  /**
   * Peso do risco: criticidade do processo ligado a ele, OU criticidade do
   * fornecedor ligado a ele, quando nao ha processo. As duas escalas (Tier do
   * BIA e criticidade de fornecedor) foram desenhadas para caber no mesmo
   * peso 1/2/3 de proposito — ver fornecedor-criticidade.js.
   */
  function pesoDoRisco(r, processosPorId, criticidadePorFornecedor) {
    var idProcesso = r && r.processoId;
    if (idProcesso) {
      var p = processosPorId && processosPorId[String(idProcesso)];
      var pesoTier = p && PESO_TIER[Criticidade.tierDoProcesso(p)];
      return pesoTier || PESO_PADRAO;
    }
    var idFornecedor = r && r.fornecedor;
    if (idFornecedor && criticidadePorFornecedor) {
      var pesoForn = FornecedorCriticidade.pesoPorScore(criticidadePorFornecedor[String(idFornecedor)]);
      if (pesoForn) return pesoForn;
    }
    return PESO_PADRAO;
  }

  /** Pontos que este risco soma na carga: score x peso. null se sem score. */
  function cargaDoRisco(r, processosPorId, criticidadePorFornecedor) {
    var score = scoreDoRisco(r);
    if (score === null) return null;
    return score * pesoDoRisco(r, processosPorId, criticidadePorFornecedor);
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

  function _novoAcumulado() {
    var comp = {};
    FAIXAS.forEach(function (f) { comp[f] = 0; });
    return { carga: 0, contados: 0, semAvaliacao: 0, pior: null, composicao: comp };
  }

  function _somar(acc, score, carga) {
    acc.carga += carga;
    acc.contados += 1;
    if (acc.pior === null || score > acc.pior) acc.pior = score;
    acc.composicao[faixaScore(score).rotulo] += 1;
  }

  function _resultado(area, acc) {
    return {
      area: area,
      carga: acc.carga,
      contados: acc.contados,
      semAvaliacao: acc.semAvaliacao,
      piorScore: acc.pior,
      piorFaixa: acc.pior === null ? null : faixaScore(acc.pior),
      composicao: acc.composicao,
    };
  }

  /**
   * Carga de risco por area e da empresa.
   *
   * A carga da empresa e a soma das cargas das areas — conferivel somando a
   * coluna na mao.
   */
  function consolidar(riscos, processos, criticidadePorFornecedor) {
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
      var carga = score * pesoDoRisco(r, processosPorId, criticidadePorFornecedor);
      _somar(acc, score, carga);
      _somar(empresa, score, carga);
    });

    var areas = Object.keys(porArea)
      .map(function (a) { return _resultado(a, porArea[a]); })
      .sort(function (x, y) { return y.carga - x.carga || x.area.localeCompare(y.area); });

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
    CARGA_MAXIMA_POR_RISCO: CARGA_MAXIMA_POR_RISCO,
    FAIXAS: FAIXAS,
    scoreDoRisco: scoreDoRisco,
    faixaScore: faixaScore,
    contaNoConsolidado: contaNoConsolidado,
    pesoDoRisco: pesoDoRisco,
    cargaDoRisco: cargaDoRisco,
    areaDoRisco: areaDoRisco,
    indexarProcessos: _indexarProcessos,
    consolidar: consolidar,
  };
}));
