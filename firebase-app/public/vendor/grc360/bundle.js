/* @ds-bundle: {"format":4,"namespace":"GRC360","components":[{"name":"Logo","group":"Brand"},{"name":"Badge","group":"Status"},{"name":"MetricCard","group":"Data"},{"name":"Button","group":"Actions"}]} */
(function () {
  function h(tag, className, children) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    (children || []).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  var LEVEL_LABEL = { low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico' };

  // Logo BIA (DECISAO 23/10/2026: o sistema volta a se chamar BIA). Mesma tipografia
  // escura e pesada do logo GRC360, sem o anel: o "B" leva o vermelho da marca.
  // O namespace GRC360 e a pasta vendor/grc360/ ficam (nomes internos). Arquivos:
  //   bia-logo(.png|-branco.png)          -> com tagline "GOVERNANCA · RISCO · COMPLIANCE"
  //   bia-logo-simbolo(.png|-branco.png)  -> so o nome (nav, espacos curtos)
  // Os grc360-logo*.png antigos continuam na pasta (e-mails ja enviados apontam para eles).
  // props.height = altura do NOME "BIA" em px. props.tagline = true usa a versao com tagline.
  // tone "on-dark" = versao branca (o "B" continua vermelho).
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^\/]*$/, '') : 'vendor/grc360/';
  })();

  function Logo(props) {
    props = props || {};
    var height = Number(props.height) || 32;
    var tone = props.tone === 'on-dark' ? 'on-dark' : 'default';
    var file = 'bia-logo' + (props.tagline ? '' : '-simbolo') + (tone === 'on-dark' ? '-branco' : '') + '.png';
    // largura da imagem / altura do nome: 336/151 so o nome; 841/151 com a tagline (mais larga)
    var width = Math.round(height * (props.tagline ? 841 / 151 : 336 / 151));
    var wrap = h('span', 'bia-logo bia-logo--' + tone);
    var img = document.createElement('img');
    img.src = BASE + file;
    img.width = width;
    img.alt = 'BIA';
    img.style.display = 'block';
    img.style.height = 'auto';
    wrap.appendChild(img);
    return wrap;
  }

  function Badge(props) {
    props = props || {};
    var level = props.level || 'low';
    var label = props.label || LEVEL_LABEL[level] || level;
    var dot = h('span', 'bia-badge__dot');
    var text = h('span', 'bia-badge__label label', [label]);
    return h('span', 'bia-badge bia-badge--' + level, [dot, text]);
  }

  function Button(props) {
    props = props || {};
    var variant = props.variant || 'primary';
    var label = props.label || 'Botão';
    var btn = h('button', 'bia-btn bia-btn--' + variant + ' label', [label]);
    btn.type = 'button';
    return btn;
  }

  function MetricCard(props) {
    props = props || {};
    var children = [
      h('div', 'bia-metric__label label', [props.label || 'Métrica']),
      h('div', 'bia-metric__value display', [String(props.value != null ? props.value : '0')])
    ];
    if (props.level) children.push(Badge({ level: props.level }));
    if (props.trend) children.push(h('div', 'bia-metric__trend body-sm', [props.trend]));
    return h('div', 'bia-metric', children);
  }

  var ns = window;
  ns.GRC360 = ns.GRC360 || {};
  Object.assign(ns.GRC360, { Logo: Logo, Badge: Badge, Button: Button, MetricCard: MetricCard });
})();
