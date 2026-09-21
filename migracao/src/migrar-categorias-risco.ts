/**
 * Migra a categoria dos riscos para a lista fechada nova.
 *
 * Contexto: o campo Categoria do drawer de Risco era um texto livre (com
 * sugestoes de uma lista antiga de 7 opcoes) e virou um select fechado com
 * só 4: Financeiro, Operacional, Reputacional, Regulatório/Legal. Em
 * producao (20/09/2026) so existem 5 riscos: 3 ja sao "Operacional", 1 esta
 * vazio e 1 e "Crise e Continuidade" -- um risco gerado automaticamente por
 * desvio de indicador, que usava o Pilar do indicador (outra taxonomia) como
 * categoria e nunca bateu com a lista de categorias de risco, nem a antiga.
 *
 * O que este script faz: qualquer risco com categoria fora da lista nova
 * (incluindo vazio) recebe "Operacional" -- o valor mais proximo e o que ja
 * predomina nos dados. A geracao automatica de risco por indicador
 * (app.js:_lancarResultadosIndicador) ja foi corrigida para gravar
 * "Operacional" direto; este script so limpa o que ja existia.
 *
 * Idempotente: rodar de novo nao muda nada (riscos ja migrados ja estao na
 * lista nova, e o filtro so pega quem esta fora dela).
 *
 *   npx ts-node src/migrar-categorias-risco.ts              # ensaio
 *   npx ts-node src/migrar-categorias-risco.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';

const CATEGORIAS_VALIDAS = ['Financeiro', 'Operacional', 'Reputacional', 'Regulatório/Legal'];
const CATEGORIA_PADRAO = 'Operacional';

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('riscos').get();
  console.log(`${snap.size} riscos no total.\n`);

  const foraDaLista = snap.docs.filter((d) => !CATEGORIAS_VALIDAS.includes(d.data().categoria));

  if (!foraDaLista.length) {
    console.log('Nenhum risco fora da lista nova de categorias. Nada a fazer.');
    return;
  }

  console.log(`${foraDaLista.length} risco(s) fora da lista, vira(m) "${CATEGORIA_PADRAO}":\n`);
  foraDaLista.forEach((d) => {
    const r = d.data() as { titulo?: string; categoria?: string };
    console.log(`  ${r.titulo || d.id}: "${r.categoria || '(vazio)'}"`);
  });

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    return;
  }

  const lote = db.batch();
  foraDaLista.forEach((d) => lote.set(d.ref, { categoria: CATEGORIA_PADRAO }, { merge: true }));
  await lote.commit();
  console.log(`\n${foraDaLista.length} risco(s) atualizados.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
