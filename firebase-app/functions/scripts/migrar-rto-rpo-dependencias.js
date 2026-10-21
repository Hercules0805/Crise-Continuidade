/**
 * Converte o RTO/RPO em texto livre das dependencias tecnicas ("4 horas",
 * "< 1 hora", "4h a 8h") para minutos em rtoMin/rpoMin (Composicao de
 * Servicos, 21/10/2026). Ver public/servico-composicao.js.
 *
 * RODA UMA VEZ, NA MAO, DEPOIS do deploy do hosting com os campos novos:
 *   cd firebase-app/functions
 *   node scripts/migrar-rto-rpo-dependencias.js            (so mostra o que faria)
 *   node scripts/migrar-rto-rpo-dependencias.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * - So mexe nas 7 categorias tecnicas e so preenche rtoMin/rpoMin que ainda
 *   estejam vazios (nunca sobrescreve o que alguem ja informou na tela).
 * - NAO apaga o texto rto/rpo.
 * - Lista os textos que nao conseguiu interpretar ("> 24 horas", "rapido"),
 *   para ajuste manual na tela.
 * - E IDEMPOTENTE: rodar de novo nao muda nada do que ja foi convertido.
 */

'use strict';

const admin = require('firebase-admin');
const SC = require('../../public/servico-composicao.js');

admin.initializeApp();
const db = admin.firestore();

const CATEGORIAS_TECNICAS = ['API', 'Banco de Dados', 'Infraestrutura', 'Segurança', 'Servidor', 'Sistemas', 'Outros'];

function vazio(v) {
  return v === null || v === undefined || v === '';
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const snap = await db.collection('dependencias').get();
  const tecnicas = snap.docs
    .map((d) => ({ ref: d.ref, id: d.id, ...(d.data() || {}) }))
    .filter((d) => CATEGORIAS_TECNICAS.includes(d.categoria));
  console.log(`Dependencias tecnicas: ${tecnicas.length}`);

  let alteradas = 0;
  const ilegiveis = [];
  for (const d of tecnicas) {
    const patch = {};
    const linhas = [];
    ['rto', 'rpo'].forEach((a) => {
      const texto = String(d[a] || '').trim();
      if (!texto || !vazio(d[a + 'Min'])) return;
      const min = SC.parseDuracao(texto);
      if (min === null) { ilegiveis.push(`${d.nome || d.id} [${d.categoria}] ${a.toUpperCase()}: "${texto}"`); return; }
      patch[a + 'Min'] = min;
      linhas.push(`  ${a.toUpperCase()}: "${texto}" -> ${min} min (${SC.formatarDuracao(min)})`);
    });
    if (!Object.keys(patch).length) continue;
    alteradas++;
    console.log(`\n${d.nome || d.id} [${d.categoria}]`);
    linhas.forEach((l) => console.log(l));
    if (gravar) {
      await d.ref.set(Object.assign(patch, {
        migradoRtoRpoEm: new Date().toISOString(),
        atualizadoPor: 'script:migrar-rto-rpo-dependencias',
      }), { merge: true });
    }
  }

  console.log(`\n${alteradas} dependencia(s) ${gravar ? 'atualizada(s)' : 'seriam atualizadas'}.`);
  if (ilegiveis.length) {
    console.log(`\n${ilegiveis.length} valor(es) sem conversao -- ajustar na tela:`);
    ilegiveis.forEach((l) => console.log(`  - ${l}`));
  }
  if (!gravar) console.log('\nNada foi gravado. Rode com --gravar para gravar.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
