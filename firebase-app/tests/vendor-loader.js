// Ponte para carregar o DOMPurify empacotado em testes Node (precisa receber
// uma window, que vem do jsdom). O navegador nao usa este arquivo.
module.exports = function (window) {
  const fs = require('fs');
  const path = require('path');
  const codigo = fs.readFileSync(path.join(__dirname, 'vendor', 'purify-3.4.15.min.js'), 'utf8');
  const fn = new Function('window', 'module', 'exports', codigo + '\nreturn window.DOMPurify || module.exports;');
  const mod = { exports: {} };
  return fn(window, mod, mod.exports);
};
