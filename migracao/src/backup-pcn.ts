import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { FsDoc } from './transform';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Backup dos PCN.
 *
 * O PCN gerado fica salvo inline na coluna `pcnSalvo` da aba Processos, como
 * um JSON array de versões: [{ versao, data, autor, html }]. Este script lê o
 * export de processos e grava um arquivo .html por processo que tenha PCN,
 * além de um índice. Deve rodar DEPOIS de "npm run export".
 */

const EXPORT_DIR = path.resolve(__dirname, '../export');
const BACKUP_DIR = path.resolve(__dirname, '../backup-pcn');

function safeName(area: string, processo: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  return `${clean(area)}__${clean(processo)}`;
}

function main(): void {
  const processosFile = path.join(EXPORT_DIR, 'processos.json');
  if (!fs.existsSync(processosFile)) {
    throw new Error(`Export de processos não encontrado em ${processosFile}. Rode "npm run export" primeiro.`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const docs: FsDoc[] = JSON.parse(fs.readFileSync(processosFile, 'utf8'));
  const indice: Array<{ arquivo: string; area: string; processo: string; versao: unknown; data: unknown; autor: unknown }> = [];

  console.log('=== Backup de PCN (HTML) ===');
  console.log(`Origem: ${processosFile}`);
  console.log(`Saída: ${BACKUP_DIR}\n`);

  for (const doc of docs) {
    const d = doc.data as Record<string, any>;
    const raw = d.pcnSalvo;
    if (!raw) continue;

    let versoes: any[] = [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      versoes = Array.isArray(parsed) ? parsed : [{ versao: 1, html: String(raw) }];
    } catch {
      // pcnSalvo pode ser HTML puro (não-JSON)
      versoes = [{ versao: 1, html: String(raw) }];
    }

    const ultima = versoes[versoes.length - 1];
    const html = ultima && ultima.html ? ultima.html : String(raw);
    if (!html || !String(html).trim()) continue;

    const nome = safeName(String(d.area || ''), String(d.processo || '')) + '.html';
    fs.writeFileSync(path.join(BACKUP_DIR, nome), String(html), 'utf8');
    indice.push({
      arquivo: nome,
      area: d.area,
      processo: d.processo,
      versao: ultima?.versao ?? 1,
      data: ultima?.data ?? null,
      autor: ultima?.autor ?? null,
    });
    console.log(`  ${nome} (${String(html).length} bytes)`);
  }

  fs.writeFileSync(path.join(BACKUP_DIR, '_indice.json'), JSON.stringify(indice, null, 2), 'utf8');
  console.log(`\n${indice.length} PCN salvos. Índice em ${path.join(BACKUP_DIR, '_indice.json')}`);
}

try {
  main();
} catch (err: any) {
  console.error('Falha no backup de PCN:', err.message);
  process.exit(1);
}
