/**
 * Orquestrador da migração big-bang.
 *   npx ts-node src/migrar.ts            (execução real)
 *   npx ts-node src/migrar.ts --dry-run  (exporta + backup, importa em dry-run)
 *
 * Sequência:
 *   1) export  — lê a planilha e gera export/*.json + _manifest.json
 *   2) backup  — extrai os HTML de PCN para backup-pcn/
 *   3) import  — grava no Firestore (respeita FIRESTORE_EMULATOR_HOST)
 *   4) verify  — compara contagens export vs Firestore
 *
 * Pré-requisitos: migracao/.env preenchido (SPREADSHEET_ID,
 * GOOGLE_CREDENTIALS_PATH, FIREBASE_PROJECT_ID). Ver README.md.
 */
import * as path from 'path';
import { spawnSync } from 'child_process';

const dryRun = process.argv.includes('--dry-run');

function run(step: string, args: string[]): void {
  console.log(`\n===== ${step} =====`);
  const res = spawnSync('npx', ['ts-node', ...args], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    console.error(`\nFalha na etapa "${step}" (exit ${res.status}). Abortando.`);
    process.exit(res.status || 1);
  }
}

run('1/4 Export (Sheets -> JSON)', ['src/export-sheets.ts']);
run('2/4 Backup de PCN (HTML)', ['src/backup-pcn.ts']);
run('3/4 Import (JSON -> Firestore)', dryRun ? ['src/import-firestore.ts', '--', '--dry-run'] : ['src/import-firestore.ts']);
if (!dryRun) {
  run('4/4 Verificação', ['src/verify.ts']);
} else {
  console.log('\n(dry-run: etapa de verificação pulada — nada foi gravado no Firestore)');
}

console.log('\nMigração concluída.');
