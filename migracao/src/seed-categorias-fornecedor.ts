/**
 * Cria as categorias iniciais de fornecedor, se ainda nao existirem.
 *
 * Categoria de fornecedor e o segmento de negocio (ex.: "Nuvem, Data Center e
 * Cibersegurança") -- diferente do campo `categoria` que ja existe em
 * /dependencias (esse e as 5 Ps do BIA: Fornecedores/Infraestrutura/Pessoas/
 * Sistemas/Processos Internos, e nao muda). Vive na colecao
 * categorias_fornecedor, cadastravel/editavel/excluivel pela tela
 * Fornecedores > Categorias.
 *
 * Idempotente: pula qualquer nome que ja exista (comparando por texto exato),
 * entao rodar de novo depois de alguem editar o cadastro nao duplica nada.
 *
 *   npx ts-node src/seed-categorias-fornecedor.ts              # ensaio
 *   npx ts-node src/seed-categorias-fornecedor.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';

const CATEGORIAS = [
  'Consultoria em TI, Serviços Gerenciados e Integração',
  'Hardware, Equipamentos e Distribuição de TI',
  'Inteligência Artificial, Automação e Ferramentas Digitais',
  'Nuvem, Data Center e Cibersegurança',
  'Plataformas Digitais, Redes e Techs Especializadas',
  'Software, SaaS e Desenvolvimento de Sistemas',
  'Telecomunicações e Conectividade',
];

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('categorias_fornecedor').get();
  const existentes = new Set(snap.docs.map((d) => String(d.data().nome || '').trim().toLowerCase()));

  const novas = CATEGORIAS.filter((nome) => !existentes.has(nome.toLowerCase()));

  console.log(`${snap.size} categoria(s) ja cadastrada(s).`);
  if (!novas.length) {
    console.log('Todas as categorias da lista ja existem. Nada a fazer.');
    return;
  }

  console.log(`\n${novas.length} categoria(s) a criar, na ordem:\n`);
  novas.forEach((nome, i) => console.log(`  ${i + 1}. ${nome}`));

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    return;
  }

  const agora = new Date().toISOString();
  const lote = db.batch();
  novas.forEach((nome, i) => {
    const ref = db.collection('categorias_fornecedor').doc();
    lote.set(ref, { nome, ativo: true, ordem: (i + 1) * 10, criadoEm: agora, atualizadoEm: agora });
  });
  await lote.commit();
  console.log(`\n${novas.length} categoria(s) criada(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
