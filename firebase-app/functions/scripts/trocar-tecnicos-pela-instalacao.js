/**
 * Troca itens tecnicos ligados direto nos processos (ex.: Energia elétrica e
 * Internet da sede) pela Instalacao que os contem (22/10/2026).
 *
 * Energia e Internet nao sao de um Servico de TI: sao da instalacao fisica. O
 * jeito certo na hierarquia e a Instalacao te-los em "Componentes abaixo" e o
 * processo apontar a Instalacao -- a cadeia (cadeiaDependencias.js) chega a
 * eles, sem repetir a mesma ligacao em dezenas de processos.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/trocar-tecnicos-pela-instalacao.js --instalacao=<id> --itens=<id1>,<id2>            (so mostra)
 *   node scripts/trocar-tecnicos-pela-instalacao.js --instalacao=<id> --itens=<id1>,<id2> --aplicar  (grava)
 *
 * Credenciais: `gcloud auth application-default login` e GOOGLE_CLOUD_PROJECT=bia-forte-2025.
 *
 * E IDEMPOTENTE: item ja componente da Instalacao nao repete; processo que ja
 * aponta a Instalacao nao ganha outra; rodar de novo nao muda nada. Grava so
 * dependenciaItens/dependencia do processo e componentes da Instalacao.
 */

'use strict';

const cadeia = require('../cadeiaDependencias');

const CATEGORIAS_INSTALACAO = ['Instalações', 'Instalação'];

/**
 * Puro. Devolve { componentes: [..]|null (null = nada a mudar na Instalacao),
 * processos: [{ id, dependenciaItens, tirados:[nome] }] }.
 */
function planejar(instalacao, itens, processos) {
  const ids = new Set(itens.map((d) => String(d.id)));
  const atuais = Array.isArray(instalacao.componentes) ? instalacao.componentes : [];
  const faltam = itens.filter((d) => !atuais.some((c) => c && String(c.id) === String(d.id)));
  const componentes = faltam.length
    ? atuais.concat(faltam.map((d) => ({ id: String(d.id), nome: String(d.nome || ''), categoria: String(d.categoria || '') })))
    : null;

  const refInst = { categoria: 'Instalações', id: String(instalacao.id), nome: String(instalacao.nome || '') };
  const mudancas = [];
  (processos || []).forEach((p) => {
    const lista = Array.isArray(p.dependenciaItens) ? p.dependenciaItens : [];
    const tirados = lista.filter((it) => it && it.id && ids.has(String(it.id)) && cadeia.ehTecnicoDireto(it));
    if (!tirados.length) return;
    const fica = lista.filter((it) => !tirados.includes(it));
    if (!fica.some((it) => it && CATEGORIAS_INSTALACAO.includes(it.categoria) && String(it.id) === refInst.id)) fica.push(refInst);
    mudancas.push({ id: p.id, dependenciaItens: fica, tirados: tirados.map((it) => it.nome) });
  });
  return { componentes, processos: mudancas };
}

function arg(nome) {
  const a = process.argv.find((x) => x.startsWith('--' + nome + '='));
  return a ? a.slice(nome.length + 3) : '';
}

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const aplicar = process.argv.includes('--aplicar');
  const instId = arg('instalacao');
  const itensIds = arg('itens').split(',').map((s) => s.trim()).filter(Boolean);
  if (!instId || !itensIds.length) throw new Error('Informe --instalacao=<id> e --itens=<id1>,<id2>.');

  const instSnap = await db.collection('dependencias').doc(instId).get();
  if (!instSnap.exists || !CATEGORIAS_INSTALACAO.includes((instSnap.data() || {}).categoria)) throw new Error('Instalação não encontrada: ' + instId);
  const instalacao = { id: instSnap.id, ...instSnap.data() };
  const itens = [];
  for (const id of itensIds) {
    const s = await db.collection('dependencias').doc(id).get();
    if (!s.exists) throw new Error('Dependência não encontrada: ' + id);
    itens.push({ id: s.id, ...s.data() });
  }
  const processos = (await db.collection('processos').get()).docs.map((d) => ({ id: d.id, ...d.data() }));

  const plano = planejar(instalacao, itens, processos);
  console.log(`Instalação: ${instalacao.nome} (${instalacao.id})`);
  console.log(plano.componentes
    ? `  + Componentes abaixo: ${plano.componentes.map((c) => c.nome).join(', ')}`
    : '  = Componentes já contêm os itens');
  console.log(`\nProcessos que passam a apontar "${instalacao.nome}" no lugar dos itens: ${plano.processos.length}`);
  plano.processos.forEach((m) => {
    const p = processos.find((x) => x.id === m.id);
    console.log(`  ~ ${p.area} · ${p.processo}: tira ${m.tirados.join(', ')}`);
  });

  if (aplicar) {
    if (plano.componentes) await db.collection('dependencias').doc(instalacao.id).set({ componentes: plano.componentes }, { merge: true });
    for (const m of plano.processos) {
      await db.collection('processos').doc(m.id).set({
        dependenciaItens: m.dependenciaItens,
        dependencia: [...new Set(m.dependenciaItens.map((it) => it.nome))].join(', '),
      }, { merge: true });
    }
  }
  console.log(aplicar ? '\nGravado.' : '\nNada gravado (use --aplicar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}

module.exports = { planejar };
