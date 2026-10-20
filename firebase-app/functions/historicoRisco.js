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

// 'Excluído' e um status sintetico: nunca vem do formulario, so da medicao de
// fechamento que medicaoDeRisco (index.js) grava quando o documento do risco
// e apagado. Sem ele, um risco excluido continuaria contando pra sempre no
// retrato (a reconstrucao so olha a ULTIMA medicao de cada sujeitoId, e uma
// exclusao nunca gerava medicao nenhuma antes desta mudanca).
const STATUS_FORA = ['Encerrado', 'Excluído'];
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

// DECISAO 15/10/2026: escala NIST 5x5. O nivel vem da matriz do SP 800-30
// (escalaRisco.nivelPorMatriz), com os rotulos da medicao.
const escalaRisco = require('./escalaRisco');

/**
 * Nivel (rotulo da composicao) de uma medicao: pela matriz NIST com a
 * probabilidade/impacto da propria medicao. Medicao sem rotulos reconheciveis
 * (nao deveria existir: medicaoDeRisco so grava com escala valida) cai em
 * Moderado, o meio da escala, em vez de sumir da composicao.
 */
function nivelDaMedicao(m) {
  return escalaRisco.nivelPorMatriz(m && m.probabilidade, m && m.impacto) || 'Moderado';
}

/**
 * Score de uma medicao: recalculado pelos rotulos normalizados (assim medicao
 * da escala antiga 3x4 vale na escala nova sem regravar); sem rotulos, o
 * `valor` gravado.
 */
function scoreDaMedicao(m) {
  const s = escalaRisco.scoreDeRisco(m && m.probabilidade, m && m.impacto);
  return s !== null ? s : Number(m && m.valor);
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
  const composicao = {};
  escalaRisco.FAIXAS.forEach((f) => { composicao[f] = 0; });
  return { carga: 0, contados: 0, impactoFinanceiro: 0, composicao };
}

/**
 * `valorFinanceiro` pode ser null (medicao antiga, de antes deste campo
 * existir, ou risco sem estimativa ainda) -- soma 0 nesse caso, mas quem
 * chama e responsavel por contar em semImpactoFinanceiro (a soma sozinha nao
 * distingue "somou zero de verdade" de "nao tinha estimativa nenhuma").
 */
function _somar(acc, nivel, carga, valorFinanceiro) {
  acc.carga += carga;
  acc.contados += 1;
  acc.impactoFinanceiro += (valorFinanceiro || 0);
  acc.composicao[nivel] += 1;
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
  // Contribuicao de CADA risco neste dia (so para comparar um dia com o outro --
  // ver mudancasEntre; reconstruirComMudancas nao persiste esta lista).
  const riscos = [];

  Object.keys(estadoPorRisco).forEach((riscoId) => {
    const estado = estadoPorRisco[riscoId];
    const status = String(estado.classificacao || 'Identificado').trim();
    const vinculo = (vinculosPorRiscoId && vinculosPorRiscoId[riscoId]) || null;
    const areaDoRisco = String((vinculo && vinculo.area) || estado.area || '').trim() || AREA_CORPORATIVA;
    const base = {
      id: riscoId,
      titulo: String(estado.sujeitoRotulo || riscoId),
      area: areaDoRisco,
      status,
      score: Number(estado.valor),
      contado: false,
      carga: 0,
      valorFinanceiro: null,
    };
    if (STATUS_FORA.indexOf(status) !== -1) { foraPorStatus += 1; riscos.push(base); return; }

    if (!vinculo) semVinculo += 1;
    const area = areaDoRisco;

    const score = scoreDaMedicao(estado);
    if (!porArea[area]) porArea[area] = _novoAcumulado();

    if (!Number.isFinite(score) || score <= 0) {
      semAvaliacao += 1;
      riscos.push(base);
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
    const nivel = nivelDaMedicao(estado);
    _somar(porArea[area], nivel, carga, valorFinanceiro);
    _somar(empresa, nivel, carga, valorFinanceiro);
    riscos.push(Object.assign(base, { contado: true, carga, valorFinanceiro }));
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
    riscos,
  };
}

/**
 * O que mudou de um estado para o outro, risco a risco -- a resposta para "por
 * que a curva subiu (ou desceu) neste dia?". `antes` e `depois` sao as listas
 * `riscos` de duas reconstrucoes (fim do dia anterior e fim do dia), feitas com
 * os MESMOS insumos, entao pesos de Tier/criticidade iguais nos dois lados: so
 * entra aqui o que mudou no proprio risco.
 *
 * Um risco so entra se sua carga OU seu valor financeiro mudou. `tipo`:
 *   novo        -- nao contava e passou a contar (criado, ou avaliado pela 1a vez)
 *   reavaliado  -- contava antes e depois, com valor diferente (inclui voltar a "sem avaliacao")
 *   encerrado   -- contava e saiu por status Encerrado
 *   excluido    -- contava e o risco foi apagado
 * Ordenado pelo tamanho da variacao de carga (os que mais mexeram primeiro).
 */
function mudancasEntre(antes, depois) {
  const porId = (lista) => {
    const m = {};
    (lista || []).forEach((r) => { m[r.id] = r; });
    return m;
  };
  const a = porId(antes);
  const d = porId(depois);
  const ids = Object.keys(Object.assign({}, a, d));
  const out = [];

  ids.forEach((id) => {
    const ra = a[id];
    const rd = d[id];
    const contavaAntes = !!(ra && ra.contado);
    const contaDepois = !!(rd && rd.contado);
    const cargaAntes = contavaAntes ? ra.carga : 0;
    const cargaDepois = contaDepois ? rd.carga : 0;
    const financeiroAntes = contavaAntes ? (ra.valorFinanceiro || 0) : 0;
    const financeiroDepois = contaDepois ? (rd.valorFinanceiro || 0) : 0;
    if (cargaAntes === cargaDepois && financeiroAntes === financeiroDepois) return;

    let tipo;
    if (!contavaAntes && contaDepois) tipo = 'novo';
    else if (contavaAntes && !contaDepois && rd && rd.status === 'Excluído') tipo = 'excluido';
    else if (contavaAntes && !contaDepois && rd && STATUS_FORA.indexOf(rd.status) !== -1) tipo = 'encerrado';
    else tipo = 'reavaliado';

    const ref = rd || ra;
    // Titulo de verdade: a medicao cai no proprio id quando o risco nao tinha
    // titulo; prefere um dos dois lados que tenha, senao rotulo neutro.
    const tituloReal = [rd, ra].map((r) => r && r.titulo).find((t) => t && t !== id);
    out.push({
      riscoId: id,
      titulo: tituloReal || '(risco sem título)',
      area: ref.area,
      tipo,
      scoreAntes: contavaAntes ? ra.score : null,
      scoreDepois: contaDepois ? rd.score : null,
      cargaAntes,
      cargaDepois,
      financeiroAntes,
      financeiroDepois,
    });
  });

  return out.sort((x, y) => Math.abs(y.cargaDepois - y.cargaAntes) - Math.abs(x.cargaDepois - x.cargaAntes)
    || x.titulo.localeCompare(y.titulo, 'pt-BR'));
}

/**
 * Retrato de `dataAlvoISO` + `mudancas` (o que mudou desde `baselineISO`, em
 * geral o fim do dia anterior). Duas reconstrucoes com os mesmos insumos --
 * nenhuma leitura a mais no Firestore. A lista interna `riscos` NAO vai para o
 * documento: so o resultado, `mudancas`.
 */
function reconstruirComMudancas(medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor, dataAlvoISO, baselineISO) {
  const depois = reconstruirEmData(medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor, dataAlvoISO);
  const antes = reconstruirEmData(medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor, baselineISO);
  const retrato = Object.assign({}, depois);
  delete retrato.riscos;
  retrato.mudancas = mudancasEntre(antes.riscos, depois.riscos);
  return retrato;
}

// ------------------------------------------------------------------
// Linha do tempo por escopo (Relatorio Executivo de Riscos, 20/10/2026)
// ------------------------------------------------------------------

function _mesesAte(mesAtual, n) {
  const ano = Number(mesAtual.slice(0, 4));
  const mes = Number(mesAtual.slice(5, 7));
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    let m = mes - k;
    let a = ano;
    while (m <= 0) { m += 12; a--; }
    out.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Fim do ultimo dia do mes 'AAAA-MM' (mesmo instante "fim do dia" do retrato diario). */
function _fimDoMesISO(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return new Date(ultimo + 'T23:59:59.999Z').toISOString();
}

function _mesAnterior(mes) {
  return _mesesAte(mes, 2)[0];
}

/**
 * Serie mensal do risco consolidado reconstruida das medicoes -- a mesma conta
 * do retrato diario (reconstruirEmData), feita no fim de cada mes. Com
 * `idsFiltro` (Set de riscoId), so os riscos do escopo de um relatorio
 * filtrado: e o que permite a linha do tempo de QUALQUER filtro, nao so de
 * empresa/area (que e tudo o que historico_risco guarda).
 *
 * `insumos` = retratoRisco.montarInsumos. `mesAtual` = 'AAAA-MM' do agora; o
 * ponto do mes corrente e `agoraISO`, os outros o fim do mes.
 * Devolve { pontos: [{ mes, carga, contados, impactoFinanceiro, composicao,
 * novos, sairam, areas: [{ area, carga, contados, impactoFinanceiro, novos,
 * sairam }] }], marcos } -- marcos = os 6 riscos que mais mexeram na carga no
 * periodo (inicio -> agora).
 */
function serieMensal(insumos, opcoes) {
  const o = opcoes || {};
  const ids = o.idsFiltro ? new Set([...o.idsFiltro].map(String)) : null;
  const medicoes = (insumos.medicoesRisco || []).filter((m) => !ids || ids.has(String(m && m.sujeitoId)));
  const reconstruir = (alvo) => reconstruirEmData(medicoes, insumos.vinculosPorRiscoId, insumos.processosPorId, insumos.criticidadePorFornecedor, alvo);
  const meses = _mesesAte(o.mesAtual, o.meses || 12);
  const inicio = reconstruir(_fimDoMesISO(_mesAnterior(meses[0])));
  let anterior = inicio;
  const pontos = meses.map((mes) => {
    const atual = reconstruir(mes === o.mesAtual ? o.agoraISO : _fimDoMesISO(mes));
    const mudancas = mudancasEntre(anterior.riscos, atual.riscos);
    anterior = atual;
    const conta = (lista, tipos) => lista.filter((x) => tipos.indexOf(x.tipo) !== -1).length;
    const SAIU = ['encerrado', 'excluido'];
    return {
      mes,
      carga: atual.empresa.carga,
      contados: atual.empresa.contados,
      impactoFinanceiro: atual.empresa.impactoFinanceiro,
      composicao: atual.empresa.composicao,
      novos: conta(mudancas, ['novo']),
      sairam: conta(mudancas, SAIU),
      areas: atual.areas.map((a) => {
        const daArea = mudancas.filter((x) => x.area === a.area);
        return { area: a.area, carga: a.carga, contados: a.contados, impactoFinanceiro: a.impactoFinanceiro, novos: conta(daArea, ['novo']), sairam: conta(daArea, SAIU) };
      }),
    };
  });
  const marcos = mudancasEntre(inicio.riscos, anterior.riscos).slice(0, 6).map((x) => ({
    riscoId: x.riscoId, titulo: x.titulo, area: x.area, tipo: x.tipo, cargaAntes: x.cargaAntes, cargaDepois: x.cargaDepois,
  }));
  return { pontos, marcos };
}

module.exports = {
  serieMensal,
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
  nivelDaMedicao,
  scoreDaMedicao,
  pesoDoRisco,
  reconstruirEmData,
  mudancasEntre,
  reconstruirComMudancas,
};
