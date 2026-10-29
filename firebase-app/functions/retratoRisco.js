/**
 * Monta e grava o retrato diario do risco consolidado (Fase 5 -- O monitor).
 *
 * Usado por dois caminhos que precisam concordar exatamente: a funcao
 * agendada (retratoDiarioRisco, em index.js, roda 1x por dia) e o backfill
 * manual (scripts/backfill-historico-risco.js, roda uma vez para preencher o
 * passado). Os dois chamam gerarRetrato/salvarRetrato daqui -- nao existem
 * dois jeitos de calcular o mesmo numero.
 *
 * A conta em si (o que conta, o peso, a soma) mora em historicoRisco.js, sem
 * Firestore, para poder ser testada. Este arquivo so busca os dados e grava
 * o resultado -- e por isso que NAO tem teste proprio de node --test (ele e
 * so encanamento; a logica esta coberta em historicoRisco.test.js).
 */

'use strict';

const historicoRisco = require('./historicoRisco');

const COLECAO_RETRATOS = 'historico_risco';

/** YYYY-MM-DD no fuso da empresa (Brasil nao tem horario de verao desde 2019). */
function chaveDoDia(dataISO) {
  return new Date(dataISO).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Busca os insumos que a reconstrucao precisa. */
async function montarInsumos(db) {
  const [medicoesSnap, riscosSnap, processosSnap, respostasBiaSnap, avaliacoesSnap, servicosSnap, dependenciasSnap] = await Promise.all([
    db.collection('medicoes').where('fonte', '==', 'risco').get(),
    db.collection('riscos').get(),
    db.collection('processos').get(),
    // O score/Tier do processo NAO mora no documento de /processos -- mora em
    // respostas_bia, unido na leitura. Ver historicoRisco.resolverProcessosComBia
    // (e o bug que essa uniao corrige: sem ela, todo processo caia em
    // Pendente/peso 2 aqui, mesmo com BIA respondido).
    db.collection('respostas_bia').get(),
    db.collection('avaliacoes_fornecedor').get(),
    // Criticidade automatica do fornecedor (29/10/2026): a cadeia
    // processo -> servico -> componentes precisa do catalogo e dos servicos.
    db.collection('servicos').get(),
    db.collection('dependencias').get(),
  ]);

  const medicoesRisco = medicoesSnap.docs.map((d) => d.data());

  const vinculosPorRiscoId = {};
  riscosSnap.docs.forEach((d) => {
    const r = d.data() || {};
    vinculosPorRiscoId[d.id] = {
      processoId: r.processoId || null,
      fornecedor: r.fornecedor || null,
      area: String(r.area || '').trim(),
    };
  });

  const processosRaw = processosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const respostasBia = respostasBiaSnap.docs.map((d) => d.data());
  const processosPorId = historicoRisco.resolverProcessosComBia(processosRaw, respostasBia);

  // Mesma dedupe do cliente (api.js: _lerAvaliacoesFornecedor) -- a ultima
  // avaliacao de cada fornecedor, por avaliadoEm.
  const criticidadePorFornecedor = {};
  const avaliadoEmPorFornecedor = {};
  avaliacoesSnap.docs.forEach((d) => {
    const a = d.data() || {};
    const fid = String(a.fornecedorId || '');
    if (!fid) return;
    const quando = String(a.avaliadoEm || '');
    if (!avaliadoEmPorFornecedor[fid] || quando > avaliadoEmPorFornecedor[fid]) {
      avaliadoEmPorFornecedor[fid] = quando;
      criticidadePorFornecedor[fid] = {
        score: a.completaCriticidade === false || a.scoreCriticidade === null || a.scoreCriticidade === undefined
          ? null : Number(a.scoreCriticidade),
        scoreMaximo: Number(a.scoreMaximoCriticidade) || 0,
        automatica: false,
      };
    }
  });

  // Fornecedor de processo Tier 1 e Alta automatica (29/10/2026), com ou sem avaliacao.
  const servicos = servicosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const dependencias = dependenciasSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  historicoRisco.fornecedoresDeProcessoCritico(processosPorId, servicos, dependencias).forEach((fid) => {
    criticidadePorFornecedor[fid] = Object.assign({ score: null, scoreMaximo: 0 }, criticidadePorFornecedor[fid], { automatica: true });
  });

  return { medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor };
}

/**
 * Fim do dia `chave` (YYYY-MM-DD): 23:59:59.999 UTC. E o MESMO instante que o
 * backfill sempre usou para "o retrato daquele dia" -- o que o gráfico mostra.
 */
function fimDoDiaISO(chave) {
  return new Date(chave + 'T23:59:59.999Z').toISOString();
}

/** A chave do dia anterior a `chave` (YYYY-MM-DD), por aritmetica de data pura. */
function diaAnterior(chave) {
  return new Date(Date.parse(chave + 'T00:00:00.000Z') - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Reconstroi o retrato do risco consolidado como estava em `dataAlvoISO`, mais
 * `mudancas`: o que mudou, risco a risco, desde o fim do dia anterior (a
 * resposta para "por que a curva subiu neste dia?").
 */
async function gerarRetrato(db, dataAlvoISO, insumosProntos) {
  const { medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor } = insumosProntos || await montarInsumos(db);
  const baselineISO = fimDoDiaISO(diaAnterior(chaveDoDia(dataAlvoISO)));
  const retrato = historicoRisco.reconstruirComMudancas(medicoesRisco, vinculosPorRiscoId, processosPorId, criticidadePorFornecedor, dataAlvoISO, baselineISO);
  // Onde o livro de medicoes comeca DE VERDADE (sem os pontos retroativos):
  // a tela marca o trecho anterior como reconstruido pela identificacao.
  retrato.inicioLivro = inicioDoLivro(medicoesRisco);
  return retrato;
}

/** Dia ('AAAA-MM-DD') da medicao de risco mais antiga que nao e retroativa; null sem nenhuma. */
function inicioDoLivro(medicoesRisco) {
  let min = null;
  (medicoesRisco || []).forEach((m) => {
    if (!m || m.retroativa || !m.coletadoEm || isNaN(new Date(m.coletadoEm).getTime())) return;
    const dia = chaveDoDia(m.coletadoEm);
    if (!min || dia < min) min = dia;
  });
  return min;
}

const LIMITE_DIAS_REGRAVAR = 400;

/**
 * Dias ja gravados que ficaram desatualizados (DECISAO 21/10/2026): medicao
 * registrada nas ultimas 26 h com `coletadoEm` anterior a ontem -- risco
 * criado com Data de identificacao no passado, ou retroacao. Devolve as
 * chaves 'AAAA-MM-DD' do dia mais antigo afetado ate ONTEM (o de hoje o
 * proprio retrato diario grava), no maximo 400 dias. Vazio = nada a regravar.
 */
function diasParaRegravar(medicoesRisco, agoraISO) {
  const agora = new Date(agoraISO).getTime();
  const ontem = diaAnterior(chaveDoDia(agoraISO));
  let maisAntigo = null;
  (medicoesRisco || []).forEach((m) => {
    if (!m || !m.registradoEm || !m.coletadoEm) return;
    const registrado = new Date(m.registradoEm).getTime();
    if (isNaN(registrado) || agora - registrado > 26 * 60 * 60 * 1000) return;
    const dia = chaveDoDia(m.coletadoEm);
    if (dia <= ontem && (!maisAntigo || dia < maisAntigo)) maisAntigo = dia;
  });
  if (!maisAntigo) return [];
  const dias = [];
  for (let d = ontem; d >= maisAntigo && dias.length < LIMITE_DIAS_REGRAVAR; d = diaAnterior(d)) dias.push(d);
  return dias.reverse();
}

/**
 * Grava (ou regrava) o retrato de um dia. Idempotente: o id do documento e a
 * propria data, entao rodar de novo por cima de um dia ja gravado so
 * atualiza o numero -- nunca duplica um ponto na curva.
 */
async function salvarRetrato(db, retrato) {
  const dia = chaveDoDia(retrato.data);
  await db.collection(COLECAO_RETRATOS).doc(dia).set(Object.assign({}, retrato, {
    dia,
    registradoEm: new Date().toISOString(),
  }));
  return dia;
}

module.exports = { COLECAO_RETRATOS, LIMITE_DIAS_REGRAVAR, chaveDoDia, fimDoDiaISO, diaAnterior, diasParaRegravar, inicioDoLivro, montarInsumos, gerarRetrato, salvarRetrato };
