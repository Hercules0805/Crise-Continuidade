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

// --- criarRastreadorEdicao: "Fechar" so grava se o formulario mudou.
const { criarRastreadorEdicao } = require('../public/util.js');

test('rastreador: sem marcar() conta como sujo (grava, como antes)', () => {
  const r = criarRastreadorEdicao(() => ({ a: 1 }));
  assert.strictEqual(r.sujo(), true);
});

test('rastreador: igual ao marcado = limpo; mudou = sujo; voltou ao original = limpo', () => {
  const f = { nome: 'A', itens: [1] };
  const r = criarRastreadorEdicao(() => ({ nome: f.nome, itens: f.itens.slice() }));
  r.marcar();
  assert.strictEqual(r.sujo(), false);
  f.nome = 'B';
  assert.strictEqual(r.sujo(), true);
  f.nome = 'A';
  assert.strictEqual(r.sujo(), false);
  f.itens.push(2);
  assert.strictEqual(r.sujo(), true);
});

test('rastreador: marcar(payload) usa o que foi enviado, nao o formulario atual', () => {
  const f = { nome: 'A' };
  const r = criarRastreadorEdicao(() => ({ nome: f.nome }));
  const enviado = { nome: 'A' };
  f.nome = 'A digitado durante a gravacao';
  r.marcar(enviado);
  assert.strictEqual(r.sujo(), true);
});

test('rastreador: esquecer() volta a sujo (rascunho que ainda nao existe no banco)', () => {
  const r = criarRastreadorEdicao(() => ({ a: 1 }));
  r.marcar();
  r.esquecer();
  assert.strictEqual(r.sujo(), true);
});

test('rastreador: coletor que falha conta como sujo, nunca como limpo', () => {
  let falha = false;
  const r = criarRastreadorEdicao(() => { if (falha) throw new Error('DOM sumiu'); return { a: 1 }; });
  r.marcar();
  falha = true;
  assert.strictEqual(r.sujo(), true);
});

// ---- Moeda (15/10/2026): mascara dos campos de valor do contrato ----
const { formatarMoedaBR, mascararMoedaBR, lerMoedaBR } = require('../public/util.js');

test('formatarMoedaBR: 2 casas, milhar com ponto, vazio e invalido viram vazio', () => {
  assert.strictEqual(formatarMoedaBR(1234.5), '1.234,50');
  assert.strictEqual(formatarMoedaBR(505881.12), '505.881,12');
  assert.strictEqual(formatarMoedaBR(0), '0,00');
  assert.strictEqual(formatarMoedaBR(''), '');
  assert.strictEqual(formatarMoedaBR(null), '');
  assert.strictEqual(formatarMoedaBR(undefined), '');
  assert.strictEqual(formatarMoedaBR('abc'), '');
  assert.strictEqual(formatarMoedaBR('42.156,76'), '42.156,76', 'texto ja mascarado volta igual');
});

test('mascararMoedaBR: os digitos viram centavos', () => {
  assert.strictEqual(mascararMoedaBR('4215676'), '42.156,76');
  assert.strictEqual(mascararMoedaBR('abc12345'), '123,45');
  assert.strictEqual(mascararMoedaBR('5'), '0,05');
  assert.strictEqual(mascararMoedaBR('0'), '');
  assert.strictEqual(mascararMoedaBR(''), '');
  assert.strictEqual(mascararMoedaBR('1.234,56'), '1.234,56', 'redigitar sobre o texto mascarado nao muda o valor');
});

test('lerMoedaBR: texto mascarado vira o numero que vai para o banco', () => {
  assert.strictEqual(lerMoedaBR('1.234,56'), 1234.56);
  assert.strictEqual(lerMoedaBR('R$ 42.156,76'), 42156.76);
  assert.strictEqual(lerMoedaBR('0,05'), 0.05);
  assert.strictEqual(lerMoedaBR(''), null);
  assert.strictEqual(lerMoedaBR('abc'), null);
  assert.strictEqual(lerMoedaBR(null), null);
});

test('moeda: ida e volta sem perder centavo', () => {
  [0.01, 1, 12.5, 42156.76, 505881.12, 1234567.89].forEach((x) => {
    assert.strictEqual(lerMoedaBR(formatarMoedaBR(x)), x);
  });
});
