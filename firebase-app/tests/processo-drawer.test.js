// Drawer de Processo (revisao de 21/10/2026): tabela de Fornecedores do BCP,
// aba DRP (DRPs das dependencias que sustentam o processo), Equipe de crise,
// Vinculos e chip "(removida)". Carrega o app.js REAL no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const ref = (d) => ({ id: d.id, nome: d.nome, categoria: d.categoria });
const DB = { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados', rtoMin: 600 };
const SRV = { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', rto: '2 horas', componentes: [ref(DB)],
  drpSalvo: JSON.stringify([{ versao: 1, data: '2026-10-01T10:00:00Z', autor: 'x' }]),
  drpRegistrosTeste: [{ data: '2026-09-15', resultado: 'Sucesso' }] };
const INFRA = { id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' };
const FORN = { id: 'forn', nome: 'Fornecedor X', categoria: 'Fornecedores', pessoasRelacionadas: [{ id: 'ana', nome: 'Ana', papel: 'Gerente de conta' }] };
const ANA = { id: 'ana', nome: 'Ana', categoria: 'Pessoas', telefone: '85 9999-0000', instalacao: { id: 'sede', nome: 'Sede' } };
const SEDE = { id: 'sede', nome: 'Sede', categoria: 'Instalações' };
const DEPS = [DB, SRV, INFRA, FORN, ANA, SEDE];

const P1 = {
  id: 'p1', area: 'TI', processo: 'Folha', rto: '< 4 horas',
  dependenciaItens: [ref(SRV), ref(FORN), ref(SEDE), { id: 'sumiu', nome: 'Sistema Antigo', categoria: 'Sistemas' }],
  bcpSlas: JSON.stringify({ 'Fornecedor X': '24x7' }), bcpPlanoBProvedores: '', bcpContatos: ['ana'],
  pcnSalvo: '',
};
const P2 = { id: 'p2', area: 'TI', processo: 'Compras', dependenciaItens: [], bcpContatos: [] };
const SERVICOS = [{ id: 's1', nome: 'Portal RH', processoIds: [{ id: 'p1', nome: 'Folha' }], dependenciaItens: [ref(INFRA)] }];

async function carregar(perfis, extra) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = perfis; w.USER_PERFIL = perfis[0]; w.USER_AREA = 'TI';
  const gravacoes = [];
  const dados = Object.assign({
    getDependencias: DEPS, getServicos: SERVICOS, getAreas: [{ id: 'a1', nome: 'TI', responsavel: 'Bruno' }],
    getProcessos: [P1, P2], getPerguntas: [], getConfigRespostas: null, getRiscosPorProcesso: [],
  }, extra || {});
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      if (nome === 'get') return { versoes: [{ versao: 1, html: '<h2>1. Objetivo</h2><p>Recuperar o SRV-01</p>' }] };
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.processos();
  return { w, doc: w.document, gravacoes };
}

const esperar = () => new Promise((r) => setTimeout(r, 20));

test('BCP: tabela de Fornecedores lista o fornecedor do processo, com o SLA gravado e a pessoa relacionada', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('bcp');
  const tabela = doc.getElementById('bcpFornecedoresTabela');
  assert.match(tabela.textContent, /Fornecedor X/);
  assert.match(tabela.textContent, /Ana/);
  assert.strictEqual(tabela.querySelector('.sla-valor').value, '24x7');
  tabela.querySelector('.planoB-contingencia').value = 'Provedor Y';
  await w.salvarProcesso();
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.deepStrictEqual(JSON.parse(g.bcpPlanoBProvedores), { 'Fornecedor X': 'Provedor Y' });
  assert.deepStrictEqual(JSON.parse(g.bcpSlas), { 'Fornecedor X': '24x7' });
});

test('BCP: abrir outro processo limpa a tabela -- salvar nao leva o Plano B/SLA do anterior', async () => {
  const { w, gravacoes } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('bcp');
  w.editarProcesso('p2');
  await w.salvarProcesso();
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.strictEqual(g.id, 'p2');
  assert.ok(!('bcpSlas' in g) && !('bcpPlanoBProvedores' in g));
});

test('BCP: equipe de crise mostra o dono e os contatos, somente leitura', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('bcp');
  const box = doc.getElementById('bcpContatosCrise').textContent;
  assert.match(box, /Dono do processo: Bruno/);
  assert.match(box, /Ana/);
  assert.match(box, /85 9999-0000/);
  assert.match(box, /Gere o PCN/);
});

test('DRP: lista dependencias diretas, via servico e componentes, com DRP, RTO acima do processo e ultimo teste', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('drp');
  await esperar();
  const tabela = doc.getElementById('drpProcessoTabela');
  const linhas = [...tabela.querySelectorAll('tbody tr')].filter((tr) => !tr.id);
  const nomes = linhas.map((tr) => tr.querySelector('strong').textContent);
  // Diretas primeiro (inclui fornecedor, instalacao e o item removido), depois via servico, depois componentes.
  assert.deepStrictEqual(nomes, ['Fornecedor X', 'Sede', 'Sistema Antigo', 'SRV-01', 'Cluster K8s', 'Oracle']);
  assert.ok(!nomes.includes('Ana'), 'Pessoas nao tem DRP');
  const srv = linhas[nomes.indexOf('SRV-01')];
  assert.match(srv.textContent, /Gerado/);
  assert.match(srv.textContent, /Teste: 15\/09\/2026 · Sucesso/);
  assert.ok(srv.querySelector('button[title="Ver a última versão aqui"]'));
  const oracle = linhas[nomes.indexOf('Oracle')];
  assert.match(oracle.textContent, /Componente de SRV-01/);
  assert.match(oracle.textContent, /Sem DRP/);
  assert.match(oracle.textContent, /10 h ⚠/, 'RTO de 10 h acima do RTO do processo (4 h)');
  assert.match(linhas[nomes.indexOf('Cluster K8s')].textContent, /Via serviço Portal RH/);
  assert.match(linhas[nomes.indexOf('Sistema Antigo')].textContent, /\(removida\)/);
  assert.match(doc.getElementById('drpProcessoResumo').textContent, /1 de 6 dependências com DRP gerado · 1 com RTO acima/);

  // Previa carregada sob demanda (obterDRP).
  await w.alternarPreviaDrpProcesso(nomes.indexOf('SRV-01'));
  assert.match(doc.getElementById('drpPreviaProcesso-' + nomes.indexOf('SRV-01')).textContent, /Recuperar o SRV-01/);
});

test('DRP: gestor ve a situacao, mas nao previa nem abrir (conteudo e de Admin/Seguranca/TI)', async () => {
  const { w, doc } = await carregar(['gestor']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('drp');
  await esperar();
  const tabela = doc.getElementById('drpProcessoTabela');
  assert.match(tabela.textContent, /SRV-01/);
  assert.ok(!tabela.querySelector('button[title="Ver a última versão aqui"]'));
  assert.ok(!tabela.querySelector('button[title="Abrir o DRP completo"]'));
  assert.match(tabela.textContent, /restrito a Admin, Segurança e TI/);
});

test('BIA: dependencia cujo cadastro foi removido vira chip cinza "(removida)"; Vinculos mostra servico e instalacao', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  const chip = [...doc.querySelectorAll('#fDependenciaTabela .dep-tag-item')].find((el) => /Sistema Antigo/.test(el.textContent));
  assert.ok(chip.classList.contains('dep-tag-item--removida'));
  assert.match(chip.textContent, /\(removida\)/);
  await esperar();
  const vinc = doc.getElementById('processoVinculos').textContent;
  assert.match(vinc, /Portal RH/);
  assert.match(vinc, /Sede/);
  assert.match(vinc, /1 pessoa lotada/);
  assert.match(vinc, /sem instalação alternativa/);
  assert.match(vinc, /1 dependência da aba BIA aponta para cadastro removido/);
});

test('detalhe somente leitura mostra MTD (campo do formulario), nao o antigo MTPD', async () => {
  const { w, doc } = await carregar(['operador'], { getProcessos: [{ ...P2, mtd: '24 horas' }] });
  w.verDetalhesProcesso('p2');
  const txt = doc.getElementById('modalDetalhesConteudo').textContent;
  assert.match(txt, /MTD/);
  assert.match(txt, /24 horas/);
  assert.doesNotMatch(txt, /MTPD/);
});
