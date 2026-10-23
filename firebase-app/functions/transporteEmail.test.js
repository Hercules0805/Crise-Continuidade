const { test } = require('node:test');
const assert = require('node:assert');
const T = require('./transporteEmail');

/** nodemailer falso: guarda as opcoes do transporte e de cada envio. */
function falso(erroNoEnvio) {
  const capturado = { transporte: null, envios: [] };
  const nodemailer = {
    createTransport(opts) {
      capturado.transporte = opts;
      return {
        async sendMail(m) {
          if (erroNoEnvio) throw erroNoEnvio;
          capturado.envios.push(m);
          return { messageId: 'x' };
        },
      };
    },
  };
  return { capturado, deps: { nodemailer } };
}

const MSG = { de: 'BIA · Contratos', para: 'a@fortestecnologia.com.br', assunto: 'Assunto', html: '<p>x</p>', texto: 'x' };
const SENDGRID = { provedor: 'sendgrid', remetenteEmail: 'Alertas@fortestecnologia.com.br' };

test('SendGrid: smtp.sendgrid.net:587 com STARTTLS, usuario apikey e a API Key como senha', async () => {
  const { capturado, deps } = falso();
  await T.criarEnviador({ usuario: 'apikey', senha: 'SG.abc', servidor: SENDGRID }, deps)(MSG);
  assert.deepStrictEqual(capturado.transporte, {
    host: 'smtp.sendgrid.net', port: 587, secure: false, requireTLS: true, auth: { user: 'apikey', pass: 'SG.abc' },
  });
});

test('SendGrid: From e o remetente verificado (nao "apikey") e o rastreamento de clique/abertura vai desligado', async () => {
  const { capturado, deps } = falso();
  await T.criarEnviador({ usuario: 'apikey', senha: 'SG.abc', servidor: SENDGRID }, deps)({ ...MSG, responderPara: 'contratos@fortestecnologia.com.br' });
  const m = capturado.envios[0];
  assert.strictEqual(m.from, '"BIA · Contratos" <alertas@fortestecnologia.com.br>');
  assert.strictEqual(m.replyTo, 'contratos@fortestecnologia.com.br');
  const filtros = JSON.parse(m.headers['X-SMTPAPI']).filters;
  assert.strictEqual(filtros.clicktrack.settings.enable, 0);
  assert.strictEqual(filtros.opentrack.settings.enable, 0);
});

test('SendGrid sem remetente: erro claro, sem tentar enviar', async () => {
  const { capturado, deps } = falso();
  const enviar = T.criarEnviador({ usuario: 'apikey', senha: 'SG.abc', servidor: { provedor: 'sendgrid' } }, deps);
  await assert.rejects(() => enviar(MSG), /Informe o e-mail do remetente/);
  assert.strictEqual(capturado.transporte, null);
});

test('Gmail: smtp.gmail.com:465 TLS; sem remetente, o From e a propria conta; senha de app sem espacos', async () => {
  const { capturado, deps } = falso();
  await T.criarEnviador({ usuario: 'alertas@fortestecnologia.com.br', senha: 'abcd efgh ijkl mnop', servidor: { provedor: 'gmail' } }, deps)(MSG);
  assert.strictEqual(capturado.transporte.host, 'smtp.gmail.com');
  assert.strictEqual(capturado.transporte.port, 465);
  assert.strictEqual(capturado.transporte.secure, true);
  assert.strictEqual(capturado.transporte.auth.pass, 'abcdefghijklmnop');
  assert.strictEqual(capturado.envios[0].from, '"BIA · Contratos" <alertas@fortestecnologia.com.br>');
  assert.strictEqual(capturado.envios[0].headers, undefined, 'cabecalho do SendGrid so no SendGrid');
});

test('Outro SMTP: usa host e porta informados; sem host, erro', async () => {
  const { capturado, deps } = falso();
  await T.criarEnviador({ usuario: 'u@fortestecnologia.com.br', senha: 's', servidor: { provedor: 'outro', host: 'mail.empresa.com', porta: 465 } }, deps)(MSG);
  assert.deepStrictEqual([capturado.transporte.host, capturado.transporte.port, capturado.transporte.secure], ['mail.empresa.com', 465, true]);
  const semHost = T.criarEnviador({ usuario: 'u@fortestecnologia.com.br', senha: 's', servidor: { provedor: 'outro' } }, falso().deps);
  await assert.rejects(() => semHost(MSG), /Servidor SMTP não informado/);
});

test('provedor ausente ou desconhecido cai no SendGrid (o escolhido)', () => {
  assert.strictEqual(T.resolverServidor(null).host, 'smtp.sendgrid.net');
  assert.strictEqual(T.resolverServidor({ provedor: 'xpto' }).provedor, 'sendgrid');
});

test('segredo ausente ou "pendente": avisa o que falta', async () => {
  await assert.rejects(() => T.criarEnviador({ usuario: 'apikey', senha: 'pendente', servidor: SENDGRID })(MSG), /SMTP não configurado/);
  await assert.rejects(() => T.criarEnviador({})(MSG), /SMTP não configurado/);
});

test('erros do SMTP viram mensagem que a pessoa entende', async () => {
  const e535 = Object.assign(new Error('Invalid login'), { response: '535 Authentication failed: Bad username / password' });
  const { deps } = falso(e535);
  await assert.rejects(() => T.criarEnviador({ usuario: 'apikey', senha: 'SG.x', servidor: SENDGRID }, deps)(MSG), /Credencial SMTP recusada/);
  const e550 = new Error('550 The from address does not match a verified Sender Identity.');
  await assert.rejects(() => T.criarEnviador({ usuario: 'apikey', senha: 'SG.x', servidor: SENDGRID }, falso(e550).deps)(MSG), /Remetente não verificado no SendGrid/);
  assert.match(T.traduzirErro(new Error('getaddrinfo ENOTFOUND smtp.x')), /Não foi possível conectar/);
});
