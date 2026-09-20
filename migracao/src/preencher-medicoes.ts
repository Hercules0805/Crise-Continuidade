/**
 * Preenche o livro de medicoes com o historico de BIA ja existente.
 *
 * O gatilho medicaoDeBia so dispara em respostas NOVAS. As respostas que ja
 * estao no banco — o historico inteiro do BIA — precisam ser convertidas uma
 * vez, senao a curva comeca vazia e o monitor nasce sem passado.
 *
 * Idempotente: o id da medicao vem do id da resposta, entao rodar de novo
 * sobrescreve em vez de duplicar.
 *
 * Por padrao roda em ENSAIO.
 *   npx ts-node src/preencher-medicoes.ts              # ensaio
 *   npx ts-node src/preencher-medicoes.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';
// Mesma transformacao que o gatilho usa: uma fonte de verdade, nao duas.
const { medicaoDeRespostaBia, idDaMedicao, FONTE, COLECAO } =
  require('../../firebase-app/functions/medicoes.js');

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('respostas_bia').get();
  console.log(`${snap.size} respostas de BIA no banco.\n`);

  const medicoes: Array<{ id: string; dados: Record<string, unknown> }> = [];
  const ignoradas: string[] = [];

  snap.docs.forEach((d) => {
    const m = medicaoDeRespostaBia(d.id, d.data());
    if (m) medicoes.push({ id: idDaMedicao(FONTE.BIA, d.id), dados: m });
    else ignoradas.push(d.id);
  });

  console.log(`  viram medicao: ${medicoes.length}`);
  console.log(`  ignoradas:     ${ignoradas.length}  (sem data, sem score ou sem processo)`);

  if (medicoes.length) {
    const datas = medicoes.map((m) => String(m.dados.coletadoEm)).sort();
    console.log(`\n  periodo coberto: ${datas[0].slice(0, 10)} a ${datas[datas.length - 1].slice(0, 10)}`);
    const areas = new Set(medicoes.map((m) => m.dados.area));
    console.log(`  areas:           ${areas.size}`);
  }

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    return;
  }

  let n = 0;
  const fila = medicoes.slice();
  while (fila.length) {
    const lote = db.batch();
    fila.splice(0, 400).forEach((m) => {
      lote.set(db.collection(COLECAO).doc(m.id), m.dados, { merge: true });
      n += 1;
    });
    await lote.commit();
  }
  console.log(`\n${n} medicoes gravadas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
