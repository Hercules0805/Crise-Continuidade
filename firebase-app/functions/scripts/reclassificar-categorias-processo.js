/**
 * Revisao das categorias dos processos (29/10/2026). Cria a 4a categoria,
 * "Processo de Apoio" (servicos internos que sustentam a operacao de toda a
 * empresa: TI, SI, predial, dados, governanca), e muda a categoria dos
 * processos da lista RECLASSIFICACAO, analisada um a um com o usuario contra
 * a finalidade e os criterios de cada categoria.
 *
 * So mexe em categoriaId: "Avaliar em Continuidade" (continuidade) NAO muda --
 * categoria descreve a natureza do processo; Continuidade, se passa por BIA.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/reclassificar-categorias-processo.js           (so mostra o que faria)
 *   node scripts/reclassificar-categorias-processo.js --gravar  (grava de verdade)
 * Credenciais: `gcloud auth application-default login` + GCLOUD_PROJECT=bia-forte-2025.
 *
 * E IDEMPOTENTE. Recusa gravar se algum processo da lista nao for achado
 * (renomeado/excluido depois da analise).
 */

'use strict';

const AUTOR = 'reclassificacao-categorias';

const CATEGORIA_APOIO = {
  id: 'processo-de-apoio', ordem: 4, nome: 'Processo de Apoio', ativo: true,
  finalidade: 'Serviços internos que sustentam a operação de toda a empresa (tecnologia, segurança, instalações, dados, governança). Não entregam valor direto ao cliente, mas a parada deles trava outras áreas. São candidatos frequentes à avaliação de Continuidade.',
  criteriosIdentificacao: 'O cliente do processo são as outras áreas, não o cliente externo.\nFunciona como um serviço contínuo, não como um fluxo com início e fim.\nSe parar, várias áreas são afetadas ao mesmo tempo.',
  exemplos: 'Firewall e antivírus.\nDiretório e autenticação (AD/DNS).\nTelefonia.\nEnergia e segurança predial.\nDashboards internos.',
};

const APOIO = 'processo-de-apoio';
const INTER = 'intersetorial';
const NEGOCIO = 'processo-de-negocio';

/** [area, processo, categoriaId] -- nomes exatamente como estao no cadastro. */
const RECLASSIFICACAO = [
  // Processo de Negocio -> Processo de Apoio
  ['Administrativo', 'Controle de acesso predial > Colaboradores', APOIO],
  ['Administrativo', 'Limpeza/Conservação predial', APOIO],
  ['Administrativo', 'Manutenção da energia predial', APOIO],
  ['Administrativo', 'Segurança patrimonial', APOIO],
  ['Comunicação Interna', 'Comunicação de Chat', APOIO],
  ['Comunicação Interna', 'Comunicação de Emails', APOIO],
  ['Comunicação Interna', 'Comunicação de Instagram', APOIO],
  ['Inteligência de Negócios', 'Criação de Dashboards > Apoio ao Comercial', APOIO],
  ['Inteligência de Negócios', 'Criação de Dashboards > Apoio de Suporte', APOIO],
  ['Inteligência de Negócios', 'Criação de Dashboards > Comissionamento Comercial', APOIO],
  ['Inteligência de Negócios', 'Criação de Dashboards > Diretoria', APOIO],
  ['Inteligência de Negócios', 'Criação de Dashboards > RR', APOIO],
  ['Inteligência de Negócios', 'Folha > Informações de Gratificação (Suporte, Implantação)', APOIO],
  ['Inteligência de Negócios', 'Integração de Dados > Neo Assist', APOIO],
  ['Segurança da Informação', 'Backup e Recuperação', APOIO],
  ['Segurança da Informação', 'Gestão de Identidade e Acesso (IAM) - Google', APOIO],
  ['Segurança da Informação', 'Operação do Firewall', APOIO],
  ['Segurança da Informação', 'Serviço Endpoint (Antivírus)', APOIO],
  ['TI', 'Operação de Infra de TI Nuvem: AWS', APOIO],
  ['TI', 'Operação de Service Desk / Suporte Técnico', APOIO],
  ['TI', 'Serviço de Telefonia', APOIO],
  ['TI', 'Serviços de Diretório e Autenticação (AD / DNS / DHCP)', APOIO],
  ['TI', 'Suporte a Sistemas e Aplicações', APOIO],
  ['GRC', 'Auditoria Interna', APOIO],
  ['GRC', 'Mapeamento de Riscos', APOIO],
  // Departamental -> Processo de Apoio
  ['TI', 'Gestão de Equipamentos (FLU.TI.005)', APOIO],
  ['TI', 'Manutenção de Equipamentos (FLU.TI.006)', APOIO],
  ['TI', 'Infra (FLU.TI.004)', APOIO],
  ['TI', 'Macrofluxo (FLU.TI.001)', APOIO],

  // Processo de Negocio -> Intersetorial
  ['Departamento Pessoal', 'Admissão', INTER],
  ['Administrativo', 'Gestão de Compras/Suprimentos', INTER],
  ['Financeiro', 'Processamento de Contas a Pagar', INTER],
  ['GRC', 'Gestão de Contratos de Fornecedores', INTER],
  ['Controladoria', 'Fechamento mensal orçamentário', INTER],
  // Departamental -> Intersetorial
  ['Administrativo', 'Demissão de Colaboradores', INTER],
  ['Departamento Pessoal', 'Rescisão', INTER],
  ['T&D', 'Onboarding (FLU.T&D.01)', INTER],
  ['T&D', 'Offboard (FLU.T&D.02)', INTER],
  ['TI', 'Onboard (FLU.TI.003)', INTER],
  ['TI', 'Offboard (FLU.TI.002)', INTER],
  ['Administrativo Comercial', 'Cancelamento (MN.ADC.002)', INTER],
  ['Administrativo Comercial', 'Cancelamento por Inadimplência (FL.ADC.003, PO.ADC.003)', INTER],
  ['Administrativo Comercial', 'Gerenciamento de Comissões: Vendedores, Unidades, Parceiros e Fanfortes Indica (MN.ADC.006)', INTER],
  ['Comercial', 'Gerenciamento de Comissões - Vendedores,Unidades, Parceiros e Indica (PO.ADC.006)', INTER],
  ['Suporte Tecnologia', 'Cancelamento de Ambiente Nuvem (MN.TN.010, POP.TN.002)', INTER],
  ['Suporte Tecnologia', 'Unidades/Matriz - Cancelamento de Ambiente Nuvem (FL.TN.001)', INTER],
  ['Suporte Tecnologia', 'Acesso do Desenvolvimento ao Ambiente do Cliente - Manutenção (MN.TN.030)', INTER],
  ['Suporte Tecnologia', 'Entrega de Backup para Análise Interna (MN.TN.024, POP.TN.006)', INTER],
  ['Relacionamento', 'Passagem de bastão e onboarding (PO.CS.005)', INTER],
  ['Relacionamento', 'Acionamento Interno (PO.CS.003)', INTER],
  ['Relacionamento', 'Relacionamento por Inadimplência (MN.CS.001, PO.CS.004)', INTER],
  ['Departamento Pessoal', 'Pagamento de RPA (POP.DP.005)', INTER],
  ['Departamento Pessoal', 'Pagamento e RPA (FLU.DP.005)', INTER],

  // Departamental -> Processo de Negocio
  ['Administrativo Comercial', 'Gestão de Contrato - Cliente Nuvem/Unidade (PO.ADC.007)', NEGOCIO],
  ['Administrativo Comercial', 'Gestão de Contrato - Clientes Nuvem Unidade (FL.ADC.004)', NEGOCIO],
  ['Administrativo Comercial', 'Gestão de Contrato - Matriz/Nuvem Unidade (MN.ADC.003)', NEGOCIO],
  ['Administrativo Comercial', 'Gestão de Contratos de Clientes e Unidades (NR.ADC.001)', NEGOCIO],
  ['Administrativo Comercial', 'Gestão de Contratos com Representantes e Franquias (PO.ADC.004)', NEGOCIO],
  ['Administrativo Comercial', 'Gestão de Contratos com Franquia e Representação - Gerenciamento de Carteira (MN.ADC.004)', NEGOCIO],
  ['Atendimento', 'Atendimento e Resolução de Chamados - Fisco Pessoal e Gestão de Empresas (PO.AT.001)', NEGOCIO],
  ['Atendimento', 'Atendimento e Resolução de Chamados - Tecnologia (PO.AT.002)', NEGOCIO],
  ['Atendimento', 'Macrofluxo Atendimento (FL.AT.001)', NEGOCIO],
  ['Atendimento', 'Macrofluxo Atendimento Tecnologia (FL.AT.002)', NEGOCIO],
  ['Comercial', 'Jornada de Vendas (MN.COM.001, POP.COM.001, NR.COM.001)', NEGOCIO],
  ['Comercial', 'Macrofluxo Comercial (FLU.COM.001)', NEGOCIO],
  ['Comercial', 'Prospecção (FLU.COM.002)', NEGOCIO],
  ['Comercial Corporativo', 'Redução de Plano (Contábil e Corporativo) (MN.ADC.007)', NEGOCIO],
  ['Comercial Corporativo', 'Redução de Planos - Contábil (FL.ADC.002, PO.ADC.002)', NEGOCIO],
  ['Comercial Corporativo', 'Redução de Planos - Corporativo (FL.ADC.006, PO.ADC.008)', NEGOCIO],
  ['Contas a Pagar', 'Faturamento (MN.CRE.002, PO.CRE.001, FL.CRE 003)', NEGOCIO],
  ['Contas a Receber', 'Cobrança e Faturamento (NR.CRE 001)', NEGOCIO],
  ['Contas a Receber', 'Royalties (MN.CRE.004, PO.CRE.002, FL.CRE 004)', NEGOCIO],
  ['Departamento Pessoal', 'Folha de Pagamento', NEGOCIO],
  ['Implantação', 'Pré Implantação (PO.IMP.001)', NEGOCIO],
  ['Implantação', 'Macro Fluxo Contábil e Corporativo (FL.IMP.001)', NEGOCIO],
  ['Implantação', 'Normas Implantação (NR.IMP. 001)', NEGOCIO],
  ['Relacionamento', 'Cancelamento a Pedido do Cliente (MN.CS.002)', NEGOCIO],
  ['Relacionamento', 'Cancelamento por Insatisfação Unificado (FLU.CS.002)', NEGOCIO],
  ['Relacionamento', 'Cancelamento, Retenção e Relacionamento com o Cliente (NR.CS.001)', NEGOCIO],
  ['Relacionamento', 'Solicitação de Cancelamento/Cliente - Matriz (PO.CS.001)', NEGOCIO],
  ['Relacionamento', 'Relacionamento (FLU.CS.001)', NEGOCIO],
  ['Relacionamento', 'Relacionamento com Clientes de Base (PO.CS.002)', NEGOCIO],
  ['Relacionamento', 'Relacionamento Proativo com Clientes de Base (MN.CS.003)', NEGOCIO],
  ['Relacionamento', 'Relacionamento Reativo com Clientes de Base (MN.CS.004)', NEGOCIO],
  ['Suporte Tecnologia', 'Entrega de Backups para Clientes Nuvem (MN.TN.001, POP.TN.005)', NEGOCIO],
  ['Suporte Tecnologia', 'Recriar Usuários de Clientes Nuvem (MN.TN.002, POP.TN.004)', NEGOCIO],
  ['Suporte Tecnologia', 'Atualização AG (MN.TN.015)', NEGOCIO],
  ['Suporte Tecnologia', 'Atualização do Fortes RH em Clientes Nuvem Dedicada (MN.TN.004)', NEGOCIO],
  ['Suporte Tecnologia', 'Atualização do Frota (MN.TN.013)', NEGOCIO],
  ['Suporte Tecnologia', 'Processo de Atualização do Cargas (MN.TN.012)', NEGOCIO],
  ['Suporte Tecnologia', 'Processo de Atualização Patrio (MN.TN.016)', NEGOCIO],
  ['Suporte Tecnologia', 'Processo de Atualização Ponto (MN.TN.017)', NEGOCIO],
  ['Suporte Tecnologia', 'Regras para Atualização de Clientes Nuvem (NR.TN.001)', NEGOCIO],
  ['Suporte Tecnologia', 'Web Service Pessoal - Compartilhado (MN.TN.029)', NEGOCIO],
  ['Suporte Tecnologia', 'Integração do Fortes AC Pessoal x Fortes RH (MN.TN.007)', NEGOCIO],
  ['Suporte Tecnologia', 'Integração do Fortes AG x Fortes AC Contábil (MN.TN.006)', NEGOCIO],
  ['Suporte Tecnologia', 'Integração do Fortes Ponto x Fortes AC (MN.TN.005)', NEGOCIO],
  ['Suporte Tecnologia', 'Construção - Criação de Ambiente Nuvem (POP.TN.007)', NEGOCIO],
  ['Suporte Tecnologia', 'Setup - Criação de Ambiente Nuvem - Skyone (FL.TN.003)', NEGOCIO],
  ['Suporte Tecnologia', 'Adição/Instalação de Novo Sistema em Nuvem (MN.TN.009)', NEGOCIO],
  ['Suporte Tecnologia', 'Instalação de Sistema RH em Nuvem Compartilhada (MN.TN.034)', NEGOCIO],
  ['Suporte Tecnologia', 'Reativação de Cliente Nuvem (POP.TN.003)', NEGOCIO],
  ['Suporte Tecnologia', 'Migração para Desktop (MN.TN.025, POP.TN.001)', NEGOCIO],
  ['Suporte Tecnologia', 'Migração - Nuvem para Desktop (FL.TN.004)', NEGOCIO],
  ['Suporte Tecnologia', 'Jornada de Suporte ao Cliente Desde a Unidade (FL.TN.002)', NEGOCIO],
];

/**
 * Puro. `processos` = [{ id, area, processo, categoriaId }], `categoriasIds` =
 * ids ja presentes em categorias_processo. Devolve { criarCategoria (bool),
 * mudar: [{ id, area, processo, de, para }], jaCertos: n, naoEncontrados: ['area · processo'] }.
 */
function planejar(processos, categoriasIds, lista = RECLASSIFICACAO) {
  const porChave = new Map((processos || []).map((p) => [`${p.area}||${p.processo}`, p]));
  const mudar = [];
  const naoEncontrados = [];
  let jaCertos = 0;
  lista.forEach(([area, processo, para]) => {
    const p = porChave.get(`${area}||${processo}`);
    if (!p) { naoEncontrados.push(`${area} · ${processo}`); return; }
    if (p.categoriaId === para) { jaCertos++; return; }
    mudar.push({ id: String(p.id), area, processo, de: p.categoriaId || '', para });
  });
  return { criarCategoria: !new Set((categoriasIds || []).map(String)).has(CATEGORIA_APOIO.id), mudar, jaCertos, naoEncontrados };
}

async function main() {
  const gravar = process.argv.includes('--gravar');
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const [procSnap, catSnap] = await Promise.all([db.collection('processos').get(), db.collection('categorias_processo').get()]);
  const processos = procSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const plano = planejar(processos, catSnap.docs.map((d) => d.id));

  if (plano.naoEncontrados.length) {
    plano.naoEncontrados.forEach((n) => console.error('NÃO ENCONTRADO: ' + n));
    throw new Error('Nada gravado: a lista não bate com o cadastro (processo renomeado ou excluído).');
  }
  console.log(plano.criarCategoria ? `Categoria a criar: ${CATEGORIA_APOIO.nome}` : `Categoria ${CATEGORIA_APOIO.nome} já existe.`);
  const grupos = {};
  plano.mudar.forEach((m) => { const k = `${m.de || '(sem)'} → ${m.para}`; (grupos[k] = grupos[k] || []).push(m); });
  Object.keys(grupos).sort().forEach((k) => {
    console.log(`\n${k} (${grupos[k].length})`);
    grupos[k].forEach((m) => console.log(`  ${m.area} · ${m.processo}`));
  });
  console.log(`\nA mudar: ${plano.mudar.length} · já na categoria certa: ${plano.jaCertos}`);

  if (gravar) {
    const agora = new Date().toISOString();
    if (plano.criarCategoria) {
      const { id, ...dados } = CATEGORIA_APOIO;
      await db.collection('categorias_processo').doc(id).set({ ...dados, atualizadoEm: agora, atualizadoPor: AUTOR });
    }
    for (let i = 0; i < plano.mudar.length; i += 400) {
      const batch = db.batch();
      plano.mudar.slice(i, i + 400).forEach((m) => batch.set(db.collection('processos').doc(m.id),
        { categoriaId: m.para, atualizadoEm: agora, atualizadoPor: AUTOR }, { merge: true }));
      await batch.commit();
    }
  }
  console.log(gravar ? '\nGravado.' : '\nNada gravado (use --gravar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}

module.exports = { planejar, RECLASSIFICACAO, CATEGORIA_APOIO };
