/**
 * Transporte de e-mail dos alertas de contrato.
 *
 * DECISAO 16/10/2026: SMTP. Primeiro previsto o Google Workspace; no mesmo dia
 * o usuario escolheu o SendGrid (credencial SMTP). Os dois ficam disponiveis,
 * escolhidos na tela (config_notificacoes/contratos `servidor.provedor`).
 *
 * Credencial nos segredos do Firebase, nunca no Firestore nem na tela:
 *   SMTP_USUARIO -- no SendGrid e a palavra literal "apikey"; no Gmail, a conta.
 *   SMTP_SENHA   -- no SendGrid, a API Key (permissao Mail Send); no Gmail, a senha de app.
 *
 * REMETENTE SEPARADO DO USUARIO: no SendGrid o usuario SMTP e "apikey", entao
 * o From vem de `servidor.remetenteEmail`, que precisa estar verificado no
 * SendGrid (Single Sender ou dominio autenticado) -- senao ele recusa.
 *
 * E o UNICO arquivo que conhece o provedor: a fila (notificacoes_email), as
 * regras (notificacoes.js) e a tela nao mudam se ele for trocado.
 */
const nodemailerPadrao = require('nodemailer');

const PROVEDORES = {
  sendgrid: { host: 'smtp.sendgrid.net', porta: 587 },
  gmail: { host: 'smtp.gmail.com', porta: 465 },
};

// SendGrid reescreve os links para medir cliques (e poe um pixel de
// abertura). O botao "Abrir contrato" passaria por um dominio do SendGrid --
// desligado so nestes e-mails, sem depender da configuracao da conta.
const CABECALHO_SENDGRID = JSON.stringify({
  filters: {
    clicktrack: { settings: { enable: 0 } },
    opentrack: { settings: { enable: 0 } },
  },
});

function _emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

/** host/porta/TLS efetivos do servidor configurado. */
function resolverServidor(servidor) {
  const s = servidor || {};
  const provedor = PROVEDORES[s.provedor] ? s.provedor : (s.provedor === 'outro' ? 'outro' : 'sendgrid');
  const host = provedor === 'outro' ? String(s.host || '').trim() : PROVEDORES[provedor].host;
  const porta = provedor === 'outro' ? (Number(s.porta) || 587) : PROVEDORES[provedor].porta;
  return { provedor, host, porta, secure: porta === 465 };
}

/** Mensagem que a pessoa entende para os erros mais comuns do SMTP. */
function traduzirErro(err) {
  const msg = String((err && (err.response || err.message)) || err || '');
  if (/\b535\b/.test(msg) || /authentication failed|username and password not accepted|invalid login/i.test(msg)) {
    return 'Credencial SMTP recusada: confira os segredos SMTP_USUARIO e SMTP_SENHA (no SendGrid: usuário "apikey" e uma API Key com permissão Mail Send).';
  }
  if (/verified sender identity|sender identity|from address does not match/i.test(msg)) {
    return 'Remetente não verificado no SendGrid: verifique o e-mail do remetente em Settings ▸ Sender Authentication.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNECTION/i.test(msg)) {
    return 'Não foi possível conectar ao servidor SMTP (' + msg.slice(0, 120) + ').';
  }
  return msg.slice(0, 500) || 'Erro desconhecido no envio.';
}

/**
 * Funcao enviar(msg) pronta para usar.
 * msg: { de (nome exibido), para, responderPara?, assunto, html, texto }.
 * deps.nodemailer: injetavel nos testes.
 */
function criarEnviador({ usuario, senha, servidor } = {}, deps) {
  const nodemailer = (deps && deps.nodemailer) || nodemailerPadrao;
  const user = String(usuario || '').trim();
  const pass = String(senha || '').trim();
  if (!user || !pass || user === 'pendente' || pass === 'pendente') {
    return async () => { throw new Error('SMTP não configurado: defina os segredos SMTP_USUARIO e SMTP_SENHA.'); };
  }
  const srv = resolverServidor(servidor);
  if (!srv.host) {
    return async () => { throw new Error('Servidor SMTP não informado: preencha o host na tela de Notificações.'); };
  }
  const remetenteConfigurado = String((servidor && servidor.remetenteEmail) || '').trim().toLowerCase();
  // Gmail: sem remetente informado, a propria conta. SendGrid: o usuario e "apikey", nao serve.
  const remetente = _emailValido(remetenteConfigurado) ? remetenteConfigurado : (_emailValido(user) ? user : '');
  if (!remetente) {
    return async () => { throw new Error('Informe o e-mail do remetente (verificado no SendGrid) na tela de Notificações.'); };
  }
  const transporte = nodemailer.createTransport({
    host: srv.host,
    port: srv.porta,
    secure: srv.secure,
    requireTLS: !srv.secure,
    // Senha de app do Gmail vem em grupos com espaco; a API Key do SendGrid nao tem espaco.
    auth: { user, pass: srv.provedor === 'gmail' ? pass.replace(/\s+/g, '') : pass },
  });
  return async (msg) => {
    const nome = String(msg.de || '').replace(/["<>]/g, '').trim();
    const opcoes = {
      from: nome ? `"${nome}" <${remetente}>` : remetente,
      to: msg.para,
      replyTo: msg.responderPara || undefined,
      subject: msg.assunto,
      html: msg.html,
      text: msg.texto,
    };
    if (srv.provedor === 'sendgrid') opcoes.headers = { 'X-SMTPAPI': CABECALHO_SENDGRID };
    try {
      return await transporte.sendMail(opcoes);
    } catch (err) {
      throw new Error(traduzirErro(err));
    }
  };
}

module.exports = { criarEnviador, resolverServidor, traduzirErro, PROVEDORES, CABECALHO_SENDGRID };
