/**
 * Regra unica da nota de conformidade do fornecedor.
 *
 * DECISOES 21/09/2026 (tomadas pelo Hercules, nao inferidas):
 *   - Quem responde e alguem de dentro da empresa, olhando os documentos.
 *   - Cada criterio tem um PESO, e a resposta e Sim, Parcial ou Nao.
 *   - A evidencia e o LINK de onde o documento esta, nao um arquivo anexado.
 *   - Nota abaixo do limiar abre um risco automatico ligado ao fornecedor.
 *
 * ATENCAO AO SENTIDO DA NOTA — esta e a armadilha deste modulo:
 *
 *   A nota do fornecedor e CONFORMIDADE: quanto MAIOR, MELHOR. 100 e o
 *   fornecedor que atende tudo. E o contrario do score de risco, onde 12 e o
 *   pior caso. Os dois numeros convivem na mesma tela e na mesma carga de risco.
 *
 *   O sistema ja se enganou com isso: os indicadores de seguranca liam "fora da
 *   meta" ao contrario para os indicadores do tipo "quanto menor melhor", e um
 *   numero ruim aparecia verde. Por isso SENTIDO esta escrito aqui como
 *   constante, e existe um teste que falha se alguem inverter a conta.
 *
 * ZERO NAO E "NAO AVALIADO":
 *   Nota 0 significa fornecedor que nao atende nada. Fornecedor sem avaliacao
 *   devolve null e aparece como "Nao avaliado" — mesma regra do processo
 *   Pendente no BIA. Um fornecedor que ninguem avaliou nao pode se esconder
 *   como nota zero nem como nota cheia.
 *
 * "NAO SE APLICA" SAI DA CONTA:
 *   Existe porque sem essa opcao a pessoa responde "Sim" para criterio que nao
 *   cabe, e a nota sobe por mentira. Criterio marcado assim sai do numerador E
 *   do denominador — nao vale ponto nem tira ponto.
 *
 * CRITERIO ATIVO SEM RESPOSTA NAO E IGNORADO:
 *   Ignorar em silencio infla a nota: respondendo so os dois criterios faceis,
 *   o fornecedor tira 100. Por isso a resposta traz `pendentes` e `completa`, e
 *   a tela e obrigada a mostrar que a avaliacao esta pela metade.
 *
 * Carregar ANTES de app.js. Tambem exporta como modulo CommonJS para poder ser
 * testada com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FornecedorScore = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Maior e melhor. Escrito como constante para o teste poder afirmar isso. */
  var SENTIDO = 'maiorMelhor';

  var RESPOSTA = {
    SIM: 'Sim',
    PARCIAL: 'Parcial',
    NAO: 'Não',
    NAO_SE_APLICA: 'Não se aplica',
  };

  var RESPOSTAS = [RESPOSTA.SIM, RESPOSTA.PARCIAL, RESPOSTA.NAO, RESPOSTA.NAO_SE_APLICA];

  /** Quanto do peso do critario cada resposta aproveita. */
  var FATOR = {};
  FATOR[RESPOSTA.SIM] = 1;
  FATOR[RESPOSTA.PARCIAL] = 0.5;
  FATOR[RESPOSTA.NAO] = 0;

  /** Peso usado quando o critario nao tem peso definido. */
  var PESO_PADRAO = 1;

  /** Abaixo disto, o fornecedor abre risco automatico. Configuravel na tela. */
  var LIMIAR_RISCO_PADRAO = 70;

  /** Uma avaliacao de fornecedor vale um ano (mesmo prazo do livro de medicoes). */
  var VALIDADE_DIAS = 365;

  function _peso(criterio) {
    var p = Number(criterio && criterio.peso);
    return Number.isFinite(p) && p > 0 ? p : PESO_PADRAO;
  }

  function criterioAtivo(c) {
    return !!c && c.ativo !== false;
  }

  function respostaValida(v) {
    return RESPOSTAS.indexOf(String(v || '').trim()) !== -1;
  }

  /** Faixas da conformidade, de 0 a 100. Maior e melhor. */
  function faixaNota(n) {
    if (n === null || n === undefined) return { rotulo: 'Não avaliado', cor: '#999', fundo: '#f5f5f5' };
    if (n >= 90) return { rotulo: 'Adequado', cor: '#2e7d32', fundo: '#e8f5e9' };
    if (n >= 70) return { rotulo: 'Aceitável', cor: '#f57c00', fundo: '#fff8e1' };
    if (n >= 50) return { rotulo: 'Insuficiente', cor: '#e65100', fundo: '#fff3e0' };
    return { rotulo: 'Crítico', cor: '#c62828', fundo: '#ffebee' };
  }

  /**
   * Nota de conformidade a partir dos criterios ativos e das respostas dadas.
   *
   * `respostas` e um mapa criterioId -> { resposta, link, observacao }.
   */
  function calcular(criterios, respostas) {
    var ativos = (criterios || []).filter(criterioAtivo);
    var mapa = respostas || {};

    var pesoConsiderado = 0;
    var pontos = 0;
    var respondidos = 0;
    var naoSeAplica = 0;
    var pendentes = [];

    ativos.forEach(function (c) {
      var r = mapa[c.id] || {};
      var valor = String(r.resposta || '').trim();

      if (!respostaValida(valor)) { pendentes.push(c.id); return; }
      respondidos += 1;

      if (valor === RESPOSTA.NAO_SE_APLICA) { naoSeAplica += 1; return; }

      var peso = _peso(c);
      pesoConsiderado += peso;
      pontos += peso * FATOR[valor];
    });

    // Sem nada que conte, a nota nao existe. Nunca devolver 0 aqui: 0 e
    // "nao atende nada", e isso e uma afirmacao que ninguem fez.
    var nota = pesoConsiderado > 0 ? Math.round((pontos / pesoConsiderado) * 100) : null;

    return {
      nota: nota,
      faixa: faixaNota(nota),
      criteriosAtivos: ativos.length,
      respondidos: respondidos,
      naoSeAplica: naoSeAplica,
      pendentes: pendentes,
      completa: ativos.length > 0 && pendentes.length === 0,
      pesoConsiderado: pesoConsiderado,
    };
  }

  /** Nota que abre risco: abaixo do limiar, e so quando a nota existe. */
  function abreRisco(nota, limiar) {
    if (nota === null || nota === undefined) return false;
    var lim = Number(limiar);
    if (!Number.isFinite(lim)) lim = LIMIAR_RISCO_PADRAO;
    return Number(nota) < lim;
  }

  function _dias(de, ate) {
    var a = new Date(de).getTime();
    var b = new Date(ate).getTime();
    if (isNaN(a) || isNaN(b)) return null;
    return Math.floor((b - a) / 86400000);
  }

  /**
   * Data em que a avaliacao vence.
   *
   * A guarda de vazio vem ANTES do Date: `new Date(null)` devolve 01/01/1970,
   * uma data valida, e sem esta linha um fornecedor nunca avaliado apareceria
   * com avaliacao "vencida em 1971". Mesma armadilha do `Number(null) === 0`
   * que ja mordeu o livro de medicoes.
   */
  function venceEm(avaliadoEm) {
    if (!avaliadoEm) return null;
    var d = new Date(avaliadoEm);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + VALIDADE_DIAS);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Avaliacao vencida.
   *
   * Fornecedor sem avaliacao NAO e "vencido" — e "nao avaliado". Sao situacoes
   * diferentes e a tela precisa dizer coisas diferentes.
   */
  function vencida(avaliadoEm, hoje) {
    if (!avaliadoEm) return false;
    var d = _dias(avaliadoEm, hoje || new Date().toISOString());
    return d === null ? false : d > VALIDADE_DIAS;
  }

  return {
    SENTIDO: SENTIDO,
    RESPOSTA: RESPOSTA,
    RESPOSTAS: RESPOSTAS,
    FATOR: FATOR,
    PESO_PADRAO: PESO_PADRAO,
    LIMIAR_RISCO_PADRAO: LIMIAR_RISCO_PADRAO,
    VALIDADE_DIAS: VALIDADE_DIAS,
    criterioAtivo: criterioAtivo,
    respostaValida: respostaValida,
    faixaNota: faixaNota,
    calcular: calcular,
    abreRisco: abreRisco,
    venceEm: venceEm,
    vencida: vencida,
  };
}));
