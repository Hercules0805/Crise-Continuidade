/**
 * Carga inicial das listas configuraveis do contrato:
 *   tipos_contrato, indexadores_reajuste, status_contrato.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/seed-cadastros-contrato.js            (so mostra o que faria)
 *   node scripts/seed-cadastros-contrato.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * E IDEMPOTENTE: pula todo item cujo nome (sem acento/maiuscula/espaco
 * sobrando) ja existe na lista -- rodar de novo nao duplica nada, e nao mexe
 * em quem ja foi renomeado/desativado pela tela.
 *
 * STATUS: a `situacao` (pre | vigente | encerrado) e o que a regra do ciclo de
 * vida le (contratoCiclo.js). O nome e livre; a situacao nao.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Fonte unica dos valores padrao: a mesma lista do botao da tela.
const { PADROES } = require('../contratoCiclo');
const LISTAS = {
  tipos_contrato: PADROES.tipos,
  indexadores_reajuste: PADROES.indexadores,
  status_contrato: PADROES.status,
};

function comparavel(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const agora = Date.now();
  let criados = 0;
  for (const [colecao, itens] of Object.entries(LISTAS)) {
    const snap = await db.collection(colecao).get();
    const jaExistem = new Set(snap.docs.map((d) => comparavel(d.data().nome)));
    console.log(`${colecao}: ${snap.size} já cadastrado(s)`);
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      if (jaExistem.has(comparavel(item.nome))) { console.log(`  = ${item.nome} (já existe)`); continue; }
      console.log(`  + ${item.nome}${item.situacao ? ` [${item.situacao}]` : ''}`);
      criados++;
      if (gravar) {
        const iso = new Date().toISOString();
        await db.collection(colecao).add(Object.assign({
          ativo: true,
          ordem: agora + i,
          criadoEm: iso,
          atualizadoEm: iso,
          criadoPor: 'seed:cadastros-contrato',
        }, item));
      }
    }
  }
  console.log(gravar ? `\n${criados} item(ns) gravado(s).` : `\n${criados} item(ns) seriam criados. Rode com --gravar para gravar.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
