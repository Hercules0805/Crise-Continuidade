const { test } = require('node:test');
const assert = require('node:assert');
const N = require('./notificacoes');
const R = require('./notificacoesRisco');

const RISCO = {
  titulo: 'Vazamento de dados <cliente>', area: 'Financeiro', responsavel: 'Maria Silva',
  probabilidade: 'Alta', impacto: 'Muito alto', origem: 'Manual', status: 'Identificado',
  descricao: 'DETALHE SIGILOSO', impactoFinanceiro: 250000, planoAcao: [{ acao: 'PLANO SIGILOSO' }],
  estrategiaDescricao: 'ESTRATEGIA SIGILOSA',
};

const CTX = {
  pessoas: [
    { id: 'p1', nome: 'Maria  Silva', email: 'maria@fortestecnologia.com.br' },
    { id: 'p2', nome: 'João', email: 'joao@gmail.com' },
  ],
  areas: [{ nome: 'Financeiro', email: 'financeiro@fortestecnologia.com.br' }],
  perfis: [
    { id: 'gestor@fortestecnologia.com.br', perfis: ['gestor'], area: 'Financeiro' },
    { id: 'outro@fortestecnologia.com.br', perfis: ['gestor'], area: 'TI' },
    { id: 'si@fortestecnologia.com.br', perfis: ['seguranca'] },
    { id: 'maria@fortestecnologia.com.br', perfil: 'seguranca' },
    { id: 'admin@fortestecnologia.com.br', perfis: ['admin'] },
  ],
  config: {},
};

test('evento: criacao e "novo"; manual sem marca, automatico com criadoPelaAutomacao', () => {
  assert.deepStrictEqual(R.decidirEventoRisco('r1', null, RISCO), { tipo: 'novo', automatico: false, chave: 'risco:r1:novo' });
  assert.strictEqual(R.decidirEventoRisco('r1', null, Object.assign({}, RISCO, { criadoPelaAutomacao: true })).automatico, true);
});

test('evento: so a passagem para Encerrado avisa; salvar de novo ou excluir nao', () => {
  const enc = Object.assign({}, RISCO, { status: 'Encerrado', dataEncerramento: '2026-10-22', atualizadoPor: 'ana@fortestecnologia.com.br' });
  assert.deepStrictEqual(R.decidirEventoRisco('r1', RISCO, enc), { tipo: 'encerrado', automatico: false, chave: 'risco:r1:encerrado:2026-10-22' });
  assert.strictEqual(R.decidirEventoRisco('r1', enc, enc), null);
  assert.strictEqual(R.decidirEventoRisco('r1', RISCO, Object.assign({}, RISCO, { status: 'Em tratamento' })), null);
  assert.strictEqual(R.decidirEventoRisco('r1', RISCO, null), null);
});

test('evento: encerramento pela automacao vai para o resumo; reencerrar em outra data muda a chave', () => {
  const auto = Object.assign({}, RISCO, { status: 'Encerrado', dataEncerramento: '2026-10-22', atualizadoPor: 'automacao:vulnerabilidade' });
  assert.strictEqual(R.decidirEventoRisco('r1', RISCO, auto).automatico, true);
  const outra = Object.assign({}, auto, { dataEncerramento: '2026-11-05' });
  assert.notStrictEqual(R.decidirEventoRisco('r1', RISCO, auto).chave, R.decidirEventoRisco('r1', RISCO, outra).chave);
});

test('destinatarios: responsavel pelo nome, area + gestor dela, Seguranca; sem repetir e so do dominio', () => {
  const d = R.resolverDestinatariosRisco(RISCO, CTX);
  const por = Object.fromEntries(d.map((x) => [x.email, x.motivos]));
  assert.deepStrictEqual(por, {
    'maria@fortestecnologia.com.br': ['responsavel', 'seguranca'],
    'financeiro@fortestecnologia.com.br': ['area'],
    'gestor@fortestecnologia.com.br': ['gestor'],
    'si@fortestecnologia.com.br': ['seguranca'],
  });
  // Responsavel com e-mail de fora do dominio nao recebe.
  const fora = R.resolverDestinatariosRisco(Object.assign({}, RISCO, { responsavel: 'João' }), CTX);
  assert.ok(!fora.some((x) => x.email === 'joao@gmail.com'));
});

test('destinatarios: risco corporativo (sem area) nao pega gestor com area vazia', () => {
  const ctx = Object.assign({}, CTX, { perfis: [{ id: 'g@fortestecnologia.com.br', perfis: ['gestor'], area: '' }] });
  assert.deepStrictEqual(R.resolverDestinatariosRisco(Object.assign({}, RISCO, { area: '', responsavel: '' }), ctx), []);
});

test('destinatarios: a configuracao desliga cada grupo', () => {
  const config = { riscos: { destinatarios: { responsavel: false, area: false, seguranca: true } } };
  const d = R.resolverDestinatariosRisco(RISCO, Object.assign({}, CTX, { config }));
  assert.deepStrictEqual(d.map((x) => x.email).sort(), ['maria@fortestecnologia.com.br', 'si@fortestecnologia.com.br']);
  assert.deepStrictEqual(d.find((x) => x.email === 'maria@fortestecnologia.com.br').motivos, ['seguranca']);
});

test('configuracao: bloco riscos ligado por padrao, e cada chave respeitada', () => {
  assert.deepStrictEqual(N.normalizarConfig(null).riscos, {
    novo: true, encerrado: true, resumoAutomaticos: true,
    destinatarios: { responsavel: true, area: true, seguranca: true },
  });
  const c = N.normalizarConfig({ riscos: { novo: false, destinatarios: { seguranca: false } } }).riscos;
  assert.strictEqual(c.novo, false);
  assert.strictEqual(c.encerrado, true);
  assert.strictEqual(c.destinatarios.seguranca, false);
  assert.strictEqual(c.destinatarios.area, true);
});

test('e-mail de risco novo: titulo, area, nivel NIST, responsavel, link e motivo -- sem valor, descricao ou plano', () => {
  const m = R.montarEmailRisco(RISCO, { tipo: 'novo' }, { id: 'r 1', baseUrl: 'https://x.web.app/', motivos: ['responsavel', 'seguranca'] });
  assert.strictEqual(m.assunto, '[Riscos] Novo risco registrado: Vazamento de dados <cliente>');
  for (const parte of [m.html, m.texto]) {
    assert.ok(parte.includes('Financeiro'));
    assert.ok(parte.includes('Muito alto')); // Alta x Muito alto = Muito alto na matriz
    assert.ok(parte.includes('Maria Silva'));
    assert.ok(parte.includes('https://x.web.app/#riscos?risco=r%201'));
    assert.ok(parte.includes('responsável por este risco e integrante da equipe de Segurança da Informação'));
    for (const proibido of ['SIGILOSO', 'SIGILOSA', '250', 'R$']) assert.ok(!parte.includes(proibido), proibido);
  }
  assert.ok(m.html.includes('Vazamento de dados &lt;cliente&gt;'));
  assert.ok(!m.html.includes('<cliente>'));
});

test('e-mail de risco encerrado leva a justificativa; risco sem avaliacao diz "Não avaliado"', () => {
  const enc = Object.assign({}, RISCO, { status: 'Encerrado', justificativaEncerramento: 'Controle implantado.', probabilidade: '', impacto: '' });
  const m = R.montarEmailRisco(enc, { tipo: 'encerrado' }, { id: 'r1' });
  assert.strictEqual(m.assunto, '[Riscos] Risco encerrado: Vazamento de dados <cliente>');
  assert.ok(m.texto.includes('Justificativa do encerramento: Controle implantado.'));
  assert.ok(m.texto.includes('Nível: Não avaliado'));
  assert.ok(m.texto.includes(N.URL_BASE_PADRAO + '/#riscos?risco=r1'));
});

test('resumo diario: agrupado por destinatario, com as duas secoes e os motivos somados', () => {
  const a = R.resumoDoRisco('a', Object.assign({}, RISCO, { titulo: 'Risco A' }));
  const b = R.resumoDoRisco('b', Object.assign({}, RISCO, { titulo: 'Risco B', area: 'TI', responsavel: '', status: 'Encerrado' }));
  assert.strictEqual(a.descricao, undefined);
  assert.strictEqual(a.impactoFinanceiro, undefined);
  const eventos = [{ tipo: 'novo', risco: a }, { tipo: 'encerrado', risco: b }];
  const por = R.agruparResumoPorDestinatario(eventos, (r) => R.resolverDestinatariosRisco(r, CTX));
  assert.strictEqual(por.get('si@fortestecnologia.com.br').eventos.length, 2);
  assert.strictEqual(por.get('gestor@fortestecnologia.com.br').eventos.length, 1); // so o do Financeiro
  assert.deepStrictEqual(por.get('maria@fortestecnologia.com.br').motivos, ['responsavel', 'seguranca']);

  const m = R.montarResumoDiarioRiscos(por.get('si@fortestecnologia.com.br').eventos, { dia: '2026-10-22', motivos: ['seguranca'] });
  assert.strictEqual(m.assunto, '[Riscos] Resumo da automação de 22/10/2026: 1 registrado(s), 1 encerrado(s)');
  assert.ok(m.html.includes('Registrados pela automação (1)'));
  assert.ok(m.html.includes('Encerrados pela automação (1)'));
  assert.ok(m.texto.includes('Risco A') && m.texto.includes('Risco B'));
  assert.ok(!m.texto.includes('SIGILOSO'));
});

test('envio: remetenteNome do documento da fila prevalece sobre o da configuracao', async () => {
  let msg = null;
  const doc = { status: 'pendente', para: 'a@fortestecnologia.com.br', assunto: 's', html: 'h', texto: 't', remetenteNome: R.REMETENTE };
  const patch = await N.processarEnvio(doc, { modo: 'ativo' }, async (m) => { msg = m; });
  assert.strictEqual(patch.status, 'enviado');
  assert.strictEqual(msg.de, 'BIA · Riscos');
  await N.processarEnvio(Object.assign({}, doc, { remetenteNome: '' }), { modo: 'ativo' }, async (m) => { msg = m; });
  assert.strictEqual(msg.de, 'BIA · Contratos');
});

test('areas hierarquicas: o gestor da area de cima (areasGeridas) tambem recebe', () => {
  const ctxH = Object.assign({}, CTX, { perfis: CTX.perfis.concat([{ id: 'diretor@fortestecnologia.com.br', perfis: ['gestor'], area: 'Diretoria', areasGeridas: ['Diretoria', 'Financeiro'] }]) });
  const emails = R.resolverDestinatariosRisco(RISCO, ctxH).map((x) => x.email);
  assert.ok(emails.includes('diretor@fortestecnologia.com.br'));
  assert.ok(!emails.includes('outro@fortestecnologia.com.br'), 'gestor de outra area continua fora');
});
