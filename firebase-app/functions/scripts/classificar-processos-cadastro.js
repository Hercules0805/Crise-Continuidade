/**
 * Cadastro de Processos (28/10/2026): a colecao `processos` passa a ser o
 * cadastro geral dos processos das areas, e Continuidade (BIA/BCP/DRP) e o
 * recorte `continuidade: true`. Este script classifica o que ja existe: todo
 * processo cadastrado ate aqui era de Continuidade, e entra como
 * categoriaId 'processo-de-negocio' e continuidade true (categoria pelo id desde 29/10/2026).
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/classificar-processos-cadastro.js           (so mostra o que faria)
 *   node scripts/classificar-processos-cadastro.js --gravar  (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * E IDEMPOTENTE: so grava o campo que falta; processo ja classificado (mesmo
 * que de outra categoria, ou fora de Continuidade) fica como esta.
 */

'use strict';

// Desde 29/10/2026 a categoria e um cadastro (categorias_processo) e o processo guarda o id.
const CATEGORIA_PADRAO = 'processo-de-negocio';

/** Puro: [{ processoId, dados }] com so os campos que faltam em cada processo. */
function planejar(processos) {
  return (processos || []).map((p) => {
    const dados = {};
    if (!p.categoriaId && !p.categoria) dados.categoriaId = CATEGORIA_PADRAO;
    if (typeof p.continuidade !== 'boolean') dados.continuidade = true;
    return { processoId: String(p.id), dados };
  }).filter((g) => Object.keys(g.dados).length);
}

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const gravar = process.argv.includes('--gravar');
  const processos = (await db.collection('processos').get()).docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

  const plano = planejar(processos);
  console.log(`Processos no cadastro: ${processos.length}; a classificar: ${plano.length}`);
  for (const g of plano) {
    const p = processos.find((x) => x.id === g.processoId);
    console.log(`  + ${p.area || ''} · ${p.processo || ''}: ${JSON.stringify(g.dados)}`);
    if (gravar) await db.collection('processos').doc(g.processoId).set(g.dados, { merge: true });
  }
  console.log(gravar ? '\nGravado.' : '\nNada gravado (use --gravar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { planejar, CATEGORIA_PADRAO };
