/**
 * Regra unica da criticidade do fornecedor.
 *
 * DECISAO 08/10/2026 -- as perguntas deixam de ser fixas no codigo e viram
 * cadastraveis (tela "Perguntas de Criticidade", colecao Firestore
 * criticidade_fornecedor_perguntas). Este modulo so guarda a REGRA DE
 * CALCULO, nao mais a lista de perguntas -- quem chama (app.js/api.js) busca
 * a lista atual (perguntas ATIVAS) e passa pra calcular()/faixa()/
 * scoreMaximoDe(). PERGUNTAS_SEED abaixo e só o estado inicial (usado pelo
 * script de seed, uma vez, não pelo calculo em si).
 *
 * Por que os cortes de faixa viraram proporcionais (e nao um numero fixo):
 * se o cadastro permite adicionar/remover pergunta ou opcao, o score maximo
 * possivel muda -- um corte fixo (ex.: ">=13") ficaria descalibrado (13 de
 * um maximo de 15 e bem mais raro de evitar que 13 de um maximo de 18). Os
 * cortes agora sao uma FRACAO do maximo atual (LIMIAR_ALTA_PROPORCAO/
 * LIMIAR_MEDIA_PROPORCAO), calibrados pra dar exatamente os mesmos pontos de
 * corte de hoje (13/18 e 7/18) quando o cadastro continuar do jeito que esta
 * agora (6 perguntas x 3 pontos) -- editar/adicionar/remover pergunta depois
 * reescala os cortes automaticamente, sem precisar de outro campo de config.
 *
 * DECISOES DE FUNDO, que continuam valendo (das rodadas anteriores):
 *   - Cada pergunta e de ESCOLHA UNICA: a pessoa marca a opcao que mais se
 *     aplica. Nao e escolha multipla -- nao da pra marcar duas opcoes da
 *     mesma pergunta.
 *   - A criticidade final e a SOMA de todas as perguntas ATIVAS. Mesmo
 *     padrao "uma resposta por pergunta, soma no final" que o BIA e o Risco
 *     ja usam.
 *   - A criticidade vira o PESO do risco automatico do fornecedor na carga
 *     de risco da empresa (risco-consolidado.js), do mesmo jeito que o Tier
 *     do BIA ja pesa o risco de processo. So 3 niveis de peso (1/2/3), de
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
 *   fica true quando todas as perguntas ATIVAS tem uma opcao marcada --
 *   incluindo a de valor 0.
 *
 * Cada resposta grava o INDICE da opcao escolhida dentro de `pergunta.opcoes`
 * (nao um slug) -- as opcoes sao cadastraveis agora, entao a ordem delas no
 * array e a unica referencia estavel que o cadastro ja da de graca, sem
 * precisar de mais um campo. Avaliacoes ja salvas sao append-only e ficam
 * congeladas com o que foi gravado na epoca; isso so importa pra respostas
 * NOVAS.
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

  /**
   * Estado inicial (DECISAO 22/09/2026) -- usado só pelo script de seed de
   * `criticidade_fornecedor_perguntas`, uma vez. Depois do seed, a fonte de
   * verdade é o Firestore; este array nunca mais é lido por calcular()/
   * faixa()/scoreMaximoDe().
   */
  var PERGUNTAS_SEED = [
    {
      texto: 'Qual é a importância desse fornecedor para a operação da empresa?',
      ordem: 1,
      opcoes: [
        { rotulo: 'Baixa — o serviço não é necessário para a operação; sua indisponibilidade gera pouco ou nenhum impacto', score: 0 },
        { rotulo: 'Moderada — apoia atividades internas, mas a empresa continua trabalhando sem ele', score: 1 },
        { rotulo: 'Alta — sua indisponibilidade prejudica significativamente uma ou mais áreas', score: 2 },
        { rotulo: 'Essencial — sua indisponibilidade pode interromper processos críticos, atendimento a clientes ou serviços essenciais', score: 3 },
      ],
    },
    {
      texto: 'Por quanto tempo a empresa conseguiria operar sem esse fornecedor?',
      ordem: 2,
      opcoes: [
        { rotulo: 'Mais de 72 horas', score: 0 },
        { rotulo: 'Até 72 horas', score: 1 },
        { rotulo: 'Até 24 horas', score: 2 },
        { rotulo: 'Até 4 horas', score: 3 },
      ],
    },
    {
      texto: 'Existe uma alternativa disponível caso esse fornecedor deixe de prestar o serviço?',
      ordem: 3,
      opcoes: [
        { rotulo: 'Sim, a empresa consegue substituí-lo rapidamente', score: 0 },
        { rotulo: 'Sim, mas a substituição levaria algum tempo', score: 1 },
        { rotulo: 'Existem poucas alternativas e a substituição seria difícil', score: 2 },
        { rotulo: 'Não existe alternativa viável no curto prazo', score: 3 },
      ],
    },
    {
      texto: 'O que aconteceria se os dados ou informações mantidos pelo fornecedor ficassem indisponíveis?',
      ordem: 4,
      opcoes: [
        { rotulo: 'Não há impacto relevante', score: 0 },
        { rotulo: 'Haveria impacto pontual, mas os dados poderiam ser recuperados facilmente', score: 1 },
        { rotulo: 'A recuperação seria trabalhosa e afetaria a operação', score: 2 },
        { rotulo: 'A perda/indisponibilidade comprometeria processos críticos ou poderia causar perda significativa de informação', score: 3 },
      ],
    },
    {
      texto: 'Que tipo de acesso o fornecedor possui aos sistemas da empresa?',
      ordem: 5,
      opcoes: [
        { rotulo: 'Não possui acesso aos sistemas da empresa', score: 0 },
        { rotulo: 'Possui acesso apenas como usuário comum', score: 1 },
        { rotulo: 'Possui acesso para integração ou operação de sistemas', score: 2 },
        { rotulo: 'Possui acesso privilegiado, administrativo ou direto a ambientes críticos', score: 3 },
      ],
    },
    {
      texto: 'O serviço do fornecedor é utilizado diretamente por clientes ou afeta serviços entregues aos clientes?',
      ordem: 6,
      opcoes: [
        { rotulo: 'Não', score: 0 },
        { rotulo: 'Indiretamente — afeta processos internos que apoiam clientes', score: 1 },
        { rotulo: 'Sim, mas existe alternativa ou impacto limitado', score: 2 },
        { rotulo: 'Sim — a indisponibilidade pode impedir ou comprometer diretamente um serviço prestado ao cliente', score: 3 },
      ],
    },
  ];

  /** Soma dos scores maximos das perguntas informadas (lista de ATIVAS). */
  function scoreMaximoDe(perguntas) {
    return (perguntas || []).reduce(function (t, p) {
      var scores = (p.opcoes || []).map(function (o) { return Number(o.score) || 0; });
      return t + (scores.length ? Math.max.apply(null, scores) : 0);
    }, 0);
  }

  // Fracoes que davam os cortes de hoje (13 e 7 de um maximo de 18) --
  // preservadas como a calibracao-base; ver nota no topo do arquivo.
  var LIMIAR_ALTA_PROPORCAO = 13 / 18;
  var LIMIAR_MEDIA_PROPORCAO = 7 / 18;

  /**
   * Faixas em 3 partes, proporcionais ao score maximo possivel (nao mais um
   * numero fixo -- ver nota no topo do arquivo). So 3 niveis, de proposito:
   * mapeiam 1:1 pro mesmo peso de 1/2/3 que o Tier do BIA ja usa em
   * risco-consolidado.js (PESO_TIER). Um 4o nivel exigiria mexer em
   * CARGA_MAXIMA_POR_RISCO, que assume peso maximo 3.
   */
  function faixa(score, scoreMaximo) {
    if (score === null || score === undefined) return { rotulo: 'Não avaliado', cor: '#999', fundo: '#f5f5f5' };
    var maximo = Number(scoreMaximo) || 0;
    if (maximo > 0 && score >= maximo * LIMIAR_ALTA_PROPORCAO) return { rotulo: 'Alta', cor: 'var(--risk-critical)', fundo: 'var(--risk-critical-surface)' };
    if (maximo > 0 && score >= maximo * LIMIAR_MEDIA_PROPORCAO) return { rotulo: 'Média', cor: 'var(--risk-medium)', fundo: '#fff3e0' };
    return { rotulo: 'Baixa', cor: 'var(--risk-low)', fundo: '#e8f5e9' };
  }

  var PESO_POR_FAIXA = { 'Baixa': 1, 'Média': 2, 'Alta': 3 };

  /** Peso do risco automatico a partir do score. null (sem avaliacao) cai no peso padrao de quem chama. */
  function pesoPorScore(score, scoreMaximo) {
    if (score === null || score === undefined) return null;
    return PESO_POR_FAIXA[faixa(score, scoreMaximo).rotulo] || null;
  }

  /** Opcao escolhida, pelo indice dela no array (ver nota no topo do arquivo). */
  function _opcao(pergunta, valor) {
    var idx = Number(valor);
    if (valor === undefined || valor === null || valor === '' || isNaN(idx)) return null;
    return (pergunta.opcoes || [])[idx] || null;
  }

  /**
   * Criticidade a partir das perguntas ATIVAS (vindas do Firestore) e das
   * respostas.
   *
   * `perguntas` e a lista de perguntas ativas no momento (cada uma com `id`
   * e `opcoes`). `respostas` e um mapa { [perguntaId]: indice da opcao
   * escolhida } -- ausente/vazio se a pergunta nao foi respondida ainda.
   */
  function calcular(perguntas, respostas) {
    var lista = perguntas || [];
    var mapa = respostas || {};
    var score = 0;
    var pendentes = [];

    lista.forEach(function (p) {
      var op = _opcao(p, mapa[p.id]);
      if (!op) { pendentes.push(p.id); return; }
      score += Number(op.score) || 0;
    });

    var completa = lista.length > 0 && pendentes.length === 0;
    var scoreMaximo = scoreMaximoDe(lista);

    return {
      // Sem todas as respostas, a criticidade nao existe -- 0 aqui mentiria
      // que o fornecedor foi avaliado como baixo risco. Mesma regra do "nao
      // avaliado" de fornecedor-score.js e do Tier Pendente do BIA.
      score: completa ? score : null,
      scoreMaximo: scoreMaximo,
      faixa: completa ? faixa(score, scoreMaximo) : faixa(null, scoreMaximo),
      completa: completa,
      pendentes: pendentes,
    };
  }

  /**
   * Criticidade EFETIVA do fornecedor (DECISAO 29/10/2026): fornecedor de que
   * depende um processo Tier 1 (Critico) -- direto ou via Servico/componente --
   * e Alta automaticamente, qualquer que seja o questionario (que fica
   * bloqueado na tela enquanto isso valer). Derivada, nunca gravada: vem do
   * vinculo e do Tier de HOJE, e some sozinha quando o vinculo sai.
   *
   * `avaliacao` e a ultima avaliacao do fornecedor (ou null);
   * `processosCriticos` e a lista [{processo, origens}] ja filtrada em Tier 1.
   * Devolve o formato que risco-consolidado.js espera ({score, scoreMaximo})
   * mais `automatica`, que vale peso 3.
   */
  function efetiva(avaliacao, processosCriticos) {
    var av = avaliacao || null;
    var completa = !!(av && av.completaCriticidade);
    var score = completa && av.scoreCriticidade !== null && av.scoreCriticidade !== undefined ? Number(av.scoreCriticidade) : null;
    var scoreMaximo = av ? (Number(av.scoreMaximoCriticidade) || 0) : 0;
    var processos = processosCriticos || [];
    var automatica = processos.length > 0;
    var f = automatica ? FAIXA_AUTOMATICA : faixa(score, scoreMaximo);
    return { score: score, scoreMaximo: scoreMaximo, completa: completa, faixa: f, automatica: automatica, processos: processos };
  }

  var FAIXA_AUTOMATICA = { rotulo: 'Alta', cor: 'var(--risk-critical)', fundo: 'var(--risk-critical-surface)', automatica: true };

  /** Peso do risco a partir do resultado de efetiva(): automatica = Alta = 3. */
  function pesoEfetivo(crit) {
    if (!crit) return null;
    if (crit.automatica) return PESO_POR_FAIXA['Alta'];
    return pesoPorScore(crit.score, crit.scoreMaximo);
  }

  return {
    SENTIDO: SENTIDO,
    PERGUNTAS_SEED: PERGUNTAS_SEED,
    LIMIAR_ALTA_PROPORCAO: LIMIAR_ALTA_PROPORCAO,
    LIMIAR_MEDIA_PROPORCAO: LIMIAR_MEDIA_PROPORCAO,
    PESO_POR_FAIXA: PESO_POR_FAIXA,
    scoreMaximoDe: scoreMaximoDe,
    faixa: faixa,
    pesoPorScore: pesoPorScore,
    calcular: calcular,
    efetiva: efetiva,
    pesoEfetivo: pesoEfetivo,
  };
}));
