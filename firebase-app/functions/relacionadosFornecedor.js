/**
 * Migracao do gestor e do setor do fornecedor para "Áreas e pessoas
 * relacionadas" (DECISAO 19/10/2026).
 *
 * O gestor do contrato e a área responsável do fornecedor passaram a vir dos
 * CONTRATOS vigentes; a tela de fornecedor deixou de edita-los. Para nao perder
 * o que ja estava preenchido, cada gestor manual vira uma pessoa relacionada
 * (papel "Gestor (anterior ao contrato)") e o setor vira uma área relacionada.
 *
 * Sem Firestore: so a regra, para ser testada. Quem le e grava e
 * scripts/migrar-gestores-fornecedor-relacionados.js.
 *
 * IDEMPOTENTE: o que ja esta nas listas relacionadas nao e acrescentado de
 * novo, e quando nada falta devolve null (nao reescreve o documento).
 * NAO APAGA setor, gestorContrato nem gestoresContrato.
 */

const PAPEL_MIGRADO = 'Gestor (anterior ao contrato)';

function _norm(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @param fornecedor documento do fornecedor (com setor, gestorContrato, gestoresContrato,
 *        areasRelacionadas e pessoasRelacionadas, se houver)
 * @param pessoas    [{ id, nome }] do cadastro de Pessoas
 * @returns null se nao ha nada a acrescentar; senao
 *   { patch: { pessoasRelacionadas, areasRelacionadas }, adicionadas: [texto] }
 */
function planejarRelacionados(fornecedor, pessoas) {
  const f = fornecedor || {};
  const cadastro = pessoas || [];
  const pessoasRel = (Array.isArray(f.pessoasRelacionadas) ? f.pessoasRelacionadas : [])
    .map((r) => ({ id: r.id != null ? r.id : null, nome: r.nome || '', papel: r.papel || '' }));
  const areasRel = (Array.isArray(f.areasRelacionadas) ? f.areasRelacionadas : []).filter(Boolean);
  const adicionadas = [];

  const jaRelacionada = (id, nome) => pessoasRel.some((r) => (id != null && r.id != null
    ? String(r.id) === String(id)
    : id == null && r.id == null && _norm(r.nome) === _norm(nome)));

  // Candidatos: a lista nova de gestores; so se nao houver nenhum, o texto legado.
  const gestores = (Array.isArray(f.gestoresContrato) ? f.gestoresContrato : [])
    .filter((g) => g && (g.id != null || String(g.nome || '').trim()))
    .map((g) => ({ id: g.id != null ? g.id : null, nome: String(g.nome || '').trim() }));
  if (!gestores.length && String(f.gestorContrato || '').trim()) {
    gestores.push({ id: null, nome: String(f.gestorContrato).trim() });
  }

  gestores.forEach((g) => {
    // Sem id, tenta achar a Pessoa pelo nome (so se for um unico homonimo).
    let id = g.id;
    let nome = g.nome;
    if (id != null) {
      const p = cadastro.find((x) => String(x.id) === String(id));
      if (p) nome = p.nome || nome;
    } else {
      const achadas = cadastro.filter((x) => _norm(x.nome) === _norm(nome));
      if (achadas.length === 1) { id = achadas[0].id; nome = achadas[0].nome || nome; }
    }
    if (jaRelacionada(id, nome)) return;
    pessoasRel.push({ id, nome, papel: PAPEL_MIGRADO });
    adicionadas.push(`pessoa ${nome}${id == null ? ' (sem cadastro)' : ''} como "${PAPEL_MIGRADO}"`);
  });

  const setor = String(f.setor || '').trim();
  if (setor && !areasRel.includes(setor)) {
    areasRel.push(setor);
    adicionadas.push(`área ${setor}`);
  }

  if (!adicionadas.length) return null;
  return { patch: { pessoasRelacionadas: pessoasRel, areasRelacionadas: areasRel }, adicionadas };
}

module.exports = { planejarRelacionados, PAPEL_MIGRADO };
