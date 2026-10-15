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

  // DECISAO 15/10/2026: escala NIST SP 800-30 5x5 (antes 3x4, score 1-12).
  // Score = P x I (1-25) ordena e entra na carga; o NIVEL do risco vem da
  // matriz da Tabela I-2 do SP 800-30 (nivelPorMatriz), nao do produto.
  var PROBABILIDADES = ['Muito baixa', 'Baixa', 'Moderada', 'Alta', 'Muito alta'];
  var IMPACTOS = ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'];
  var PESO_PROBABILIDADE = { 'Muito baixa': 1, 'Baixa': 2, 'Moderada': 3, 'Alta': 4, 'Muito alta': 5 };
  var PESO_IMPACTO = { 'Muito baixo': 1, 'Baixo': 2, 'Moderado': 3, 'Alto': 4, 'Muito alto': 5 };
  var SCORE_MAXIMO = 25;

  /** Definicoes do SP 800-30 (Tabelas G-2/H-3), para as dicas da matriz na tela. */
  var DEFINICAO_PROBABILIDADE = {
    'Muito baixa': 'Altamente improvável que o evento ocorra e cause dano.',
    'Baixa': 'Improvável que ocorra e cause dano.',
    'Moderada': 'Pode ocorrer e causar dano.',
    'Alta': 'Provável que ocorra e cause dano.',
    'Muito alta': 'Quase certo que ocorra e cause dano.',
  };
  var DEFINICAO_IMPACTO = {
    'Muito baixo': 'Efeito adverso desprezível nas operações, ativos ou pessoas.',
    'Baixo': 'Efeito adverso limitado: degradação pequena, dano ou perda pequenos.',
    'Moderado': 'Efeito adverso sério: degradação significativa da missão, dano significativo.',
    'Alto': 'Efeito adverso grave: perda importante de capacidade, dano grande.',
    'Muito alto': 'Efeito adverso catastrófico: perda da capacidade de operar, dano severo ou múltiplo.',
  };

  /**
   * Rotulos antigos (escala 3x4) e variantes de genero/acento -> rotulo atual.
   * Usado em toda leitura: PCN/DRP ja gerados, importacoes e dado nao migrado
   * continuam calculando certo. Crítico/Crítica viram o topo da escala.
   */
  function _chave(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  var _NIVEIS_POR_CHAVE = {
    'muito baixa': 0, 'muito baixo': 0,
    'baixa': 1, 'baixo': 1,
    'media': 2, 'medio': 2, 'moderada': 2, 'moderado': 2,
    'alta': 3, 'alto': 3,
    'muito alta': 4, 'muito alto': 4, 'critica': 4, 'critico': 4,
  };
  function normalizarProbabilidade(v) {
    var i = _NIVEIS_POR_CHAVE[_chave(v)];
    return i === undefined ? '' : PROBABILIDADES[i];
  }
  function normalizarImpacto(v) {
    var i = _NIVEIS_POR_CHAVE[_chave(v)];
    return i === undefined ? '' : IMPACTOS[i];
  }

  // Niveis de risco, do menor para o maior.
  var ORDEM_NIVEL = ['Muito baixo', 'Baixo', 'Moderado', 'Alto', 'Muito alto'];
  // SP 800-30 Tabela I-2: linha = probabilidade (Muito baixa..Muito alta),
  // coluna = impacto (Muito baixo..Muito alto).
  var _MB = 'Muito baixo', _B = 'Baixo', _M = 'Moderado', _A = 'Alto', _MA = 'Muito alto';
  var MATRIZ_NIVEL = [
    [_MB, _MB, _MB, _B, _B],
    [_MB, _B, _B, _B, _M],
    [_MB, _B, _M, _M, _A],
    [_MB, _B, _M, _A, _MA],
    [_MB, _B, _M, _A, _MA],
  ];

  /** Nivel pela matriz NIST, ou null se P ou I fora da escala. */
  function nivelPorMatriz(probabilidade, impacto) {
    var p = PROBABILIDADES.indexOf(normalizarProbabilidade(probabilidade));
    var i = IMPACTOS.indexOf(normalizarImpacto(impacto));
    if (p === -1 || i === -1) return null;
    return MATRIZ_NIVEL[p][i];
  }

  var PESO_TIER = {};
  PESO_TIER[Criticidade.TIER.T1] = 3;
  PESO_TIER[Criticidade.TIER.T2] = 2;
  PESO_TIER[Criticidade.TIER.T3] = 1;

  /** Risco corporativo, ou em processo ainda nao avaliado: meio da escala. */
  var PESO_PADRAO = 2;

  /** Quanto um risco pode somar, no pior caso: score 25 x peso 3. */
  var CARGA_MAXIMA_POR_RISCO = 75;

  /** Unico status que fica fora da conta (decisao 3 acima). */
  var STATUS_FORA = ['Encerrado'];

  /** Area dos riscos que nasceram sem area (ex.: desvio de indicador). */
  var AREA_CORPORATIVA = 'Corporativo (sem área)';

  /** Ordem da composicao (pior primeiro) -- as mesmas chaves do historico. */
  var FAIXAS = ['Muito alto', 'Alto', 'Moderado', 'Baixo', 'Muito baixo'];

  /**
   * Score do risco, 1 a 12, recalculado de probabilidade x impacto.
   *
   * Nunca usa o campo `score` gravado: ele vinha do navegador e podia divergir
   * da escala. Devolve null quando falta um dos dois — ausencia nao e risco
   * baixo, e um null obriga quem chama a decidir o que fazer com o buraco.
   */
  function scoreDoRisco(r) {
    var p = PESO_PROBABILIDADE[normalizarProbabilidade(r && r.probabilidade)];
    var i = PESO_IMPACTO[normalizarImpacto(r && r.impacto)];
    if (!p || !i) return null;
    return p * i;
  }

  /** Cores de cada nivel. Cores: ver DECISAO 04/10/2026 em criticidade.js. */
  var _CORES_NIVEL = {
    'Muito alto': { cor: 'var(--risk-critical)', fundo: 'var(--risk-critical-surface)' },
    'Alto': { cor: 'var(--risk-high)', fundo: '#fff3e0' },
    'Moderado': { cor: 'var(--risk-medium)', fundo: '#fff8e1' },
    'Baixo': { cor: 'var(--risk-low)', fundo: '#e8f5e9' },
    'Muito baixo': { cor: 'var(--risk-low)', fundo: '#f3faf3' },
  };

  /** {rotulo, cor, fundo} de um nivel. */
  function faixaNivel(rotulo) {
    var c = _CORES_NIVEL[rotulo];
    return c ? { rotulo: rotulo, cor: c.cor, fundo: c.fundo } : null;
  }

  /** Faixa do risco pela matriz NIST (null sem avaliacao). */
  function faixaDoRisco(r) {
    return faixaNivel(nivelPorMatriz(r && r.probabilidade, r && r.impacto));
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
      // {score, scoreMaximo} -- scoreMaximo congelado na epoca da avaliacao
      // (perguntas de criticidade sao cadastraveis agora; sem o maximo da
      // epoca, pesoPorScore reclassificaria uma nota antiga contra um total
      // de perguntas diferente do que existia quando ela foi calculada).
      var crit = criticidadePorFornecedor[String(idFornecedor)];
      var pesoForn = crit && FornecedorCriticidade.pesoPorScore(crit.score, crit.scoreMaximo);
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
    return { carga: 0, contados: 0, semAvaliacao: 0, pior: null, piorNivel: null, composicao: comp };
  }

  function _somar(acc, r, score, carga) {
    var nivel = nivelPorMatriz(r.probabilidade, r.impacto);
    acc.carga += carga;
    acc.contados += 1;
    // Pior = maior nivel (matriz); empate no nivel, maior score.
    if (acc.pior === null || ORDEM_NIVEL.indexOf(nivel) > ORDEM_NIVEL.indexOf(acc.piorNivel)
      || (nivel === acc.piorNivel && score > acc.pior)) {
      acc.pior = score;
      acc.piorNivel = nivel;
    }
    acc.composicao[nivel] += 1;
  }

  function _resultado(area, acc) {
    return {
      area: area,
      carga: acc.carga,
      contados: acc.contados,
      semAvaliacao: acc.semAvaliacao,
      piorScore: acc.pior,
      piorFaixa: acc.piorNivel === null ? null : faixaNivel(acc.piorNivel),
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
      _somar(acc, r, score, carga);
      _somar(empresa, r, score, carga);
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

  // ------------------------------------------------------------------
  // Governanca de riscos alinhada ao NIST (DECISAO 15/10/2026)
  //   - apetite/tolerancia: CSF 2.0 GV.RM-02;
  //   - inerente x residual e resposta ao risco: SP 800-30 / SP 800-37;
  //   - reavaliacao periodica: RMF "Monitor".
  // Funcoes puras: a tela usa e os testes cobrem.
  // ------------------------------------------------------------------

  var APETITE_PADRAO = 'Moderado';

  /** Apetite gravado na escala antiga ("Crítico") -> nivel atual. */
  function normalizarNivel(v) {
    var i = _NIVEIS_POR_CHAVE[_chave(v)];
    return i === undefined ? '' : ORDEM_NIVEL[i];
  }

  /** Dias ate a proxima reavaliacao, pelo nivel (quanto pior, mais cedo). */
  var DIAS_REAVALIACAO = { 'Muito alto': 30, 'Alto': 90, 'Moderado': 180, 'Baixo': 365, 'Muito baixo': 365 };

  /** Funcoes do NIST CSF 2.0, e a padrao por origem do risco. */
  var FUNCOES_CSF = ['Governar', 'Identificar', 'Proteger', 'Detectar', 'Responder', 'Recuperar'];
  var FUNCAO_CSF_POR_ORIGEM = {
    'Vulnerabilidade': 'Identificar',
    'Fornecedor': 'Governar',
    'Indicador de Segurança': 'Detectar',
    'Importado de DRP': 'Recuperar',
    'Importado de PCN': 'Recuperar',
  };

  /** Status em que o risco precisa estar avaliado (P e I preenchidos). */
  var STATUS_EXIGEM_AVALIACAO = ['Em Avaliação', 'Em Tratamento', 'Em Monitoramento', 'Aceito'];

  /** Nivel inerente (matriz NIST), ou null sem avaliacao. */
  function nivelDoRisco(r) {
    return nivelPorMatriz(r && r.probabilidade, r && r.impacto);
  }

  /** Nivel residual (matriz NIST com P/I residuais), ou null. */
  function nivelResidual(r) {
    return nivelPorMatriz(r && r.probabilidadeResidual, r && r.impactoResidual);
  }

  /** Score residual (depois do tratamento), ou null quando nao informado. */
  function scoreResidual(r) {
    return scoreDoRisco({ probabilidade: r && r.probabilidadeResidual, impacto: r && r.impactoResidual });
  }

  function _ordem(nivel) { return ORDEM_NIVEL.indexOf(nivel); }

  /** Acima do apetite: nivel inerente maior que o apetite, e o risco ainda conta. */
  function acimaDoApetite(r, apetite) {
    var nivel = nivelDoRisco(r);
    if (!nivel || !contaNoConsolidado(r)) return false;
    var ap = normalizarNivel(apetite);
    var lim = _ordem(ap) === -1 ? _ordem(APETITE_PADRAO) : _ordem(ap);
    return _ordem(nivel) > lim;
  }

  /**
   * Prioridade CALCULADA (antes era escolhida a mao e podia contradizer o
   * score): pelo nivel do risco, um degrau acima quando passa do apetite.
   */
  var PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];
  var _PRIORIDADE_POR_NIVEL = { 'Muito baixo': 0, 'Baixo': 0, 'Moderado': 1, 'Alto': 2, 'Muito alto': 3 };
  function prioridadeCalculada(r, apetite) {
    var nivel = nivelDoRisco(r);
    if (!nivel) return '';
    var i = _PRIORIDADE_POR_NIVEL[nivel];
    if (acimaDoApetite(r, apetite)) i = Math.min(i + 1, PRIORIDADES.length - 1);
    return PRIORIDADES[i];
  }

  // Avanco automatico de status (RMF): so para frente, nunca Aceito/Encerrado.
  var _ORDEM_STATUS_AUTOMATICO = ['Identificado', 'Em Avaliação', 'Em Tratamento', 'Em Monitoramento'];

  function _respostaDefinida(r) {
    var est = r && r.estrategiaTratamento;
    var acoes = Array.isArray(r && r.planoAcao) ? r.planoAcao : [];
    if (est === 'Mitigar') return acoes.length > 0;
    if (est === 'Transferir' || est === 'Evitar') return String(r.estrategiaDescricao || '').trim() !== '';
    return false;
  }

  /**
   * Status para onde o risco avanca sozinho ao salvar, ou null. So quando a
   * pessoa NAO mexeu no status nesta edicao (statusAnterior === r.status).
   * Identificado -> Em Avaliacao (P e I) -> Em Tratamento (resposta definida)
   * -> Em Monitoramento (todas as acoes concluidas).
   */
  function statusAvancado(r, statusAnterior) {
    var atual = String((r && r.status) || 'Identificado');
    if (atual !== String(statusAnterior || atual)) return null;
    var pos = _ORDEM_STATUS_AUTOMATICO.indexOf(atual);
    if (pos === -1) return null;
    var alvo = -1;
    if (scoreDoRisco(r) !== null) alvo = 1;
    if (alvo === 1 && _respostaDefinida(r)) alvo = 2;
    var acoes = Array.isArray(r.planoAcao) ? r.planoAcao : [];
    if (alvo === 2 && r.estrategiaTratamento === 'Mitigar' && acoes.length && acoes.every(function (a) { return a && a.status === 'Concluído'; })) alvo = 3;
    return alvo > pos ? _ORDEM_STATUS_AUTOMATICO[alvo] : null;
  }

  /** Status de uma acao do plano: Atrasado automatico se o prazo passou e nao foi concluida. */
  function statusDaAcao(acao, hojeISO) {
    var st = (acao && acao.status) || 'Pendente';
    if (st === 'Concluído') return st;
    var q = acao && acao.quando;
    if (q && String(q).slice(0, 10) < String(hojeISO).slice(0, 10)) return 'Atrasado';
    return st === 'Atrasado' ? 'Pendente' : st;
  }

  /** Etapas do processo NIST SP 800-39 concluidas (trilha do drawer). */
  function etapasNist(r) {
    var x = r || {};
    var est = x.estrategiaTratamento;
    var resp = false;
    if (est === 'Aceitar') resp = String(x.justificativaAceite || '').trim() !== '';
    else resp = _respostaDefinida(x);
    return {
      enquadrar: String(x.titulo || '').trim() !== '' && String(x.responsavel || '').trim() !== '',
      avaliar: scoreDoRisco(x) !== null,
      responder: resp,
      monitorar: !!x.proximaReavaliacao || (Array.isArray(x.kris) && x.kris.length > 0),
    };
  }

  function _somarDias(dataISO, dias) {
    var d = new Date(String(dataISO).slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  /** Proxima reavaliacao sugerida pelo nivel (matriz), a partir de hoje. null sem avaliacao. */
  function proximaReavaliacaoSugerida(r, hojeISO) {
    var nivel = nivelDoRisco(r);
    return nivel ? _somarDias(hojeISO, DIAS_REAVALIACAO[nivel]) : null;
  }

  /** Reavaliacao vencida: data passou e o risco ainda esta ativo. */
  function reavaliacaoVencida(r, hojeISO) {
    var prox = r && r.proximaReavaliacao;
    if (!prox || !contaNoConsolidado(r)) return false;
    return String(prox).slice(0, 10) < String(hojeISO).slice(0, 10);
  }

  function funcaoCsfPadrao(origem) {
    return FUNCAO_CSF_POR_ORIGEM[origem] || '';
  }

  /**
   * O que falta para o risco ENTRAR no status escolhido (SP 800-37: cada etapa
   * tem o seu minimo). So vale na MUDANCA de status -- registro antigo que ja
   * estava no status nao e travado. Devolve a lista de pendencias (vazia = ok).
   */
  function pendenciasDoStatus(r, statusAnterior, apetite) {
    var st = String((r && r.status) || '');
    if (!st || st === statusAnterior) return [];
    var falta = [];
    var vazio = function (x) { return x === null || x === undefined || String(x).trim() === ''; };
    if (STATUS_EXIGEM_AVALIACAO.indexOf(st) !== -1 && scoreDoRisco(r) === null) {
      falta.push('Probabilidade e Impacto (aba Análise & Avaliação)');
    }
    if (st === 'Em Tratamento') {
      if (vazio(r.estrategiaTratamento)) falta.push('Estratégia de Tratamento');
      else if (r.estrategiaTratamento === 'Mitigar' && !(Array.isArray(r.planoAcao) && r.planoAcao.length)) {
        falta.push('ao menos uma ação no Plano de Ação (estratégia Mitigar)');
      }
    }
    if (st === 'Aceito') {
      if (vazio(r.justificativaAceite)) falta.push('Justificativa do aceite');
      if (vazio(r.proximaReavaliacao)) falta.push('Próxima reavaliação');
      if (acimaDoApetite(r, apetite) && vazio(r.aprovadorAceite)) falta.push('Aprovador do aceite (risco acima do apetite)');
    }
    if (st === 'Encerrado' && vazio(r.justificativaEncerramento)) falta.push('Justificativa de encerramento');
    return falta;
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
    PROBABILIDADES: PROBABILIDADES,
    IMPACTOS: IMPACTOS,
    DEFINICAO_PROBABILIDADE: DEFINICAO_PROBABILIDADE,
    DEFINICAO_IMPACTO: DEFINICAO_IMPACTO,
    MATRIZ_NIVEL: MATRIZ_NIVEL,
    normalizarProbabilidade: normalizarProbabilidade,
    normalizarImpacto: normalizarImpacto,
    normalizarNivel: normalizarNivel,
    nivelPorMatriz: nivelPorMatriz,
    faixaNivel: faixaNivel,
    faixaDoRisco: faixaDoRisco,
    contaNoConsolidado: contaNoConsolidado,
    pesoDoRisco: pesoDoRisco,
    cargaDoRisco: cargaDoRisco,
    areaDoRisco: areaDoRisco,
    indexarProcessos: _indexarProcessos,
    consolidar: consolidar,
    ORDEM_NIVEL: ORDEM_NIVEL,
    APETITE_PADRAO: APETITE_PADRAO,
    DIAS_REAVALIACAO: DIAS_REAVALIACAO,
    FUNCOES_CSF: FUNCOES_CSF,
    nivelDoRisco: nivelDoRisco,
    nivelResidual: nivelResidual,
    PRIORIDADES: PRIORIDADES,
    prioridadeCalculada: prioridadeCalculada,
    statusAvancado: statusAvancado,
    statusDaAcao: statusDaAcao,
    etapasNist: etapasNist,
    scoreResidual: scoreResidual,
    acimaDoApetite: acimaDoApetite,
    proximaReavaliacaoSugerida: proximaReavaliacaoSugerida,
    reavaliacaoVencida: reavaliacaoVencida,
    funcaoCsfPadrao: funcaoCsfPadrao,
    pendenciasDoStatus: pendenciasDoStatus,
  };
}));
