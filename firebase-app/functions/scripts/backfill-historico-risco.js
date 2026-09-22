/**
 * Preenche o historico do monitor de risco (Fase 5) com um retrato por dia,
 * desde a primeira medicao de risco ja registrada ate hoje.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/backfill-historico-risco.js
 *
 * Precisa de credenciais do projeto para falar com o Firestore de producao.
 * O jeito mais simples: `gcloud auth application-default login` uma vez no
 * computador (ou apontar GOOGLE_APPLICATION_CREDENTIALS para o arquivo de
 * uma service account com acesso ao projeto bia-forte-2025).
 *
 * E IDEMPOTENTE: se um dia ja tem retrato gravado, este script regrava por
 * cima com o numero mais atual -- rodar de novo mais tarde, com mais
 * medicoes acumuladas, so deixa o historico mais completo. Nao apaga nada.
 *
 * O QUE ISSO NAO FAZ: nao inventa dado anterior a primeira medicao. A curva
 * comeca no dia em que o livro de medicoes comecou a existir -- ver a aba
 * Roadmap, Fase 2, para o porque.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const retratoRisco = require('../retratoRisco');

const UM_DIA_MS = 24 * 60 * 60 * 1000;

async function main() {
  const primeira = await db.collection('medicoes')
    .where('fonte', '==', 'risco')
    .orderBy('coletadoEm', 'asc')
    .limit(1)
    .get();

  if (primeira.empty) {
    console.log('Nenhuma medicao de risco registrada ainda -- nada para reconstruir.');
    return;
  }

  const inicioISO = primeira.docs[0].data().coletadoEm;
  let cursor = new Date(retratoRisco.chaveDoDia(inicioISO) + 'T12:00:00.000Z'); // meio-dia evita duvida de fuso na virada
  const hoje = new Date(retratoRisco.chaveDoDia(new Date().toISOString()) + 'T12:00:00.000Z');

  let gravados = 0;
  while (cursor.getTime() <= hoje.getTime()) {
    const fimDoDiaISO = new Date(cursor.getTime() + (12 * 60 * 60 * 1000 - 1)).toISOString(); // ~23:59:59 do dia, no fuso da empresa
    const retrato = await retratoRisco.gerarRetrato(db, fimDoDiaISO);
    const dia = await retratoRisco.salvarRetrato(db, retrato);
    console.log(`${dia}: carga da empresa = ${retrato.empresa.carga} (${retrato.empresa.contados} riscos contados, ${retrato.foraPorStatus} fora por status)`);
    gravados += 1;
    cursor = new Date(cursor.getTime() + UM_DIA_MS);
  }

  console.log(`\nPronto -- ${gravados} dia(s) gravado(s) em "${retratoRisco.COLECAO_RETRATOS}".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Backfill falhou:', err); process.exit(1); });
