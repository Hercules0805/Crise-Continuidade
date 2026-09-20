/**
 * Move o historico mensal dos indicadores para a colecao propria.
 *
 * Ate 20/09/2026 o historico vivia numa lista DENTRO do documento do indicador,
 * e cada lancamento regravava a lista inteira a partir da copia em memoria do
 * navegador. Dois administradores lancando ao mesmo tempo — ou um com a tela
 * aberta ha uma hora — apagavam o trabalho um do outro, em silencio.
 *
 * Agora cada mes e um documento em lancamentos_indicadores, com id estavel
 * (indicadorId__AAAA-MM). Este script converte o que ja existe.
 *
 * NAO apaga a lista antiga. O campo `historico` deixa de ser gravado pelo
 * sistema, mas fica onde esta como rede de seguranca: se algo der errado, o
 * dado original continua la para conferencia.
 *
 * Idempotente: id derivado de (indicador, mes), entao rodar de novo sobrescreve.
 *
 *   npx ts-node src/migrar-lancamentos.ts              # ensaio
 *   npx ts-node src/migrar-lancamentos.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

type Entrada = { mes?: string; desempenho?: unknown; importadoEm?: string; arquivo?: string };

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('indicadores_seguranca').get();
  console.log(`${snap.size} indicadores.\n`);

  const paraGravar: Array<{ id: string; dados: Record<string, unknown> }> = [];
  const mesesInvalidos: string[] = [];
  const semDesempenho: string[] = [];

  snap.docs.forEach((d) => {
    const ind = d.data() || {};
    const historico: Entrada[] = Array.isArray(ind.historico) ? ind.historico : [];
    historico.forEach((h) => {
      const mes = String(h.mes || '').trim();
      if (!MES_VALIDO.test(mes)) { mesesInvalidos.push(`${ind.nome || d.id}: "${mes}"`); return; }
      // Sem desempenho nao e zero: e ausencia. Nao vira lancamento.
      if (h.desempenho === null || h.desempenho === undefined || h.desempenho === '') {
        semDesempenho.push(`${ind.nome || d.id}: ${mes}`);
        return;
      }
      paraGravar.push({
        id: `${d.id}__${mes}`,
        dados: {
          indicadorId: d.id,
          indicadorNome: ind.nome || '',
          mes,
          desempenho: Number(h.desempenho),
          arquivo: h.arquivo || '',
          lancadoEm: h.importadoEm || '',
          lancadoPor: '',   // a origem nao registrava quem lancou
          migradoDoHistorico: true,
        },
      });
    });
  });

  console.log(`  lancamentos a criar:   ${paraGravar.length}`);
  console.log(`  meses em formato invalido (ignorados): ${mesesInvalidos.length}`);
  mesesInvalidos.slice(0, 10).forEach((m) => console.log(`     ${m}`));
  console.log(`  meses sem desempenho (ignorados):      ${semDesempenho.length}`);

  if (paraGravar.length) {
    const meses = paraGravar.map((x) => String(x.dados.mes)).sort();
    console.log(`\n  periodo coberto: ${meses[0]} a ${meses[meses.length - 1]}`);
  }

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    console.log('O campo `historico` antigo NAO e apagado: fica como rede de seguranca.');
    return;
  }

  let n = 0;
  const fila = paraGravar.slice();
  while (fila.length) {
    const lote = db.batch();
    fila.splice(0, 400).forEach((x) => {
      lote.set(db.collection('lancamentos_indicadores').doc(x.id), x.dados, { merge: true });
      n += 1;
    });
    await lote.commit();
  }
  console.log(`\n${n} lancamentos gravados. O campo historico antigo foi preservado.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
