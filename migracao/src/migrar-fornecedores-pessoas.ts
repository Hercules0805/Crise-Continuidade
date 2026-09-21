/**
 * Migra fornecedores para o modelo empresa + N pessoas.
 *
 * Ate 20/09/2026 um fornecedor era uma linha so em /dependencias, tentando
 * representar empresa e contato ao mesmo tempo (nome, empresa, email,
 * telefone soltos). Auditoria em producao (21/09/2026, 21 linhas):
 *   - 17 tem `empresa` vazio e o `nome` JA E o nome da empresa
 *     ("Dataprev", "Oracle", "Azure"...) -- nenhum contato cadastrado.
 *   - 3 tem `empresa` preenchido mas IDENTICO ao `nome` (ex.: "CE
 *     Refrigeração") -- nao e uma pessoa distinta, e o mesmo texto duas vezes.
 *     Uma delas tinha um telefone solto sem nome de contato associado.
 *   - 1 ("SalesForce") tem o padrao pessoa+empresa de verdade:
 *     nome="Danilo Nogueira", empresa="SalesForce".
 * Nao ha empresa com mais de uma linha hoje -- nao ha duplicata pra resolver.
 *
 * O que este script faz, por linha de categoria Fornecedor/Fornecedores:
 *   - Se `empresa` tem valor DIFERENTE de `nome`: nome (pessoa) + email +
 *     telefone viram pessoas[0]; `empresa` vira o novo `nome` do documento;
 *     os campos antigos (empresa/email/telefone) sao zerados.
 *   - Se `empresa` esta vazio OU e IGUAL a `nome`, mas ha e-mail/telefone
 *     soltos: esse contato nao pode ser jogado fora em silencio -- vira uma
 *     pessoa com nome placeholder "Contato", facil de achar e corrigir depois.
 *   - Caso contrario: nao ha nada pra mover, so grava `pessoas: []`.
 * Idempotente: pula quem ja tem o campo `pessoas` gravado.
 *
 *   npx ts-node src/migrar-fornecedores-pessoas.ts              # ensaio
 *   npx ts-node src/migrar-fornecedores-pessoas.ts --confirmar  # grava
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getFirestore } from './firestore';

const CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const db = getFirestore();

  const snap = await db.collection('dependencias').where('categoria', 'in', CATEGORIAS_FORNECEDOR).get();
  console.log(`${snap.size} linha(s) de fornecedor em /dependencias.\n`);

  const jaMigradas = snap.docs.filter((d) => Array.isArray(d.data().pessoas));
  const paraMigrar = snap.docs.filter((d) => !Array.isArray(d.data().pessoas));

  if (jaMigradas.length) console.log(`${jaMigradas.length} ja tem "pessoas" gravado -- ignoradas (idempotente).`);
  if (!paraMigrar.length) {
    console.log('Nada a fazer.');
    return;
  }

  console.log(`\n${paraMigrar.length} linha(s) a migrar:\n`);
  const patches: Array<{ id: string; nomeAntes: string; patch: Record<string, unknown> }> = [];
  paraMigrar.forEach((d) => {
    const r = d.data() as { nome?: string; empresa?: string; email?: string; telefone?: string };
    const nomeAntes = r.nome || d.id;
    const empresa = String(r.empresa || '').trim();
    const nomeAtual = String(r.nome || '').trim();
    // `empresa` igual a `nome` nao e uma pessoa distinta -- e o mesmo texto
    // preenchido duas vezes. So conta como pessoa quando os dois divergem.
    const temPessoaDistinta = !!empresa && empresa.toLowerCase() !== nomeAtual.toLowerCase();

    if (temPessoaDistinta) {
      const pessoa = { nome: r.nome || '', cargo: '', email: r.email || '', telefone: r.telefone || '' };
      patches.push({
        id: d.id,
        nomeAntes,
        patch: { nome: empresa, empresa: '', email: '', telefone: '', pessoas: [pessoa] },
      });
      console.log(`  ${nomeAntes} -> empresa "${empresa}", pessoa "${pessoa.nome}"`);
    } else if (r.email || r.telefone) {
      // Nao ha pessoa nomeada, mas ha e-mail/telefone que nao pode ser jogado
      // fora em silencio -- vira uma pessoa com nome placeholder, que fica
      // facil de achar e corrigir depois (ex.: "CE Refrigeração" tinha so um
      // telefone solto, sem nome de contato).
      const pessoa = { nome: 'Contato', cargo: '', email: r.email || '', telefone: r.telefone || '' };
      patches.push({
        id: d.id,
        nomeAntes,
        patch: { empresa: '', email: '', telefone: '', pessoas: [pessoa] },
      });
      console.log(`  ${nomeAntes} -> sem pessoa nomeada, mas tinha contato solto -> pessoa placeholder "Contato" (${[pessoa.email, pessoa.telefone].filter(Boolean).join(' / ')})`);
    } else {
      patches.push({ id: d.id, nomeAntes, patch: { empresa: '', pessoas: [] } });
      console.log(`  ${nomeAntes} -> já é o nome da empresa, sem contato (pessoas: [])`);
    }
  });

  if (!confirmar) {
    console.log('\nENSAIO — nada foi gravado. Rode com --confirmar para aplicar.');
    return;
  }

  const lote = db.batch();
  patches.forEach((p) => lote.set(db.collection('dependencias').doc(p.id), p.patch, { merge: true }));
  await lote.commit();
  console.log(`\n${patches.length} linha(s) migradas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
