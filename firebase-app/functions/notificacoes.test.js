const { test } = require('node:test');
const assert = require('node:assert');
const N = require('./notificacoes');

const HOJE = '2026-10-16';
const VIG = { hoje: HOJE, situacao: 'vigente' };
const contrato = (extra) => Object.assign({
  id: 'c1', codigo: 'CT-0001', objeto: 'Qualys VMDR', fornecedorNome: 'ICTS', area: 'Segurança da Informação',
  gestor: { id: 'p1', nome: 'Gabriel Fortes' }, dataInicio: '2025-11-15', dataFim: '2026-11-14', vigenciaMeses: 12,
  renovacaoAutomatica: false, avisoCancelamentoDias: 30, valorMensal: 42156.76, valorGlobal: 505881.12,
}, extra);
const eventos = (c, o) => N.decidirUrgentes(c, Object.assign({}, VIG, o)).map((e) => e.evento);

// ============================================================
// URGENTES
// ============================================================

test('vence em 30 dias sem renovacao automatica: um aviso, com chave pela data de fim', () => {
  const ev = N.decidirUrgentes(contrato(), VIG);
  assert.deepStrictEqual(ev.map((e) => e.evento), ['vence30']);
  assert.strictEqual(ev[0].chave, 'c1:vence30:2026-11-14');
  assert.strictEqual(ev[0].grupo, 'prazos');
});

test('com renovacao automatica nao avisa "vence em 30": o que importa e o prazo de aviso', () => {
  // fim 14/11, aviso 30 -> limite 15/10 -> ja passou: aviso perdido
  assert.deepStrictEqual(eventos(contrato({ renovacaoAutomatica: true })), ['avisoPerdido']);
});

test('janela de aviso: aberta (>7 dias) e lembrete final (<=7 dias) tem chaves diferentes', () => {
  const longe = N.decidirUrgentes(contrato({ renovacaoAutomatica: true, dataFim: '2026-12-31' }), VIG); // limite 01/12, 46 dias -> fora
  assert.deepStrictEqual(longe, []);
  const aberta = N.decidirUrgentes(contrato({ renovacaoAutomatica: true, dataFim: '2026-12-10' }), VIG); // limite 10/11, 25 dias
  assert.deepStrictEqual(aberta.map((e) => e.chave), ['c1:janela:2026-11-10']);
  const final = N.decidirUrgentes(contrato({ renovacaoAutomatica: true, dataFim: '2026-11-20' }), VIG); // limite 21/10, 5 dias
  assert.deepStrictEqual(final.map((e) => e.chave), ['c1:janela7:2026-10-21']);
});

test('vencido sem renovacao automatica avisa; contrato nao vigente nao avisa nada', () => {
  assert.deepStrictEqual(eventos(contrato({ dataFim: '2026-10-01' })), ['vencido']);
  assert.deepStrictEqual(N.decidirUrgentes(contrato({ dataFim: '2026-10-01' }), { hoje: HOJE, situacao: 'encerrado' }), []);
  assert.deepStrictEqual(N.decidirUrgentes(contrato(), { hoje: HOJE, situacao: 'pre' }), []);
});

test('renovacao automatica executada vira evento, e a chave muda a cada novo fim (o ciclo recomeca)', () => {
  const c = contrato({ renovacaoAutomatica: true, dataUltimaRenovacao: '2026-10-15', dataFim: '2027-10-14' });
  const ev = N.decidirUrgentes(c, Object.assign({ renovacao: { dataFim: '2027-10-14', ciclos: 1 } }, VIG));
  assert.deepStrictEqual(ev.map((e) => e.chave), ['c1:renovado:2027-10-14']);
  assert.strictEqual(ev[0].grupo, 'renovacaoReajuste');
  const proximoCiclo = N.decidirUrgentes(contrato({ dataFim: '2027-11-14' }), { hoje: '2027-10-16', situacao: 'vigente' });
  assert.strictEqual(proximoCiclo[0].chave, 'c1:vence30:2027-11-14');
});

test('id na fila: mesmo evento + mesmo destinatario = mesmo id (create() barra a repeticao)', () => {
  assert.strictEqual(N.idNaFila('c1:vence30:2026-11-14', 'A@fortestecnologia.com.br'), N.idNaFila('c1:vence30:2026-11-14', 'a@fortestecnologia.com.br'));
  assert.notStrictEqual(N.idNaFila('c1:vence30:2026-11-14', 'a@fortestecnologia.com.br'), N.idNaFila('c1:vence30:2026-11-14', 'b@fortestecnologia.com.br'));
  assert.match(N.idNaFila('x', 'y'), /^[0-9a-f]{40}$/);
});

// ============================================================
// DESTINATARIOS
// ============================================================

const CTX = {
  pessoas: [{ id: 'p1', email: 'Gabriel@fortestecnologia.com.br' }, { id: 'p2', email: 'externo@gmail.com' }],
  areas: [{ nome: 'Segurança da Informação', email: 'si@fortestecnologia.com.br' }],
  operadores: ['op@fortestecnologia.com.br', 'si@fortestecnologia.com.br'],
};

test('destinatarios: gestor, area e operadores, sem repetir endereco e com os motivos somados', () => {
  const d = N.resolverDestinatarios(contrato(), CTX);
  assert.deepStrictEqual(d, [
    { email: 'gabriel@fortestecnologia.com.br', motivos: ['gestor'] },
    { email: 'si@fortestecnologia.com.br', motivos: ['area', 'operador'] },
    { email: 'op@fortestecnologia.com.br', motivos: ['operador'] },
  ]);
});

test('destinatarios: gestor digitado sem cadastro e e-mail de fora do dominio ficam de fora', () => {
  assert.deepStrictEqual(N.resolverDestinatarios(contrato({ gestor: { id: null, nome: 'Fulano' }, area: '' }), { ...CTX, operadores: [] }), []);
  assert.deepStrictEqual(N.resolverDestinatarios(contrato({ gestor: { id: 'p2', nome: 'X' }, area: '' }), { ...CTX, operadores: [] }), []);
});

test('destinatarios: a configuracao desliga cada grupo', () => {
  const config = { destinatarios: { gestor: false, area: true, operadores: false } };
  assert.deepStrictEqual(N.resolverDestinatarios(contrato(), { ...CTX, config }).map((x) => x.email), ['si@fortestecnologia.com.br']);
});

test('operadores: perfis[] ou perfil legado; outros perfis nao entram', () => {
  const lista = N.emailsDeOperadores([
    { id: 'a@fortestecnologia.com.br', perfis: ['operador', 'ti'] },
    { email: 'b@fortestecnologia.com.br', perfil: 'Operador' },
    { email: 'c@fortestecnologia.com.br', perfis: ['admin'] },
  ]);
  assert.deepStrictEqual(lista, ['a@fortestecnologia.com.br', 'b@fortestecnologia.com.br']);
});

// ============================================================
// CONTEUDO
// ============================================================

test('e-mail urgente: assunto, link do contrato, motivo e NENHUM valor', () => {
  const c = contrato({ objeto: 'Qualys <script>alert(1)</script>' });
  const ev = N.decidirUrgentes(c, VIG)[0];
  const m = N.montarEmailUrgente(c, ev, { baseUrl: 'https://bia-forte-2025.web.app', motivos: ['gestor'], nomes: { tipo: 'SaaS' } });
  assert.strictEqual(m.assunto, '[Contratos] CT-0001 vence em 29 dia(s) (14/11/2026)');
  assert.ok(m.html.includes('https://bia-forte-2025.web.app/#contratos?contrato=c1'));
  assert.ok(m.texto.includes('https://bia-forte-2025.web.app/#contratos?contrato=c1'));
  assert.ok(m.html.includes('gestor deste contrato'));
  assert.ok(!m.html.includes('<script>alert'), 'texto escapado');
  ['42156', '42.156', '505881', '505.881', 'R$'].forEach((t) => {
    assert.ok(!m.html.includes(t) && !m.texto.includes(t), `nao pode conter ${t}`);
  });
});

test('e-mail da janela final diz a data-limite e os dias', () => {
  const c = contrato({ renovacaoAutomatica: true, dataFim: '2026-11-20' });
  const m = N.montarEmailUrgente(c, N.decidirUrgentes(c, VIG)[0], {});
  assert.match(m.assunto, /faltam 5 dia\(s\) para avisar cancelamento/);
  assert.match(m.texto, /21\/10\/2026/);
});

test('resumo mensal: itens por secao, grupos desligados somem, contrato sem nada nao aparece', () => {
  const c = contrato({ mesReajuste: 11 });
  const itens = N.itensDoResumo(c, { hoje: HOJE, situacao: 'vigente', nomes: { indexador: 'IPCA' }, renovacoesMesAnterior: ['2026-09-10'] });
  assert.deepStrictEqual(itens.map((i) => i.secao), ['vencimentos', 'reajustes', 'renovados']);
  assert.match(itens[1].texto, /Novembro pelo IPCA/);
  const semPrazos = N.itensDoResumo(c, { hoje: HOJE, situacao: 'vigente', config: { grupos: { prazos: false } } });
  assert.ok(!semPrazos.some((i) => i.secao === 'vencimentos'));
  assert.deepStrictEqual(N.itensDoResumo(c, { hoje: HOJE, situacao: 'encerrado' }), []);
  const m = N.montarResumoMensal([{ contrato: c, itens }, { contrato: contrato({ id: 'c2', codigo: 'CT-0002' }), itens: [] }],
    { mesAno: N.mesPorExtenso('2026-10'), motivos: ['operador'] });
  assert.strictEqual(m.assunto, '[Contratos] Resumo de outubro de 2026: 1 contrato(s) pedem atenção');
  assert.ok(m.html.includes('Vencimentos nos próximos 90 dias'));
  assert.ok(!m.html.includes('CT-0002'));
  assert.ok(!m.html.includes('42.156') && !m.texto.includes('42156'));
});

test('mes anterior e mes por extenso', () => {
  assert.deepStrictEqual(N.mesAnterior('2026-10-01'), { inicio: '2026-09-01', fim: '2026-09-30' });
  assert.deepStrictEqual(N.mesAnterior('2026-01-01'), { inicio: '2025-12-01', fim: '2025-12-31' });
  assert.strictEqual(N.mesPorExtenso('2026-03'), 'março de 2026');
});

// ============================================================
// CONFIGURACAO E ENVIO
// ============================================================

test('configuracao: padrao desligado; "responder para" so do dominio', () => {
  const c = N.normalizarConfig({ modo: 'xpto', responderPara: 'fora@gmail.com' });
  assert.strictEqual(c.modo, 'desligado');
  assert.strictEqual(c.responderPara, '');
  assert.deepStrictEqual(c.grupos, { prazos: true, renovacaoReajuste: true, resumoMensal: true });
  assert.strictEqual(N.normalizarConfig({ responderPara: 'Contratos@fortestecnologia.com.br' }).responderPara, 'contratos@fortestecnologia.com.br');
});

const DOC = { status: 'pendente', para: 'a@fortestecnologia.com.br', assunto: 'x', html: '<p>x</p>', texto: 'x' };

test('envio: simulacao nao chama o transporte; ativo envia; erro guarda mensagem e tentativas', async () => {
  let chamadas = 0;
  const enviar = async () => { chamadas++; };
  assert.strictEqual((await N.processarEnvio(DOC, { modo: 'simulacao' }, enviar)).status, 'simulado');
  assert.strictEqual(chamadas, 0);
  const ok = await N.processarEnvio(DOC, { modo: 'ativo' }, enviar);
  assert.strictEqual(ok.status, 'enviado');
  assert.strictEqual(ok.tentativas, 1);
  assert.strictEqual(chamadas, 1);
  const falha = await N.processarEnvio({ ...DOC, tentativas: 1 }, { modo: 'ativo' }, async () => { throw new Error('535 auth failed'); });
  assert.deepStrictEqual([falha.status, falha.tentativas, falha.erro], ['erro', 2, '535 auth failed']);
  assert.strictEqual(N.podeReenviar({ status: 'erro', tentativas: 2 }), true);
  assert.strictEqual(N.podeReenviar({ status: 'erro', tentativas: 3 }), false);
});

test('envio: so processa pendente; sem destinatario e modo desligado ficam registrados', async () => {
  const nunca = async () => { throw new Error('nao devia enviar'); };
  assert.strictEqual(await N.processarEnvio({ ...DOC, status: 'enviado' }, { modo: 'ativo' }, nunca), null);
  assert.strictEqual((await N.processarEnvio({ ...DOC, para: '' }, { modo: 'ativo' }, nunca)).status, 'sem_destinatario');
  assert.strictEqual((await N.processarEnvio(DOC, { modo: 'desligado' }, nunca)).status, 'ignorado');
});

test('configuracao do servidor: padrao SendGrid; remetente so do dominio; host/porta so em "outro"', () => {
  assert.deepStrictEqual(N.normalizarConfig({}).servidor, { provedor: 'sendgrid', host: '', porta: null, remetenteEmail: '' });
  assert.strictEqual(N.normalizarConfig({ servidor: { remetenteEmail: 'Alertas@fortestecnologia.com.br' } }).servidor.remetenteEmail, 'alertas@fortestecnologia.com.br');
  assert.strictEqual(N.normalizarConfig({ servidor: { remetenteEmail: 'x@gmail.com' } }).servidor.remetenteEmail, '');
  assert.deepStrictEqual(N.normalizarConfig({ servidor: { provedor: 'gmail', host: 'h', porta: 25 } }).servidor, { provedor: 'gmail', host: '', porta: null, remetenteEmail: '' });
  const outro = N.normalizarConfig({ servidor: { provedor: 'outro', host: ' mail.x.com ', porta: '2525' } }).servidor;
  assert.deepStrictEqual([outro.host, outro.porta], ['mail.x.com', 2525]);
  assert.strictEqual(N.normalizarConfig({ servidor: { provedor: 'outro', porta: 99999 } }).servidor.porta, null);
});

// --- Relatorio executivo compartilhado (20/10/2026) ---

test('e-mail de relatorio compartilhado: link para a tela do relatorio, recorte da area, mensagem escapada, sem numeros', () => {
  const N = require('./notificacoes');
  const m = N.montarEmailRelatorioCompartilhado({
    tipo: 'riscos', titulo: 'Relatório Executivo de Riscos', geradoEm: '2026-10-20T09:00:00Z', area: 'TI',
    compartilhadoPor: 'si@fortestecnologia.com.br', mensagem: 'Veja <b>antes</b> da reunião\nObrigado',
  }, { baseUrl: 'https://bia-forte-2025.web.app/' });
  assert.strictEqual(m.assunto, '[BIA] Relatório Executivo de Riscos compartilhado com você');
  assert.match(m.html, /href="https:\/\/bia-forte-2025\.web\.app\/#riscos-relatorio"/);
  assert.match(m.html, /riscos da área TI/);
  assert.match(m.html, /Veja &lt;b&gt;antes&lt;\/b&gt; da reunião/);
  assert.match(m.html, /20\/10\/2026/);
  assert.match(m.texto, /Abrir no BIA: https:\/\/bia-forte-2025\.web\.app\/#riscos-relatorio/);
  const v = N.montarEmailRelatorioCompartilhado({ tipo: 'vulnerabilidades', titulo: 'Relatório Executivo de Vulnerabilidades', geradoEm: '2026-10-20' }, {});
  assert.match(v.html, /#vulnerabilidades-relatorio/);
  assert.doesNotMatch(v.html, /riscos da área/);
});
