/**
 * Categorias de Processo (29/10/2026): a categoria do processo deixa de ser
 * uma lista fixa no codigo e vira o cadastro `categorias_processo` (nome,
 * finalidade, criterios de identificacao, exemplos). O processo passa a
 * guardar `categoriaId`. Este script:
 *  - cria as 3 categorias de partida (ids fixos), so as que faltam -- texto ja
 *    editado na tela nao e sobrescrito;
 *  - grava `categoriaId` em cada processo a partir do nome antigo (`categoria`)
 *    ou, sem ele, 'processo-de-negocio', e apaga o `categoria` antigo.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/migrar-categorias-processo.js           (so mostra o que faria)
 *   node scripts/migrar-categorias-processo.js --gravar  (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS ou
 * `gcloud auth application-default login`, com GCLOUD_PROJECT=bia-forte-2025).
 *
 * E IDEMPOTENTE.
 */

'use strict';

const CATEGORIA_PADRAO_ID = 'processo-de-negocio';

const CATEGORIAS_INICIAIS = [
  {
    id: 'departamental', ordem: 1, nome: 'Departamental',
    finalidade: 'Processos executados e controlados por uma única área, que sustentam a rotina interna dela.',
    criteriosIdentificacao: 'Entradas, execução e saídas ficam dentro da mesma área.\nHá um só responsável pelo processo.\nMudar o processo não exige acordo com outras áreas.\nNão entrega valor diretamente ao cliente externo.',
    exemplos: 'Controle de ponto da equipe.\nConciliação bancária diária.\nGestão de acessos do time.',
  },
  {
    id: 'intersetorial', ordem: 2, nome: 'Intersetorial',
    finalidade: 'Processos que atravessam duas ou mais áreas, com passagem de responsabilidade entre elas.',
    criteriosIdentificacao: 'Pelo menos duas áreas executam etapas do processo.\nHá entrega ou aprovação de uma área para outra.\nA falha de uma área para o fluxo das outras.\nRegras e dono precisam ser acordados entre as áreas.',
    exemplos: 'Admissão de colaborador (RH, TI, Facilities).\nCompras (solicitante, Compras, Financeiro).\nCadastro de fornecedor.',
  },
  {
    id: CATEGORIA_PADRAO_ID, ordem: 3, nome: 'Processo de Negócio',
    finalidade: 'Processos que geram ou sustentam diretamente o valor entregue ao cliente ou a receita. São os candidatos naturais à avaliação de Continuidade (BIA, PCN, DRP).',
    criteriosIdentificacao: 'Entrega produto ou serviço ao cliente, ou afeta receita, obrigação legal ou regulatória, ou imagem.\nA parada causa impacto financeiro, legal ou reputacional relevante.\nCostuma ir de ponta a ponta.',
    exemplos: 'Faturamento e cobrança.\nSuporte ao cliente.\nEntrega e atualização dos produtos de software.',
  },
];

const _chave = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const ID_POR_NOME = new Map(CATEGORIAS_INICIAIS.map((c) => [_chave(c.nome), c.id]));

/**
 * Puro. Devolve { criar: [categoria], processos: [{ processoId, categoriaId, apagarCategoria }] }.
 * `existentes` = ids ja presentes em categorias_processo.
 */
function planejar(processos, existentes) {
  const jaHa = new Set((existentes || []).map(String));
  const criar = CATEGORIAS_INICIAIS.filter((c) => !jaHa.has(c.id));
  const plano = (processos || []).map((p) => {
    const categoriaId = p.categoriaId || ID_POR_NOME.get(_chave(p.categoria)) || CATEGORIA_PADRAO_ID;
    const apagarCategoria = Object.prototype.hasOwnProperty.call(p, 'categoria');
    if (p.categoriaId === categoriaId && !apagarCategoria) return null;
    return { processoId: String(p.id), categoriaId, apagarCategoria };
  }).filter(Boolean);
  return { criar, processos: plano };
}

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const gravar = process.argv.includes('--gravar');
  const [procSnap, catSnap] = await Promise.all([db.collection('processos').get(), db.collection('categorias_processo').get()]);
  const processos = procSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const { criar, processos: plano } = planejar(processos, catSnap.docs.map((d) => d.id));

  console.log(`Categorias a criar: ${criar.length} (${criar.map((c) => c.nome).join(', ') || '-'})`);
  const agora = new Date().toISOString();
  for (const c of criar) {
    const { id, ...dados } = c;
    if (gravar) await db.collection('categorias_processo').doc(id).set({ ...dados, ativo: true, criadoEm: agora, criadoPor: 'migracao', atualizadoEm: agora, atualizadoPor: 'migracao' });
  }
  console.log(`Processos a atualizar: ${plano.length} de ${processos.length}`);
  const porCategoria = {};
  plano.forEach((g) => { porCategoria[g.categoriaId] = (porCategoria[g.categoriaId] || 0) + 1; });
  Object.entries(porCategoria).forEach(([id, n]) => console.log(`  ${id}: ${n}`));
  if (gravar) {
    for (const g of plano) {
      const dados = { categoriaId: g.categoriaId };
      if (g.apagarCategoria) dados.categoria = admin.firestore.FieldValue.delete();
      await db.collection('processos').doc(g.processoId).set(dados, { merge: true });
    }
  }
  console.log(gravar ? '\nGravado.' : '\nNada gravado (use --gravar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { planejar, CATEGORIAS_INICIAIS, CATEGORIA_PADRAO_ID };
