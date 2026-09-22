/**
 * Regra unica da criticidade do fornecedor.
 *
 * DECISAO 22/09/2026 (3), a mais recente -- SUBSTITUIU POR INTEIRO as
 * perguntas das duas rodadas anteriores (nao ha compatibilidade com elas):
 *
 *   Uma revisao externa apontou que as perguntas antigas (Tipo de Dados
 *   Tratados, Tipo de Atividade/Finalidade, Dependencia Tecnologica e
 *   Continuidade, Transferencia Internacional) misturavam DEPENDENCIA
 *   OPERACIONAL (o quanto a empresa quebra sem aquele fornecedor) com
 *   EXPOSICAO DE PRIVACIDADE/COMPLIANCE (que tipo de dado ele trata) -- e a
 *   soma virava peso de risco por motivos que nao tem relacao com o quanto a
 *   empresa depende do fornecedor. Sao 6 perguntas novas, todas puramente
 *   operacionais (importancia para a operacao, tempo sem operar, existe
 *   substituto, dependencia dos dados dele, acesso a sistemas, impacto a
 *   clientes) -- Tipo de Dados Tratados, Decisoes Automatizadas e
 *   Transferencia Internacional SAEM da Criticidade e nao viram outro eixo
 *   nesta rodada (fica para uma entrega futura, decisao explicita, nao
 *   esquecimento).
 *
 *   Score maximo sobe de 9 para 18 (6 perguntas x 3). Os limiares de faixa
 *   foram redivididos em 3 partes de tamanho parecido (Baixa 0-6, Media 7-12,
 *   Alta 13-18) -- ao contrario da ultima mudanca (que so abriu o teto de
 *   Alta), aqui nao ha como preservar o significado das faixas antigas: as
 *   perguntas sao outras, entao um fornecedor ja avaliado tem seu score
 *   antigo (0-9) reinterpretado pelas faixas novas ate ser reavaliado. Isso e
 *   uma consequencia aceita, nao um bug -- ver decisao no plano desta
 *   mudanca.
 *
 * DECISOES DE FUNDO, que continuam valendo (das rodadas anteriores):
 *   - As perguntas sao fixas (nao cadastraveis, ao contrario dos criterios de
 *     conformidade).
 *   - Cada pergunta e de ESCOLHA UNICA: a pessoa marca a opcao que mais se
 *     aplica. Nao e escolha multipla -- nao da pra marcar duas opcoes da
 *     mesma pergunta.
 *   - A criticidade final e a SOMA de todas as perguntas. Mesmo padrao "uma
 *     resposta por pergunta, soma no final" que o BIA e o Risco ja usam.
 *   - A criticidade vira o PESO do risco automatico do fornecedor na carga de
 *     risco da empresa (risco-consolidado.js), do mesmo jeito que o Tier do
 *     BIA ja pesa o risco de processo. So 3 niveis de peso (1/2/3), de
 *     proposito -- um 4o nivel exigiria mexer em CARGA_MAXIMA_POR_RISCO, que
 *     assume peso maximo 3 em risco-consolidado.js.
 *
 * SENTIDO: MAIOR e PIOR (igual ao score de risco, diferente da nota de
 * conformidade do fornecedor-score.js, que e o contrario). Os dois numeros do
 * fornecedor -- nota (maior melhor) e criticidade (maior pior) -- convivem na
 * mesma tela, entao vale reler fornecedor-score.js antes de mexer aqui.
 *
 * A OPCAO DE MENOR SCORE E RESPOSTA VALIDA, NAO AUSENCIA:
 *   Um fornecedor pode legitimamente ser de baixa importancia operacional,
 *   facil de substituir e sem acesso a sistemas -- isso da criticidade 0 de
 *   verdade, um fornecedor de baixo risco. E diferente de NINGUEM TER
 *   RESPONDIDO a pergunta ainda. Por isso a resposta traz `completa`, que so
 *   fica true quando todas as perguntas tem uma opcao marcada -- incluindo a
 *   de valor 0.
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

  /** As perguntas fixas, cada uma com as opcoes na ordem de exibicao. */
  var PERGUNTAS = [
    {
      chave: 'importanciaOperacional',
      titulo: 'Qual é a importância desse fornecedor para a operação da empresa?',
      opcoes: [
        { valor: 'baixa', rotulo: 'Baixa — o serviço não é necessário para a operação; sua indisponibilidade gera pouco ou nenhum impacto', score: 0 },
        { valor: 'moderada', rotulo: 'Moderada — apoia atividades internas, mas a empresa continua trabalhando sem ele', score: 1 },
        { valor: 'alta', rotulo: 'Alta — sua indisponibilidade prejudica significativamente uma ou mais áreas', score: 2 },
        { valor: 'essencial', rotulo: 'Essencial — sua indisponibilidade pode interromper processos críticos, atendimento a clientes ou serviços essenciais', score: 3 },
      ],
    },
    {
      chave: 'tempoSemOperar',
      titulo: 'Por quanto tempo a empresa conseguiria operar sem esse fornecedor?',
      opcoes: [
        { valor: 'mais72h', rotulo: 'Mais de 72 horas', score: 0 },
        { valor: 'ate72h', rotulo: 'Até 72 horas', score: 1 },
        { valor: 'ate24h', rotulo: 'Até 24 horas', score: 2 },
        { valor: 'ate4h', rotulo: 'Até 4 horas', score: 3 },
      ],
    },
    {
      chave: 'substituibilidade',
      titulo: 'Existe uma alternativa disponível caso esse fornecedor deixe de prestar o serviço?',
      opcoes: [
        { valor: 'facil', rotulo: 'Sim, a empresa consegue substituí-lo rapidamente', score: 0 },
        { valor: 'comTempo', rotulo: 'Sim, mas a substituição levaria algum tempo', score: 1 },
        { valor: 'poucas', rotulo: 'Existem poucas alternativas e a substituição seria difícil', score: 2 },
        { valor: 'nenhuma', rotulo: 'Não existe alternativa viável no curto prazo', score: 3 },
      ],
    },
    {
      chave: 'dependenciaDados',
      titulo: 'O que aconteceria se os dados ou informações mantidos pelo fornecedor ficassem indisponíveis?',
      opcoes: [
        { valor: 'semImpacto', rotulo: 'Não há impacto relevante', score: 0 },
        { valor: 'pontual', rotulo: 'Haveria impacto pontual, mas os dados poderiam ser recuperados facilmente', score: 1 },
        { valor: 'trabalhosa', rotulo: 'A recuperação seria trabalhosa e afetaria a operação', score: 2 },
        { valor: 'critico', rotulo: 'A perda/indisponibilidade comprometeria processos críticos ou poderia causar perda significativa de informação', score: 3 },
      ],
    },
    {
      chave: 'acessoSistemas',
      titulo: 'Que tipo de acesso o fornecedor possui aos sistemas da empresa?',
      opcoes: [
        { valor: 'nenhum', rotulo: 'Não possui acesso aos sistemas da empresa', score: 0 },
        { valor: 'usuarioComum', rotulo: 'Possui acesso apenas como usuário comum', score: 1 },
        { valor: 'integracao', rotulo: 'Possui acesso para integração ou operação de sistemas', score: 2 },
        { valor: 'privilegiado', rotulo: 'Possui acesso privilegiado, administrativo ou direto a ambientes críticos', score: 3 },
      ],
    },
    {
      chave: 'impactoClientes',
      titulo: 'O serviço do fornecedor é utilizado diretamente por clientes ou afeta serviços entregues aos clientes?',
      opcoes: [
        { valor: 'nao', rotulo: 'Não', score: 0 },
        { valor: 'indireto', rotulo: 'Indiretamente — afeta processos internos que apoiam clientes', score: 1 },
        { valor: 'limitado', rotulo: 'Sim, mas existe alternativa ou impacto limitado', score: 2 },
        { valor: 'direto', rotulo: 'Sim — a indisponibilidade pode impedir ou comprometer diretamente um serviço prestado ao cliente', score: 3 },
      ],
    },
  ];

  /** Soma dos scores maximos das perguntas: 6 perguntas x 3 = 18. */
  var SCORE_MAXIMO = PERGUNTAS.reduce(function (t, p) {
    return t + Math.max.apply(null, p.opcoes.map(function (o) { return o.score; }));
  }, 0);

  /**
   * Faixas de 0 a 18, em 3 partes de tamanho parecido. So 3 niveis, de
   * proposito: mapeiam 1:1 pro mesmo peso de 1/2/3 que o Tier do BIA ja usa em
   * risco-consolidado.js (PESO_TIER). Um 4o nivel exigiria mexer em
   * CARGA_MAXIMA_POR_RISCO, que assume peso maximo 3.
   */
  function faixa(score) {
    if (score === null || score === undefined) return { rotulo: 'Não avaliado', cor: '#999', fundo: '#f5f5f5' };
    if (score >= 13) return { rotulo: 'Alta', cor: '#c62828', fundo: '#ffebee' };
    if (score >= 7) return { rotulo: 'Média', cor: '#e65100', fundo: '#fff3e0' };
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
