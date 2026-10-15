/**
 * Converte o texto antigo "Ativo afetado" (campo `produto`) das vulnerabilidades
 * em "Dependencias afetadas" (campo `dependenciasAfetadas`, vinculo por id com o
 * catalogo de Dependencias) -- DECISAO 15/10/2026.
 *
 * RODA UMA VEZ, NA MAO:
 *   cd firebase-app/functions
 *   node scripts/vincular-ativos-dependencias-vulnerabilidades.js            (ensaio: so mostra o que faria)
 *   node scripts/vincular-ativos-dependencias-vulnerabilidades.js --gravar   (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * Para cada vulnerabilidade com texto e SEM dependencia afetada:
 *   - texto igual ao nome do Produto de Software ja vinculado ("Fortes RH" +
 *     produto Fortes RH) e duplicata -> so limpa o texto;
 *   - texto igual ao nome de UM item do catalogo (categorias tecnicas + Processos
 *     Internos, sem acento/maiuscula/espaco) -> grava o vinculo e limpa o texto;
 *   - o resto (sem correspondencia, ou mais de um item com o mesmo nome) fica
 *     como legado e e listado, para ligar a mao na tela.
 *
 * TRAVA DE SEGURANCA: gravar dispara o gatilho de risco automatico. Antes de
 * gravar, o script simula a decisao do gatilho e SO grava se ela for "nada".
 * Mexe so em `dependenciasAfetadas` e `produto`. Idempotente.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const vulnerabilidadeRisco = require('../vulnerabilidadeRisco');

// Espelha VULN_CATEGORIAS_DEPENDENCIA (public/app.js).
const CATEGORIAS = ['Infraestrutura', 'Sistemas', 'Servidor', 'Banco de Dados', 'API', 'Segurança', 'Processos Internos'];

function comparavel(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const [vulns, deps, produtos, riscosSnap] = await Promise.all([
    db.collection('vulnerabilidades').get(),
    db.collection('dependencias').get(),
    db.collection('produtos_software').get(),
    db.collection('riscos').get(),
  ]);
  const porNome = new Map();
  deps.docs.forEach((d) => {
    const x = d.data();
    if (!CATEGORIAS.includes(x.categoria)) return;
    const k = comparavel(x.nome);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push({ id: d.id, categoria: x.categoria, nome: x.nome });
  });
  const nomeProduto = new Map(produtos.docs.map((d) => [d.id, d.data().nome || '']));
  const riscos = riscosSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

  const acoes = [];
  const legado = [];
  vulns.docs
    .map((d) => ({ ref: d.ref, v: Object.assign({ id: d.id }, d.data()) }))
    .sort((a, b) => String(a.v.codigo).localeCompare(String(b.v.codigo)))
    .forEach(({ ref, v }) => {
      const texto = String(v.produto || '').trim();
      if (!texto) return;
      if (Array.isArray(v.dependenciasAfetadas) && v.dependenciasAfetadas.length) return;
      const prod = v.produtoSoftwareId ? nomeProduto.get(v.produtoSoftwareId) : '';
      if (prod && comparavel(prod) === comparavel(texto)) {
        acoes.push({ ref, v, patch: { produto: '' }, msg: `"${texto}" = Produto de Software vinculado -> só limpa o texto` });
        return;
      }
      const cand = porNome.get(comparavel(texto)) || [];
      if (cand.length === 1) {
        acoes.push({ ref, v, patch: { produto: '', dependenciasAfetadas: [cand[0]] }, msg: `"${texto}" -> ${cand[0].categoria}: ${cand[0].nome}` });
        return;
      }
      legado.push(`${v.codigo}: "${texto}"${cand.length > 1 ? ` (${cand.length} itens com esse nome: ${cand.map((c) => c.categoria).join(', ')})` : ''}`);
    });

  console.log(`Vulnerabilidades: ${vulns.size}; com texto a tratar: ${acoes.length}; ficam como legado: ${legado.length}.\n`);
  let gravadas = 0;
  let puladas = 0;
  for (const { ref, v, patch, msg } of acoes) {
    const decisao = vulnerabilidadeRisco.decidir({
      vulnerabilidade: Object.assign({}, v, patch),
      riscos: riscos.filter((r) => r.vulnerabilidadeId === v.id),
    });
    if (decisao.acao !== 'nada') {
      puladas++;
      console.log(`  ! ${v.codigo} ${msg}: PULADA (o gatilho de risco faria "${decisao.acao}" ao regravar); ajuste pela tela.`);
      continue;
    }
    console.log(`  + ${v.codigo} ${msg}`);
    if (gravar) {
      await ref.set(patch, { merge: true });
      gravadas++;
    }
  }
  if (legado.length) {
    console.log('\nFicam como "Ativo afetado (texto antigo)" -- escolher a dependência à mão, na tela:');
    legado.forEach((l) => console.log(`  - ${l}`));
  }
  console.log(gravar
    ? `\nPronto -- ${gravadas} gravada(s)${puladas ? `, ${puladas} pulada(s)` : ''}.`
    : `\nEnsaio: ${acoes.length - puladas} seriam gravadas${puladas ? `, ${puladas} puladas` : ''}. Rode com --gravar para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('Falhou:', e); process.exit(1); });
