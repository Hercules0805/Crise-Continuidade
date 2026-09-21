/**
 * Livro de medicoes — a base do monitor de risco ao longo do tempo.
 *
 * PROBLEMA QUE RESOLVE
 * Cada modulo guardava o passado de um jeito: o BIA numa colecao propria, o
 * indicador numa lista dentro do documento, o risco num campo de texto livre.
 * Nao havia como cruzar os tres numa linha do tempo, e o risco simplesmente nao
 * guardava historico. Sem isso nao existe monitor: so a foto de hoje.
 *
 * A IDEIA
 * Toda medicao vira uma linha, nunca apagada, sempre com os mesmos campos:
 *   - sobre o que e      (sujeitoTipo + sujeitoId + area)
 *   - de onde veio       (fonte)
 *   - o que foi medido   (metrica + escala)
 *   - quanto deu         (valor)
 *   - quando             (coletadoEm, e registradoEm)
 *   - por qual regua     (reguaVersao)
 *   - ate quando vale    (validoAte)
 *
 * E isso que faz BIA, indicadores, vulnerabilidades e fornecedores caberem na
 * mesma prateleira, e o que faz a curva existir.
 *
 * POR QUE VIA GATILHO, E NAO NO CODIGO QUE GRAVA
 * O BIA e gravado por dois caminhos (o app e o link externo sem login). Duas
 * vezes nesta migracao um caminho escondido passou despercebido porque a busca
 * foi feita na camada errada. Um gatilho no proprio banco nao tem como ser
 * esquecido: quem gravar a resposta, por onde for, gera a medicao.
 *
 * Este arquivo tem so a transformacao, sem Firestore, para poder ser testada.
 */

const COLECAO = 'medicoes';

/** Escalas conhecidas. A escala diz como ler o valor. */
const ESCALA = {
  SCORE_BIA: 'score-bia',        // soma das respostas do questionario
  PERCENTUAL: 'percentual',      // 0 a 100
  SCORE_RISCO: 'score-risco',    // probabilidade x impacto
  CONFORMIDADE: 'conformidade',  // 0 a 100, MAIOR E MELHOR (fornecedor)
};

/**
 * Sentido da escala: para onde aponta o "bom".
 *
 * Existe porque as escalas deste livro nao apontam todas para o mesmo lado. Um
 * score de risco 12 e o pior caso; uma conformidade de fornecedor 100 e o melhor.
 * Sem esta marca, o grafico que ainda vamos construir leria conformidade alta
 * como risco alto — que foi exatamente o erro que os indicadores "quanto menor
 * melhor" ja cometeram uma vez na tela.
 */
const SENTIDO = {
  MAIOR_PIOR: 'maiorPior',
  MAIOR_MELHOR: 'maiorMelhor',
};

const FONTE = {
  BIA: 'bia',
  INDICADOR: 'indicador',
  RISCO: 'risco',
  VULNERABILIDADE: 'vulnerabilidade',
  FORNECEDOR: 'fornecedor',
};

/** Quanto tempo uma medicao continua valendo, por fonte (em dias). */
const VALIDADE_DIAS = {
  [FONTE.BIA]: 365,            // BIA e revisao anual
  [FONTE.INDICADOR]: 45,       // mensal, com folga
  [FONTE.RISCO]: 180,
  [FONTE.VULNERABILIDADE]: 30,
  [FONTE.FORNECEDOR]: 365,
};

function _somarDias(iso, dias) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + dias * 86400000).toISOString();
}

/**
 * Numero medido, ou null quando nao houve medicao.
 *
 * ATENCAO: Number(null) e Number('') valem ZERO em JavaScript. Sem esta guarda,
 * um mes sem dado virava uma medicao de 0% — que na curva e MUITO pior que a
 * ausencia, porque 0% parece desempenho pessimo em vez de "nao medido". E o
 * mesmo engano que fazia uma celula vazia da planilha apagar o valor do mes.
 */
function _numeroMedido(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Chave estavel: a mesma resposta nunca gera duas medicoes. */
function idDaMedicao(fonte, origemId) {
  return `${fonte}__${origemId}`;
}

/**
 * Converte uma resposta de BIA em medicao.
 *
 * Devolve null quando a resposta nao tem o minimo para virar um ponto da curva
 * — melhor nao registrar do que registrar um ponto sem data ou sem valor.
 */
function medicaoDeRespostaBia(origemId, resp) {
  if (!resp) return null;
  const valor = _numeroMedido(resp.score);
  if (valor === null) return null;

  const coletadoEm = resp.timestamp || null;
  if (!coletadoEm || isNaN(new Date(coletadoEm).getTime())) return null;

  const area = String(resp.area || '').trim();
  const processo = String(resp.processo || '').trim();
  if (!area || !processo) return null;

  return {
    sujeitoTipo: 'processo',
    sujeitoId: `${area}||${processo}`,
    sujeitoRotulo: `${area} | ${processo}`,
    area,
    fonte: FONTE.BIA,
    metrica: 'criticidade',
    escala: ESCALA.SCORE_BIA,
    valor,
    // Rotulo derivado no momento da medicao: guarda o que valia entao, mesmo
    // que a regra mude depois.
    classificacao: resp.tier || '',
    coletadoEm,
    registradoEm: new Date().toISOString(),
    registradoPor: String(resp.respondente || '').trim(),
    reguaVersao: Number(resp.reguaVersao) || 1,
    validoAte: _somarDias(coletadoEm, VALIDADE_DIAS[FONTE.BIA]),
    origemColecao: 'respostas_bia',
    origemId,
  };
}

/**
 * Converte um lancamento mensal de indicador em medicao.
 *
 * O mes (AAAA-MM) vira a data da medicao: dia 1 do mes, em UTC. A medicao e
 * sobre o MES de referencia, nao sobre o instante em que alguem digitou.
 */
function medicaoDeLancamento(origemId, lanc) {
  if (!lanc) return null;
  const valor = _numeroMedido(lanc.desempenho);
  if (valor === null) return null;

  const mes = String(lanc.mes || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;

  const indicadorId = String(lanc.indicadorId || '').trim();
  if (!indicadorId) return null;

  const coletadoEm = `${mes}-01T00:00:00.000Z`;

  return {
    sujeitoTipo: 'indicador',
    sujeitoId: indicadorId,
    sujeitoRotulo: String(lanc.indicadorNome || indicadorId),
    // Indicador nao pertence a uma area: fica sem, e so admin le a medicao.
    area: '',
    fonte: FONTE.INDICADOR,
    metrica: 'desempenho',
    escala: ESCALA.PERCENTUAL,
    valor,
    classificacao: '',
    periodo: mes,
    coletadoEm,
    registradoEm: new Date().toISOString(),
    registradoPor: String(lanc.lancadoPor || '').trim(),
    reguaVersao: 1,
    validoAte: _somarDias(coletadoEm, VALIDADE_DIAS[FONTE.INDICADOR]),
    origemColecao: 'lancamentos_indicadores',
    origemId,
  };
}

/**
 * Pesos do score de risco. Copia CANONICA no servidor.
 *
 * Ate agora o score era calculado so no navegador (app.js) e gravado como
 * viesse — diferente do BIA, que recalcula no servidor. Um ponto da curva de
 * risco nao pode depender do que o cliente mandou: aqui ele e recalculado.
 */
const PESO_PROBABILIDADE = { Baixa: 1, 'Média': 2, Alta: 3 };
const PESO_IMPACTO = { Baixo: 1, Moderado: 2, Alto: 3, 'Crítico': 4 };

/** Score do risco, ou null quando a escala nao e reconhecida. */
function scoreDeRisco(probabilidade, impacto) {
  const p = PESO_PROBABILIDADE[String(probabilidade || '').trim()];
  const i = PESO_IMPACTO[String(impacto || '').trim()];
  if (!p || !i) return null;
  return p * i;
}

/**
 * Converte um risco em medicao, quando algo que afeta o numero mudou.
 *
 * O risco nao guardava historico: probabilidade, impacto e score eram
 * sobrescritos, e as reavaliacoes iam para um campo de texto livre, sem data,
 * autor nem os valores do momento. Nao dava para responder "como este risco
 * evoluiu no ano" nem demonstrar a trilha numa auditoria.
 *
 * Devolve null quando nada relevante mudou (para nao poluir a curva com pontos
 * iguais) ou quando a escala nao e reconhecida — risco importado de PCN usa
 * outra escala, e registrar um numero errado e pior que nao registrar.
 */
function medicaoDeRisco(origemId, risco, anterior) {
  if (!risco) return null;

  const score = scoreDeRisco(risco.probabilidade, risco.impacto);
  if (score === null) return null;

  if (anterior) {
    const scoreAntes = scoreDeRisco(anterior.probabilidade, anterior.impacto);
    const mudou = scoreAntes !== score || (anterior.status || '') !== (risco.status || '');
    if (!mudou) return null;
  }

  const coletadoEm = risco.dataUltimaReavaliacao || risco.atualizadoEm || new Date().toISOString();
  if (isNaN(new Date(coletadoEm).getTime())) return null;

  return {
    sujeitoTipo: 'risco',
    sujeitoId: origemId,
    sujeitoRotulo: String(risco.titulo || origemId),
    area: String(risco.area || '').trim(),
    processoId: risco.processoId || null,
    fonte: FONTE.RISCO,
    metrica: 'risco',
    escala: ESCALA.SCORE_RISCO,
    valor: score,
    classificacao: String(risco.status || ''),
    probabilidade: String(risco.probabilidade || ''),
    impacto: String(risco.impacto || ''),
    coletadoEm,
    registradoEm: new Date().toISOString(),
    registradoPor: String(risco.atualizadoPor || risco.criadoPor || '').trim(),
    reguaVersao: 1,
    validoAte: _somarDias(coletadoEm, VALIDADE_DIAS[FONTE.RISCO]),
    origemColecao: 'riscos',
    origemId,
  };
}

/**
 * Converte uma avaliacao de fornecedor em medicao.
 *
 * A nota e CONFORMIDADE: maior e melhor. Por isso a medicao carrega o sentido
 * junto — ver SENTIDO, acima.
 *
 * Avaliacao sem nota (nenhum criterio respondido, ou todos "Nao se aplica") NAO
 * vira medicao: ausencia de nota nao e nota zero, e um ponto de valor 0 na curva
 * diria que o fornecedor nao atende nada.
 *
 * A faixa (Adequado, Aceitavel, Insuficiente, Critico) NAO e gravada aqui de
 * proposito: ela e regra de exibicao e vive em um lugar so, em
 * fornecedor-score.js. Gravar a faixa criaria uma segunda copia dos limites,
 * que e o problema que este projeto passou semanas removendo.
 */
function medicaoDeAvaliacaoFornecedor(origemId, av) {
  if (!av) return null;

  const valor = _numeroMedido(av.nota);
  if (valor === null) return null;

  const fornecedorId = String(av.fornecedorId || '').trim();
  if (!fornecedorId) return null;

  const coletadoEm = av.avaliadoEm || new Date().toISOString();
  if (isNaN(new Date(coletadoEm).getTime())) return null;

  return {
    sujeitoTipo: 'fornecedor',
    sujeitoId: fornecedorId,
    sujeitoRotulo: String(av.fornecedorNome || fornecedorId),
    // Fornecedor nao pertence a uma area: fica sem, e so admin le a medicao.
    area: '',
    fonte: FONTE.FORNECEDOR,
    metrica: 'conformidade',
    escala: ESCALA.CONFORMIDADE,
    sentido: SENTIDO.MAIOR_MELHOR,
    valor,
    classificacao: av.completa ? 'completa' : 'incompleta',
    coletadoEm,
    registradoEm: new Date().toISOString(),
    registradoPor: String(av.avaliadoPor || '').trim(),
    reguaVersao: Number(av.criteriosVersao) || 1,
    validoAte: _somarDias(coletadoEm, VALIDADE_DIAS[FONTE.FORNECEDOR]),
    origemColecao: 'avaliacoes_fornecedor',
    origemId,
  };
}

module.exports = {
  PESO_PROBABILIDADE,
  PESO_IMPACTO,
  scoreDeRisco,
  medicaoDeRisco,
  medicaoDeLancamento,
  COLECAO,
  ESCALA,
  FONTE,
  VALIDADE_DIAS,
  idDaMedicao,
  medicaoDeRespostaBia,
  medicaoDeAvaliacaoFornecedor,
  SENTIDO,
};
