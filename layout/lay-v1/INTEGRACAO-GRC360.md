# Aplicando o GRC360 no sistema

Quatro arquivos, nessa ordem:

1. **`tokens.css`** — as cores, tipografia, espaçamento e raio como variáveis CSS (`--brand`, `--ink`, `--space-16`...) e classes de texto (`.display`, `.heading`, `.body`...). Carregue antes de qualquer outro CSS do sistema.
2. **`bundle.css`** — o visual dos componentes (`Logo`, `Badge`, `Button`, `MetricCard`), em cima das variáveis do passo 1.
3. **`bundle.js`** — um script clássico (sem build, sem import) que expõe `window.GRC360` com os quatro componentes.
4. **`grc360-wordmark.svg`** — a marca em vetor, pra usos fora do bundle (favicon, documentos, apresentações).

## Num HTML simples

```html
<link rel="stylesheet" href="/caminho/para/tokens.css">
<link rel="stylesheet" href="/caminho/para/bundle.css">
<script src="/caminho/para/bundle.js"></script>
```

E depois, em qualquer ponto do seu JS:

```js
document.getElementById('nav-logo')
  .appendChild(window.GRC360.Logo({ height: 28, tone: 'on-dark' }));

document.getElementById('kpi-risco')
  .appendChild(window.GRC360.MetricCard({ label: 'Risco agregado', value: 72, level: 'high', trend: '+5 esta semana' }));
```

As classes de texto do `tokens.css` (`.display`, `.heading-lg`, `.heading`, `.body`, `.body-sm`, `.label`, `.code`) funcionam em qualquer elemento, com ou sem os componentes: `<h1 class="display">...</h1>`.

## Se o sistema usa um framework (React, Vue...)

Os componentes do `bundle.js` são funções que retornam elementos DOM puro — funcionam carregando o script globalmente e chamando `window.GRC360.X(...)` dentro de um `useEffect`/`onMounted`, mas o mais natural é reescrever cada um como componente nativo do framework, usando as MESMAS variáveis CSS e as mesmas classes (`bia-badge`, `bia-btn`, `bia-metric`, `bia-logo`) do `bundle.css` — o visual fica idêntico, só a forma de montar muda. Me diga qual framework o sistema usa que eu já devolvo os componentes nesse formato.

## O que falta

A tipografia real da Fortes não foi confirmada (ver nota em `tokens.css`) — se você tiver o nome da fonte ou os arquivos, eu atualizo `tokens.css` e o `README.md` do Design System.
