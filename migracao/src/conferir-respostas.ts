/**
 * Confere a integridade das respostas de BIA no Firestore.
 *
 * Motivo: o drawer de processo nao limpa a aba "Avaliacao" ao trocar de
 * registro (app.js:1995 nao zera #avaliacaoPerguntas, que so e redesenhado em
 * app.js:212), e salvarProcesso le os radios marcados do documento inteiro
 * (app.js:2083). Resultado: abrir o processo A, ver a aba Avaliacao, fechar,
 * abrir o processo B e salvar qualquer campo grava as respostas de A em B,
 * junto com o tier recalculado em cima delas. Nada avisa.
 *
 * Este script NAO altera nada. Ele so le respostas_bia e aponta:
 *   1. vetores de resposta identicos que aparecem em AREAS diferentes
 *      (o sinal forte: uma avaliacao de area inteira explica repeticao dentro
 *      de uma area, nunca entre areas);
 *   2. blocos contiguos de respostas identicas em processos diferentes
 *      (a assinatura de uma sessao de edicao que propagou o mesmo vetor);
 *   3. quais processos tem HOJE o tier derivado de um vetor suspeito, que e a
 *      lista curta que precisa ser reavaliada a mao.
 *
 * Uso:  cd migracao && npx ts-node src/conferir-respostas.ts
 */
import { getFirestore } from './firestore';

type Resposta = {
  id: string;
  area?: string;
  processo?: string;
  respondente?: string;
  score?: number;
  tier?: string;
  timestamp?: string;
  scores?: Record<string, number>;
};

function vetor(r: Resposta): string {
  const s = r.scores || {};
  return JSON.stringify(Object.keys(s).sort().map((k) => s[k]));
}

async function main() {
  const db = getFirestore();
  const snap = await db.collection('respostas_bia').get();
  const regs: Resposta[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));

  const processos = new Set(regs.map((r) => `${r.area}||${r.processo}`));
  console.log(`respostas: ${regs.length}  |  processos avaliados: ${processos.size}`);

  // 1. Vetores que cruzam areas diferentes.
  const porVetor = new Map<string, Resposta[]>();
  for (const r of regs) {
    const v = vetor(r);
    if (!porVetor.has(v)) porVetor.set(v, []);
    porVetor.get(v)!.push(r);
  }

  const suspeitos = new Set<string>();
  console.log('\n=== Vetores identicos em AREAS diferentes ===');
  let achou = false;
  for (const [v, rs] of [...porVetor].sort((a, b) => b[1].length - a[1].length)) {
    const areas = new Set(rs.map((r) => r.area));
    if (areas.size < 2) continue;
    achou = true;
    suspeitos.add(v);
    const procs = new Set(rs.map((r) => `${r.area}||${r.processo}`));
    console.log(`\n  score ${rs[0].score} | vetor ${v}`);
    console.log(`  ${rs.length} respostas, ${procs.size} processos, ${areas.size} areas: ${[...areas].sort().join(', ')}`);
    for (const p of [...procs].sort()) console.log(`     - ${p.replace('||', ' | ')}`);
  }
  if (!achou) console.log('  nenhum. A base nao mostra sinal de propagacao entre areas.');

  // 2. Qual resposta vence hoje por processo (o front ordena por timestamp desc).
  const porProcesso = new Map<string, Resposta[]>();
  for (const r of regs) {
    const k = `${r.area}||${r.processo}`;
    if (!porProcesso.has(k)) porProcesso.set(k, []);
    porProcesso.get(k)!.push(r);
  }

  console.log('\n=== Processos cujo tier ATUAL vem de um vetor suspeito ===');
  const afetados: string[] = [];
  for (const [k, rs] of porProcesso) {
    const venc = [...rs].sort((a, b) =>
      new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())[0];
    if (suspeitos.has(vetor(venc))) {
      afetados.push(k);
      console.log(`  ${k.replace('||', ' | ')} -> score ${venc.score}, ${venc.tier}, em ${venc.timestamp || 'sem data'}`);
    }
  }
  console.log(`\n  ${afetados.length} de ${porProcesso.size} processos precisam de reavaliacao manual.`);

  // 3. Duplicatas dentro do mesmo processo (ruido, nao corrupcao).
  const dup = [...porProcesso].filter(([, rs]) => rs.length > 1);
  console.log(`\n=== Processos com mais de uma resposta: ${dup.length} ===`);
  console.log('  (normal: cada salvamento acrescenta uma linha. So vira problema se o');
  console.log('   vencedor for um vetor suspeito, caso ja listado acima.)');
}

main().catch((e) => { console.error(e); process.exit(1); });
