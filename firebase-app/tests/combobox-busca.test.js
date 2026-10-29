// Campo de escolha com busca (29/10/2026): public/combobox-busca.js isolado em jsdom,
// mais a integração no drawer do Fornecedor ("Buscar pessoa...").
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

function montar(htmlSelect) {
  const dom = new JSDOM(`<body><label for="sel">Pessoa</label>${htmlSelect}</body>`, { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(PUB, 'util.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(PUB, 'combobox-busca.js'), 'utf8'));
  const sel = w.document.getElementById('sel');
  const cb = w.ComboboxBusca.aprimorar(sel);
  const digitar = (t) => { cb.campo.value = t; cb.campo.dispatchEvent(new w.Event('input')); };
  const tecla = (key) => cb.campo.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
  const opcoes = () => [...cb.lista.querySelectorAll('.combo-busca__opcao')].map((o) => o.textContent);
  const espera = () => new Promise((r) => setTimeout(r, 0));
  return { w, sel, cb, digitar, tecla, opcoes, espera };
}

const PESSOAS = `<select id="sel" style="width:100%;padding:9px 12px;"><option value="">Buscar pessoa...</option>
  <optgroup label="Da área TI"><option value="p1">João Silva — TI</option><option value="p2">Ana Souza — TI</option></optgroup>
  <optgroup label="Outras pessoas"><option value="p3">Mário Ângelo — Financeiro</option></optgroup></select>`;

test('campo no lugar do select: placeholder da opção vazia, label aponta para o campo, select escondido mas no DOM', () => {
  const { w, sel, cb } = montar(PESSOAS);
  assert.strictEqual(cb.campo.placeholder, 'Buscar pessoa...');
  assert.strictEqual(cb.campo.getAttribute('role'), 'combobox');
  assert.strictEqual(w.document.querySelector('label').getAttribute('for'), cb.campo.id);
  assert.ok(sel.classList.contains('combo-busca__select'));
  assert.strictEqual(w.document.getElementById('sel'), sel);
});

test('filtro sem acento e por qualquer parte do texto, com grupos e destaque', () => {
  const { cb, digitar, opcoes } = montar(PESSOAS);
  digitar('joao');
  assert.deepStrictEqual(opcoes(), ['João SilvaTI']);
  assert.match(cb.lista.innerHTML, /<mark>João<\/mark>/);
  digitar('financ');
  assert.deepStrictEqual(opcoes(), ['Mário ÂngeloFinanceiro'], 'acha pela informação secundária');
  digitar('ANGELO');
  assert.deepStrictEqual(opcoes(), ['Mário ÂngeloFinanceiro']);
  digitar('');
  assert.deepStrictEqual([...cb.lista.querySelectorAll('.combo-busca__grupo')].map((g) => g.textContent), ['Da área TI', 'Outras pessoas']);
  digitar('zzz');
  assert.match(cb.lista.textContent, /Nada encontrado/);
});

test('teclado: ↓/↑ com volta, Enter escolhe (grava value e dispara change), Esc fecha', () => {
  const { sel, cb, digitar, tecla } = montar(PESSOAS);
  let mudou = 0;
  sel.addEventListener('change', () => mudou++);
  digitar('a');
  tecla('ArrowUp');
  assert.strictEqual(cb.lista.querySelector('.combo-busca__opcao--ativa').textContent, 'Mário ÂngeloFinanceiro', 'volta para o último');
  tecla('ArrowDown');
  tecla('ArrowDown');
  tecla('Enter');
  assert.strictEqual(sel.value, 'p2');
  assert.strictEqual(mudou, 1);
  assert.strictEqual(cb.campo.value, 'Ana Souza — TI');
  assert.ok(cb.lista.hidden);
  assert.ok(!cb.campo.parentNode.querySelector('.combo-busca__limpar').hidden, 'valor escolhido ganha o ×');
  digitar('jo');
  tecla('Escape');
  assert.ok(cb.lista.hidden);
  assert.strictEqual(cb.campo.value, 'Ana Souza — TI', 'Esc restaura o escolhido');
});

test('campo de "adicionar": o handler devolve o select para vazio e o texto some', () => {
  const { sel, cb, digitar, tecla } = montar(PESSOAS);
  sel.addEventListener('change', () => { sel.value = ''; });
  digitar('ana');
  tecla('Enter');
  assert.strictEqual(sel.value, '');
  assert.strictEqual(cb.campo.value, '');
});

test('× limpa o valor e dispara change', () => {
  const { sel, cb } = montar(PESSOAS.replace('value="p3"', 'value="p3" selected'));
  assert.strictEqual(cb.campo.value, 'Mário Ângelo — Financeiro');
  let mudou = 0;
  sel.addEventListener('change', () => mudou++);
  cb.campo.parentNode.querySelector('.combo-busca__limpar').click();
  assert.strictEqual(sel.value, '');
  assert.strictEqual(cb.campo.value, '');
  assert.strictEqual(mudou, 1);
});

test('sincroniza: sel.value no código, repopular o select e disabled', async () => {
  const { sel, cb, espera, digitar, opcoes } = montar(PESSOAS);
  sel.value = 'p1';
  assert.strictEqual(cb.campo.value, 'João Silva — TI');
  sel.innerHTML = '<option value="">Buscar pessoa...</option><option value="p9">Zélia (pessoa removida)</option>';
  await espera();
  digitar('zelia');
  assert.deepStrictEqual(opcoes(), ['Zélia (pessoa removida)'], 'opção de legado aparece');
  sel.disabled = true;
  await espera();
  assert.ok(cb.campo.disabled);
});

test('limite de 50 resultados com aviso para continuar digitando', () => {
  const muitas = Array.from({ length: 70 }, (_, i) => `<option value="p${i}">Pessoa ${i}</option>`).join('');
  const { cb, digitar, opcoes } = montar(`<select id="sel"><option value="">Buscar...</option>${muitas}</select>`);
  digitar('pessoa');
  assert.strictEqual(opcoes().length, 50);
  assert.match(cb.lista.textContent, /\+ 20 — continue digitando/);
});

test('observar: select[data-busca] que aparece depois é aprimorado; o resto continua nativo', async () => {
  const dom = new JSDOM('<body><div id="app"></div></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(PUB, 'combobox-busca.js'), 'utf8'));
  w.ComboboxBusca.observar(w.document.body);
  w.document.getElementById('app').innerHTML = '<div><select id="a" data-busca><option value="">x</option></select><select id="b"></select></div>';
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(w.document.getElementById('a')._comboBusca);
  assert.ok(!w.document.getElementById('b')._comboBusca);
  assert.strictEqual(w.document.querySelectorAll('.combo-busca').length, 1);
});

test('Fornecedor: "Buscar pessoa..." acha digitando sem acento; papel + Adicionar põe na tabela', async () => {
  const SCRIPTS = ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js',
    'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js',
    'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js'];
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin'; w.USER_EMAIL = 'a@x';
  w.console.error = () => {};
  const DADOS = {
    getDependencias: [
      { id: 'f1', categoria: 'Fornecedores', nome: 'Alfa S.A.' },
      { id: 'p1', categoria: 'Pessoas', nome: 'João Pereira', areas: ['TI'] },
      { id: 'p2', categoria: 'Pessoas', nome: 'Ana Lima', areas: ['RH'] },
    ],
    getAreas: [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'RH' }],
  };
  w.API = new Proxy({}, { get: (_, n) => (n === 'invalidate' ? () => {} : async () => JSON.parse(JSON.stringify(DADOS[n] !== undefined ? DADOS[n] : (/Config/.test(n) ? {} : [])))) });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.fornecedores();
  await new Promise((r) => setTimeout(r, 20));
  await w.abrirDrawerFornecedorCadastro('f1');
  await new Promise((r) => setTimeout(r, 20));
  const sel = w.document.getElementById('fornPessoaRelAdd');
  const cb = sel._comboBusca;
  assert.ok(cb, 'o select de pessoa ganhou a busca');
  cb.campo.value = 'joao';
  cb.campo.dispatchEvent(new w.Event('input'));
  assert.deepStrictEqual([...cb.lista.querySelectorAll('.combo-busca__opcao')].map((o) => o.querySelector('.combo-busca__nome').textContent), ['João Pereira']);
  cb.campo.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.strictEqual(sel.value, 'p1');
  w.document.getElementById('fornPessoaRelPapel').value = w.document.getElementById('fornPessoaRelPapel').options[1].value;
  w.adicionarPessoaRelFornecedor();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(w.document.getElementById('fornPessoasRelTabela').textContent, /João Pereira/);
  assert.strictEqual(sel.value, '');
  assert.strictEqual(cb.campo.value, '');
  cb.campo.value = 'joao';
  cb.campo.dispatchEvent(new w.Event('input'));
  assert.strictEqual(cb.lista.querySelectorAll('.combo-busca__opcao').length, 0, 'quem já está relacionado sai da busca');
});
