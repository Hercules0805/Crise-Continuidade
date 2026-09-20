// Testes do escape de HTML (node --test, sem emulador).
const { test } = require('node:test');
const assert = require('node:assert');
const { esc, escJs } = require('../public/util.js');

test('esc cobre os cinco caracteres que quebram HTML', () => {
  assert.strictEqual(esc('&'), '&amp;');
  assert.strictEqual(esc('<'), '&lt;');
  assert.strictEqual(esc('>'), '&gt;');
  assert.strictEqual(esc('"'), '&quot;');
  assert.strictEqual(esc("'"), '&#39;');
});

test('esc nao deixa tag executavel passar', () => {
  assert.strictEqual(
    esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;'
  );
  assert.ok(!esc('<script>alert(1)</script>').includes('<'));
});

// O caso real: aspas duplas num nome quebravam o atributo e o botao da linha.
test('esc protege valor de atributo com aspas', () => {
  const html = `<input value="${esc('Cia "Alfa"')}">`;
  assert.strictEqual(html, '<input value="Cia &quot;Alfa&quot;">');
});

test('esc trata vazio, nulo e numero', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc(''), '');
  assert.strictEqual(esc(0), '0');
});

test('esc nao mexe em texto comum', () => {
  assert.strictEqual(esc('Faturamento > Emissão de NFs'), 'Faturamento &gt; Emissão de NFs');
  assert.strictEqual(esc('Operação do ASIMO'), 'Operação do ASIMO');
});

// escJs existe por causa da ordem de decodificacao: o navegador desfaz as
// entidades antes de o JS rodar. Depois de decodificar, a string tem que
// continuar valida — por isso a barra invertida precisa sobreviver.
test('escJs mantem a string JS valida depois do HTML ser decodificado', () => {
  const saida = escJs("O'Brien");
  assert.ok(saida.includes('\\'), 'perdeu o escape de JS: ' + saida);
  // Simula o navegador decodificando as entidades antes de entregar ao JS.
  const decodificado = saida
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  assert.strictEqual(decodificado, "O\\'Brien");
  // E o que o JS le de volta e o valor original.
  assert.strictEqual(eval("'" + decodificado + "'"), "O'Brien");
});

test('escJs neutraliza tentativa de fechar a chamada', () => {
  const saida = escJs("x');alert(1);//");
  const decodificado = saida.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  assert.strictEqual(eval("'" + decodificado + "'"), "x');alert(1);//");
});

test('escJs escapa barra invertida e quebra de linha', () => {
  assert.ok(escJs('a\\b').includes('\\\\'));
  assert.ok(escJs('linha1\nlinha2').includes('\\n'));
});

test('escJs trata nulo e vazio', () => {
  assert.strictEqual(escJs(null), '');
  assert.strictEqual(escJs(undefined), '');
});

// Terceiro contexto: dentro de <script>. Escapar HTML aqui seria ERRADO — o
// conteudo de <script> nao passa pelo decodificador de entidades.
const { escScript } = require('../public/util.js');

test('escScript nao introduz entidades HTML', () => {
  const saida = escScript("O'Brien");
  assert.ok(!saida.includes('&#39;'), 'nao deve haver entidade: ' + saida);
  assert.strictEqual(eval("'" + saida + "'"), "O'Brien");
});

test('escScript neutraliza fechamento do bloco script', () => {
  const saida = escScript('</script><script>alert(1)</script>');
  assert.ok(!saida.includes('</script>'), 'fecharia o bloco: ' + saida);
  assert.strictEqual(eval("'" + saida + "'"), '</script><script>alert(1)</script>');
});

test('escScript sobrevive ao round-trip de valores comuns', () => {
  for (const v of ['Faturamento > NFs', 'Operação do ASIMO', 'a\\b', "x');alert(1)"]) {
    assert.strictEqual(eval("'" + escScript(v) + "'"), v, 'quebrou em ' + v);
  }
});
