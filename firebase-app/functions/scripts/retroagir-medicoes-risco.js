/**
 * Retroage o Risco no Tempo ate a Data de identificacao de cada risco
 * (DECISAO 21/10/2026). A conta esta em ../retroacao.js (testada); este
 * arquivo so le e grava.
 *
 * RODA NA MAO, EM DUAS VEZES:
 *   cd firebase-app/functions
 *   node scripts/retroagir-medicoes-risco.js            # so a previa, nao grava nada
 *   node scripts/retroagir-medicoes-risco.js --aplicar  # grava
 * Depois de aplicar, regrave os retratos diarios desde o novo inicio:
 *   node scripts/backfill-historico-risco.js
 *
 * Credenciais: as mesmas dos outros backfills (gcloud auth
 * application-default login, ou GOOGLE_APPLICATION_CREDENTIALS).
 *
 * O que grava: (1) uma medicao retroativa por risco cujo inicio (Data de
 * identificacao, ou deteccao da vulnerabilidade de origem, se mais antiga) e
 * anterior a primeira medicao -- copia da primeira, status Identificado,
 * `retroativa: true`; (2) nos riscos de vulnerabilidade, a Data de
 * identificacao passa a ser a data de deteccao (mesma regra de agora em
 * diante). IDEMPOTENTE: o id da medicao e estavel e a conta ignora quem ja
 * comeca no inicio.
 */
'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const { FONTE } = require('../medicoes');
const { planoRetroativo } = require('../retroacao');

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const [riscosSnap, vulnsSnap, medicoesSnap] = await Promise.all([
    db.collection('riscos').get(),
    db.collection('vulnerabilidades').get(),
    db.collection('medicoes').where('fonte', '==', FONTE.RISCO).get(),
  ]);
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const vulnerabilidadesPorId = {};
  vulnsSnap.docs.forEach((d) => { vulnerabilidadesPorId[d.id] = { dataDeteccao: (d.data() || {}).dataDeteccao || '' }; });
  const medicoesPorRisco = {};
  medicoesSnap.docs.forEach((d) => {
    const m = d.data() || {};
    if (m.sujeitoTipo !== 'risco' || !m.sujeitoId) return;
    (medicoesPorRisco[String(m.sujeitoId)] = medicoesPorRisco[String(m.sujeitoId)] || []).push(m);
  });

  const plano = planoRetroativo(riscos, vulnerabilidadesPorId, medicoesPorRisco);
  const r = plano.resumo;
  console.log(`${APLICAR ? 'APLICANDO' : 'PRÉVIA (nada é gravado; use --aplicar)'}`);
  console.log(`Riscos lidos: ${r.riscos}`);
  console.log(`  medições retroativas a criar: ${r.retroativas}`);
  console.log(`  Data de identificação corrigida para a detecção da vulnerabilidade: ${r.correcoesDeData}`);
  console.log(`  sem nenhuma medição (fora da curva): ${r.semMedicao}`);
  console.log(`  já encerrados na primeira medição (não retroagem): ${r.encerradoNaPrimeira}`);
  console.log(`  já começam na identificação: ${r.jaNoInicio}`);
  if (plano.medicoes.length) {
    const datas = plano.medicoes.map((x) => x.dados.coletadoEm.slice(0, 10)).sort();
    console.log(`  novo início da curva: ${datas[0]} (até ${datas[datas.length - 1]})`);
    console.log('\nPrimeiras 10:');
    plano.medicoes.slice(0, 10).forEach((x) => console.log(`  ${x.dados.coletadoEm.slice(0, 10)} ← ${x.dados.retroativaDe.slice(0, 10)}  ${x.titulo}`));
  }
  if (!APLICAR) return;

  let gravadas = 0;
  for (const x of plano.medicoes) {
    await db.collection('medicoes').doc(x.id).set(x.dados, { merge: true });
    gravadas += 1;
  }
  let corrigidos = 0;
  for (const c of plano.correcoesRisco) {
    // Sem atualizadoEm: e correcao de dado, nao uma edicao do risco (nao deve
    // gerar medicao nova pelo gatilho -- score e status nao mudam).
    await db.collection('riscos').doc(c.id).set({ dataIdentificacao: c.dataIdentificacao }, { merge: true });
    corrigidos += 1;
  }
  console.log(`\nPronto: ${gravadas} medição(ões) retroativa(s) gravada(s), ${corrigidos} risco(s) com a data corrigida.`);
  console.log('Agora rode: node scripts/backfill-historico-risco.js');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Retroação falhou:', err); process.exit(1); });
