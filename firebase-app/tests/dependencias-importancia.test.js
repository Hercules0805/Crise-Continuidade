// Dependências: importância pela cadeia (29/10/2026) -- coluna Sustenta, DRP,
// ordem padrão pela mais importante, filtros e aviso de crítica sem DRP.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js',
  'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js',
  'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js'];

const ref = (d) => ({ id: d.id, nome: d.nome, categoria: d.categoria });
const BD = { id: 'bd', nome: 'Oracle', categoria: 'Banco de Dados', detalhes: 'Base do faturamento' };
const SRV = { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', componentes: [ref(BD)] };
const API_ = { id: 'api', nome: 'API Pix', categoria: 'API', drpSalvo: [{ data: '2026-10-01', conteudo: 'x' }] };
const SQL = { id: 'sql', nome: 'SQL Server', categoria: 'Banco de Dados' };
const ORFA = { id: 'orfa', nome: 'Banco NEO', categoria: 'Banco de Dados' };
const FORN = { id: 'forn', nome: 'Nuvem SA', categoria: 'Fornecedores' };
const DEPS = [ORFA, SQL, API_, BD, SRV, FORN, { id: 'ana', nome: 'Ana', categoria: 'Pessoas' }];
const SERVICOS = [{ id: 's1', nome: 'Portal', dependenciaItens: [ref(SRV)] }];
const PROCESSOS = [
  { id: 'p1', processo: 'Faturamento', area: 'Fin', avaliado: true, score: 15, dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }, ref(FORN)] },
  { id: 'p2', processo: 'Cobrança', area: 'Fin', avaliado: true, score: 13, dependenciaItens: [ref(API_), ref(BD)] },
  { id: 'p3', processo: 'Arquivo', area: 'Adm', avaliado: true, score: 3, dependenciaItens: [ref(SQL)] },
  { id: 'p4', processo: 'Folha', area: 'RH', avaliado: true, score: 8, dependenciaItens: [ref(API_)] },
];

async function montar({ processosFalham = false } = {}) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin'; w.USER_EMAIL = 'a@x';
  w.console.error = () => {};
  const DADOS = { getDependencias: DEPS, getServicos: SERVICOS, getProcessos: PROCESSOS, getAreas: [] };
  w.API = new Proxy({}, { get: (_, n) => (n === 'invalidate' ? () => {} : async () => {
    if (n === 'getProcessos' && processosFalham) throw new Error('falhou');
    return JSON.parse(JSON.stringify(DADOS[n] !== undefined ? DADOS[n] : (/Config/.test(n) ? {} : [])));
  }) });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {};');
  await w.dependencias();
  const $ = (id) => w.document.getElementById(id);
  const linhas = () => [...$('depRows').querySelectorAll('tr')].map((tr) => [...tr.children].slice(0, 4).map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  const nomes = () => linhas().map((l) => l[0]);
  const filtrar = (id, v) => { $(id).value = v; w.filtrarDependencias(); };
  return { w, $, linhas, nomes, filtrar };
}

test('ordem padrão: Tier mais alto primeiro, depois mais processos; colunas Sustenta e DRP', async () => {
  const { linhas, nomes } = await montar();
  // Oracle: p1 (via Portal > SRV-01) e p2 direto -> Tier 1 com 2; SRV-01, Nuvem SA: Tier 1 com 1;
  // API Pix: p2 (T1) e p4 (T2) -> Tier 1 com 2; SQL: Tier 3; Banco NEO: nenhum.
  assert.deepStrictEqual(nomes(), ['API Pix', 'Oracle', 'Nuvem SA', 'SRV-01', 'SQL Server', 'Banco NEO']);
  const porNome = Object.fromEntries(linhas().map((l) => [l[0], l]));
  assert.deepStrictEqual(porNome['Oracle'].slice(1), ['Tier 1 · 2 processos', 'Sem DRP', 'Banco de Dados']);
  assert.deepStrictEqual(porNome['API Pix'].slice(1, 3), ['Tier 1 · 2 processos', 'Com DRP']);
  assert.deepStrictEqual(porNome['SQL Server'].slice(1, 3), ['Tier 3 · 1 processo', 'Sem DRP']);
  assert.deepStrictEqual(porNome['Banco NEO'].slice(1, 3), ['Nenhum processo', 'Sem DRP']);
});

test('title lista os processos com Tier e origem; Papel vai para o title do nome; Sem DRP vermelho só se crítica', async () => {
  const { $ } = await montar();
  const tr = [...$('depRows').querySelectorAll('tr')].find((x) => x.children[0].textContent === 'Oracle');
  assert.strictEqual(tr.children[0].getAttribute('title'), 'Oracle — Base do faturamento');
  const t = tr.children[1].querySelector('[title]').getAttribute('title');
  assert.match(t, /^Cobrança — Tier 1 · Direta \(legado\)\nFaturamento — Tier 1 · Componente de SRV-01/);
  assert.ok(tr.children[2].querySelector('.chip--l4'), 'Oracle: Tier 1 sem DRP em selo');
  const sql = [...$('depRows').querySelectorAll('tr')].find((x) => x.children[0].textContent === 'SQL Server');
  assert.ok(!sql.children[2].querySelector('.chip'), 'Tier 3 sem DRP: texto cinza');
});

test('aviso de crítica sem DRP conta e filtra; filtros Sustenta e DRP', async () => {
  const { $, w, nomes, filtrar } = await montar();
  assert.match($('dependenciasAlerta').textContent, /3 dependências sustentam processos Tier 1 ou 2 e estão sem DRP/);
  w.filtrarDependenciasCriticasSemDrp();
  assert.deepStrictEqual(nomes(), ['Oracle', 'Nuvem SA', 'SRV-01']);
  assert.ok($('filtroDepSustenta').classList.contains('lista-sel--ativo'));
  filtrar('filtroDepDrp', '');
  filtrar('filtroDepSustenta', 'nenhum');
  assert.deepStrictEqual(nomes(), ['Banco NEO']);
  filtrar('filtroDepSustenta', 't3');
  assert.deepStrictEqual(nomes(), ['SQL Server']);
  filtrar('filtroDepSustenta', '');
  filtrar('filtroDepDrp', 'com');
  assert.deepStrictEqual(nomes(), ['API Pix']);
});

test('ordenar por Sustenta inverte; por DRP põe a crítica sem DRP primeiro', async () => {
  const { w, nomes } = await montar();
  w.ordenarDependencias('sustenta');
  assert.deepStrictEqual(nomes()[0], 'Banco NEO');
  w.ordenarDependencias('drp');
  assert.deepStrictEqual(nomes().slice(0, 3), ['Nuvem SA', 'Oracle', 'SRV-01']);
  assert.strictEqual(nomes()[5], 'API Pix');
});

test('processos não carregaram: a lista aparece com "—" e sem aviso', async () => {
  const { $, linhas } = await montar({ processosFalham: true });
  assert.strictEqual(linhas().length, 6);
  assert.ok(linhas().every((l) => l[1] === '—'));
  assert.strictEqual($('dependenciasAlerta').textContent, '');
});

test('drawer da dependência mostra o mesmo selo no título', async () => {
  const { w, $ } = await montar();
  w.editarDep('bd');
  assert.match($('depDrawerTitulo').textContent, /Oracle · Tier 1 · 2 processos/);
});
