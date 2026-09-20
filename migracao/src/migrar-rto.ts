/**
 * Migra os processos que ficaram com um RTO que o formulario nao reconhece.
 *
 * Contexto: ate 20/09/2026 o calculo derivava o RTO do tier e SOBRESCREVIA o
 * valor a cada avaliacao salva. Para Tier 2 ele gravava "4h a 24 horas", que
 * nao existe entre as opcoes do campo (< 1 hora, < 4 horas, 4h a 8h, 8h a 24h,
 * > 24 horas). Resultado: o campo aparecia em branco ao reabrir o processo, e
 * quem salvasse de novo sem notar gravava RTO vazio.
 *
 * O que este script faz: troca "4h a 24 horas" por "8h a 24h" — a faixa larga,
 * nao a apertada, porque a original ia de 4h a 24h e escolher a menor criaria
 * um compromisso de recuperacao que ninguem assumiu.
 *
 * Marca cada registro migrado com rtoOrigem: 'sugerido'. Isso importa: esses 14
 * valores nunca foram escolhidos por ninguem, e a marca deixa isso visivel em
 * vez de fazer passar por decisao de gestor. Registros onde o gestor escolheu
 * ficam sem a marca (ou com 'gestor', quando ele salvar pela tela).
 *
 * Por padrao roda em ENSAIO: mostra o que faria e nao grava nada.
 *   npx ts-node src/migrar-rto.ts              # ensaio
 *   npx ts-node src/migrar-rto.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';

const VALOR_INVALIDO = '4h a 24 horas';
const VALOR_NOVO = '8h a 24h';

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('processos').where('rto', '==', VALOR_INVALIDO).get();

  if (snap.empty) {
    console.log(`Nenhum processo com "${VALOR_INVALIDO}". Nada a fazer.`);
    return;
  }

  console.log(`${snap.size} processo(s) com "${VALOR_INVALIDO}" -> "${VALOR_NOVO}":\n`);
  for (const d of snap.docs) {
    const p = d.data() as { area?: string; processo?: string; tier?: string };
    console.log(`  ${p.area} | ${p.processo}  (${p.tier || 'sem tier'})`);
  }

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    return;
  }

  let n = 0;
  // Lotes de 400: o limite do Firestore e 500 operacoes por lote.
  const docs = snap.docs.slice();
  while (docs.length) {
    const lote = db.batch();
    docs.splice(0, 400).forEach((d) => {
      lote.set(d.ref, { rto: VALOR_NOVO, rtoOrigem: 'sugerido' }, { merge: true });
      n += 1;
    });
    await lote.commit();
  }
  console.log(`\n${n} processo(s) atualizados.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
