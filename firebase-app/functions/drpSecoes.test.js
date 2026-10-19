const { test } = require('node:test');
const assert = require('node:assert');
const { chaveDaSecao, dividirSecoes, mesclarBloqueadas, secoesBloqueadas, substituirOuInserirSecao } = require('./drpSecoes');

const ANTIGO = '<h1>DRP: SRV-01</h1>\n'
  + '<h2>1. Objetivo</h2><p>objetivo antigo</p>\n'
  + '<h2>2. Estratégia</h2><p>RTO 4h</p>\n'
  + '<h2>6. Runbook <button class="drp-lock-btn">🔒 Ajustada manualmente</button></h2><ol><li>passo ajustado pelo humano</li></ol>\n';

const NOVO = '<h1>DRP: SRV-01</h1>\n'
  + '<h2>1. Objetivo</h2><p>objetivo novo</p>\n'
  + '<h2>2. Estratégia</h2><p>RTO 2h</p>\n'
  + '<h2>6. Runbook</h2><ol><li>passo da IA</li></ol>\n';

test('chaveDaSecao usa o numero do titulo e ignora botoes injetados', () => {
  assert.strictEqual(chaveDaSecao('<h2>6. Runbook <button>🔒 Ajustada</button></h2>'), '6');
  assert.strictEqual(chaveDaSecao('<h2 id="s3">  10) Testes</h2>'), '10');
});

test('chaveDaSecao sem numero cai para o titulo normalizado', () => {
  assert.strictEqual(chaveDaSecao('<h2>Contatos  de <em>Contingência</em></h2>'), 'contatos de contingencia');
});

test('dividirSecoes recompoe o HTML original sem perder nada', () => {
  const { cabecalho, secoes } = dividirSecoes(ANTIGO);
  assert.deepStrictEqual(secoes.map((s) => s.chave), ['1', '2', '6']);
  assert.strictEqual(cabecalho + secoes.map((s) => s.html).join(''), ANTIGO);
});

test('dividirSecoes sem h2 devolve tudo como cabecalho', () => {
  assert.deepStrictEqual(dividirSecoes('<p>so texto</p>'), { cabecalho: '<p>so texto</p>', secoes: [] });
});

test('secao bloqueada volta byte a byte igual; as outras vem da geracao nova', () => {
  const r = mesclarBloqueadas(NOVO, ANTIGO, ['6']);
  const secoes = dividirSecoes(r.html).secoes;
  assert.strictEqual(secoes[2].html, dividirSecoes(ANTIGO).secoes[2].html);
  assert.ok(r.html.includes('RTO 2h'));
  assert.ok(r.html.includes('objetivo novo'));
  assert.ok(!r.html.includes('passo da IA'));
  assert.deepStrictEqual(r.bloqueadas, ['6']);
});

test('sem bloqueadas o HTML novo passa intacto', () => {
  assert.deepStrictEqual(mesclarBloqueadas(NOVO, ANTIGO, []), { html: NOVO, bloqueadas: [] });
  assert.deepStrictEqual(mesclarBloqueadas(NOVO, ANTIGO, undefined), { html: NOVO, bloqueadas: [] });
});

test('secao bloqueada que sumiu da geracao nova e reinserida depois da que a precedia', () => {
  const novoSem2 = '<h1>DRP</h1><h2>1. Objetivo</h2><p>novo</p><h2>6. Runbook</h2><p>ia</p>';
  const r = mesclarBloqueadas(novoSem2, ANTIGO, ['2']);
  assert.deepStrictEqual(dividirSecoes(r.html).secoes.map((s) => s.chave), ['1', '2', '6']);
  assert.ok(r.html.includes('RTO 4h'));
});

test('secoesBloqueadas devolve so as travadas, na ordem, sem os botoes injetados', () => {
  const r = secoesBloqueadas(ANTIGO, ['6', '1']);
  assert.deepStrictEqual(r.map((s) => s.chave), ['1', '6']);
  assert.strictEqual(r[1].html, '<h2>6. Runbook </h2><ol><li>passo ajustado pelo humano</li></ol>');
  assert.deepStrictEqual(secoesBloqueadas(ANTIGO, []), []);
});

test('chave bloqueada que nao existe no antigo e descartada do cadeado', () => {
  const r = mesclarBloqueadas(NOVO, ANTIGO, ['6', '9']);
  assert.deepStrictEqual(r.bloqueadas, ['6']);
});

// ---- Secao montada pelo sistema (SLAs Contratados, 15/10/2026) ----
const CHAVE_SLA = 'slas contratados com fornecedores';
const SEC_SLA = '<h2>SLAs Contratados com Fornecedores</h2><p>dado atual</p>\n';
const DOC = '<h1>DRP</h1>\n<h2>8. Limitações</h2><p>a</p>\n<h2>9. Dependências</h2><p>b</p>\n<h2>10. Testes</h2><p>c</p>\n';
const depoisDeDependencias = (s) => s.chave === '9' || /depend/.test(s.chave);

test('secao do sistema entra logo depois de Dependencias', () => {
  const html = substituirOuInserirSecao(DOC, CHAVE_SLA, SEC_SLA, depoisDeDependencias);
  assert.deepStrictEqual(dividirSecoes(html).secoes.map((s) => s.chave), ['8', '9', CHAVE_SLA, '10']);
  assert.ok(html.startsWith('<h1>DRP</h1>'));
});

test('secao do sistema ja existente (mesmo travada) e substituida pelo dado atual, sem duplicar', () => {
  const comVelha = DOC + '<h2>SLAs Contratados com Fornecedores <button>🔒</button></h2><p>dado velho</p>\n'
    + '<h2>SLAs contratados com fornecedores</h2><p>copia inventada pela IA</p>\n';
  const html = substituirOuInserirSecao(comVelha, CHAVE_SLA, SEC_SLA, depoisDeDependencias);
  assert.ok(html.includes('dado atual'));
  assert.ok(!html.includes('dado velho'));
  assert.ok(!html.includes('copia inventada'));
  assert.strictEqual(dividirSecoes(html).secoes.filter((s) => s.chave === CHAVE_SLA).length, 1);
});

test('sem a ancora (template personalizado), a secao do sistema vai para o fim', () => {
  const html = substituirOuInserirSecao('<h2>Visão geral</h2><p>x</p>', CHAVE_SLA, SEC_SLA, depoisDeDependencias);
  assert.deepStrictEqual(dividirSecoes(html).secoes.map((s) => s.chave), ['visao geral', CHAVE_SLA]);
});

test('chave da secao do sistema e o titulo normalizado', () => {
  assert.strictEqual(chaveDaSecao('<h2>SLAs Contratados com Fornecedores</h2>'), CHAVE_SLA);
});
