/**
 * Liga as vulnerabilidades ja cadastradas ao catalogo de Produtos de Software
 * (campo `produtoSoftwareId`), quando o texto do campo antigo `produto` (hoje
 * "Ativo afetado" na tela) bate EXATAMENTE com o nome de um produto.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/vincular-produtos-vulnerabilidades.js            (ensaio: so mostra o que faria)
 *   node scripts/vincular-produtos-vulnerabilidades.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * SEM ADIVINHAR: so liga quando o nome bate (sem acento/maiuscula/espaco sobrando).
 * "Fortes Pessoal" NAO vira "Fortes AC Pessoal" sozinho -- os que ficarem sem
 * correspondencia sao listados no final para ligar a mao, na tela.
 *
 * TRAVA DE SEGURANCA: gravar numa vulnerabilidade dispara o gatilho de risco
 * automatico (riscoDeVulnerabilidade). Antes de gravar, o script simula a
 * decisao do gatilho e SO grava se ela for "nada" -- um registro que fosse abrir
 * (ou encerrar) um risco so por causa deste vinculo e pulado e avisado.
 *
 * Nao altera nenhum outro campo (merge so de produtoSoftwareId). Idempotente.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const vulnerabilidadeRisco = require('../vulnerabilidadeRisco');

function comparavel(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const [vulns, produtos, riscosSnap] = await Promise.all([
    db.collection('vulnerabilidades').get(),
    db.collection('produtos_software').get(),
    db.collection('riscos').get(),
  ]);
  const catalogo = new Map(produtos.docs.map((d) => [comparavel(d.data().nome), { id: d.id, nome: d.data().nome }]));
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

  const ligar = [];
  const semCorrespondencia = [];
  let jaLigadas = 0;
  vulns.docs
    .map((d) => ({ ref: d.ref, v: Object.assign({ id: d.id }, d.data()) }))
    .sort((a, b) => String(a.v.codigo).localeCompare(String(b.v.codigo)))
    .forEach(({ ref, v }) => {
      if (v.produtoSoftwareId) { jaLigadas++; return; }
      const prod = catalogo.get(comparavel(v.produto));
      if (!prod) { semCorrespondencia.push(v); return; }
      ligar.push({ ref, v, prod });
    });

  console.log(`Vulnerabilidades: ${vulns.size} (${jaLigadas} já ligadas, ${ligar.length} a ligar, ${semCorrespondencia.length} sem correspondência exata).\n`);

  let gravadas = 0;
  let puladas = 0;
  for (const { ref, v, prod } of ligar) {
    const decisao = vulnerabilidadeRisco.decidir({
      vulnerabilidade: Object.assign({}, v, { produtoSoftwareId: prod.id }),
      riscos: riscos.filter((r) => r.vulnerabilidadeId === v.id),
      produtoNome: prod.nome,
    });
    if (decisao.acao !== 'nada') {
      puladas++;
      console.log(`  ! ${v.codigo} "${v.produto}" -> ${prod.nome}: PULADA (o gatilho de risco faria "${decisao.acao}" ao regravar); ligue pela tela.`);
      continue;
    }
    console.log(`  + ${v.codigo} "${v.produto}" -> ${prod.nome}`);
    if (gravar) {
      await ref.set({ produtoSoftwareId: prod.id }, { merge: true });
      gravadas++;
    }
  }

  if (semCorrespondencia.length) {
    console.log('\nSem correspondência exata no catálogo (ligar à mão, na tela da vulnerabilidade):');
    semCorrespondencia.forEach((v) => console.log(`  - ${v.codigo}: "${v.produto || '(vazio)'}"`));
  }
  console.log(gravar
    ? `\nPronto -- ${gravadas} ligada(s)${puladas ? `, ${puladas} pulada(s)` : ''}.`
    : `\nEnsaio: ${ligar.length - puladas} seriam ligadas${puladas ? `, ${puladas} puladas` : ''}. Rode com --gravar para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('Falhou:', e); process.exit(1); });
