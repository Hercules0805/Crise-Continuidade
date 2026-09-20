// Testes da sanitizacao do PCN.
//
// O grosso da limpeza e responsabilidade do DOMPurify, que tem a propria
// suite. O que se testa aqui e o que e NOSSO: se a funcao chama a biblioteca
// quando ela existe, se manda a lista de tags proibidas, e se avisa quando
// cai no fallback.
//
// O teste de comportamento real (script removido, onerror removido...) precisa
// de um DOM. Ele existe abaixo, mas so roda com PCN_DOM_TESTS=1 e jsdom
// instalado, porque jsdom e pesado demais para a suite do dia a dia:
//   cd tests && npm install --no-save jsdom && PCN_DOM_TESTS=1 node --test sanitizar-pcn.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

function carregarModulo() {
  delete require.cache[require.resolve('../public/sanitizar-pcn.js')];
  return require('../public/sanitizar-pcn.js');
}

test('usa DOMPurify quando ele esta presente, e diz que nao usou fallback', () => {
  const chamadas = [];
  global.DOMPurify = { sanitize: (html, cfg) => { chamadas.push({ html, cfg }); return 'LIMPO'; } };
  const { sanitizarPCN } = carregarModulo();
  const r = sanitizarPCN('<p>x</p>');
  assert.strictEqual(r.html, 'LIMPO');
  assert.strictEqual(r.usouFallback, false);
  assert.strictEqual(chamadas.length, 1);
  delete global.DOMPurify;
});

test('manda a lista de tags proibidas para o DOMPurify', () => {
  let cfg = null;
  global.DOMPurify = { sanitize: (h, c) => { cfg = c; return h; } };
  const { sanitizarPCN, TAGS_PROIBIDAS } = carregarModulo();
  sanitizarPCN('<p>x</p>');
  assert.deepStrictEqual(cfg.FORBID_TAGS, TAGS_PROIBIDAS);
  assert.strictEqual(cfg.ALLOW_DATA_ATTR, false);
  delete global.DOMPurify;
});

test('a lista de proibidas cobre os vetores conhecidos', () => {
  const { TAGS_PROIBIDAS } = carregarModulo();
  for (const tag of ['script', 'iframe', 'object', 'embed', 'form', 'base']) {
    assert.ok(TAGS_PROIBIDAS.includes(tag), 'faltou ' + tag);
  }
});

test('sem DOMPurify e sem DOM, avisa em vez de devolver conteudo cru em silencio', () => {
  delete global.DOMPurify;
  const { sanitizarPCN } = carregarModulo();
  // Sem document, o fallback lanca — o que e melhor que devolver HTML nao
  // limpo achando que limpou. Quem chama trata e avisa o usuario.
  assert.throws(() => sanitizarPCN('<script>alert(1)</script>'));
});

// --- Teste de comportamento real, opcional (precisa de jsdom) ---
if (process.env.PCN_DOM_TESTS) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMPurify = require(path.join(__dirname, 'vendor-loader.js'))(dom.window);
  const { sanitizarPCN } = carregarModulo();

  test('[DOM] remove script, onerror e URL executavel', () => {
    assert.ok(!/<script/i.test(sanitizarPCN('<h1>P</h1><script>alert(1)</script>').html));
    assert.ok(!/onerror/i.test(sanitizarPCN('<img src=x onerror="alert(1)">').html));
    assert.ok(!/javascript:/i.test(sanitizarPCN('<a href="javascript:alert(1)">c</a>').html));
  });

  test('[DOM] preserva o que o PCN usa: tabela, titulo, lista e estilo inline', () => {
    const r = sanitizarPCN('<h2>Contatos</h2><table><tr><td style="padding:8px">João</td></tr></table><ul><li>i</li></ul>');
    for (const t of ['<h2', '<table', '<td', '<ul', 'João', 'padding']) {
      assert.ok(r.html.includes(t), 'perdeu ' + t);
    }
  });
}
