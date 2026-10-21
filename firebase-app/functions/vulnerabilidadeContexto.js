/**
 * Le no Firestore o contexto que a decisao do risco de uma Vulnerabilidade
 * precisa (vulnerabilidadeRisco.decidir/construirRisco sao puras e nao leem
 * nada): limiar configurado, nome do Produto de Software e os processos de
 * negocio afetados (cadeia Vulnerabilidade -> Dependencia afetada -> Processo
 * -> Tier do BIA). Usado pelo gatilho riscoDeVulnerabilidade, pela varredura
 * diaria e pela importacao manual (appLogic), para os tres decidirem igual.
 */

'use strict';

const historicoRisco = require('./historicoRisco');
const vulnerabilidadeRisco = require('./vulnerabilidadeRisco');

/** Limiar de CVSS que abre risco: config_regua/vulnerabilidade.limiarCvss (0-10), padrao 7.0. */
async function lerLimiar(db) {
  try {
    const snap = await db.collection('config_regua').doc('vulnerabilidade').get();
    const n = Number(snap.exists ? (snap.data() || {}).limiarCvss : NaN);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : vulnerabilidadeRisco.LIMIAR_CVSS_PADRAO;
  } catch (e) {
    return vulnerabilidadeRisco.LIMIAR_CVSS_PADRAO;
  }
}

/** Processos com score/avaliado do BIA unidos -- uma leitura, reaproveitavel (cache). */
async function lerProcessosPorId(db) {
  const [procSnap, biaSnap] = await Promise.all([
    db.collection('processos').get(),
    db.collection('respostas_bia').get(),
  ]);
  return historicoRisco.resolverProcessosComBia(
    procSnap.docs.map((d) => Object.assign({ id: d.id }, d.data())),
    biaSnap.docs.map((d) => d.data())
  );
}

/**
 * Servicos e dependencias: a cadeia Processo -> Servico -> componentes pela
 * qual uma dependencia afetada chega ao processo (cadeiaDependencias.js).
 */
async function lerRede(db) {
  const [srvSnap, depSnap] = await Promise.all([
    db.collection('servicos').get(),
    db.collection('dependencias').get(),
  ]);
  return {
    servicos: srvSnap.docs.map((d) => Object.assign({ id: d.id }, d.data())),
    dependencias: depSnap.docs.map((d) => Object.assign({ id: d.id }, d.data())),
  };
}

/**
 * { limiar, produtoNome, processosAfetados }. `cache` (opcional) evita reler
 * limiar e processos quando varias vulnerabilidades sao tratadas em sequencia.
 * Falha de leitura do produto/processos nao impede a decisao: segue sem eles.
 */
async function contextoDaVulnerabilidade(db, v, cache) {
  const c = cache || {};
  if (c.limiar === undefined) c.limiar = await lerLimiar(db);

  let produtoNome = '';
  if (v && v.produtoSoftwareId) {
    try {
      const ps = await db.collection('produtos_software').doc(String(v.produtoSoftwareId)).get();
      if (ps.exists) produtoNome = String((ps.data() || {}).nome || '');
    } catch (e) { /* segue sem o nome */ }
  }

  let processosAfetados = [];
  const temDeps = Array.isArray(v && v.dependenciasAfetadas) && v.dependenciasAfetadas.some((d) => d && d.id);
  if (temDeps) {
    try {
      if (!c.processosPorId) c.processosPorId = await lerProcessosPorId(db);
      if (!c.rede) c.rede = await lerRede(db);
      processosAfetados = vulnerabilidadeRisco.processosAfetados(v, c.processosPorId, c.rede);
    } catch (e) { /* segue sem a cadeia: impacto pela severidade */ }
  }
  return { limiar: c.limiar, produtoNome, processosAfetados };
}

module.exports = { lerLimiar, lerProcessosPorId, lerRede, contextoDaVulnerabilidade };
