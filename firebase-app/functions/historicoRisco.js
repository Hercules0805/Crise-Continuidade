/**
 * Reconstrucao do risco consolidado num ponto do passado, a partir do livro
 * de medicoes (Fase 5 -- O monitor).
 *
 * POR QUE ESTE ARQUIVO DUPLICA PESO_TIER, TIER e PESO_POR_FAIXA_FORNECEDOR,
 * EM VEZ DE REQUERER public/risco-consolidado.js OU public/criticidade.js:
 * o deploy de Functions so empacota a pasta functions/ (firebase.json:
 * functions.source = "functions"). Um require('../public/...') funciona nos
 * testes locais e QUEBRA EM PRODUCAO, silenciosamente -- exatamente o
 * defeito que esta migracao ja cometeu duas vezes (a pagina do PCN e o
 * editor inline chamando o Apps Script escondido, porque a busca foi feita
 * na camada errada). medicoes.js ja abriu esse precedente aqui dentro
 * (PESO_PROBABILIDADE/PESO_IMPACTO duplicados) pelo mesmo motivo.
 *
 * Se as faixas de Tier ou de criticidade do fornecedor mudarem em public/,
 * este arquivo precisa mudar junto -- e os testes dos dois lados (aqui e em
 * risco-consolidado.test.js / criticidade.test.js) precisam continuar
 * concordando. E o preco de nao poder compartilhar codigo entre Hosting e
 * Functions; a alternativa (reescrever tudo em cada tela) e pior.
 *
 * O QUE E RECONSTRUIDO A PARTIR DO LIVRO (varia dia a dia, por isso precisa
 * vir da medicao, nao do documento atual):
 *   - se o risco contava no consolidado naquele dia (status, via `classificacao`)
 *   - o score do risco naquele dia (via `valor`)
 *   - o impacto financeiro estimado naquele dia (via `valorFinanceiro`,
 *     22/09/2026) -- somado em R$, SEM aplicar o peso do Tier/criticidade
 *     (dinheiro ja e o numero final, nao precisa de ponderacao de novo).
 *     Medicao anterior a essa data nao tem esse campo -- conta em
 *     `semImpactoFinanceiro`, nunca como estimativa zero.
 *
 * O QUE VEM DO ESTADO ATUAL (aproximacao deliberada -- ver risco-
 * consolidado.js: "Criticidade muda uma vez por ano, Exposicao muda toda
 * semana"; o vinculo risco->processo/fornecedor e o Tier/criticidade de hoje
 * raramente diferem do que eram ha poucos dias ou semanas):
 *   - a qual processo ou fornecedor o risco pertence
 *   - o Tier do processo e a criticidade do fornecedor
 *
 * Sem Firestore aqui, de proposito, para poder ser testado com node --test.
 */

'use strict';

const STATUS_FORA = ['Encerrado'];
const AREA_CORPORATIVA = 'Corporativo (sem área)';

// --- Tier do processo (copia de public/criticidade.js) ---------------------
const LIMIAR_TIER_1 = 12;
const LIMIAR_TIER_2 = 6;
const TIER = {
  T1: 'Tier 1 (Crítico)',
  T2: 'Tier 2 (Essencial)',
  T3: 'Tier 3 (Suporte)',
  PENDENTE: 'Pendente',
};

function _foiAvaliado(p) {
  return !!p && (p.avaliado === true || Number(p.score) > 0);
}

function _tierPorScore(score) {
  if (score >= LIMIAR_TIER_1) return TIER.T1;
  if (score >= LIMIAR_TIER_2) return TIER.T2;
  return TIER.T3;
}

function tierDoProcesso(p) {
  if (!p) return TIER.PENDENTE;
  if (_foiAvaliado(p)) return _tierPorScore(Number(p.score));
  if (p.tierManual) return p.tierManual;
  return TIER.PENDENTE;
}

/**
 * Resolve score/avaliado de cada processo a partir da ultima resposta do BIA
 * (respostas_bia, por chave area+processo) — copia de _lerRespostasIndexadas
 * + _lerProcessos em public/api.js.
 *
 * BUG QUE ISSO CORRIGE (22/09/2026): o documento de /processos NAO guarda
 * score nem avaliado -- eles vivem so em respostas_bia e sao unidos na
 * leitura. A reconstrucao lia /processos cru, sem esse join, entao
 * tierDoProcesso() caia sempre em Pendente (peso 2) mesmo pra processo com
 * BIA respondido -- a carga do retrato saia sistematicamente menor que a
 * carga ao vivo (caso real: 70 no retrato contra 93 ao vivo, no mesmo dia,
 * com os mesmos riscos).
 */
function resolverProcessosComBia(processosRaw, respostasBia) {
  const maisRecentePorChave = {};
  (respostasBia || [])
    .slice()
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .forEach((r) => {
      const key = `${r.area}||${r.processo}`;
      if (!maisRecentePorChave[key]) {
        maisRecentePorChave[key] = { score: Number(r.score) || 0, avaliado: true };
      }
    });

  const processosPorId = {};
  (processosRaw || []).forEach((p) => {
    const resp = maisRecentePorChave[`${p.area}||${p.processo}`];
    processosPorId[p.id] = Object.assign({}, p, {
      score: resp ? resp.score : 0,
      avaliado: resp ? resp.avaliado : false,
    });
  });
  return processosPorId;
}

// --- Pesos (copia de public/risco-consolidado.js) ---------------------------
const PESO_TIER = {};
PESO_TIER[TIER.T1] = 3;
PESO_TIER[TIER.T2] = 2;
PESO_TIER[TIER.T3] = 1;
const PESO_PADRAO = 2;

// --- Criticidade do fornecedor (copia de public/fornecedor-criticidade.js) -
const PESO_POR_FAIXA_FORNECEDOR = { Baixa: 1, 'Média': 2, Alta: 3 };

function faixaCriticidadeFornecedor(score) {
  if (score >= 13) return 'Alta';
  if (score >= 7) return 'Média';
  return 'Baixa';
}

function pesoPorCriticidadeFornecedor(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  return PESO_POR_FAIXA_FORNECEDOR[faixaCriticidadeFornecedor(Number(score))] || null;
}

/** Peso do risco: Tier do processo vinculado, OU criticidade do fornecedor vinculado, OU padrao. */
function pesoDoRisco(vinculo, processosPorId, criticidadePorFornecedor) {
  const idProcesso = vinculo && vinculo.processoId;
  if (idProcesso) {
    const p = processosPorId && processosPorId[String(idProcesso)];
    const pesoTier = PESO_TIER[tierDoProcesso(p)];
    return pesoTier || PESO_PADRAO;
  }
  const idFornecedor = vinculo && vinculo.fornecedor;
  if (idFornecedor && criticidadePorFornecedor) {
    const pesoForn = pesoPorCriticidadeFornecedor(criticidadePorFornecedor[String(idFornecedor)]);
    if (pesoForn) return pesoForn;
  }
  return PESO_PADRAO;
}

/** Faixa do score individual (1 a 12), so o rotulo -- e o que entra na composicao. */
function faixaScore(n) {
  if (n >= 9) return 'Crítico';
  if (n >= 6) return 'Alto';
  if (n >= 3) return 'Moderado';
  return 'Baixo';
}

/**
 * Reduz uma lista de medicoes de risco (fonte 'risco') ao estado mais recente
 * de cada risco, em ou antes de `dataAlvoISO`.
 *
 * Medicoes mais novas que a data alvo sao ignoradas -- e isso que torna o
 * resultado "o retrato daquele dia", nao o de hoje. Um risco sem nenhuma
 * medicao ate a data alvo (ainda nao existia, ou ainda nao tinha sido
 * avaliado) simplesmente nao aparece -- nao e um erro, e a foto correta.
 */
function _estadoPorRiscoEmData(medicoesRisco, dataAlvoISO) {
  const alvo = new Date(dataAlvoISO).getTime();
  const porRisco = {};
  (medicoesRisco || []).forEach((m) => {
    if (!m || m.sujeitoTipo !== 'risco' || !m.sujeitoId) return;
    const quando = new Date(m.coletadoEm).getTime();
    if (isNaN(quando) || quando > alvo) return;
    const atual = porRisco[m.sujeitoId];
    if (!atual || quando > atual._quando) {
      porRisco[m.sujeitoId] = Object.assign({ _quando: quando }, m);
    }
  });
  return porRisco;
}

function _novoAcumulado() {
  return { carga: 0, contados: 0, impactoFinanceiro: 0, composicao: { 'Crítico': 0, Alto: 0, Moderado: 0, Baixo: 0 } };
}

/**
 * `valorFinanceiro` pode ser null (medicao antiga, de antes deste campo
 * existir, ou risco sem estimativa ainda) -- soma 0 nesse caso, mas quem
 * chama e responsavel por contar em semImpactoFinanceiro (a soma sozinha nao
 * distingue "somou zero de verdade" de "nao tinha estimativa nenhuma").
 */
function _somar(acc, score, carga, valorFinanceiro) {
  acc.carga += carga;
  acc.contados += 1;
  acc.impactoFinanceiro += (valorFinanceiro || 0);
  acc.composicao[faixaScore(score)] += 1;
}

/**
 * Risco consolidado (empresa + por area) como estava em `dataAlvoISO`.
 *
 * @param medicoesRisco            medicoes de fonte 'risco' (qualquer periodo; a funcao filtra pela data)
 * @param vinculosPorRiscoId       mapa riscoId -> {processoId, fornecedor, area} (vinculo ATUAL)
 * @param processosPorId           mapa processoId -> {score, avaliado, tierManual} (estado ATUAL do BIA)
 * @param criticidadePorFornecedor mapa fornecedorId -> scoreCriticidade (ATUAL, 0-18)
 * @param dataAlvoISO              data alvo, ISO 8601
 */
function reconstruirEmData(medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor, dataAlvoISO) {
  const estadoPorRisco = _estadoPorRiscoEmData(medicoesRisco, dataAlvoISO);
  const porArea = {};
  const empresa = _novoAcumulado();
  let foraPorStatus = 0;
  let semAvaliacao = 0;
  let semVinculo = 0;
  let semImpactoFinanceiro = 0;

  Object.keys(estadoPorRisco).forEach((riscoId) => {
    const estado = estadoPorRisco[riscoId];
    const status = String(estado.classificacao || 'Identificado').trim();
    if (STATUS_FORA.indexOf(status) !== -1) { foraPorStatus += 1; return; }

    const vinculo = (vinculosPorRiscoId && vinculosPorRiscoId[riscoId]) || null;
    if (!vinculo) semVinculo += 1;
    const area = String((vinculo && vinculo.area) || estado.area || '').trim() || AREA_CORPORATIVA;

    const score = Number(estado.valor);
    if (!porArea[area]) porArea[area] = _novoAcumulado();

    if (!Number.isFinite(score) || score <= 0) {
      semAvaliacao += 1;
      return;
    }

    const peso = pesoDoRisco(vinculo, processosPorId, criticidadePorFornecedor);
    const carga = score * peso;
    // Impacto financeiro NAO e ponderado pelo peso do Tier/criticidade -- e um
    // valor em R$ ja estimado, multiplicar por criticidade nao faz sentido
    // (dinheiro nao fica "mais dinheiro" por o processo ser mais critico).
    const valorFinanceiro = estado.valorFinanceiro === null || estado.valorFinanceiro === undefined
      ? null : Number(estado.valorFinanceiro);
    if (valorFinanceiro === null) semImpactoFinanceiro += 1;
    _somar(porArea[area], score, carga, valorFinanceiro);
    _somar(empresa, score, carga, valorFinanceiro);
  });

  const areas = Object.keys(porArea)
    .map((area) => Object.assign({ area }, porArea[area]))
    .sort((x, y) => y.carga - x.carga || x.area.localeCompare(y.area));

  return {
    data: dataAlvoISO,
    empresa: Object.assign({ area: 'Empresa' }, empresa),
    areas,
    foraPorStatus,
    semAvaliacao,
    semVinculo,
    semImpactoFinanceiro,
  };
}

module.exports = {
  STATUS_FORA,
  AREA_CORPORATIVA,
  TIER,
  PESO_TIER,
  PESO_PADRAO,
  PESO_POR_FAIXA_FORNECEDOR,
  tierDoProcesso,
  resolverProcessosComBia,
  faixaCriticidadeFornecedor,
  pesoPorCriticidadeFornecedor,
  faixaScore,
  pesoDoRisco,
  reconstruirEmData,
};
