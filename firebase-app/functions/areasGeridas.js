/**
 * Escopo do Gestor nas Áreas hierárquicas (29/10/2026).
 *
 * config_perfis.areasGeridas = a área do perfil e todas as de baixo dela
 * (areas.areaPaiId). As regras do Firestore (isGestorDaArea) aceitam qualquer
 * área desta lista. Só o servidor grava o campo -- o próprio usuário não pode
 * (regra de config_perfis) -- e só quando o valor muda, para a regravação não
 * entrar em laço com o gatilho.
 */
const areasHierarquia = require('./areasHierarquia');

/** Lista que o perfil deveria ter (vazia se ele não tem área). */
function areasGeridasDoPerfil(areas, perfil) {
  const area = perfil && perfil.area ? String(perfil.area).trim() : '';
  return areasHierarquia.escopoDoGestor(areas, area);
}

/** [{id, areasGeridas}] só dos perfis cujo valor gravado difere do calculado. */
function ajustesAreasGeridas(areas, perfis) {
  return (perfis || []).map((p) => {
    const devia = areasGeridasDoPerfil(areas, p);
    // Sem o campo gravado e sem área: nada a gravar.
    const igual = Array.isArray(p.areasGeridas) ? areasHierarquia.mesmaLista(devia, p.areasGeridas) : !devia.length;
    return igual ? null : { id: p.id, areasGeridas: devia };
  }).filter(Boolean);
}

async function _lerAreas(db) {
  const snap = await db.collection('areas').get();
  return snap.docs.map((d) => ({ id: d.id, nome: (d.data() || {}).nome || '', areaPaiId: (d.data() || {}).areaPaiId || null }));
}

/** Recalcula todos os perfis (uma área mudou de nome ou de lugar). Devolve quantos gravou. */
async function recalcularTodos(db) {
  const [areas, perfisSnap] = await Promise.all([_lerAreas(db), db.collection('config_perfis').get()]);
  const ajustes = ajustesAreasGeridas(areas, perfisSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
  for (const a of ajustes) await db.collection('config_perfis').doc(a.id).set({ areasGeridas: a.areasGeridas }, { merge: true });
  return ajustes.length;
}

/** Recalcula um perfil (a área dele mudou). Devolve true se gravou. */
async function recalcularPerfil(db, id, dados) {
  if (!dados) return false;
  const ajustes = ajustesAreasGeridas(await _lerAreas(db), [{ id, ...dados }]);
  if (!ajustes.length) return false;
  await db.collection('config_perfis').doc(id).set({ areasGeridas: ajustes[0].areasGeridas }, { merge: true });
  return true;
}

module.exports = { areasGeridasDoPerfil, ajustesAreasGeridas, recalcularTodos, recalcularPerfil };
