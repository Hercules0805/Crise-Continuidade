/**
 * Preenche a primeira medicao dos riscos que nunca tiveram nenhuma.
 *
 * PROBLEMA QUE RESOLVE
 * O livro de medicoes (medicoes.js) so ganha um ponto quando o risco e criado
 * ou reavaliado DEPOIS que o gatilho medicaoDeRisco foi publicado
 * (functions/index.js, commit "risco vira medicao"). Um risco que ja existia
 * antes disso e nunca foi tocado de novo simplesmente nao tem nenhuma medicao
 * -- e por isso fica INVISIVEL no Monitor de Risco (historico_risco), mesmo
 * contando normalmente no Registro de Riscos (que le o documento atual, nao o
 * livro). Foi assim que a carga da empresa apareceu como 93 no Registro e 40
 * no Monitor no mesmo dia: 2 dos 4 riscos ativos nao tinham nenhuma medicao.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/backfill-medicoes-risco.js
 *
 * Mesma autenticacao do backfill de historico_risco (gcloud auth
 * application-default login, ou GOOGLE_APPLICATION_CREDENTIALS apontando pra
 * uma service account com acesso ao projeto).
 *
 * E IDEMPOTENTE: so cria medicao pra risco que hoje tem ZERO medicoes. Rodar
 * de novo depois nao duplica nada -- quem ja tem pelo menos uma medicao
 * (mesmo que so uma, do proprio gatilho) e deixado em paz, porque esse risco
 * ja tem uma trilha real e nao e este script que deve mexer nela.
 *
 * A medicao criada usa exatamente a mesma logica do gatilho real
 * (medicaoDeRisco, com `anterior = null` -- o mesmo caminho que uma CRIACAO
 * de risco usa), com o mesmo esquema de id (`risco__<riscoId>__<coletadoEm>`)
 * -- se o risco for reavaliado de verdade depois, o gatilho real grava um
 * segundo ponto normalmente, sem colidir com este.
 *
 * `coletadoEm` vem de `dataUltimaReavaliacao || atualizadoEm` do proprio
 * risco (a mesma regra de medicaoDeRisco) -- data-lo com o instante em que
 * o script rodou inventaria um ponto no presente para um risco que pode ter
 * anos, e destruiria a curva desse risco especificamente.
 *
 * DEPOIS DE RODAR ISTO: os retratos ja gravados em historico_risco continuam
 * como estavam (esta medicao nova so passa a valer para reconstrucoes
 * futuras). Rode `node scripts/backfill-historico-risco.js` em seguida para
 * os dias ja existentes passarem a refletir os riscos que acabaram de ganhar
 * sua primeira medicao.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const { FONTE, idDaMedicao, medicaoDeRisco } = require('../medicoes');

async function main() {
  const [riscosSnap, medicoesRiscoSnap] = await Promise.all([
    db.collection('riscos').get(),
    db.collection('medicoes').where('fonte', '==', FONTE.RISCO).get(),
  ]);

  const riscosComMedicao = new Set();
  medicoesRiscoSnap.docs.forEach((d) => {
    const m = d.data();
    if (m && m.sujeitoId) riscosComMedicao.add(String(m.sujeitoId));
  });

  let criadas = 0;
  let semEscala = 0;
  let jaTinha = 0;

  for (const doc of riscosSnap.docs) {
    const riscoId = doc.id;
    if (riscosComMedicao.has(riscoId)) { jaTinha += 1; continue; }

    const risco = doc.data();
    // anterior = null: mesmo caminho que uma CRIACAO de risco usa no gatilho
    // real -- so exige que a escala seja reconhecida (score != null).
    const medicao = medicaoDeRisco(riscoId, risco, null);
    if (!medicao) {
      semEscala += 1;
      console.log(`(sem escala reconhecida, pulado) ${riscoId} — ${risco.titulo || '(sem título)'}`);
      continue;
    }

    const idPonto = `${riscoId}__${medicao.coletadoEm}`;
    await db.collection('medicoes').doc(idDaMedicao(FONTE.RISCO, idPonto)).set(medicao, { merge: true });
    criadas += 1;
    console.log(`${riscoId} — ${medicao.sujeitoRotulo}: primeira medicao criada (valor ${medicao.valor}, coletadoEm ${medicao.coletadoEm})`);
  }

  console.log(`\nPronto -- ${criadas} medicao(oes) nova(s) criada(s), ${jaTinha} risco(s) ja tinham medicao, ${semEscala} sem escala reconhecida (pulado(s)).`);
  if (criadas > 0) {
    console.log('Rode agora "node scripts/backfill-historico-risco.js" para os retratos ja gravados refletirem esses riscos.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Backfill de medicoes falhou:', err); process.exit(1); });
