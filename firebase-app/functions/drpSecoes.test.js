const { test } = require('node:test');
const assert = require('node:assert');
const { chaveDaSecao, dividirSecoes, mesclarBloqueadas, secoesBloqueadas } = require('./drpSecoes');

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
