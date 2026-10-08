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

  function Logo(props) {
    props = props || {};
    var height = Number(props.height) || 32;
    var width = Math.round(height * (360 / 96));
    var tone = props.tone === 'on-dark' ? 'on-dark' : 'default';
    var wrap = h('span', 'bia-logo bia-logo--' + tone);
    wrap.innerHTML =
      '<svg viewBox="0 0 360 96" width="' + width + '" height="' + height + '" role="img" aria-label="GRC360">' +
      '<text x="0" y="78" font-family="ui-sans-serif, system-ui, -apple-system, &quot;Segoe UI&quot;, sans-serif" font-weight="700" font-size="84" letter-spacing="-2" fill="currentColor">GRC36</text>' +
      '<circle cx="317" cy="48" r="23" fill="none" stroke="#d60014" stroke-width="14"></circle>' +
      '</svg>';
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
