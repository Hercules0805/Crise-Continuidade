/**
 * Migra o gestor do contrato e o setor MANUAIS dos fornecedores para "Áreas e
 * pessoas relacionadas" (DECISAO 19/10/2026). Ver relacionadosFornecedor.js.
 *
 * RODA UMA VEZ, NA MAO, ANTES do deploy do hosting:
 *   cd firebase-app/functions
 *   node scripts/migrar-gestores-fornecedor-relacionados.js            (so mostra o que faria)
 *   node scripts/migrar-gestores-fornecedor-relacionados.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * - Cada gestor manual vira pessoa relacionada com o papel "Gestor (anterior ao
 *   contrato)"; o setor vira área relacionada. Revise os papeis depois, na tela.
 * - NAO apaga setor, gestorContrato nem gestoresContrato.
 * - E IDEMPOTENTE: rodar de novo nao duplica nada.
 */

'use strict';

const admin = require('firebase-admin');
const { planejarRelacionados } = require('../relacionadosFornecedor');

admin.initializeApp();
const db = admin.firestore();

const CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];

async function main() {
  const gravar = process.argv.includes('--gravar');
  const snap = await db.collection('dependencias').get();
  const docs = snap.docs.map((d) => ({ ref: d.ref, id: d.id, ...(d.data() || {}) }));
  const pessoas = docs.filter((d) => d.categoria === 'Pessoas').map((d) => ({ id: d.id, nome: d.nome || '' }));
  const fornecedores = docs.filter((d) => CATEGORIAS_FORNECEDOR.includes(d.categoria));
  console.log(`Fornecedores: ${fornecedores.length} | Pessoas no cadastro: ${pessoas.length}`);

  let alterados = 0;
  let semCadastro = 0;
  for (const f of fornecedores) {
    const plano = planejarRelacionados(f, pessoas);
    if (!plano) continue;
    alterados++;
    console.log(`\n${f.nome || f.id}`);
    plano.adicionadas.forEach((t) => { console.log(`  + ${t}`); if (/sem cadastro/.test(t)) semCadastro++; });
    if (gravar) {
      await f.ref.set(Object.assign({}, plano.patch, {
        migradoRelacionadosEm: new Date().toISOString(),
        atualizadoPor: 'script:migrar-gestores-fornecedor-relacionados',
      }), { merge: true });
    }
  }
  console.log(`\n${alterados} fornecedor(es) ${gravar ? 'atualizado(s)' : 'seriam atualizados'}; ${semCadastro} gestor(es) sem cadastro de Pessoa.`);
  if (!gravar) console.log('Nada foi gravado. Rode com --gravar para gravar.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
