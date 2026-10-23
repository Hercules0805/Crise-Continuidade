// Marca BIA (DECISÃO 23/10/2026): o sistema voltou a se chamar BIA. Nenhum texto
// visível (telas, documentos gerados, e-mails) diz mais "GRC360"; ficam só os nomes
// internos (namespace window.GRC360, pasta vendor/grc360, constantes GRC360_*).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const PUB = path.join(RAIZ, 'public');

const ARQUIVOS = [
  ...fs.readdirSync(PUB).filter((f) => /\.(html|js)$/.test(f)).map((f) => path.join(PUB, f)),
  ...fs.readdirSync(path.join(RAIZ, 'functions')).filter((f) => /\.js$/.test(f) && !/\.test\.js$/.test(f)).map((f) => path.join(RAIZ, 'functions', f)),
];
const INTERNO = /window\.GRC360|GRC360\.Logo|GRC360_[A-Z_]+|vendor\/grc360|ns\.GRC360/g;
const COMENTARIO = /^\s*(\/\/|\/?\*|<!--)/;

test('nenhum texto visivel diz "GRC360" (so nomes internos e comentarios)', () => {
  const achados = [];
  for (const arq of ARQUIVOS) {
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (COMENTARIO.test(linha)) return;
      const semComentarioFinal = linha.replace(/\s\/\/ .*$/, '');
      if (semComentarioFinal.replace(INTERNO, '').includes('GRC360')) achados.push(`${path.relative(RAIZ, arq)}:${i + 1}: ${linha.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(achados, []);
});

test('logo BIA: imagens novas, alt "BIA", proporcao do nome e favicon do B', () => {
  for (const f of ['bia-logo.png', 'bia-logo-branco.png', 'bia-logo-simbolo.png', 'bia-logo-simbolo-branco.png', 'bia-favicon.png']) {
    assert.ok(fs.existsSync(path.join(PUB, 'vendor', 'grc360', f)), f);
  }
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(PUB, 'vendor', 'grc360', 'bundle.js'), 'utf8'));
  const nav = dom.window.GRC360.Logo({ height: 28 }).querySelector('img');
  assert.match(nav.src, /bia-logo-simbolo\.png$/);
  assert.strictEqual(nav.alt, 'BIA');
  assert.strictEqual(nav.width, Math.round(28 * 336 / 151));
  const login = dom.window.GRC360.Logo({ height: 56, tagline: true }).querySelector('img');
  assert.match(login.src, /bia-logo\.png$/);
  assert.match(dom.window.GRC360.Logo({ height: 28, tone: 'on-dark' }).querySelector('img').src, /bia-logo-simbolo-branco\.png$/);
  for (const html of ['index.html', 'login.html']) {
    assert.match(fs.readFileSync(path.join(PUB, html), 'utf8'), /<link rel="icon" type="image\/png" href="vendor\/grc360\/bia-favicon\.png">/, html);
  }
  dom.window.close();
});
