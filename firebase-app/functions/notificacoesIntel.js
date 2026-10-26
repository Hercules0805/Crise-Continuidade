/**
 * Resumo diario de Threat Intelligence por e-mail (26/10/2026).
 *
 * So regra -- sem Firestore e sem SMTP -- para poder ser testado. Quem le o
 * banco e grava a fila e functions/index.js (agendado coletaThreatIntel, logo
 * depois da coleta); quem envia e o mesmo envioDeNotificacaoEmail, com o mesmo
 * modo (desligado/simulacao/ativo).
 *
 *   - Destinatarios: quem tem o perfil Seguranca da Informacao (quem faz a
 *     triagem). So enderecos do dominio corporativo.
 *   - So sai e-mail se a coleta do dia gerou acao Critica ou Alta pendente;
 *     o resto fica na tela. A chave inclui o dia: rodar de novo nao repete.
 */
'use strict';

const N = require('./notificacoes');

const REMETENTE = 'BIA · Threat Intel';
const PERFIL_SEGURANCA = 'seguranca';
const PRIORIDADES_EMAIL = ['Crítica', 'Alta'];
const MAX_ITENS_EMAIL = 40;

function _perfisDe(d) {
  const lista = Array.isArray(d.perfis) ? d.perfis : (d.perfil ? [d.perfil] : []);
  return lista.map((p) => String(p || '').trim().toLowerCase());
}

/** E-mails (dominio) de quem tem o perfil Seguranca. */
function destinatariosIntel(configPerfis) {
  return [...new Set((configPerfis || [])
    .filter((d) => _perfisDe(d).includes(PERFIL_SEGURANCA))
    .map((d) => String(d.email || d.id || '').trim().toLowerCase())
    .filter(N.emailCorporativo))];
}

/** Acoes que entram no e-mail: pendentes, Critica/Alta, criadas no dia (AAAA-MM-DD, horario de Brasilia). */
function acoesDoResumo(acoes, dia) {
  const ordem = (p) => PRIORIDADES_EMAIL.indexOf(p);
  return (acoes || [])
    .filter((a) => a && a.statusTriagem === 'Pendente' && PRIORIDADES_EMAIL.includes(a.prioridade)
      && _diaSP(a.criadoEm) === dia)
    .sort((a, b) => (ordem(a.prioridade) - ordem(b.prioridade)) || (Number(b.exploracaoAtiva) - Number(a.exploracaoAtiva)));
}

function _diaSP(iso) {
  const d = new Date(String(iso || ''));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function _dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function linkThreatIntel(baseUrl) {
  return `${String(baseUrl || N.URL_BASE_PADRAO).replace(/\/+$/, '')}/#threat-intel`;
}

/** { assunto, html, texto }. opts: { dia, baseUrl, totalPendentes }. */
function montarResumoIntel(acoes, opts) {
  const o = opts || {};
  const lista = acoes || [];
  const dia = _dataBR(o.dia);
  const criticas = lista.filter((a) => a.prioridade === 'Crítica').length;
  const assunto = `[Threat Intel] ${lista.length} ação(ões) para triagem${criticas ? ` (${criticas} crítica(s))` : ''}${dia ? ` — ${dia}` : ''}`;
  const total = Number(o.totalPendentes) || lista.length;
  const frase = `A coleta de hoje gerou ${lista.length} ação(ões) de prioridade crítica ou alta. No total, ${total} ação(ões) aguardam triagem.`;
  let html = N._cabecalhoHtml(`Threat Intelligence${dia ? ` — ${dia}` : ''}`)
    + `<p style="font-size:15px;">${N.esc(frase)}</p><ul style="padding-left:18px;margin:0;">`;
  const textoLinhas = [`Threat Intelligence${dia ? ` — ${dia}` : ''}`, '', frase, ''];
  const mostradas = lista.slice(0, MAX_ITENS_EMAIL);
  mostradas.forEach((a) => {
    const detalhe = [
      a.prioridade,
      a.exploracaoAtiva ? 'explorada ativamente' : '',
      (a.cves || []).slice(0, 3).join(', '),
      a.qtdHosts ? `${a.qtdHosts} host(s)` : '',
      a.prazoSugerido ? `prazo sugerido ${_dataBR(a.prazoSugerido)}` : '',
    ].filter(Boolean).join(' · ');
    html += `<li style="margin-bottom:8px;"><strong>${N.esc(a.titulo || '—')}</strong><br><span style="color:#5c5550;">${N.esc(detalhe)}</span>`
      + (a.noticiaTitulo ? `<br><span style="color:#888;font-size:12px;">${N.esc(a.noticiaTitulo)}</span>` : '') + '</li>';
    textoLinhas.push(`- ${a.titulo || '—'} (${detalhe})`);
  });
  html += '</ul>';
  if (lista.length > mostradas.length) {
    const resto = `E mais ${lista.length - mostradas.length} ação(ões) na tela de Threat Intelligence.`;
    html += `<p>${N.esc(resto)}</p>`;
    textoLinhas.push(resto);
  }
  const url = linkThreatIntel(o.baseUrl);
  html += N._botao(url, 'Abrir a triagem');
  textoLinhas.push('', `Abrir no BIA: ${url}`, '');
  const rodape = 'Você recebe este resumo por ter o perfil Segurança da Informação.';
  textoLinhas.push(rodape);
  return { assunto, html: N._envelopeHtml(html, rodape), texto: textoLinhas.join('\n') };
}

module.exports = {
  REMETENTE, PERFIL_SEGURANCA, PRIORIDADES_EMAIL, MAX_ITENS_EMAIL,
  destinatariosIntel, acoesDoResumo, montarResumoIntel, linkThreatIntel,
};
