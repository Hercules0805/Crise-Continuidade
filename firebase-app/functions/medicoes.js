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

module.exports = {
  medicaoDeLancamento,
  COLECAO,
  ESCALA,
  FONTE,
  VALIDADE_DIAS,
  idDaMedicao,
  medicaoDeRespostaBia,
};
