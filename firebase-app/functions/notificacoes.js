/**
 * Alertas de contrato por e-mail (DECISAO 16/10/2026, Hercules).
 *
 * So regra -- sem Firestore e sem SMTP -- para poder ser testado. Quem le o
 * banco e grava a fila e functions/index.js; quem envia e transporteEmail.js.
 *
 *   - Envio por SMTP do Google Workspace, com conta dedicada (segredos
 *     SMTP_USUARIO/SMTP_SENHA). Fila de saida em `notificacoes_email`: um
 *     documento por e-mail, com o resultado do envio gravado nele.
 *   - Destinatarios: gestor do contrato (Pessoa), responsavel da area do
 *     contrato e usuarios com perfil Operador Administrativo. So enderecos do
 *     dominio corporativo -- trava contra mandar dado interno para fora.
 *   - Formato: urgentes na hora (varredura diaria) + resumo mensal (dia 1).
 *   - Alertas: prazos (vence em 30, vencido, janela de aviso, aviso perdido),
 *     renovacao automatica executada e reajuste (este, so no resumo).
 *
 * O E-MAIL NAO LEVA VALOR DO CONTRATO: o gestor indicado pode nem ter acesso
 * ao sistema, e e-mail sai do controle das regras do banco. Leva codigo,
 * objeto, fornecedor, datas, prazo e o link.
 *
 * IDEMPOTENCIA: cada e-mail tem uma CHAVE de evento que inclui a data que o
 * originou (fim do contrato, data-limite do aviso). O id do documento na fila
 * e um hash da chave + destinatario, gravado com create(): rodar a varredura
 * de novo nao repete o e-mail, e depois de uma renovacao a data muda e o ciclo
 * recomeca sozinho.
 */
const crypto = require('node:crypto');
const CC = require('./contratoCiclo');

const DOMINIO = '@fortestecnologia.com.br';
const URL_BASE_PADRAO = 'https://bia-forte-2025.web.app';
const COLECAO_FILA = 'notificacoes_email';
const DOC_CONFIG = 'config_notificacoes/contratos';
const MAX_TENTATIVAS = 3;

const MODO = { DESLIGADO: 'desligado', SIMULACAO: 'simulacao', ATIVO: 'ativo' };
const GRUPO = { PRAZOS: 'prazos', RENOVACAO_REAJUSTE: 'renovacaoReajuste', RESUMO: 'resumoMensal' };
const STATUS = {
  PENDENTE: 'pendente', ENVIADO: 'enviado', SIMULADO: 'simulado', ERRO: 'erro',
  SEM_DESTINATARIO: 'sem_destinatario', IGNORADO: 'ignorado',
};

const CONFIG_PADRAO = {
  modo: MODO.DESLIGADO,
  remetenteNome: 'GRC360 · Contratos',
  responderPara: '',
  grupos: { prazos: true, renovacaoReajuste: true, resumoMensal: true },
  destinatarios: { gestor: true, area: true, operadores: true },
  // Servidor SMTP (16/10/2026: SendGrid). Usuario/senha ficam nos segredos.
  servidor: { provedor: 'sendgrid', host: '', porta: null, remetenteEmail: '' },
};
const PROVEDORES_SMTP = ['sendgrid', 'gmail', 'outro'];

/** Configuracao no formato canonico (o que faltar vem do padrao; o modo padrao e desligado). */
function normalizarConfig(c) {
  const x = c && typeof c === 'object' ? c : {};
  const bool = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
  const g = x.grupos || {}, d = x.destinatarios || {};
  const resp = String(x.responderPara || '').trim().toLowerCase();
  const sv = x.servidor || {};
  const provedor = PROVEDORES_SMTP.includes(sv.provedor) ? sv.provedor : 'sendgrid';
  const remetente = String(sv.remetenteEmail || '').trim().toLowerCase();
  const porta = Number(sv.porta);
  return {
    modo: Object.values(MODO).includes(x.modo) ? x.modo : MODO.DESLIGADO,
    remetenteNome: String(x.remetenteNome || '').trim() || CONFIG_PADRAO.remetenteNome,
    responderPara: emailCorporativo(resp) ? resp : '',
    grupos: {
      prazos: bool(g.prazos, true),
      renovacaoReajuste: bool(g.renovacaoReajuste, true),
      resumoMensal: bool(g.resumoMensal, true),
    },
    destinatarios: {
      gestor: bool(d.gestor, true),
      area: bool(d.area, true),
      operadores: bool(d.operadores, true),
    },
    servidor: {
      provedor,
      host: provedor === 'outro' ? String(sv.host || '').trim() : '',
      porta: provedor === 'outro' && Number.isInteger(porta) && porta > 0 && porta < 65536 ? porta : null,
      // Mesma trava dos destinatarios: so remetente do dominio corporativo.
      remetenteEmail: emailCorporativo(remetente) ? remetente : '',
    },
  };
}

function emailCorporativo(email) {
  const e = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.endsWith(DOMINIO);
}

/** Id do documento na fila: hash da chave do evento + destinatario (create() barra a repeticao). */
function idNaFila(chave, email) {
  return crypto.createHash('sha1').update(String(chave) + '|' + String(email).toLowerCase()).digest('hex');
}

// ------------------------------------------------------------
// Urgentes (varredura diaria)
// ------------------------------------------------------------

/**
 * Eventos urgentes do contrato em `hoje`. `contrato` ja com a renovacao
 * automatica aplicada, se houve; `renovacao` e o que a varredura aplicou
 * agora (ou null). So contrato vigente notifica.
 * Devolve [{ evento, grupo, chave, dias }].
 */
function decidirUrgentes(contrato, opts) {
  const o = opts || {};
  const c = contrato || {};
  const id = String(c.id || '');
  const eventos = [];
  if (!id || o.situacao !== CC.SITUACAO.VIGENTE) return eventos;

  if (o.renovacao && o.renovacao.dataFim) {
    eventos.push({ evento: 'renovado', grupo: GRUPO.RENOVACAO_REAJUSTE, chave: `${id}:renovado:${o.renovacao.dataFim}`, ciclos: o.renovacao.ciclos || 1 });
  }

  const alertas = CC.calcularAlertas(c, { hoje: o.hoje, situacao: o.situacao });
  const limite = CC.dataLimiteAviso(c);
  alertas.forEach((a) => {
    // Contrato com renovacao automatica nao "vence": o que importa nele e o
    // prazo de aviso. Avisar "vence em 30 dias" seria ruido.
    if (a.codigo === CC.ALERTA.VENCE_EM && a.faixa === 30 && !c.renovacaoAutomatica) {
      eventos.push({ evento: 'vence30', grupo: GRUPO.PRAZOS, chave: `${id}:vence30:${c.dataFim}`, dias: a.dias });
    } else if (a.codigo === CC.ALERTA.VENCIDO && !c.renovacaoAutomatica) {
      eventos.push({ evento: 'vencido', grupo: GRUPO.PRAZOS, chave: `${id}:vencido:${c.dataFim}`, dias: a.dias });
    } else if (a.codigo === CC.ALERTA.JANELA_CANCELAMENTO) {
      // Chegou a 7 dias: so o lembrete final (se a janela ja abriu com <= 7,
      // o aviso de "janela aberta" seria redundante no mesmo dia).
      eventos.push(a.dias <= 7
        ? { evento: 'janela7', grupo: GRUPO.PRAZOS, chave: `${id}:janela7:${limite}`, dias: a.dias }
        : { evento: 'janela', grupo: GRUPO.PRAZOS, chave: `${id}:janela:${limite}`, dias: a.dias });
    } else if (a.codigo === CC.ALERTA.AVISO_PERDIDO) {
      eventos.push({ evento: 'avisoPerdido', grupo: GRUPO.PRAZOS, chave: `${id}:avisoPerdido:${limite}`, dias: a.dias });
    }
  });
  return eventos;
}

// ------------------------------------------------------------
// Destinatarios
// ------------------------------------------------------------

/**
 * [{ email, motivos[] }] do contrato, sem repetir endereco.
 * ctx: { pessoas: [{id, email}], areas: [{nome, email}], operadores: [email], config }.
 * `incluirOperadores` false no resumo por destinatario (operador recebe o
 * resumo geral, montado a parte).
 */
function resolverDestinatarios(contrato, ctx, incluirOperadores) {
  const c = contrato || {};
  const x = ctx || {};
  const cfg = normalizarConfig(x.config);
  const por = new Map();
  const add = (email, motivo) => {
    const e = String(email || '').trim().toLowerCase();
    if (!emailCorporativo(e)) return;
    if (!por.has(e)) por.set(e, { email: e, motivos: [] });
    if (!por.get(e).motivos.includes(motivo)) por.get(e).motivos.push(motivo);
  };
  if (cfg.destinatarios.gestor && c.gestor && c.gestor.id) {
    const p = (x.pessoas || []).find((pp) => String(pp.id) === String(c.gestor.id));
    if (p) add(p.email, 'gestor');
  }
  if (cfg.destinatarios.area && c.area) {
    const a = (x.areas || []).find((aa) => aa.nome === c.area);
    if (a) add(a.email, 'area');
  }
  if (incluirOperadores !== false && cfg.destinatarios.operadores) {
    (x.operadores || []).forEach((e) => add(e, 'operador'));
  }
  return [...por.values()];
}

/** E-mails de quem tem o perfil Operador (perfis[] ou o campo legado `perfil`). */
function emailsDeOperadores(configPerfis) {
  return (configPerfis || []).filter((d) => {
    const lista = Array.isArray(d.perfis) ? d.perfis : (d.perfil ? [d.perfil] : []);
    return lista.some((p) => String(p || '').trim().toLowerCase() === 'operador');
  }).map((d) => String(d.email || d.id || '').toLowerCase()).filter(emailCorporativo);
}

// ------------------------------------------------------------
// Conteudo
// ------------------------------------------------------------

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

const MOTIVO_TEXTO = {
  gestor: 'gestor deste contrato',
  area: 'responsável pela área do contrato',
  operador: 'Operador Administrativo de contratos',
};

function _textoMotivos(motivos) {
  const t = (motivos || []).map((m) => MOTIVO_TEXTO[m]).filter(Boolean);
  return t.length ? 'Você recebe este aviso como ' + t.join(' e ') + '.' : '';
}

function linkContrato(id, baseUrl) {
  return `${String(baseUrl || URL_BASE_PADRAO).replace(/\/+$/, '')}/#contratos?contrato=${encodeURIComponent(String(id || ''))}`;
}

/** Assunto e frase principal de cada evento urgente. */
function _textoEvento(ev, c) {
  const dias = Math.abs(Number(ev.dias) || 0);
  const codigo = c.codigo || 'Contrato';
  const limite = dataBR(CC.dataLimiteAviso(c));
  switch (ev.evento) {
    case 'vence30': return {
      assunto: `[Contratos] ${codigo} vence em ${dias} dia(s) (${dataBR(c.dataFim)})`,
      frase: `O contrato vence em ${dias} dia(s), em ${dataBR(c.dataFim)}, e não tem renovação automática. Decida se ele será renovado, substituído ou encerrado.`,
    };
    case 'vencido': return {
      assunto: `[Contratos] ${codigo} venceu em ${dataBR(c.dataFim)}`,
      frase: `O contrato venceu em ${dataBR(c.dataFim)} e continua com status vigente no sistema. Registre a renovação ou o encerramento.`,
    };
    case 'janela': return {
      assunto: `[Contratos] ${codigo}: prazo para avisar cancelamento termina em ${dias} dia(s)`,
      frase: `O contrato renova automaticamente. Se a empresa não quiser renovar, o aviso de cancelamento precisa ser enviado ao fornecedor até ${limite} (faltam ${dias} dia(s)).`,
    };
    case 'janela7': return {
      assunto: `[Contratos] ⚠️ ${codigo}: faltam ${dias} dia(s) para avisar cancelamento`,
      frase: dias === 0
        ? `Hoje (${limite}) é o último dia para enviar o aviso de cancelamento. Depois disso, o contrato renova automaticamente.`
        : `Faltam ${dias} dia(s) para o fim do prazo de aviso de cancelamento (${limite}). Depois disso, o contrato renova automaticamente.`,
    };
    case 'avisoPerdido': return {
      assunto: `[Contratos] ${codigo}: prazo de aviso encerrado — renovará em ${dataBR(CC.somarDias(c.dataFim, 1))}`,
      frase: `O prazo para avisar o cancelamento terminou em ${limite}. O contrato renovará automaticamente ao fim da vigência (${dataBR(c.dataFim)}).`,
    };
    case 'renovado': return {
      assunto: `[Contratos] ${codigo} renovado automaticamente até ${dataBR(c.dataFim)}`,
      frase: `O sistema registrou a renovação automática do contrato. Novo período: ${dataBR(c.dataUltimaRenovacao)} a ${dataBR(c.dataFim)}${ev.ciclos > 1 ? ` (${ev.ciclos} períodos aplicados de uma vez)` : ''}.`,
    };
    default: return { assunto: `[Contratos] ${codigo}`, frase: '' };
  }
}

function _cabecalhoHtml(titulo) {
  return `<div style="border-bottom:3px solid #d60014;padding-bottom:10px;margin-bottom:18px;">
  <img src="${URL_BASE_PADRAO}/logo_fortes.png" style="height:34px;display:block;margin-bottom:4px;" alt="Fortes Tecnologia">
  <div style="font-size:12px;color:#d60014;font-weight:700;letter-spacing:0.3px;">GRC360 · Governança, Riscos e Conformidade</div>
  <h1 style="font-size:20px;color:#2a2623;margin:10px 0 0;">${esc(titulo)}</h1>
</div>`;
}

function _envelopeHtml(conteudo, rodape) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4f2;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#2a2623;">
${conteudo}
<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px;margin-top:24px;">${esc(rodape)} E-mail automático do GRC360 — não responda a este endereço, a não ser que ele indique outro para resposta.</p>
</div></body></html>`;
}

function _botao(url, rotulo) {
  return `<p style="margin:20px 0;"><a href="${esc(url)}" style="background:#d60014;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:7px;font-weight:700;display:inline-block;">${esc(rotulo)}</a></p>`;
}

/** Linhas de identificacao do contrato (sem valor). */
function _linhasContrato(c, nomes) {
  const n = nomes || {};
  const linhas = [
    ['Contrato', `${c.codigo || ''} — ${c.objeto || ''}`],
    ['Fornecedor', c.fornecedorNome],
    ['Tipo', n.tipo],
    ['Área responsável', c.area],
    ['Gestor', c.gestor && c.gestor.nome],
    ['Vigência', `${dataBR(c.dataUltimaRenovacao || c.dataInicio)} a ${dataBR(c.dataFim)}`],
    ['Renovação automática', c.renovacaoAutomatica ? 'Sim' : 'Não'],
  ];
  if (c.renovacaoAutomatica && !c.cancelamentoQualquerMomento && Number(c.avisoCancelamentoDias) > 0) {
    linhas.push(['Aviso de cancelamento', `${c.avisoCancelamentoDias} dia(s) antes — até ${dataBR(CC.dataLimiteAviso(c))}`]);
  }
  return linhas.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
}

/** { assunto, html, texto } de um evento urgente para um destinatario. */
function montarEmailUrgente(contrato, ev, opts) {
  const o = opts || {};
  const c = contrato || {};
  const { assunto, frase } = _textoEvento(ev, c);
  const url = linkContrato(c.id, o.baseUrl);
  const linhas = _linhasContrato(c, o.nomes);
  const tabela = `<table style="border-collapse:collapse;width:100%;">${linhas.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e0e0e0;background:#f6f4f2;font-weight:700;width:180px;">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #e0e0e0;">${esc(v)}</td></tr>`).join('')}</table>`;
  const rodape = _textoMotivos(o.motivos);
  const html = _envelopeHtml(
    _cabecalhoHtml(assunto.replace(/^\[Contratos\]\s*/, '')) +
    `<p style="font-size:15px;">${esc(frase)}</p>` + tabela + _botao(url, 'Abrir contrato'), rodape);
  const texto = [frase, '', ...linhas.map(([k, v]) => `${k}: ${v}`), '', `Abrir contrato: ${url}`, '', rodape].join('\n');
  return { assunto, html, texto };
}

// ------------------------------------------------------------
// Resumo mensal
// ------------------------------------------------------------

const SECOES_RESUMO = [
  { chave: 'vencimentos', titulo: 'Vencimentos nos próximos 90 dias' },
  { chave: 'avisos', titulo: 'Prazos de aviso de cancelamento' },
  { chave: 'reajustes', titulo: 'Reajustes neste mês e no próximo' },
  { chave: 'renovados', titulo: 'Renovações automáticas no mês passado' },
];

/**
 * Itens do resumo de um contrato: [{ secao, texto }]. Grupos desligados na
 * configuracao ficam de fora. `renovacoesMesAnterior`: datas (ISO) das
 * renovacoes automaticas deste contrato no mes anterior.
 */
function itensDoResumo(contrato, opts) {
  const o = opts || {};
  const c = contrato || {};
  if (o.situacao !== CC.SITUACAO.VIGENTE) return [];
  const cfg = normalizarConfig(o.config);
  const n = o.nomes || {};
  const itens = [];
  const alertas = CC.calcularAlertas(c, { hoje: o.hoje, situacao: o.situacao });
  if (cfg.grupos.prazos) {
    alertas.forEach((a) => {
      if (a.codigo === CC.ALERTA.VENCIDO || a.codigo === CC.ALERTA.VENCE_EM) {
        itens.push({ secao: 'vencimentos', texto: `${a.rotulo} (fim ${dataBR(c.dataFim)}${c.renovacaoAutomatica ? ', renovação automática' : ''})` });
      } else if (a.codigo === CC.ALERTA.JANELA_CANCELAMENTO || a.codigo === CC.ALERTA.AVISO_PERDIDO) {
        itens.push({ secao: 'avisos', texto: `${a.rotulo} (data-limite ${dataBR(CC.dataLimiteAviso(c))})` });
      }
    });
  }
  if (cfg.grupos.renovacaoReajuste) {
    if (alertas.some((a) => a.codigo === CC.ALERTA.REAJUSTE_PROXIMO)) {
      const mes = CC.MESES[Number(c.mesReajuste) - 1] || '';
      itens.push({ secao: 'reajustes', texto: `Reajuste em ${mes}${n.indexador ? ' pelo ' + n.indexador : ''}` });
    }
    (o.renovacoesMesAnterior || []).forEach((d) => {
      itens.push({ secao: 'renovados', texto: `Renovado automaticamente em ${dataBR(d)} (vigente até ${dataBR(c.dataFim)})` });
    });
  }
  return itens;
}

/**
 * { assunto, html, texto } do resumo de um destinatario.
 * entradas: [{ contrato, itens: [{secao, texto}] }] -- so as que tem item.
 */
function montarResumoMensal(entradas, opts) {
  const o = opts || {};
  const mesAno = o.mesAno || '';
  const lista = (entradas || []).filter((e) => e && e.itens && e.itens.length);
  const assunto = `[Contratos] Resumo de ${mesAno}: ${lista.length} contrato(s) pedem atenção`;
  let html = _cabecalhoHtml(`Resumo de contratos — ${mesAno}`)
    + '<p>Situação dos contratos em que você é gestor, responsável pela área ou operador. O detalhe e as ações ficam no sistema.</p>';
  const textoLinhas = [`Resumo de contratos — ${mesAno}`, ''];
  SECOES_RESUMO.forEach((s) => {
    const daSecao = [];
    lista.forEach((e) => e.itens.filter((i) => i.secao === s.chave).forEach((i) => daSecao.push({ c: e.contrato, texto: i.texto })));
    if (!daSecao.length) return;
    html += `<h2 style="font-size:15px;color:#d60014;margin:22px 0 8px;">${esc(s.titulo)}</h2><ul style="padding-left:18px;margin:0;">`
      + daSecao.map((x) => `<li style="margin-bottom:6px;"><a href="${esc(linkContrato(x.c.id, o.baseUrl))}" style="color:#2a2623;font-weight:700;">${esc(x.c.codigo)} — ${esc(x.c.objeto)}</a>`
        + `<span style="color:#5c5550;"> · ${esc(x.c.fornecedorNome || '')}</span><br><span>${esc(x.texto)}</span></li>`).join('')
      + '</ul>';
    textoLinhas.push(s.titulo.toUpperCase());
    daSecao.forEach((x) => textoLinhas.push(`- ${x.c.codigo} — ${x.c.objeto} (${x.c.fornecedorNome || ''}): ${x.texto} — ${linkContrato(x.c.id, o.baseUrl)}`));
    textoLinhas.push('');
  });
  html += _botao(`${String(o.baseUrl || URL_BASE_PADRAO).replace(/\/+$/, '')}/#contratos`, 'Abrir a tela de Contratos');
  const rodape = _textoMotivos(o.motivos);
  textoLinhas.push(rodape);
  return { assunto, html: _envelopeHtml(html, rodape), texto: textoLinhas.join('\n') };
}

/** 'AAAA-MM' -> 'outubro de 2026'. */
function mesPorExtenso(anoMes) {
  const m = /^(\d{4})-(\d{2})/.exec(String(anoMes || ''));
  if (!m) return '';
  return `${CC.MESES[Number(m[2]) - 1].toLowerCase()} de ${m[1]}`;
}

/** Mes anterior a `hoje` como { inicio, fim } ISO. */
function mesAnterior(hoje) {
  const inicioMesAtual = String(hoje || CC.hojeIso()).slice(0, 7) + '-01';
  const inicio = CC.somarMeses(inicioMesAtual, -1);
  return { inicio, fim: CC.somarDias(inicioMesAtual, -1) };
}

// ------------------------------------------------------------
// Envio (o gatilho chama com o transporte de verdade; o teste, com um falso)
// ------------------------------------------------------------

/**
 * Resultado do envio de um documento da fila, como patch para gravar nele.
 * enviar(msg) -> Promise; so e chamado no modo ativo.
 */
async function processarEnvio(doc, config, enviar) {
  const d = doc || {};
  const cfg = normalizarConfig(config);
  const agora = new Date().toISOString();
  if (d.status !== STATUS.PENDENTE) return null;
  if (!d.para) return { status: STATUS.SEM_DESTINATARIO, processadoEm: agora };
  if (cfg.modo === MODO.DESLIGADO) return { status: STATUS.IGNORADO, processadoEm: agora, erro: 'Envio desligado na configuração.' };
  if (cfg.modo === MODO.SIMULACAO) return { status: STATUS.SIMULADO, processadoEm: agora };
  const tentativas = (Number(d.tentativas) || 0) + 1;
  try {
    await enviar({
      de: cfg.remetenteNome, para: d.para, responderPara: cfg.responderPara,
      assunto: d.assunto, html: d.html, texto: d.texto,
    });
    return { status: STATUS.ENVIADO, enviadoEm: agora, processadoEm: agora, tentativas, erro: '' };
  } catch (err) {
    return { status: STATUS.ERRO, processadoEm: agora, tentativas, erro: String((err && err.message) || err).slice(0, 500) };
  }
}

/** Documento com erro pode voltar para a fila? */
function podeReenviar(doc) {
  return !!doc && doc.status === STATUS.ERRO && (Number(doc.tentativas) || 0) < MAX_TENTATIVAS;
}

module.exports = {
  DOMINIO, URL_BASE_PADRAO, COLECAO_FILA, DOC_CONFIG, MAX_TENTATIVAS,
  MODO, GRUPO, STATUS, CONFIG_PADRAO, SECOES_RESUMO, PROVEDORES_SMTP,
  normalizarConfig, emailCorporativo, idNaFila,
  decidirUrgentes, resolverDestinatarios, emailsDeOperadores,
  montarEmailUrgente, itensDoResumo, montarResumoMensal, mesPorExtenso, mesAnterior,
  linkContrato, processarEnvio, podeReenviar,
};
