import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getFirestore } from './firestore';
import { FsDoc } from './transform';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const EXPORT_DIR = path.resolve(__dirname, '../export');
const BATCH_LIMIT = 400; // Firestore aceita até 500 ops por batch

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const target = process.env.FIRESTORE_EMULATOR_HOST ? `EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUÇÃO';

  console.log('=== Import JSON -> Firestore ===');
  console.log(`Alvo: ${target}`);
  console.log(`Origem: ${EXPORT_DIR}`);
  console.log(dryRun ? 'Modo: DRY-RUN (nada será gravado)\n' : 'Modo: GRAVAÇÃO\n');

  const manifestPath = path.join(EXPORT_DIR, '_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest não encontrado em ${manifestPath}. Rode "npm run export" primeiro.`);
  }
  const manifest: Array<{ collection: string }> = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const db = dryRun ? null : getFirestore();

  for (const entry of manifest) {
    const file = path.join(EXPORT_DIR, `${entry.collection}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`  [${entry.collection}] arquivo ausente, pulando.`);
      continue;
    }
    const docs: FsDoc[] = JSON.parse(fs.readFileSync(file, 'utf8'));

    if (dryRun || !db) {
      console.log(`  [${entry.collection}] ${docs.length} docs (dry-run, não gravado)`);
      continue;
    }

    let written = 0;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const slice = docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const doc of slice) {
        batch.set(db.collection(entry.collection).doc(doc.id), doc.data, { merge: true });
      }
      await batch.commit();
      written += slice.length;
    }
    console.log(`  [${entry.collection}] ${written} docs gravados`);
  }

  console.log('\nImport concluído.');
}

main().catch((err) => {
  console.error('Falha no import:', err.message);
  console.error(err.stack);
  process.exit(1);
});
