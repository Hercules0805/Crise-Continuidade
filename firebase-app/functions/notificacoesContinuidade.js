/**
 * Resumo semanal de conformidade de BIA/PCN/DRP por e-mail (DECISAO 23/10/2026).
 *
 * So regra -- sem Firestore e sem SMTP -- para poder ser testado. Quem le o
 * banco e grava a fila e functions/index.js (agendado resumoSemanalContinuidade,
 * segunda-feira 07:30); quem envia e o mesmo envioDeNotificacaoEmail dos
 * contratos e riscos, com o mesmo modo (desligado/simulacao/ativo).
 *
 *   - A conta e a mesma da tela Conformidade de Continuidade
 *     (conformidadeContinuidade.js, copia identica de public/).
 *   - Destinatarios: quem tem o perfil Operador de Processos (todas as areas)
 *     e, se ligado na configuracao, o Gestor de cada area (so as pendencias da
 *     area dele). So enderecos do dominio corporativo.
 *   - Quem nao tem pendencia nao recebe. A chave inclui a semana: rodar de
 *     novo no mesmo dia nao repete o e-mail.
 */
'use strict';

const N = require('./notificacoes');
const CC = require('./conformidadeContinuidade');
const cadeiaDependencias = require('./cadeiaDependencias');
const { calcularTier } = require('./tokenLogic');

const REMETENTE = 'BIA · Continuidade';
const PERFIL_OPERADOR_PROCESSOS = 'operador_processos';
const MAX_ITENS_EMAIL = 40;

/** Perfis da pessoa (perfis[] ou o campo legado `perfil`), em minusculas. */
function _perfisDe(d) {
  const lista = Array.isArray(d.perfis) ? d.perfis : (d.perfil ? [d.perfil] : []);
  return lista.map((p) => String(p || '').trim().toLowerCase());
}

/**
 * Score, avaliado e data da resposta de BIA mais recente de cada processo.
 * Mesma regra do cliente (api.js _respostaDoProcesso): por processoId ou pela
 * chave area||processo, atual ou de antes de renomear (nomesAnteriores).
 */
function enriquecerProcessos(processos, respostas) {
  const porChave = {}, porId = {};
  const maisNova = (atual, r) => (!atual || String(r.timestamp || '') > String(atual.timestamp || '') ? r : atual);
  (respostas || []).forEach((r) => {
    if (!r) return;
    const k = `${r.area || ''}||${r.processo || ''}`;
    porChave[k] = maisNova(porChave[k], r);
    if (r.processoId) porId[String(r.processoId)] = maisNova(porId[String(r.processoId)], r);
  });
  return (processos || []).map((p) => {
    const chaves = [`${p.area || ''}||${p.processo || ''}`].concat(Array.isArray(p.nomesAnteriores) ? p.nomesAnteriores : []);
    let resp = porId[String(p.id)] || null;
    chaves.forEach((c) => { if (porChave[c]) resp = maisNova(resp, porChave[c]); });
    return Object.assign({}, p, {
      score: resp ? Number(resp.score) || 0 : 0,
      avaliado: !!resp,
      biaUltimaEm: resp && resp.timestamp ? String(resp.timestamp) : '',
    });
  });
}

/** Tier como o cliente (Criticidade.tierDoProcesso): score > tier manual > Pendente. */
function tierDoProcesso(p) {
  if (p && (p.avaliado || Number(p.score) > 0)) return calcularTier(Number(p.score) || 0);
  if (p && p.tierManual) return p.tierManual;
  return 'Pendente';
}

/** Mesmo resultado da tela (indicadores + pendencias) a partir das colecoes cruas. */
function avaliarConformidade(dados) {
  const d = dados || {};
  const dependencias = d.dependencias || [];
  const servicos = d.servicos || [];
  return CC.avaliar({
    processos: enriquecerProcessos(d.processos, d.respostas),
    dependencias,
    ciclos: d.ciclos,
    hoje: d.hoje,
    tierDe: tierDoProcesso,
    cadeiaDoProcesso: (p) => cadeiaDependencias.cadeiaDoProcesso({ processo: p, dependencias, servicos }),
  });
}

/**
 * Map(email -> { motivos: [], pendencias: [] }). ctx: { perfis: config_perfis[], config }.
 * Operador de Processos recebe tudo; Gestor (se ligado), so os processos da area dele.
 */
function resolverDestinatariosContinuidade(pendencias, ctx) {
  const x = ctx || {};
  const cfg = N.normalizarConfig(x.config).continuidade.destinatarios;
  const por = new Map();
  const add = (email, motivo, itens) => {
    const e = String(email || '').trim().toLowerCase();
    if (!N.emailCorporativo(e) || !itens.length) return;
    if (!por.has(e)) por.set(e, { motivos: [], pendencias: [] });
    const alvo = por.get(e);
    if (!alvo.motivos.includes(motivo)) alvo.motivos.push(motivo);
    itens.forEach((p) => { if (!alvo.pendencias.includes(p)) alvo.pendencias.push(p); });
  };
  (x.perfis || []).forEach((d) => {
    const perfis = _perfisDe(d);
    const email = d.email || d.id;
    if (cfg.operadoresProcessos && perfis.includes(PERFIL_OPERADOR_PROCESSOS)) add(email, 'operadorProcessos', pendencias || []);
    const area = String(d.area || '');
    if (cfg.gestores && perfis.includes('gestor') && area) {
      // Areas hierarquicas (29/10/2026): a area dele e as de baixo.
      const geridas = [...new Set([area, ...(Array.isArray(d.areasGeridas) ? d.areasGeridas.map(String) : [])])];
      add(email, 'gestor', (pendencias || []).filter((p) => p.alvo === 'processo' && geridas.includes(p.area)));
    }
  });
  // Ordem da conformidade (vencido primeiro) mesmo quando um destinatario junta dois motivos.
  const ordem = new Map((pendencias || []).map((p, i) => [p, i]));
  por.forEach((v) => v.pendencias.sort((a, b) => ordem.get(a) - ordem.get(b)));
  return por;
}

const MOTIVO_TEXTO = {
  operadorProcessos: 'Operador de Processos',
  gestor: 'gestor da área (só os processos dela)',
};

function _textoMotivos(motivos) {
  const t = (motivos || []).map((m) => MOTIVO_TEXTO[m]).filter(Boolean);
  return t.length ? 'Você recebe este resumo como ' + t.join(' e ') + '.' : '';
}

function _dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function linkConformidade(baseUrl) {
  return `${String(baseUrl || N.URL_BASE_PADRAO).replace(/\/+$/, '')}/#conformidade`;
}

/** { assunto, html, texto } do resumo semanal de um destinatario. */
function montarResumoContinuidade(pendencias, opts) {
  const o = opts || {};
  const lista = pendencias || [];
  const contagem = CC.contar(lista);
  const dia = _dataBR(o.dia);
  const partes = ['vencido', 'faltando', 'atrasado', 'a-homologar', 'vencendo']
    .filter((s) => contagem.porSituacao[s])
    .map((s) => `${contagem.porSituacao[s]} ${CC.ROTULO_SITUACAO[s].toLowerCase()}`);
  const assunto = `[Continuidade] Conformidade de BIA/PCN/DRP${dia ? ` — ${dia}` : ''}: ${contagem.total} pendência(s)`;
  const resumoFrase = `${contagem.total} pendência(s): ${partes.join(', ')}.`;
  let html = N._cabecalhoHtml(`Conformidade de continuidade${dia ? ` — ${dia}` : ''}`)
    + `<p style="font-size:15px;">${N.esc(resumoFrase)}</p>`;
  const textoLinhas = [`Conformidade de continuidade${dia ? ` — ${dia}` : ''}`, '', resumoFrase, ''];
  const mostrados = lista.slice(0, MAX_ITENS_EMAIL);
  Object.keys(CC.ROTULO_TIPO).forEach((tipo) => {
    const itens = mostrados.filter((p) => p.tipo === tipo);
    if (!itens.length) return;
    const titulo = CC.ROTULO_TIPO[tipo];
    html += `<h2 style="font-size:15px;color:#d60014;margin:22px 0 8px;">${N.esc(titulo)} (${itens.length})</h2><ul style="padding-left:18px;margin:0;">`
      + itens.map((p) => {
        const detalhe = [CC.ROTULO_SITUACAO[p.situacao], p.mensagem, p.area, p.tier && p.tier !== 'Pendente' ? p.tier.split(' (')[0] : ''].filter(Boolean).join(' · ');
        return `<li style="margin-bottom:6px;"><strong>${N.esc(p.nome || '—')}</strong><br><span style="color:#5c5550;">${N.esc(detalhe)}</span></li>`;
      }).join('')
      + '</ul>';
    textoLinhas.push(titulo.toUpperCase());
    itens.forEach((p) => textoLinhas.push(`- ${p.nome || '—'}: ${CC.ROTULO_SITUACAO[p.situacao]} — ${p.mensagem}${p.area ? ` (${p.area})` : ''}`));
    textoLinhas.push('');
  });
  if (lista.length > mostrados.length) {
    const resto = `E mais ${lista.length - mostrados.length} pendência(s) na tela de Conformidade.`;
    html += `<p>${N.esc(resto)}</p>`;
    textoLinhas.push(resto, '');
  }
  const url = linkConformidade(o.baseUrl);
  html += N._botao(url, 'Abrir a Conformidade de Continuidade');
  textoLinhas.push(`Abrir no BIA: ${url}`, '');
  const rodape = _textoMotivos(o.motivos);
  textoLinhas.push(rodape);
  return { assunto, html: N._envelopeHtml(html, rodape), texto: textoLinhas.join('\n') };
}

/** Segunda-feira da semana de `dia` (AAAA-MM-DD): a chave do resumo nao repete na mesma semana. */
function semanaDe(dia) {
  const d = new Date(String(dia).slice(0, 10) + 'T00:00:00Z');
  const recuo = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  REMETENTE, PERFIL_OPERADOR_PROCESSOS, MAX_ITENS_EMAIL,
  enriquecerProcessos, tierDoProcesso, avaliarConformidade,
  resolverDestinatariosContinuidade, montarResumoContinuidade, linkConformidade, semanaDe,
};
