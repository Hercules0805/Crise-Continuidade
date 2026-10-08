/**
 * Semeia a coleção `criticidade_fornecedor_perguntas` com as 6 perguntas que,
 * até 08/10/2026, eram fixas em `fornecedor-criticidade.js` (PERGUNTAS_SEED).
 *
 * RODA UMA VEZ, NA MAO, DEPOIS DO DEPLOY da tela "Perguntas de Criticidade"
 * (sem isso, a aba Criticidade do Fornecedor fica sem nenhuma pergunta até
 * alguém cadastrar na mão):
 *   cd firebase-app/functions
 *   GOOGLE_CLOUD_PROJECT=bia-forte-2025 node scripts/seed-criticidade-fornecedor-perguntas.js
 *
 * Mesma autenticação dos outros scripts desta pasta (gcloud auth
 * application-default login, ou GOOGLE_APPLICATION_CREDENTIALS apontando pra
 * uma service account com acesso ao projeto).
 *
 * E IDEMPOTENTE POR INTEIRO: se a coleção já tiver QUALQUER documento (por já
 * ter rodado antes, ou por alguém já ter cadastrado uma pergunta na tela),
 * não faz nada -- diferente do import de vulnerabilidades (que dedupe linha a
 * linha por código), aqui não há uma chave natural por pergunta, e rodar de
 * novo depois que alguém já editou o cadastro recriaria perguntas antigas ao
 * lado das já ajustadas.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const FornecedorCriticidade = require('../../public/fornecedor-criticidade.js');

async function seed() {
  const col = db.collection('criticidade_fornecedor_perguntas');
  const existentes = await col.limit(1).get();
  if (!existentes.empty) {
    console.log('A coleção já tem pelo menos 1 pergunta -- nada a fazer (script é idempotente por inteiro, não por pergunta).');
    return;
  }

  const agora = new Date().toISOString();
  let criadas = 0;
  for (const pergunta of FornecedorCriticidade.PERGUNTAS_SEED) {
    await col.add({
      texto: pergunta.texto,
      ativa: true,
      ordem: pergunta.ordem,
      opcoes: pergunta.opcoes,
      criadoEm: agora,
      atualizadoEm: agora,
      criadoPor: 'seed-script',
    });
    console.log(`[ok] "${pergunta.texto.slice(0, 60)}..." semeada`);
    criadas++;
  }

  console.log(`\nConcluído: ${criadas} pergunta(s) semeada(s).`);
}

seed().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
