/**
 * Migra os riscos gravados para a escala NIST SP 800-30 5x5 (DECISAO 15/10/2026).
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/migrar-escala-risco-5x5.js            (ensaio: mostra cada risco antes -> depois)
 *   node scripts/migrar-escala-risco-5x5.js --gravar   (grava de verdade)
 * Depois de gravar, reconstruir o historico do Risco no Tempo na escala nova:
 *   node scripts/backfill-historico-risco.js
 *   node scripts/backfill-mudancas-risco.js --gravar
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS ou
 * `gcloud auth application-default login`).
 *
 * O QUE FAZ (mantendo o significado de cada avaliacao):
 *   - probabilidade/impacto e os residuais: Média -> Moderada, Crítico -> Muito alto
 *     (Baixa/Alta/Baixo/Moderado/Alto continuam iguais);
 *   - status "Em Análise" -> "Em Avaliação" (fundidos);
 *   - prioridade -> a calculada (nivel pela matriz NIST + apetite), que a tela
 *     passou a usar no lugar da escolhida a mao;
 *   - apetite gravado "Crítico" -> "Muito alto".
 * As medicoes antigas NAO precisam ser regravadas: o historico recalcula o
 * score pelos rotulos normalizados de cada medicao (historicoRisco.js).
 * Idempotente: rodar de novo nao muda o que ja esta na escala nova.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// A regra do cliente (mesma do drawer), carregada direto de public/.
const RC = require('../../public/risco-consolidado.js');

async function main() {
  const gravar = process.argv.includes('--gravar');

  const cfgRef = db.collection('config_regua').doc('riscos');
  const cfgSnap = await cfgRef.get();
  const apetiteGravado = cfgSnap.exists ? (cfgSnap.data() || {}).apetite : '';
  const apetite = RC.normalizarNivel(apetiteGravado) || RC.APETITE_PADRAO;
  if (apetiteGravado && apetiteGravado !== apetite) {
    console.log(`Apetite: "${apetiteGravado}" -> "${apetite}"`);
    if (gravar) await cfgRef.set({ apetite }, { merge: true });
  } else {
    console.log(`Apetite: ${apetite} (sem mudança)`);
  }

  const snap = await db.collection('riscos').get();
  let mudam = 0;
  for (const d of snap.docs) {
    const r = d.data() || {};
    const novo = {
      probabilidade: RC.normalizarProbabilidade(r.probabilidade) || (r.probabilidade || ''),
      impacto: RC.normalizarImpacto(r.impacto) || (r.impacto || ''),
      probabilidadeResidual: RC.normalizarProbabilidade(r.probabilidadeResidual) || (r.probabilidadeResidual || ''),
      impactoResidual: RC.normalizarImpacto(r.impactoResidual) || (r.impactoResidual || ''),
      status: r.status === 'Em Análise' ? 'Em Avaliação' : (r.status || 'Identificado'),
    };
    novo.prioridade = RC.prioridadeCalculada(Object.assign({}, r, novo), apetite);
    const patch = {};
    Object.keys(novo).forEach((k) => {
      const antes = r[k] === undefined || r[k] === null ? '' : r[k];
      if (antes !== novo[k]) patch[k] = novo[k];
    });
    if (!Object.keys(patch).length) continue;
    mudam++;
    const nivelAntes = r.probabilidade && r.impacto ? `${r.probabilidade} x ${r.impacto}` : '—';
    console.log(`  ~ ${d.id} "${String(r.titulo || '').slice(0, 60)}"  [${nivelAntes}]  ->  ${Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(r[k] || '')} -> ${JSON.stringify(v)}`).join('; ')}  | nível ${RC.nivelDoRisco(novo) || '—'}, score ${RC.scoreDoRisco(novo) ?? '—'}`);
    if (gravar) await d.ref.set(Object.assign(patch, { atualizadoEm: new Date().toISOString() }), { merge: true });
  }
  console.log(`\nRiscos: ${snap.size}; a migrar: ${mudam}.`);
  console.log(gravar ? 'Gravado. Agora rode os backfills de histórico (ver cabeçalho).' : 'Ensaio: nada gravado. Rode com --gravar para aplicar.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Falhou:', e); process.exit(1); });
