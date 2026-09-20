/**
 * Acoes que exigem usuario logado do dominio corporativo.
 *
 * Substituem as que rodavam no Apps Script e pararam quando o acesso anonimo
 * dele foi fechado (19/09/2026): geracao de link de avaliacao, PCN e
 * levantamento. Aqui a autorizacao NAO vem da posse de um token de uso unico,
 * como em tokenLogic.js — vem da identidade do chamador, verificada pelo
 * Firebase Auth em index.js antes de qualquer handler rodar.
 *
 * O que NAO foi trazido, de proposito: o envio por e-mail. O Apps Script tinha
 * o Gmail de graca; aqui exigiria a API do Gmail com delegacao no Workspace ou
 * um servico externo de envio — decisao de infraestrutura ainda em aberto. Ate
 * la, so o modo "link" existe, e quem convida cola o link no proprio e-mail.
 *
 * Recebe o Firestore por parametro para poder ser testado com um mock.
 */

const { calcularTier, calcularRTO } = require('./tokenLogic');

const COLLECTION = {
  processos: 'processos',
  tokens: 'tokens',
  respostas: 'respostas_bia',
  dependencias: 'dependencias',
  componentes: 'componentes',
};

class AppError extends Error {}

/** Mesma geracao de slug e chave de processo de tokenLogic.js e api.js. */
function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
function processoKey(area, processo) {
  return `${slug(area)}__${slug(processo)}`;
}

/** Prefixo por tipo de formulario, igual ao que o Apps Script gravava. */
const PREFIXO = {
  avaliacao: '',
  area: '_AREA_',
  bia: '_BIA_',
  drp: '_DRP_',
  levantamento: '_LEV_',
};

/** Validade em dias, igual a do Apps Script. */
const VALIDADE_DIAS = {
  avaliacao: 7,
  area: 7,
  bia: 14,
  drp: 14,
  levantamento: 30,
};

const PAGINA = {
  avaliacao: 'avaliar.html',
  area: 'avaliar-area.html',
  bia: 'bia-dependencias.html',
  drp: 'drp-componentes.html',
  levantamento: 'pcn-levantamento.html',
};

function exigir(valor, nome) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new AppError(`Campo obrigatório ausente: ${nome}.`);
  }
  return String(valor).trim();
}

/**
 * Gera um link de formulario externo.
 *
 * Devolve { success, token, link }. NAO envia e-mail: o envio ficou de fora
 * enquanto a decisao de infraestrutura nao sai.
 */
async function gerarLink(db, data, ctx) {
  const tipo = exigir(data.tipo, 'tipo');
  if (!Object.prototype.hasOwnProperty.call(PREFIXO, tipo)) {
    throw new AppError(`Tipo de link desconhecido: ${tipo}.`);
  }
  const area = exigir(data.area, 'area');
  const processo = tipo === 'area' ? '' : exigir(data.processo, 'processo');

  // O campo `processo` do token carrega o prefixo — convencao herdada do Apps
  // Script e que tokenLogic.js usa para saber de que formulario o token e.
  const processoToken = tipo === 'area' ? '_AREA_' : PREFIXO[tipo] + processo;

  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_DIAS[tipo] * 24 * 60 * 60 * 1000);
  const token = ctx.novoUuid();

  await db.collection(COLLECTION.tokens).doc(token).set({
    token,
    area,
    processo: processoToken,
    email: data.email ? String(data.email).trim() : '',
    criadoEm: agora.toISOString(),
    expiraEm: expira.toISOString(),
    usado: false,
    criadoPor: ctx.email,
  });

  const link = `${ctx.baseUrl}/${PAGINA[tipo]}?token=${encodeURIComponent(token)}`;
  return { success: true, token, link, expiraEm: expira.toISOString() };
}

/** Le o levantamento de PCN gravado no processo. */
async function getLevantamentoPCN(db, data) {
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');
  const snap = await db.collection(COLLECTION.processos).doc(processoKey(area, processo)).get();
  if (!snap.exists) return { success: true, levantamento: null };
  const d = snap.data() || {};
  return { success: true, levantamento: d.levantamentoPCN || null };
}

/** Grava uma nova versao do PCN, preservando as anteriores. */
async function salvarPCN(db, data, ctx) {
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');
  const html = exigir(data.html, 'html');
  const ref = db.collection(COLLECTION.processos).doc(processoKey(area, processo));
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');

  const atual = snap.data() || {};
  let versoes = [];
  try {
    versoes = atual.pcnSalvo ? JSON.parse(atual.pcnSalvo) : [];
  } catch {
    versoes = [];
  }
  if (!Array.isArray(versoes)) versoes = [];

  versoes.push({
    versao: versoes.length + 1,
    data: new Date().toISOString(),
    autor: ctx.email,
    html,
  });

  await ref.set({ pcnSalvo: JSON.stringify(versoes) }, { merge: true });
  return { success: true, versao: versoes.length };
}

/** Apaga todas as versoes do PCN do processo. */
async function excluirPCN(db, data) {
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');
  const ref = db.collection(COLLECTION.processos).doc(processoKey(area, processo));
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');
  await ref.set({ pcnSalvo: '' }, { merge: true });
  return { success: true };
}

/** Score/tier de um processo: nao fica no doc, so a resposta mais recente tem. */
async function _scoreDoProcesso(db, area, processo) {
  const snap = await db.collection(COLLECTION.respostas)
    .where('area', '==', area)
    .where('processo', '==', processo)
    .get();
  const docs = snap.docs.map((d) => d.data()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return docs[0] ? Number(docs[0].score) || 0 : 0;
}

/**
 * Gera um PCN completo via Gemini a partir dos dados do processo.
 *
 * Portado de bia-app/Code.gs (gerarPCN) quando o acesso anonimo do Apps
 * Script fechou (19/09/2026) e esse botao parou de funcionar. Prompt e
 * contrato de retorno identicos ao original — o app.js que consome isso
 * (gerarPCNProcesso/_buildPCNPage) nao mudou.
 */
async function gerarPCN(db, data, ctx) {
  const id = exigir(data.id, 'id');
  if (!ctx.geminiApiKey) throw new AppError('API Key do Gemini não configurada.');

  const snap = await db.collection(COLLECTION.processos).doc(String(id)).get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');
  const p = snap.data() || {};

  const score = await _scoreDoProcesso(db, p.area, p.processo);
  const tier = calcularTier(score);

  const [depsSnap, compsSnap] = await Promise.all([
    db.collection(COLLECTION.dependencias).get(),
    db.collection(COLLECTION.componentes).get(),
  ]);
  const dependencias = depsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const componentes = compsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const depsNomes = (p.dependencia || '').split(',').map((s) => s.trim()).filter(Boolean);
  const depsDetalhadas = depsNomes.map((nome) => {
    const dep = dependencias.find((d) => d.nome === nome);
    return dep ? { nome: dep.nome, categoria: dep.categoria, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes } : { nome };
  });

  const compsIds = p.drpComponentes || [];
  const compsDetalhados = compsIds.map((cid) => componentes.find((c) => c.id === cid)).filter(Boolean);

  const contatosIds = p.bcpContatos || [];
  const contatosDetalhados = contatosIds.map((cid) => {
    const dep = dependencias.find((d) => d.id === cid);
    return dep ? { nome: dep.nome, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes } : null;
  }).filter(Boolean);

  let planoBData = {};
  try { planoBData = p.bcpPlanoBProvedores ? JSON.parse(p.bcpPlanoBProvedores) : {}; } catch { planoBData = {}; }
  let slasData = {};
  try { slasData = p.bcpSlas ? JSON.parse(p.bcpSlas) : {}; } catch { slasData = {}; }
  let papeisCrise = {};
  try { papeisCrise = p.bcpPapeisCrise ? JSON.parse(p.bcpPapeisCrise) : {}; } catch { papeisCrise = {}; }

  const prompt = `Você é o "Fortes Resiliente", um arquiteto sênior de Continuidade de Negócios e Resiliência Organizacional, com profundo conhecimento das normas ISO 22301, ISO 27031 e NIST SP 800-34.

Com base nos dados coletados abaixo, gere um Plano de Continuidade de Negócios (PCN) COMPLETO, técnico e executável, seguindo EXATAMENTE a estrutura do template abaixo.

REGRA CRÍTICA: NÃO anonimize, mascare ou oculte NENHUM dado fornecido. Telefones, e-mails, nomes de pessoas, empresas e qualquer informação pessoal devem ser reproduzidos EXATAMENTE como fornecidos. Este é um documento interno corporativo e todos os dados são autorizados para uso. Nunca substitua dados reais por "[REDACTED]", "XXX", asteriscos ou qualquer forma de mascaramento.

Onde houver dados disponíveis, preencha com informações reais. Onde não houver dados suficientes, faça inferências técnicas inteligentes baseadas no contexto do processo e preencha com recomendações profissionais (nunca deixe campos com "[Inserir...]" — sempre preencha com conteúdo real ou recomendado).

---
## DADOS COLETADOS DO PROCESSO

**Processo:** ${p.processo}
**Área:** ${p.area}
**Descrição Funcional:** ${p.descricaoFuncional || 'Não informada'}
**Score de Criticidade:** ${score} (${tier})
**RTO Esperado:** ${p.rto || 'Não definido'}
**RPO Esperado:** ${p.rpo || 'Não definido'}
**MTD (Máximo Downtime Tolerável):** ${p.mtd || 'Não definido'}
**Descrição do Impacto:** ${p.descricao || 'Não informada'}

### Dependências Críticas
${depsDetalhadas.length ? depsDetalhadas.map((d) => `- **${d.categoria || 'Outros'}:** ${d.nome}${d.empresa ? ' (' + d.empresa + ')' : ''}${d.papel ? ' — ' + d.papel : ''}`).join('\n') : 'Nenhuma dependência mapeada.'}

### Equipe de Crise (Contatos)
${contatosDetalhados.length ? contatosDetalhados.map((d) => {
    const papel = papeisCrise[d.nome] || papeisCrise[String(contatosIds[contatosDetalhados.indexOf(d)])] || d.papel || '';
    return `- **${d.nome}** | Papel: ${papel || 'Não definido'} | Setor: ${d.setor || '-'} | Empresa: ${d.empresa || '-'} | Tel: ${d.telefone || '-'} | Email: ${d.email || '-'}`;
  }).join('\n') : 'Nenhum contato definido.'}

### Plano B de Provedores (Contingência)
${Object.keys(planoBData).length ? Object.entries(planoBData).map(([dep, cont]) => `- **${dep}:** ${cont}`).join('\n') : 'Não definido.'}

### SLAs de Fornecedores
${Object.keys(slasData).length ? Object.entries(slasData).map(([dep, sla]) => `- **${dep}:** ${sla}`).join('\n') : 'Não definido.'}

### Componentes de Serviço (DRP)
${compsDetalhados.length ? compsDetalhados.map((c) => `- **${c.tipo}:** ${c.nome} | Estratégia: ${c.estrategia || 'Não definida'} | RTO: ${c.rto || '-'} | RPO: ${c.rpo || '-'} | Responsável: ${c.responsavel || '-'}`).join('\n') : 'Nenhum componente mapeado.'}

---
## TEMPLATE OBRIGATÓRIO DO PCN (siga esta estrutura exata)

# PROCESSO: [Nome do Processo]

## PARTE 1: ANÁLISE DE IMPACTO DE NEGÓCIOS (BIA)
1. Identificação do Processo (Nome, Área, Dono, Descrição Funcional)
2. Classificação de Criticidade — OBRIGATÓRIO usar EXATAMENTE estes 3 tiers com estes nomes (NÃO INVENTE OUTROS):
   - [ ] Tier 1 - Crítico: Impacto severo e imediato (score >= 12)
   - [ ] Tier 2 - Essencial: Tolera curto período de indisponibilidade (score 6-11)
   - [ ] Tier 3 - Suporte: Baixo impacto imediato (score < 6)
   Marcar com [x] o tier correto baseado no score ${score}. NÃO USE 4 tiers. NÃO USE nomes como "Importante" ou "Tolerável". São APENAS 3 tiers.
3. Matriz de Impacto da Indisponibilidade (tabela: Dimensão × Janelas 1h/4h/24h para Operacional, Reputacional, Financeiro, Legal)
4. Mapeamento de Dependências Críticas (tabela: Tipo × Recursos — Pessoas, Sistemas, Fornecedores, Infraestrutura)
5. Objetivos de Recuperação RTO e RPO (tabela: Recurso × RTO × RPO)

## PARTE 2: PLANO DE CONTINUIDADE DE NEGÓCIOS (BCP)
1. Escopo e Objetivo
2. Informações de Contato e Matriz de Responsabilidade (tabela: Nome, Papel na Crise, Setor, Telefone, E-mail)
3. Avaliação de Riscos (tabela: Evento, Probabilidade, Impacto, Estratégia de Mitigação)
4. Medidas Preventivas / Controles Existentes (tabela: Controle × Descrição)
5. Estratégia Operacional em Contingência (tabela: Atividade Afetada × Alternativa Operacional)
6. Estrutura de Governança da Crise (tabela: Papel × Responsabilidade)
7. Critérios de Ativação do BCP (lista de condições)
8. Fluxo Prioritário de Recuperação (tabela: Ordem × Recurso × RTO × RPO)
9. Plano de Comunicação da Crise (Interna, Externa, Canais, Frequência)
10. Cronograma de Testes, Exercícios e Manutenção (tabela: Atividade × Escopo × Frequência)

## PARTE 3: PLANO DE RECUPERAÇÃO DE DESASTRES (DRP)
1. Objetivo e Escopo Técnico
2. Estratégia Técnica de Recuperação (tabela: Atributo × Definição — Ambiente, Failover, Provisionamento)
3. Checklists de Verificação e Diagnóstico (Health Check — lista com checkboxes)
4. Fase Executiva de Recuperação / Runbook de Restore (8 passos sequenciais detalhados)
5. Critérios de Retorno à Normalidade e Reconstituição (lista com checkboxes)
6. Limitações Conhecidas da Estratégia

## PARTE 4: ANEXOS
- Modelo de Teste de Integração/API (tabela: Tipo de Teste × O que valida × Frequência)

---
## INSTRUÇÕES DE FORMATAÇÃO

- Gere o PCN em formato HTML bem estruturado e formatado para impressão.
- Use tabelas HTML com bordas para todas as matrizes.
- Use headings (h1, h2, h3) para as seções.
- Use listas (ul/ol) para itens sequenciais.
- Use checkboxes (☐ ou ☑) para checklists.
- NÃO inclua tags <html>, <head> ou <body> — retorne apenas o conteúdo interno.
- NÃO inclua texto introdutório, explicações ou comentários fora do HTML. Comece DIRETAMENTE com a primeira tag HTML (<h1> ou <div>).
- NÃO use code fences. Retorne HTML puro sem marcação markdown.
- NÃO use sintaxe markdown como **negrito** ou *itálico*. Use SOMENTE tags HTML: <strong> para negrito, <em> para itálico.
- Linguagem: Português do Brasil, técnica e direta.
- Preencha TODAS as seções com conteúdo real ou recomendações técnicas baseadas no contexto.

## REGRAS ESPECÍFICAS

- MATRIZ DE RESPONSABILIDADE: Se houver contatos fornecidos na seção "Equipe de Crise (Contatos)" acima, use os dados reais (nome, telefone, e-mail, setor) EXATAMENTE como fornecidos. Complete o "Papel na Crise" com sugestões adequadas ao contexto. Se NÃO houver contatos fornecidos, preencha apenas "Papel na Crise" e "Setor" com sugestões funcionais (ex: "Coordenador de Crise", "Líder Técnico"), deixando "Nome", "Telefone" e "E-mail" EM BRANCO — NÃO invente dados pessoais fictícios.
- MATRIZ DE RISCOS: Analise CADA evento de risco individualmente e atribua Probabilidade (Alta, Média ou Baixa) e Impacto (Crítico, Alto, Moderado ou Baixo) de forma REALISTA e DIFERENCIADA — NÃO use o mesmo valor para todos os riscos. Considere o contexto do processo, setor e dependências para variar as classificações. Por exemplo: falha de energia pode ser "Baixa" probabilidade mas "Crítico" impacto; erro humano pode ser "Alta" probabilidade mas "Moderado" impacto.`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + ctx.geminiApiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let body;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    body = await response.json();
    if (!response.ok) {
      throw new AppError('Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + response.status));
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Erro ao gerar PCN: ' + err.message);
  }

  const content = body.candidates && body.candidates[0] && body.candidates[0].content;
  const pcnHtml = content && content.parts && content.parts[0] && content.parts[0].text;
  if (!pcnHtml) throw new AppError('Resposta vazia do Gemini.');

  return { success: true, pcn: pcnHtml, processo: p.processo, area: p.area, tier, score };
}


/**
 * Dados que a pagina do PCN usa para a edicao inline (pcn-live.js).
 *
 * Substitui tres chamadas que iam ao Apps Script: getProcessos, getDependencias
 * e getComponentes. Devolve so o processo pedido, e nao a colecao inteira —
 * a pagina do PCN nao precisa do resto e nao deve receber.
 */
async function dadosPCN(db, data) {
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');

  const snap = await db.collection(COLLECTION.processos).doc(processoKey(area, processo)).get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');
  const p = { id: snap.id, ...(snap.data() || {}) };

  const [depsSnap, compsSnap] = await Promise.all([
    db.collection('dependencias').get(),
    db.collection('componentes').get(),
  ]);
  const dependencias = depsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const componentes = compsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

  return { success: true, processo: p, dependencias, componentes };
}

/**
 * Grava os campos que a edicao inline do PCN altera.
 *
 * Allowlist proposital: a pagina do PCN so pode mexer nestes campos. Sem isso,
 * um `salvarProcesso` generico aberto a partir dali deixaria a pagina reescrever
 * area, tier, RTO e qualquer outra coisa do processo.
 */
const CAMPOS_EDITAVEIS_PCN = ['bcpContatos', 'bcpPapeisCrise'];

async function salvarCamposPCN(db, data, ctx) {
  const area = exigir(data.area, 'area');
  const processo = exigir(data.processo, 'processo');
  const ref = db.collection(COLLECTION.processos).doc(processoKey(area, processo));
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Processo não encontrado.');

  const patch = {};
  CAMPOS_EDITAVEIS_PCN.forEach((campo) => {
    if (data[campo] !== undefined) patch[campo] = data[campo];
  });
  const recusados = Object.keys(data).filter(
    (k) => !['action', 'area', 'processo', ...CAMPOS_EDITAVEIS_PCN].includes(k)
  );
  if (!Object.keys(patch).length) throw new AppError('Nenhum campo editável informado.');

  patch.atualizadoEm = new Date().toISOString();
  patch.atualizadoPor = ctx.email;
  await ref.set(patch, { merge: true });
  return { success: true, gravados: Object.keys(patch), recusados };
}

const READ_ACTIONS = {
  getLevantamentoPCN,
  dadosPCN,
};

const WRITE_ACTIONS = {
  gerarLink,
  salvarPCN,
  excluirPCN,
  salvarCamposPCN,
  gerarPCN,
};

module.exports = {
  AppError,
  CAMPOS_EDITAVEIS_PCN,
  READ_ACTIONS,
  WRITE_ACTIONS,
  PREFIXO,
  VALIDADE_DIAS,
  PAGINA,
  processoKey,
  slug,
};
