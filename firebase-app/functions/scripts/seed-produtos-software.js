/**
 * Carga inicial do catalogo de Produtos de Software (colecao produtos_software).
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/seed-produtos-software.js            (so mostra o que faria)
 *   node scripts/seed-produtos-software.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * E IDEMPOTENTE: pula todo produto cujo nome (sem acento/maiuscula/espaco
 * sobrando) ja existe -- rodar de novo nao duplica nada, e nao mexe em quem
 * ja foi renomeado/desativado pela tela. A ordem inicial e a da lista abaixo.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const PRODUTOS = [
  'Fortes Ponto',
  'Fortes AC Contábil',
  'Fortes AC Pessoal',
  'Fortes Compras e Estoque',
  'Fortes Financeiro',
  'Conecta',
  'Fortes AC Fiscal',
  'Fortes BI',
  'Fortes Doc',
  'Fortes RH',
  'Fortes Gestão',
  'Colabore',
  'Patrio',
];

function comparavel(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const snap = await db.collection('produtos_software').get();
  const jaExistem = new Set(snap.docs.map((d) => comparavel(d.data().nome)));
  console.log(`Produtos já cadastrados: ${snap.size}`);

  const agora = Date.now();
  let criados = 0;
  for (let i = 0; i < PRODUTOS.length; i++) {
    const nome = PRODUTOS[i];
    if (jaExistem.has(comparavel(nome))) { console.log(`  = ${nome} (já existe)`); continue; }
    console.log(`  + ${nome}`);
    criados++;
    if (gravar) {
      const iso = new Date().toISOString();
      await db.collection('produtos_software').add({
        nome,
        ativo: true,
        // Ordem estavel e crescente na ordem da lista (a tela ordena por nome por padrao).
        ordem: agora + i,
        criadoEm: iso,
        atualizadoEm: iso,
        criadoPor: 'seed-produtos-software',
      });
    }
  }
  console.log(gravar ? `Gravados: ${criados}.` : `Faltam ${criados}. Rode com --gravar para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
