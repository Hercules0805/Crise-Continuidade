/**
 * Áreas hierárquicas (29/10/2026): as Subáreas (publicadas em 29/10/2026 e
 * substituídas no mesmo dia) viram ÁREAS FILHAS. Este script:
 *  - cria uma Área para cada subárea (`areas.subareas`), com areaPaiId = a área
 *    de origem e o líder como responsável (nome, e-mail e telefone da Pessoa);
 *    se já existe uma área com o mesmo nome em outro lugar, a subárea NÃO é
 *    convertida -- vai para a lista de conflitos, para decidir à mão;
 *  - processos com `subarea`: `area` passa a ser a nova área, com o nome antigo
 *    em `nomesAnteriores` ("Área||Processo", como o salvarProcesso faz, para o
 *    histórico do BIA continuar ligado); o doc id não muda;
 *  - riscos com `subarea`: `area` passa a ser a nova área;
 *  - pessoas com `subarea`: a área de origem é trocada pela nova em `areas[]`,
 *    na mesma posição (e `setor`, se era a principal);
 *  - apaga `subarea`/`subareas` (de subárea que não existe mais também);
 *  - recalcula config_perfis.areasGeridas de todos.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/converter-subareas-em-areas.js           (so mostra o que faria)
 *   node scripts/converter-subareas-em-areas.js --gravar  (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS ou
 * `gcloud auth application-default login`, com GCLOUD_PROJECT=bia-forte-2025).
 *
 * E IDEMPOTENTE: subárea cuja área filha já existe (mesmo nome, abaixo da de
 * origem) só tem os vínculos acertados.
 */

'use strict';

const _chave = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const _tem = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

/**
 * Puro. areas/processos/riscos/pessoas = docs com id. Devolve
 * { criar: [{nome, areaPaiId, responsavel, email, telefone}], conflitos: [{area, subarea, motivo}],
 *   processos: [{id, area|null, nomeAnterior|null}], riscos: [{id, area|null}],
 *   pessoas: [{id, areas|null, setor|null}], limparAreas: [id] }.
 * area/areas null = só apagar o campo subarea.
 */
function planejar({ areas, processos, riscos, pessoas }) {
  const listaAreas = areas || [];
  const porChave = new Map(listaAreas.map((a) => [_chave(a.nome), a]));
  const pessoaPorId = new Map((pessoas || []).map((p) => [String(p.id), p]));
  const criar = [];
  const conflitos = [];
  // "Área||idSub" -> nome da área filha (nova ou já existente).
  const destino = new Map();
  const limparAreas = [];

  listaAreas.forEach((a) => {
    const subs = Array.isArray(a.subareas) ? a.subareas : [];
    if (!_tem(a, 'subareas')) return;
    let semConflito = true;
    subs.forEach((sa) => {
      if (!sa || !sa.id || !String(sa.nome || '').trim()) return;
      const nome = String(sa.nome).trim();
      const existente = porChave.get(_chave(nome));
      if (existente && String(existente.areaPaiId || '') !== String(a.id)) {
        conflitos.push({ area: a.nome, subarea: nome, motivo: `já existe a área "${existente.nome}" em outro lugar` });
        semConflito = false;
        return;
      }
      destino.set(`${a.nome}||${sa.id}`, existente ? existente.nome : nome);
      if (!existente) {
        const lider = sa.lider && sa.lider.id ? pessoaPorId.get(String(sa.lider.id)) : null;
        criar.push({
          nome, areaPaiId: String(a.id),
          responsavel: lider ? lider.nome || '' : (sa.lider && sa.lider.nome) || '',
          email: lider ? lider.email || '' : '', telefone: lider ? lider.telefone || '' : '',
        });
        porChave.set(_chave(nome), { nome, areaPaiId: String(a.id) });
      }
    });
    if (semConflito) limparAreas.push(String(a.id));
  });

  const alvo = (area, ref) => (ref && ref.id ? destino.get(`${area}||${ref.id}`) || null : null);

  const planoProcessos = (processos || []).filter((p) => _tem(p, 'subarea')).map((p) => {
    const nova = alvo(p.area, p.subarea);
    return { id: String(p.id), area: nova, nomeAnterior: nova ? `${p.area}||${p.processo}` : null };
  });
  const planoRiscos = (riscos || []).filter((r) => _tem(r, 'subarea')).map((r) => ({ id: String(r.id), area: alvo(r.area, r.subarea) }));
  const planoPessoas = (pessoas || []).filter((p) => _tem(p, 'subarea')).map((p) => {
    const ref = p.subarea;
    const nova = ref ? alvo(ref.area, ref) : null;
    if (!nova) return { id: String(p.id), areas: null, setor: null };
    const atuais = Array.isArray(p.areas) && p.areas.length ? p.areas.slice() : (p.setor ? [p.setor] : []);
    const i = atuais.indexOf(ref.area);
    if (i >= 0) atuais[i] = nova; else atuais.unshift(nova);
    const semRepetir = [...new Set(atuais)];
    return { id: String(p.id), areas: semRepetir, setor: semRepetir[0] || '' };
  });
  return { criar, conflitos, processos: planoProcessos, riscos: planoRiscos, pessoas: planoPessoas, limparAreas };
}

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const del = admin.firestore.FieldValue.delete();
  const gravar = process.argv.includes('--gravar');
  const ler = async (col, filtro) => {
    const snap = filtro ? await db.collection(col).where(...filtro).get() : await db.collection(col).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  };
  const [areas, processos, riscos, pessoas] = await Promise.all([
    ler('areas'), ler('processos'), ler('riscos'), ler('dependencias', ['categoria', '==', 'Pessoas']),
  ]);
  const plano = planejar({ areas, processos, riscos, pessoas });

  console.log(`Áreas a criar (subárea -> área filha): ${plano.criar.length}`);
  plano.criar.forEach((a) => console.log(`  + ${a.nome} (abaixo de ${(areas.find((x) => String(x.id) === a.areaPaiId) || {}).nome}) · responsável: ${a.responsavel || '-'}`));
  console.log(`Conflitos (não convertidas): ${plano.conflitos.length}`);
  plano.conflitos.forEach((c) => console.log(`  ! ${c.area} › ${c.subarea}: ${c.motivo}`));
  const conta = (l) => `${l.filter((x) => x.area || x.areas).length} mudam de área, ${l.filter((x) => !x.area && !x.areas).length} só perdem a subárea`;
  console.log(`Processos: ${conta(plano.processos)}`);
  console.log(`Riscos: ${conta(plano.riscos)}`);
  console.log(`Pessoas: ${conta(plano.pessoas)}`);

  if (gravar) {
    const agora = new Date().toISOString();
    for (const a of plano.criar) await db.collection('areas').add({ ...a, solucao: '', criadoEm: agora, criadoPor: 'migracao' });
    for (const p of plano.processos) {
      const dados = { subarea: del };
      if (p.area) Object.assign(dados, { area: p.area, nomesAnteriores: admin.firestore.FieldValue.arrayUnion(p.nomeAnterior), atualizadoEm: agora, atualizadoPor: 'migracao' });
      await db.collection('processos').doc(p.id).set(dados, { merge: true });
    }
    for (const r of plano.riscos) await db.collection('riscos').doc(r.id).set(r.area ? { subarea: del, area: r.area } : { subarea: del }, { merge: true });
    for (const p of plano.pessoas) await db.collection('dependencias').doc(p.id).set(p.areas ? { subarea: del, areas: p.areas, setor: p.setor } : { subarea: del }, { merge: true });
    for (const id of plano.limparAreas) await db.collection('areas').doc(id).set({ subareas: del }, { merge: true });
    const n = await require('../areasGeridas').recalcularTodos(db);
    console.log(`Perfis com areasGeridas recalculado: ${n}`);
  }
  console.log(gravar ? '\nGravado.' : '\nNada gravado (use --gravar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { planejar };
