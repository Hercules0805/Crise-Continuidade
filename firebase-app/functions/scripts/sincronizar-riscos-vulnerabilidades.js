/**
 * Aplica, UMA VEZ, a sincronizacao Vulnerabilidade -> Risco (DECISAO 15/10/2026,
 * NIST) a todas as vulnerabilidades ja cadastradas -- a mesma decisao que o
 * gatilho riscoDeVulnerabilidade e a varredura diaria passam a tomar. Serve para
 * nao esperar a proxima edicao de cada vulnerabilidade.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/sincronizar-riscos-vulnerabilidades.js            (ensaio: so mostra o que faria)
 *   node scripts/sincronizar-riscos-vulnerabilidades.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS ou
 * `gcloud auth application-default login`).
 *
 * O que pode acontecer com cada vulnerabilidade (vulnerabilidadeRisco.decidir):
 *   - atualizar: o risco ativo ganha impacto/area/processo (cadeia do BIA),
 *     responsavel, item de correcao no plano de acao, status/estrategia, etc.
 *     Edicao humana e preservada (so preenche vazio no risco antigo);
 *   - abrir: vulnerabilidade acima do limiar, em aberto, sem risco ativo;
 *   - encerrar: Corrigida com risco ainda ativo;
 *   - nada.
 * Idempotente: rodar de novo nao muda o que ja esta sincronizado.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const vulnerabilidadeRisco = require('../vulnerabilidadeRisco');
const vulnerabilidadeContexto = require('../vulnerabilidadeContexto');

function resumoPatch(patch) {
  return Object.keys(patch).filter((k) => k !== 'sincronizado').map((k) => {
    const v = patch[k];
    if (k === 'planoAcao') return `planoAcao(${v.length} item)`;
    if (k === 'historicoReavaliacao') return 'historicoReavaliacao(+linha)';
    return `${k}=${JSON.stringify(v)}`;
  }).join(', ');
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const [vulnsSnap, riscosSnap] = await Promise.all([
    db.collection('vulnerabilidades').get(),
    db.collection('riscos').where('origem', '==', vulnerabilidadeRisco.ORIGEM).get(),
  ]);
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const cache = {};
  const contagem = { abrir: 0, atualizar: 0, encerrar: 0, nada: 0 };
  const agora = new Date().toISOString();

  const vulns = vulnsSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  for (const v of vulns) {
    const ctx = await vulnerabilidadeContexto.contextoDaVulnerabilidade(db, v, cache);
    const decisao = vulnerabilidadeRisco.decidir({
      vulnerabilidade: v,
      riscos: riscos.filter((r) => String(r.vulnerabilidadeId) === String(v.id)),
      limiar: ctx.limiar,
      produtoNome: ctx.produtoNome,
      processosAfetados: ctx.processosAfetados,
    });
    contagem[decisao.acao]++;
    if (decisao.acao === 'nada') continue;
    if (decisao.acao === 'abrir') {
      console.log(`  + ${v.codigo} ABRIR: "${decisao.risco.titulo}" (impacto ${decisao.risco.impacto || '—'}, área ${decisao.risco.area || 'corporativo'})`);
      if (gravar) await db.collection('riscos').add(Object.assign({}, decisao.risco, { criadoEm: agora, atualizadoEm: agora, criadoPor: 'script:sincronizar-riscos-vulnerabilidades' }));
    } else if (decisao.acao === 'encerrar') {
      console.log(`  x ${v.codigo} ENCERRAR risco(s) ${decisao.ids.join(', ')}`);
      if (gravar) for (const id of decisao.ids) await db.collection('riscos').doc(id).set(Object.assign({}, decisao.patch, { atualizadoEm: agora }), { merge: true });
    } else {
      for (const a of decisao.atualizacoes) {
        console.log(`  ~ ${v.codigo} risco ${a.id}: ${resumoPatch(a.patch)}`);
        if (gravar) await db.collection('riscos').doc(a.id).set(Object.assign({}, a.patch, { atualizadoEm: agora }), { merge: true });
      }
    }
  }
  console.log(`\nLimiar: CVSS ${cache.limiar}. Resultado: ${JSON.stringify(contagem)}`);
  console.log(gravar ? 'Gravado.' : 'Ensaio: nada gravado. Rode com --gravar para aplicar.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Falhou:', e); process.exit(1); });
