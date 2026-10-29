/**
 * Aviso por e-mail de risco registrado ou encerrado (DECISAO 22/10/2026, Hercules).
 *
 * So regra -- sem Firestore e sem SMTP -- para poder ser testado. Quem le o
 * banco e grava a fila e functions/index.js (gatilho notificacaoDeRisco e o
 * agendado resumoDiarioRiscos); quem envia e o mesmo envioDeNotificacaoEmail
 * dos contratos, com o mesmo modo (desligado/simulacao/ativo).
 *
 *   - Destinatarios: o responsavel pelo risco (Pessoa pelo nome), o
 *     responsavel da area (e-mail da Area + quem tem perfil Gestor dela) e a
 *     equipe de Seguranca da Informacao (perfil seguranca). So enderecos do
 *     dominio corporativo, como nos contratos.
 *   - Feito por uma pessoa: e-mail na hora. Feito pela automacao
 *     (vulnerabilidade, fornecedor, indicador): entra num resumo diario por
 *     destinatario -- a varredura pode abrir dezenas de riscos de uma vez.
 *
 * O E-MAIL NAO LEVA impacto financeiro, descricao nem plano de acao: sai do
 * controle de acesso do sistema. Leva titulo, area, nivel, responsavel,
 * origem, status, a justificativa (no encerramento) e o link.
 */
'use strict';

const N = require('./notificacoes');
const E = require('./escalaRisco');

const TIPO = { NOVO: 'novo', ENCERRADO: 'encerrado' };
const ENCERRADO = 'Encerrado';
const PREFIXO_AUTOMACAO = 'automacao:';
const REMETENTE = 'BIA · Riscos';

function _encerrado(r) {
  return !!r && String(r.status || '') === ENCERRADO;
}

/** Data (AAAA-MM-DD) do encerramento, para a chave: reencerrar no mesmo dia nao repete o e-mail. */
function _diaEncerramento(r) {
  const d = String((r && r.dataEncerramento) || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : String((r && r.atualizadoEm) || '').slice(0, 10);
}

/**
 * Evento de e-mail desta escrita em riscos/{id}, ou null.
 *   - novo: o documento nasceu (antes nao existia);
 *   - encerrado: o status passou a Encerrado (antes era outro).
 * `automatico`: criado com criadoPelaAutomacao, ou encerrado por uma gravacao
 * com atualizadoPor 'automacao:...'.
 */
function decidirEventoRisco(id, antes, depois) {
  if (!depois || !id) return null;
  if (!antes) {
    return {
      tipo: TIPO.NOVO,
      automatico: depois.criadoPelaAutomacao === true,
      chave: `risco:${id}:novo`,
    };
  }
  if (_encerrado(depois) && !_encerrado(antes)) {
    return {
      tipo: TIPO.ENCERRADO,
      automatico: String(depois.atualizadoPor || '').startsWith(PREFIXO_AUTOMACAO),
      chave: `risco:${id}:encerrado:${_diaEncerramento(depois)}`,
    };
  }
  return null;
}

function _chaveNome(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Perfis da pessoa (perfis[] ou o campo legado `perfil`), em minusculas. */
function _perfisDe(d) {
  const lista = Array.isArray(d.perfis) ? d.perfis : (d.perfil ? [d.perfil] : []);
  return lista.map((p) => String(p || '').trim().toLowerCase());
}

/** Áreas do gestor: a dele e as de baixo (areasGeridas, calculado pelo gatilho). */
function _geridas(d) {
  const area = String(d.area || '');
  if (!area) return [];
  return [area, ...(Array.isArray(d.areasGeridas) ? d.areasGeridas.map(String) : [])];
}

/**
 * [{ email, motivos[] }] do risco, sem repetir endereco.
 * ctx: { pessoas: [{nome, email}], areas: [{nome, email}], perfis: config_perfis[], config }.
 */
function resolverDestinatariosRisco(risco, ctx) {
  const r = risco || {};
  const x = ctx || {};
  const cfg = N.normalizarConfig(x.config).riscos.destinatarios;
  const por = new Map();
  const add = (email, motivo) => {
    const e = String(email || '').trim().toLowerCase();
    if (!N.emailCorporativo(e)) return;
    if (!por.has(e)) por.set(e, { email: e, motivos: [] });
    if (!por.get(e).motivos.includes(motivo)) por.get(e).motivos.push(motivo);
  };
  if (cfg.responsavel && _chaveNome(r.responsavel)) {
    const alvo = _chaveNome(r.responsavel);
    // Nome repetido no cadastro: sem como saber qual e -- avisa todos com aquele nome.
    (x.pessoas || []).filter((p) => _chaveNome(p.nome) === alvo).forEach((p) => add(p.email, 'responsavel'));
  }
  if (cfg.area && String(r.area || '').trim()) {
    const a = (x.areas || []).find((aa) => aa.nome === r.area);
    if (a) add(a.email, 'area');
    (x.perfis || []).forEach((d) => {
      // Areas hierarquicas (29/10/2026): o gestor da area de cima tambem.
      if (_perfisDe(d).includes('gestor') && _geridas(d).includes(r.area)) add(d.email || d.id, 'gestor');
    });
  }
  if (cfg.seguranca) {
    (x.perfis || []).forEach((d) => {
      if (_perfisDe(d).includes('seguranca')) add(d.email || d.id, 'seguranca');
    });
  }
  return [...por.values()];
}

/** Nivel NIST pela matriz (probabilidade x impacto), ou '' fora da escala. */
function nivelDoRisco(r) {
  return E.nivelPorMatriz((r || {}).probabilidade, (r || {}).impacto) || '';
}

function linkRisco(id, baseUrl) {
  return `${String(baseUrl || N.URL_BASE_PADRAO).replace(/\/+$/, '')}/#riscos?risco=${encodeURIComponent(String(id || ''))}`;
}

const MOTIVO_TEXTO = {
  responsavel: 'responsável por este risco',
  area: 'responsável pela área do risco',
  gestor: 'gestor da área do risco',
  seguranca: 'integrante da equipe de Segurança da Informação',
};

function _textoMotivos(motivos) {
  const t = (motivos || []).map((m) => MOTIVO_TEXTO[m]).filter(Boolean);
  return t.length ? 'Você recebe este aviso como ' + t.join(' e ') + '.' : '';
}

/** O que o e-mail pode dizer do risco (nada de valor, descricao ou plano). */
function resumoDoRisco(id, r) {
  const x = r || {};
  return {
    id: String(id || x.id || ''),
    titulo: String(x.titulo || 'Risco sem título'),
    area: String(x.area || ''),
    nivel: nivelDoRisco(x),
    responsavel: String(x.responsavel || ''),
    origem: String(x.origem || ''),
    status: String(x.status || ''),
    justificativaEncerramento: _encerrado(x) ? String(x.justificativaEncerramento || '') : '',
  };
}

function _linhas(s) {
  return [
    ['Risco', s.titulo],
    ['Área', s.area || 'Corporativo (sem área)'],
    ['Nível', s.nivel || 'Não avaliado'],
    ['Responsável', s.responsavel || 'Não definido'],
    ['Origem', s.origem],
    ['Status', s.status],
    ['Justificativa do encerramento', s.justificativaEncerramento],
  ].filter(([, v]) => String(v || '').trim() !== '');
}

/** { assunto, html, texto } de um risco registrado ou encerrado (um destinatario). */
function montarEmailRisco(risco, evento, opts) {
  const o = opts || {};
  const s = resumoDoRisco(o.id, risco);
  const novo = evento && evento.tipo === TIPO.NOVO;
  const assunto = novo ? `[Riscos] Novo risco registrado: ${s.titulo}` : `[Riscos] Risco encerrado: ${s.titulo}`;
  const frase = novo
    ? `Um novo risco foi registrado no Registro de Riscos${s.nivel ? `, com nível ${s.nivel}` : ''}.`
    : 'Um risco foi encerrado no Registro de Riscos.';
  const url = linkRisco(s.id, o.baseUrl);
  const linhas = _linhas(s);
  const tabela = `<table style="border-collapse:collapse;width:100%;">${linhas.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e0e0e0;background:#f6f4f2;font-weight:700;width:180px;">${N.esc(k)}</td><td style="padding:6px 10px;border:1px solid #e0e0e0;white-space:pre-line;">${N.esc(v)}</td></tr>`).join('')}</table>`;
  const rodape = _textoMotivos(o.motivos);
  const html = N._envelopeHtml(
    N._cabecalhoHtml(novo ? 'Novo risco registrado' : 'Risco encerrado')
    + `<p style="font-size:15px;">${N.esc(frase)}</p>` + tabela
    + '<p>A descrição, o plano de ação e a avaliação completa ficam no sistema.</p>'
    + N._botao(url, 'Abrir no BIA'), rodape);
  const texto = [frase, '', ...linhas.map(([k, v]) => `${k}: ${v}`), '', `Abrir no BIA: ${url}`, '', rodape].join('\n');
  return { assunto, html, texto };
}

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA'. */
function _dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * { assunto, html, texto } do resumo diario de um destinatario.
 * eventos: [{ tipo, risco: resumoDoRisco(...) }] -- os da automacao, de um ou mais dias.
 */
function montarResumoDiarioRiscos(eventos, opts) {
  const o = opts || {};
  const lista = (eventos || []).filter((e) => e && e.risco);
  const novos = lista.filter((e) => e.tipo === TIPO.NOVO);
  const encerrados = lista.filter((e) => e.tipo === TIPO.ENCERRADO);
  const dia = _dataBR(o.dia);
  const partes = [];
  if (novos.length) partes.push(`${novos.length} registrado(s)`);
  if (encerrados.length) partes.push(`${encerrados.length} encerrado(s)`);
  const assunto = `[Riscos] Resumo da automação${dia ? ` de ${dia}` : ''}: ${partes.join(', ') || 'sem mudanças'}`;
  let html = N._cabecalhoHtml(`Riscos da automação${dia ? ` — ${dia}` : ''}`)
    + '<p>Riscos abertos ou encerrados automaticamente (vulnerabilidades, fornecedores e indicadores) desde o último resumo. O detalhe fica no sistema.</p>';
  const textoLinhas = [`Riscos da automação${dia ? ` — ${dia}` : ''}`, ''];
  [['Registrados pela automação', novos], ['Encerrados pela automação', encerrados]].forEach(([titulo, itens]) => {
    if (!itens.length) return;
    html += `<h2 style="font-size:15px;color:#d60014;margin:22px 0 8px;">${N.esc(titulo)} (${itens.length})</h2><ul style="padding-left:18px;margin:0;">`
      + itens.map((e) => {
        const s = e.risco;
        const detalhe = [s.area || 'Corporativo', s.nivel ? `nível ${s.nivel}` : '', s.responsavel ? `resp. ${s.responsavel}` : '', s.origem].filter(Boolean).join(' · ');
        return `<li style="margin-bottom:6px;"><a href="${N.esc(linkRisco(s.id, o.baseUrl))}" style="color:#2a2623;font-weight:700;">${N.esc(s.titulo)}</a>`
          + `<br><span style="color:#5c5550;">${N.esc(detalhe)}</span></li>`;
      }).join('')
      + '</ul>';
    textoLinhas.push(titulo.toUpperCase());
    itens.forEach((e) => textoLinhas.push(`- ${e.risco.titulo} (${e.risco.area || 'Corporativo'}${e.risco.nivel ? `, ${e.risco.nivel}` : ''}) — ${linkRisco(e.risco.id, o.baseUrl)}`));
    textoLinhas.push('');
  });
  html += N._botao(`${String(o.baseUrl || N.URL_BASE_PADRAO).replace(/\/+$/, '')}/#riscos`, 'Abrir o Registro de Riscos');
  const rodape = _textoMotivos(o.motivos);
  textoLinhas.push(rodape);
  return { assunto, html: N._envelopeHtml(html, rodape), texto: textoLinhas.join('\n') };
}

/**
 * Agrupa os eventos pendentes do resumo por destinatario.
 * eventos: [{ tipo, risco }]; destinatariosDe(risco) -> [{ email, motivos[] }].
 * Devolve Map(email -> { motivos: [], eventos: [] }).
 */
function agruparResumoPorDestinatario(eventos, destinatariosDe) {
  const por = new Map();
  (eventos || []).forEach((ev) => {
    (destinatariosDe(ev.risco) || []).forEach((d) => {
      if (!por.has(d.email)) por.set(d.email, { motivos: [], eventos: [] });
      const x = por.get(d.email);
      d.motivos.forEach((m) => { if (!x.motivos.includes(m)) x.motivos.push(m); });
      x.eventos.push(ev);
    });
  });
  return por;
}

module.exports = {
  TIPO, PREFIXO_AUTOMACAO, REMETENTE,
  decidirEventoRisco, resolverDestinatariosRisco, nivelDoRisco, linkRisco, resumoDoRisco,
  montarEmailRisco, montarResumoDiarioRiscos, agruparResumoPorDestinatario,
};
