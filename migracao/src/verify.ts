import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getFirestore } from './firestore';
import { FsDoc } from './transform';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const EXPORT_DIR = path.resolve(__dirname, '../export');

/**
 * Verificação pós-migração.
 * Compara a contagem de documentos exportados (JSON) com a contagem no
 * Firestore por coleção e faz uma checagem amostral de campos-chave em processos.
 */
async function main(): Promise<void> {
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUÇÃO';
  console.log('=== Verificação de Migração ===');
  console.log(`Alvo: ${target}\n`);

  const manifestPath = path.join(EXPORT_DIR, '_manifest.json');
  const manifest: Array<{ collection: string; docs: number }> = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const db = getFirestore();
  let divergencias = 0;

  console.log('Contagens por coleção:');
  for (const entry of manifest) {
    const snap = await db.collection(entry.collection).count().get();
    const fsCount = snap.data().count;
    const ok = fsCount === entry.docs;
    if (!ok) divergencias++;
    console.log(`  ${entry.collection.padEnd(20)} export=${String(entry.docs).padStart(5)}  firestore=${String(fsCount).padStart(5)}  ${ok ? 'OK' : 'DIVERGE'}`);
  }

  // Amostragem: até 5 processos, conferir score/tier
  const procFile = path.join(EXPORT_DIR, 'processos.json');
  if (fs.existsSync(procFile)) {
    const procs: FsDoc[] = JSON.parse(fs.readFileSync(procFile, 'utf8'));
    const amostra = procs.slice(0, 5);
    console.log('\nAmostra de processos (tier no export vs Firestore):');
    for (const p of amostra) {
      const doc = await db.collection('processos').doc(p.id).get();
      const fsTier = doc.exists ? (doc.data() as any).tier : '(ausente)';
      const expTier = (p.data as any).tier;
      const ok = doc.exists && fsTier === expTier;
      if (!ok) divergencias++;
      console.log(`  ${p.id.padEnd(40)} export="${expTier}" firestore="${fsTier}" ${ok ? 'OK' : 'DIVERGE'}`);
    }
  }

  console.log(`\nResultado: ${divergencias === 0 ? '0 divergências' : divergencias + ' divergência(s)'}`);
  process.exit(divergencias === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error('Falha na verificação:', err.message);
  process.exit(1);
});
