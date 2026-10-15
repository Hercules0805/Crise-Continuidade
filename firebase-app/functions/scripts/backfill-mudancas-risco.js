/**
 * Preenche `mudancas` (o que mudou, risco a risco, em cada dia) nos retratos do
 * Monitor de Risco que ja estao gravados -- e o que a dica ao passar o mouse
 * nos pontos do grafico mostra.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/backfill-mudancas-risco.js            (ensaio: so mostra o que faria)
 *   node scripts/backfill-mudancas-risco.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * NAO MEXE NA CURVA: grava SO o campo `mudancas` (merge) -- carga, impacto
 * financeiro e composicao dos retratos ficam exatamente como estao. E
 * IDEMPOTENTE: rodar de novo apenas recalcula `mudancas`.
 *
 * Cada dia e comparado com o fim do dia anterior, com os pesos de Tier e de
 * criticidade de HOJE (a mesma aproximacao deliberada da reconstrucao -- ver
 * historicoRisco.js). Nos poucos dias em que o retrato gravado usou outros
 * pesos, a soma das mudancas difere do ponto gravado; a tela avisa nesses casos.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const retratoRisco = require('../retratoRisco');
const historicoRisco = require('../historicoRisco');

async function main() {
  const gravar = process.argv.includes('--gravar');
  const insumos = await retratoRisco.montarInsumos(db);
  const snap = await db.collection(retratoRisco.COLECAO_RETRATOS).orderBy('dia').get();
  const hojeChave = retratoRisco.chaveDoDia(new Date().toISOString());

  let comMudanca = 0;
  for (const doc of snap.docs) {
    const dia = doc.data().dia || doc.id;
    // Hoje usa "agora" (o retrato de hoje e regravado ao longo do dia); os dias
    // passados, o fim do dia -- o mesmo criterio do backfill-historico-risco.js.
    const alvo = dia === hojeChave ? new Date().toISOString() : retratoRisco.fimDoDiaISO(dia);
    const baseline = retratoRisco.fimDoDiaISO(retratoRisco.diaAnterior(dia));
    const retrato = historicoRisco.reconstruirComMudancas(
      insumos.medicoesRisco, insumos.vinculosPorRiscoId, insumos.processosPorId, insumos.criticidadePorFornecedor, alvo, baseline);
    const m = retrato.mudancas;
    if (m.length) comMudanca++;
    console.log(`${dia}: ${m.length} risco(s) mudaram` + (m.length ? ' -> ' + m.map((x) => `${x.titulo} [${x.tipo} ${x.cargaAntes}->${x.cargaDepois}]`).join('; ') : ''));
    if (gravar) await doc.ref.set({ mudancas: m }, { merge: true });
  }
  console.log(gravar
    ? `\nPronto -- ${snap.size} retrato(s) atualizado(s) (${comMudanca} com mudancas).`
    : `\nEnsaio: ${snap.size} retrato(s), ${comMudanca} com mudancas. Rode com --gravar para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('Falhou:', e); process.exit(1); });
