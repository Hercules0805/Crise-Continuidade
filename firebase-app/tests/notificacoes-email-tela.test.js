// Notificacoes por e-mail (16/10/2026): configuracao, log da fila e previa.
// app.js real no jsdom, API trocada por um espiao.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const CONFIG = {
  modo: 'simulacao', remetenteNome: 'GRC360 · Contratos', responderPara: '',
  grupos: { prazos: true, renovacaoReajuste: false, resumoMensal: true },
  destinatarios: { gestor: true, area: false, operadores: true },
  servidor: { provedor: 'sendgrid', host: '', porta: null, remetenteEmail: 'alertas@fortestecnologia.com.br' },
  atualizadoEm: '2026-10-16T10:00:00.000Z', atualizadoPor: 'admin@fortestecnologia.com.br',
};
const FILA = Array.from({ length: 23 }, (_, i) => ({
  id: 'n' + i, tipo: 'urgente', evento: i === 0 ? 'janela7' : 'vence30', contratoId: 'c1', contratoCodigo: 'CT-000' + (i % 3),
  para: i === 1 ? '' : `p${i}@fortestecnologia.com.br`, motivos: ['gestor'], assunto: `[Contratos] assunto ${i}`,
  html: '<p>corpo <script>window.parent.__hack = 1</script></p>', texto: 'corpo',
  status: i === 0 ? 'erro' : (i === 1 ? 'sem_destinatario' : 'simulado'), tentativas: i === 0 ? 2 : 0,
  erro: i === 0 ? '535 auth failed' : '', criadoEm: `2026-10-${String(16 - (i % 10)).padStart(2, '0')}T05:00:00.000Z`,
}));

async function carregar(extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin';
  const gravacoes = [];
  const dados = Object.assign({ getConfigNotificacoes: CONFIG, getNotificacoesEmail: FILA }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir|enviar)/.test(nome)) {
        gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) });
        return nome === 'enviarEmailTeste' ? { success: true, para: 'admin@fortestecnologia.com.br' } : { success: true };
      }
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'subareas.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  return { w, doc: w.document, gravacoes };
}

test('tela de notificacoes e so do Admin', () => {
  const Perfis = require('../public/perfis.js');
  assert.strictEqual(Perfis.podeVerTela('admin', 'notificacoes-email'), true);
  ['seguranca', 'operador', 'gestor', 'ti'].forEach((p) => assert.strictEqual(Perfis.podeVerTela(p, 'notificacoes-email'), false, p));
});

test('carrega a configuracao gravada nos campos', async () => {
  const { w, doc } = await carregar();
  await w.notificacoesEmail();
  assert.strictEqual(doc.getElementById('notifModo').value, 'simulacao');
  assert.match(doc.getElementById('notifModoDica').textContent, /Simulação/);
  assert.strictEqual(doc.getElementById('notifGrupoRenovacao').checked, false);
  assert.strictEqual(doc.getElementById('notifDestArea').checked, false);
  assert.strictEqual(doc.getElementById('notifDestOperadores').checked, true);
  assert.match(doc.getElementById('notifAtualizado').textContent, /admin@fortestecnologia/);
});

test('salvar envia a configuracao; ligar o modo ativo pede confirmacao', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.notificacoesEmail();
  doc.getElementById('notifDestArea').checked = true;
  doc.getElementById('notifResponderPara').value = 'contratos@fortestecnologia.com.br';
  await w.salvarConfigNotificacoesTela();
  const g = gravacoes.find((x) => x.nome === 'salvarConfigNotificacoes').arg;
  assert.strictEqual(g.modo, 'simulacao');
  assert.strictEqual(g.destinatarios.area, true);
  assert.strictEqual(g.responderPara, 'contratos@fortestecnologia.com.br');

  let perguntou = 0;
  w.confirm = () => { perguntou++; return false; };
  doc.getElementById('notifModo').value = 'ativo';
  await w.salvarConfigNotificacoesTela();
  assert.strictEqual(perguntou, 1);
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarConfigNotificacoes').length, 1, 'cancelou: nao grava');
});

test('responder para de fora do dominio nao salva', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.notificacoesEmail();
  doc.getElementById('notifResponderPara').value = 'fulano@gmail.com';
  await w.salvarConfigNotificacoesTela();
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarConfigNotificacoes'));
  assert.match(w.__toasts.join(' '), /fortestecnologia/);
});

test('log: paginado em 20, filtro por status, erro mostra tentativas', async () => {
  const { w, doc } = await carregar();
  await w.notificacoesEmail();
  assert.strictEqual(doc.querySelectorAll('#notificacoesRows tr').length, 20);
  assert.match(doc.getElementById('notificacoesPaginacao').textContent, /Mostrando 1–20 de 23/);
  doc.getElementById('filtroNotificacaoStatus').value = 'erro';
  w.renderizarNotificacoesEmail();
  const linhas = doc.querySelectorAll('#notificacoesRows tr');
  assert.strictEqual(linhas.length, 1);
  assert.match(linhas[0].textContent, /Erro/);
  assert.match(linhas[0].textContent, /2 tentativa/);
  assert.match(linhas[0].textContent, /Últimos dias para avisar/);
});

test('previa: drawer com o e-mail num iframe sandbox (sem script), e o erro do envio', async () => {
  const { w, doc } = await carregar();
  await w.notificacoesEmail();
  w.abrirDrawerNotificacao('n0');
  assert.ok(doc.getElementById('drawerNotificacao').classList.contains('open'));
  const iframe = doc.getElementById('notificacaoPrevia');
  assert.strictEqual(iframe.getAttribute('sandbox'), '', 'sandbox vazio: sem script nem formulario');
  assert.match(iframe.srcdoc, /corpo/);
  assert.match(doc.getElementById('notificacaoDetalhes').textContent, /535 auth failed/);
  w.abrirDrawerNotificacao('n1');
  assert.match(doc.getElementById('notificacaoDetalhes').textContent, /sem destinatário/);
});

test('e-mail de teste chama a acao e avisa para quem foi', async () => {
  const { w, gravacoes } = await carregar();
  await w.notificacoesEmail();
  await w.enviarEmailTesteNotificacoes();
  assert.ok(gravacoes.some((x) => x.nome === 'enviarEmailTeste'));
  assert.match(w.__toasts.join(' '), /admin@fortestecnologia\.com\.br/);
});

test('fila vazia explica quando os e-mails comecam a aparecer', async () => {
  const { w, doc } = await carregar({ getNotificacoesEmail: [] });
  await w.notificacoesEmail();
  assert.match(doc.getElementById('notificacoesRows').textContent, /varredura diária \(05:00\)/);
});

// ---- Servidor de envio (16/10/2026: SendGrid) ----

test('servidor: carrega o SendGrid e o remetente, com a dica dos segredos (apikey + API Key)', async () => {
  const { w, doc } = await carregar();
  await w.notificacoesEmail();
  assert.strictEqual(doc.getElementById('notifProvedor').value, 'sendgrid');
  assert.strictEqual(doc.getElementById('notifRemetenteEmail').value, 'alertas@fortestecnologia.com.br');
  assert.strictEqual(doc.getElementById('notifHostWrap').style.display, 'none');
  assert.match(doc.getElementById('notifSegredosDica').textContent, /SMTP_USUARIO = apikey/);
  assert.match(doc.getElementById('notifRemetenteDica').textContent, /verificado no SendGrid/);
});

test('servidor: salvar leva provedor e remetente; SendGrid sem remetente nao salva', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.notificacoesEmail();
  await w.salvarConfigNotificacoesTela();
  const g = gravacoes.find((x) => x.nome === 'salvarConfigNotificacoes').arg;
  assert.deepStrictEqual({ p: g.servidor.provedor, r: g.servidor.remetenteEmail }, { p: 'sendgrid', r: 'alertas@fortestecnologia.com.br' });
  doc.getElementById('notifRemetenteEmail').value = '';
  await w.salvarConfigNotificacoesTela();
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarConfigNotificacoes').length, 1);
  assert.match(w.__toasts.join(' '), /remetente verificado no SendGrid/);
  doc.getElementById('notifRemetenteEmail').value = 'alertas@gmail.com';
  await w.salvarConfigNotificacoesTela();
  assert.strictEqual(gravacoes.filter((x) => x.nome === 'salvarConfigNotificacoes').length, 1, 'remetente de fora do dominio');
});

test('servidor: Host e Porta so aparecem em "Outro"; sem host nao salva', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.notificacoesEmail();
  doc.getElementById('notifProvedor').value = 'outro';
  w._renderServidorNotificacoes();
  assert.strictEqual(doc.getElementById('notifHostWrap').style.display, 'block');
  assert.strictEqual(doc.getElementById('notifPortaWrap').style.display, 'block');
  await w.salvarConfigNotificacoesTela();
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarConfigNotificacoes'));
  doc.getElementById('notifHost').value = 'smtp.empresa.com.br';
  doc.getElementById('notifPorta').value = '2525';
  await w.salvarConfigNotificacoesTela();
  const g = gravacoes.find((x) => x.nome === 'salvarConfigNotificacoes').arg;
  assert.deepStrictEqual([g.servidor.host, g.servidor.porta], ['smtp.empresa.com.br', 2525]);
  doc.getElementById('notifProvedor').value = 'gmail';
  w._renderServidorNotificacoes();
  assert.strictEqual(doc.getElementById('notifRemetenteObrig').style.display, 'none', 'no Gmail o remetente e opcional');
});

// ---- Riscos registrados/encerrados (22/10/2026) ----

test('riscos: carrega as chaves do bloco riscos e salvar devolve o que foi marcado', async () => {
  const riscos = { novo: true, encerrado: false, resumoAutomaticos: true, destinatarios: { responsavel: true, area: false, seguranca: true } };
  const { w, doc, gravacoes } = await carregar({ getConfigNotificacoes: Object.assign({}, CONFIG, { riscos }) });
  await w.notificacoesEmail();
  assert.strictEqual(doc.getElementById('notifRiscoNovo').checked, true);
  assert.strictEqual(doc.getElementById('notifRiscoEncerrado').checked, false);
  assert.strictEqual(doc.getElementById('notifRiscoDestArea').checked, false);
  doc.getElementById('notifRiscoEncerrado').checked = true;
  doc.getElementById('notifRiscoDestSeguranca').checked = false;
  await w.salvarConfigNotificacoesTela();
  const g = gravacoes.find((x) => x.nome === 'salvarConfigNotificacoes').arg;
  assert.deepStrictEqual(g.riscos, {
    novo: true, encerrado: true, resumoAutomaticos: true,
    destinatarios: { responsavel: true, area: false, seguranca: false },
  });
});

test('riscos: log mostra o tipo e o titulo do risco; o drawer leva ao risco', async () => {
  const fila = [{
    id: 'r0', tipo: 'risco', evento: 'riscoNovo', riscoId: 'abc', riscoTitulo: 'Vazamento de dados',
    para: 'si@fortestecnologia.com.br', motivos: ['seguranca'], assunto: '[Riscos] Novo risco registrado: Vazamento de dados',
    html: '<p>x</p>', texto: 'x', status: 'simulado', criadoEm: '2026-10-22T10:00:00.000Z',
  }];
  const { w, doc } = await carregar({ getNotificacoesEmail: fila });
  await w.notificacoesEmail();
  const linha = doc.querySelector('#notificacoesRows tr').textContent;
  assert.match(linha, /Risco: novo/);
  assert.match(linha, /Vazamento de dados/);
  w.abrirDrawerNotificacao('r0');
  const det = doc.getElementById('notificacaoDetalhes');
  assert.match(det.textContent, /Segurança da Informação/);
  assert.ok(det.querySelector('a[href="#riscos?risco=abc"]'));
});
