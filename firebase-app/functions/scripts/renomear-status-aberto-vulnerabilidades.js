/**
 * Renomeia o Status da Correcao "Aberto" para "Pendente" nas vulnerabilidades ja
 * cadastradas (DECISAO 15/10/2026).
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/renomear-status-aberto-vulnerabilidades.js            (ensaio: so conta)
 *   node scripts/renomear-status-aberto-vulnerabilidades.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS ou
 * `gcloud auth application-default login`).
 *
 * Seguro com o gatilho de risco automatico: so "Corrigida" e "Aceita" encerram
 * risco, e "Aberto" e "Pendente" valem o mesmo para ele -- a decisao nao muda.
 * Mexe SO em `statusCorrecao`. Idempotente.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function main() {
  const gravar = process.argv.includes('--gravar');
  const snap = await db.collection('vulnerabilidades').where('statusCorrecao', '==', 'Aberto').get();
  console.log(`${snap.size} vulnerabilidade(s) com status "Aberto".`);
  snap.docs
    .map((d) => d.data().codigo || d.id)
    .sort()
    .forEach((c) => console.log(`  ${c}`));
  if (!gravar) { console.log('\nEnsaio: nada gravado. Rode com --gravar para aplicar.'); return; }
  let n = 0;
  for (const d of snap.docs) {
    await d.ref.set({ statusCorrecao: 'Pendente' }, { merge: true });
    n++;
  }
  console.log(`\n${n} vulnerabilidade(s) atualizada(s) para "Pendente".`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
