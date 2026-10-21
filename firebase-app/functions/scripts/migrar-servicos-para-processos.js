/**
 * Processo -> Servico (21/10/2026): o vinculo passa a morar no PROCESSO (item
 * {categoria: 'Serviços', id, nome} em processo.dependenciaItens). Este script
 * copia o servico.processoIds de cada Servico para os processos que ele
 * suporta e lista as ligacoes tecnicas diretas que sobram nos processos, com o
 * Servico que ja contem cada uma (a troca e feita na tela, com um clique).
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/migrar-servicos-para-processos.js            (so mostra o que faria)
 *   node scripts/migrar-servicos-para-processos.js --aplicar  (grava de verdade)
 *
 * Precisa de credenciais do projeto (GOOGLE_APPLICATION_CREDENTIALS apontando
 * para uma service account de bia-forte-2025, ou `gcloud auth application-default login`).
 *
 * E IDEMPOTENTE e NAO APAGA NADA: processo que ja aponta o servico e pulado;
 * servico.processoIds e os itens tecnicos dos processos ficam como estao (o
 * drawer do Servico zera o processoIds ao salvar; o tecnico e trocado na aba
 * BIA do Processo).
 */

'use strict';

const cadeia = require('../cadeiaDependencias');

/**
 * Puro: o que gravar e o que relatar.
 * Devolve { gravar: [{ processoId, dependenciaItens }], legados: [{ processo, item, sugeridos:[nome] }] }.
 */
function planejar(servicos, processos, dependencias) {
  const porId = new Map((processos || []).map((p) => [String(p.id), p]));
  const novosItens = new Map();
  (servicos || []).forEach((s) => {
    (Array.isArray(s.processoIds) ? s.processoIds : []).forEach((ref) => {
      const p = porId.get(String(ref && ref.id));
      if (!p) return;
      const itens = novosItens.get(p.id) || (Array.isArray(p.dependenciaItens) ? p.dependenciaItens.slice() : []);
      if (itens.some((it) => cadeia.ehServico(it) && String(it.id) === String(s.id))) return;
      itens.push({ categoria: cadeia.CATEGORIA_SERVICO, nome: String(s.nome || ''), id: String(s.id) });
      novosItens.set(p.id, itens);
    });
  });
  const gravar = [...novosItens.entries()].map(([processoId, dependenciaItens]) => ({ processoId, dependenciaItens }));

  const legados = [];
  (processos || []).forEach((p) => {
    (Array.isArray(p.dependenciaItens) ? p.dependenciaItens : []).filter(cadeia.ehTecnicoDireto).forEach((item) => {
      const sugeridos = item.id ? cadeia.servicosQueContem(item.id, servicos, dependencias).map((s) => s.nome) : [];
      legados.push({ processo: `${p.area || ''} · ${p.processo || ''}`, item: `${item.categoria || 'Outros'}: ${item.nome || ''}`, sugeridos });
    });
  });
  return { gravar, legados };
}

async function main() {
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const aplicar = process.argv.includes('--aplicar');
  const ler = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const [servicos, processos, dependencias] = await Promise.all([ler('servicos'), ler('processos'), ler('dependencias')]);

  const { gravar, legados } = planejar(servicos, processos, dependencias);
  console.log(`Processos que passam a apontar o Serviço: ${gravar.length}`);
  for (const g of gravar) {
    const p = processos.find((x) => x.id === g.processoId);
    const novos = g.dependenciaItens.filter((it) => cadeia.ehServico(it)).map((it) => it.nome).join(', ');
    console.log(`  + ${p.area} · ${p.processo}: ${novos}`);
    if (aplicar) {
      await db.collection('processos').doc(g.processoId).set({
        dependenciaItens: g.dependenciaItens,
        dependencia: [...new Set(g.dependenciaItens.map((it) => it.nome))].join(', '),
      }, { merge: true });
    }
  }
  console.log(`\nLigações técnicas diretas (trocar na aba BIA do Processo): ${legados.length}`);
  legados.forEach((l) => console.log(`  - ${l.processo} -> ${l.item}${l.sugeridos.length ? '  [trocar por: ' + l.sugeridos.join(' | ') + ']' : '  [nenhum Serviço contém este item]'}`));
  console.log(aplicar ? '\nGravado.' : '\nNada gravado (use --aplicar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { planejar };
