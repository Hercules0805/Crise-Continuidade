/**
 * Regra unica da criticidade do fornecedor.
 *
 * DECISOES 22/09/2026 (tomadas pelo Hercules, nao inferidas):
 *   - Sao 3 perguntas fixas (nao cadastraveis, ao contrario dos criterios de
 *     conformidade): Tipo de Dados Tratados, Tipo de Atividade/Finalidade,
 *     Dependencia Tecnologica e Continuidade.
 *   - Cada pergunta e de ESCOLHA UNICA: a pessoa marca a opcao que mais se
 *     aplica (ou "nenhuma das anteriores", que vale 0). Nao e escolha
 *     multipla -- nao da pra marcar duas opcoes da mesma pergunta.
 *   - A criticidade final e a SOMA das 3 perguntas, 0 a 8 (2 + 3 + 3 no
 *     maximo). Mesmo padrao "uma resposta por pergunta, soma no final" que o
 *     BIA e o Risco ja usam.
 *   - A criticidade vira o PESO do risco automatico do fornecedor na carga de
 *     risco da empresa (risco-consolidado.js), do mesmo jeito que o Tier do
 *     BIA ja pesa o risco de processo.
 *
 * SENTIDO: MAIOR e PIOR (igual ao score de risco, diferente da nota de
 * conformidade do fornecedor-score.js, que e o contrario). Os dois numeros do
 * fornecedor -- nota (maior melhor) e criticidade (maior pior) -- convivem na
 * mesma tela, entao vale reler fornecedor-score.js antes de mexer aqui.
 *
 * "NENHUMA DAS ANTERIORES" E RESPOSTA VALIDA, NAO AUSENCIA:
 *   Um fornecedor pode legitimamente nao tratar dados pessoais, nao ser
 *   atividade core nem ter lock-in -- isso da criticidade 0 de verdade, um
 *   fornecedor de baixo risco. E diferente de NINGUEM TER RESPONDIDO a
 *   pergunta ainda. Por isso a resposta traz `completa`, que so fica true
 *   quando as 3 perguntas tem uma opcao marcada -- incluindo a de valor 0.
 *
 * Carregar ANTES de risco-consolidado.js (que usa pesoPorScore) e de app.js.
 * Tambem exporta como modulo CommonJS para poder ser testada com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FornecedorCriticidade = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SENTIDO = 'maiorPior';

  /** As 3 perguntas fixas, cada uma com as opcoes na ordem de exibicao. */
  var PERGUNTAS = [
    {
      chave: 'dados',
      titulo: 'Tipo de Dados Tratados',
      opcoes: [
        { valor: 'sensiveis', rotulo: 'Dados Pessoais Sensíveis', score: 2 },
        { valor: 'pessoais', rotulo: 'Dados Pessoais', score: 1 },
        { valor: 'nenhum', rotulo: 'Não trata dados pessoais', score: 0 },
      ],
    },
    {
      chave: 'atividade',
      titulo: 'Tipo de Atividade / Finalidade',
      opcoes: [
        { valor: 'core', rotulo: 'Atividade Core — o fornecedor é essencial para a operação (ex.: provedor de nuvem que hospeda todo o banco de dados)', score: 3 },
        { valor: 'acesso', rotulo: 'Acesso Direto a Sistemas — credenciais de acesso privilegiado à rede interna (ex.: TI/suporte remoto)', score: 2 },
        { valor: 'decisao', rotulo: 'Decisões Automatizadas — usa algoritmos para perfil (profiling) ou análise de crédito', score: 1 },
        { valor: 'nenhuma', rotulo: 'Nenhuma das anteriores', score: 0 },
      ],
    },
    {
      chave: 'dependencia',
      titulo: 'Dependência Tecnológica e Continuidade',
      opcoes: [
        { valor: 'clientesParam', rotulo: 'Resiliência — se o fornecedor sofrer um ataque de ransomware, os CLIENTES da empresa param de operar', score: 3 },
        { valor: 'empresaPara', rotulo: 'Resiliência — se o fornecedor sofrer um ataque de ransomware, a PRÓPRIA empresa para de operar', score: 2 },
        { valor: 'lockIn', rotulo: 'Lock-in — a dificuldade de migrar rapidamente torna o parceiro crítico para a continuidade', score: 1 },
        { valor: 'nenhuma', rotulo: 'Nenhuma das anteriores', score: 0 },
      ],
    },
  ];

  /** Soma dos scores maximos das 3 perguntas: 2 + 3 + 3. */
  var SCORE_MAXIMO = PERGUNTAS.reduce(function (t, p) {
    return t + Math.max.apply(null, p.opcoes.map(function (o) { return o.score; }));
  }, 0);

  /**
   * Faixas de 0 a 8. So 3 niveis, de proposito: mapeiam 1:1 pro mesmo peso de
   * 1/2/3 que o Tier do BIA ja usa em risco-consolidado.js (PESO_TIER). Um 4o
   * nivel exigiria mexer em CARGA_MAXIMA_POR_RISCO, que assume peso maximo 3.
   */
  function faixa(score) {
    if (score === null || score === undefined) return { rotulo: 'Não avaliado', cor: '#999', fundo: '#f5f5f5' };
    if (score >= 6) return { rotulo: 'Alta', cor: '#c62828', fundo: '#ffebee' };
    if (score >= 3) return { rotulo: 'Média', cor: '#e65100', fundo: '#fff3e0' };
    return { rotulo: 'Baixa', cor: '#2e7d32', fundo: '#e8f5e9' };
  }

  var PESO_POR_FAIXA = { 'Baixa': 1, 'Média': 2, 'Alta': 3 };

  /** Peso do risco automatico a partir do score. null (sem avaliacao) cai no peso padrao de quem chama. */
  function pesoPorScore(score) {
    if (score === null || score === undefined) return null;
    return PESO_POR_FAIXA[faixa(score).rotulo] || null;
  }

  function _opcao(pergunta, valor) {
    return pergunta.opcoes.find(function (o) { return o.valor === String(valor || ''); }) || null;
  }

  /**
   * Criticidade a partir das respostas.
   *
   * `respostas` e um mapa { dados, atividade, dependencia } -> valor da opcao
   * escolhida (ou ausente/vazio se a pergunta nao foi respondida ainda).
   */
  function calcular(respostas) {
    var mapa = respostas || {};
    var score = 0;
    var pendentes = [];

    PERGUNTAS.forEach(function (p) {
      var op = _opcao(p, mapa[p.chave]);
      if (!op) { pendentes.push(p.chave); return; }
      score += op.score;
    });

    var completa = pendentes.length === 0;

    return {
      // Sem as 3 respostas, a criticidade nao existe -- 0 aqui mentiria que o
      // fornecedor foi avaliado como baixo risco. Mesma regra do "nao avaliado"
      // de fornecedor-score.js e do Tier Pendente do BIA.
      score: completa ? score : null,
      faixa: completa ? faixa(score) : faixa(null),
      completa: completa,
      pendentes: pendentes,
    };
  }

  return {
    SENTIDO: SENTIDO,
    PERGUNTAS: PERGUNTAS,
    SCORE_MAXIMO: SCORE_MAXIMO,
    PESO_POR_FAIXA: PESO_POR_FAIXA,
    faixa: faixa,
    pesoPorScore: pesoPorScore,
    calcular: calcular,
  };
}));
