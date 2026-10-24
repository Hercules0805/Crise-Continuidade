// Telas de lista no padrão "opção A · barra única" (DECISÃO 23/10/2026,
// layout/listas/opcao-a.html): cabeçalho com UM primário (o resto em "Mais
// ações"), barra única com contador, grade .data-table--lista com Ações por
// SVG_EDITAR/SVG_EXCLUIR, paginação e nenhum ícone colado à mão.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
  'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js',
  'sanitizar-pcn.js', 'contrato-ciclo.js', 'app.js'];

const DADOS = {
  getAreas: [{ id: 'a1', nome: 'TI', responsavel: 'Ana Souza', email: 'ana@fortestecnologia.com.br', telefone: '(85) 99999-0000' }],
  getDependencias: [{ id: 'p1', categoria: 'Pessoas', nome: 'Ana Souza', detalhes: 'Gerente', setor: 'TI', email: 'ana@fortestecnologia.com.br' }, { id: 'd1', categoria: 'Servidor', nome: 'SRV-01', detalhes: 'Banco do ERP' }],
  getServicos: [{ id: 'sv1', nome: 'ERP', descricao: 'Sistema de gestão', dependenciaItens: [] }],
  getBackups: [{ id: 'b1', nome: 'Backup ERP', servicoIds: ['sv1'], jobs: [] }],
  getProcessos: [{ id: 'pr1', area: 'TI', processo: 'Folha de pagamento', score: 0 }],
  getIndicadoresSeguranca: [{ id: 'i1', nome: 'Patches aplicados', pilar: 'Proteger', responsavel: 'Ana Souza', tipo: 'Percentual', metaMinima: 90 }],
  getProdutosSoftware: [{ id: 's1', nome: 'Fortes Ponto', ativo: true }],
  getPerfis: [{ email: 'ana@fortestecnologia.com.br', perfis: ['gestor'], area: 'TI' }],
  getCategoriasFornecedor: [{ id: 'c1', nome: 'Nuvem', ativo: true }],
  getSubcategoriasFornecedor: [{ id: 'sc1', nome: 'IaaS', categoriaId: 'c1', ativo: true }],
  getCriteriosFornecedor: [{ id: 'k1', nome: 'ISO 27001', descricao: 'Certificado vigente', peso: 3, ativo: true }],
  getConfigFornecedor: { limiarRisco: 50 },
  getCriticidadeFornecedorPerguntas: [{ id: 'q1', texto: 'Para a operação?', opcoes: [{ texto: 'Sim', peso: 3 }], ativa: true }],
  getPerguntas: [{ id: 'g1', pergunta: 'Qual o impacto?', categoria: 'Geral', ativa: true }],
};

function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.USER_PERFIS = ['admin']; w.USER_PERFIL = 'admin'; w.USER_EMAIL = 'adm@fortestecnologia.com.br';
  w.console.log = () => {}; w.console.error = () => {};
  w.API = new Proxy({}, { get: (_, n) => (n === 'invalidate' ? () => {} : async () => (DADOS[n] !== undefined ? JSON.parse(JSON.stringify(DADOS[n])) : (/Config/.test(n) ? {} : []))) });
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval('showToast = () => {};');
  return w;
}
const espera = () => new Promise((r) => setTimeout(r, 30));

const TELAS = [
  ['areas', true], ['pessoas', true], ['produtosSoftware', true], ['perfis', true],
  ['fornecedoresCategorias', true], ['fornecedoresSubcategorias', true], ['fornecedoresCriterios', true], ['fornecedoresCriticidadePerguntas', true],
  ['contratosTipos', false], ['contratosStatus', false], ['contratosIndexadores', false], ['catalogoBackupFerramentas', false],
  ['perguntas', false],
  ['dependencias', true], ['servicos', true], ['catalogoBackup', true], ['processos', true], ['indicadoresCadastro', true],
];

for (const [tela, temGrade] of TELAS) {
  test(`${tela}: cabeçalho com um primário, barra única e grade no padrão de lista`, async () => {
    const w = carregar();
    await w[tela]();
    await espera();
    const d = w.document;
    assert.ok(d.querySelector('.lista-cab h2'), 'cabeçalho de lista');
    assert.ok(d.querySelectorAll('.lista-cab .btn-primary').length <= 1, 'no máximo um botão primário');
    assert.ok(d.querySelector('.lista-barra .lista-contador'), 'barra única com contador');
    assert.ok(/\d/.test(d.querySelector('.lista-contador').textContent), 'contador preenchido');
    assert.strictEqual(d.querySelectorAll('#app svg[width="18"]').length, 0, 'sem ícone de 18px colado à mão');
    assert.strictEqual(d.querySelectorAll('#app .filters').length, 0, 'sem a barra de filtros antiga');
    if (temGrade) {
      assert.ok(d.querySelector('.data-table--lista'), 'grade compacta');
      assert.ok(d.querySelector('.data-table--lista tbody .col-acoes button[aria-label="Editar"], .data-table--lista tbody .col-acoes button[aria-label="Alterar"]'), 'ação de editar padronizada');
      assert.ok(d.querySelector('.paginacao'), 'paginação');
    }
    w.close();
  });
}

test('Pessoas: ação secundária fica em "Mais ações", que abre e fecha', async () => {
  const w = carregar();
  await w.pessoas();
  await espera();
  const d = w.document;
  const botao = d.querySelector('.mais-acoes [aria-haspopup]');
  assert.ok(botao);
  assert.match(d.querySelector('.mais-acoes__menu').textContent, /Gerar organograma/);
  // jsdom não executa onclick inline: chama o mesmo handler que o botão chama.
  w._alternarMaisAcoes(botao, null);
  assert.ok(d.querySelector('.mais-acoes').classList.contains('open'));
  assert.strictEqual(botao.getAttribute('aria-expanded'), 'true');
  d.body.click();
  assert.ok(!d.querySelector('.mais-acoes').classList.contains('open'));
  w.close();
});

test('barra única: filtro com o nome dentro, marca ativo, Limpar aparece e zera', async () => {
  const w = carregar();
  await w.pessoas();
  await espera();
  const d = w.document;
  const sel = d.getElementById('filtroPessoaFuncao');
  assert.strictEqual(sel.options[0].textContent, 'Função: Todas');
  assert.strictEqual(sel.options[1].textContent, 'Função: Tech Lead');
  assert.ok(d.querySelector('.lista-limpar').hidden);
  sel.value = 'techLead';
  w._marcarFiltroLista(sel); w.filtrarPessoas();
  assert.ok(sel.classList.contains('lista-sel--ativo'));
  assert.ok(!d.querySelector('.lista-limpar').hidden);
  assert.strictEqual(d.getElementById('pessoasContador').textContent, '0 pessoas');
  w._limparBarraLista(d.querySelector('.lista-limpar')); w.filtrarPessoas();
  assert.strictEqual(sel.value, '');
  assert.strictEqual(d.getElementById('pessoasContador').textContent, '1 pessoa');
  w.close();
});

test('Critérios: limiar de risco saiu da lista para o drawer "Configurar"', async () => {
  const w = carregar();
  await w.fornecedoresCriterios();
  await espera();
  const d = w.document;
  assert.ok(d.querySelector('#drawerConfigLista #fornLimiarBox #fornLimiar'), 'limiar dentro do drawer');
  assert.match(d.querySelector('.mais-acoes__menu').textContent, /Configurar nota que abre risco/);
  w.abrirConfigLista();
  assert.ok(d.getElementById('drawerConfigLista').classList.contains('open'));
  w.fecharConfigLista();
  assert.ok(!d.getElementById('drawerConfigLista').classList.contains('open'));
  w.close();
});

test('Pessoas: falha de carga mostra erro com "Tentar de novo" (antes ficava carregando)', async () => {
  const w = carregar();
  w.API = new Proxy({}, { get: () => async () => { throw new Error('rede'); } });
  await w.pessoas();
  await espera();
  assert.match(w.document.getElementById('app').textContent, /Não foi possível carregar as pessoas/);
  assert.ok(w.document.querySelector('#app button[onclick="pessoas()"]'));
  w.close();
});
