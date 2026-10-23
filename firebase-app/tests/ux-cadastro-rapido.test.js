// Cadastro rápido (DECISÃO 19/10/2026): "+ Novo X" abre o cadastro completo POR CIMA
// do formulário de origem e, ao salvar, devolve o item criado já selecionado.
// Carrega o app.js real num navegador simulado (jsdom).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const SCRIPTS = ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js',
  'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js', 'app.js'];

function carregar(dados = {}) {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {};
  w.APP_API_URL = '';
  w.USER_PERFIS = ['admin'];
  w.USER_PERFIL = 'admin';
  w.USER_EMAIL = 'adm@fortestecnologia.com.br';
  w.confirm = () => true;
  w.console.log = () => {};
  w.console.error = () => {};
  w.__salvos = [];
  w.API = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'invalidate') return () => {};
      return async (...a) => {
        if (/^salvar/.test(nome)) {
          const b = a[0] || {};
          const id = b.id || ('novo-' + (w.__salvos.length + 1));
          w.__salvos.push({ nome, b, id });
          return { success: true, id, dado: { ...b, id } };
        }
        if (dados[nome] !== undefined) return JSON.parse(JSON.stringify(dados[nome]));
        return /Config/.test(nome) ? {} : [];
      };
    },
  });
  SCRIPTS.forEach((f) => { if (fs.existsSync(path.join(PUB, f))) w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')); });
  w.eval('showToast = () => {};');
  return w;
}
const espera = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const aberto = (w, id) => w.document.getElementById(id).classList.contains('open');

test('Vulnerabilidade -> + Nova pessoa: cadastra por cima e volta com a pessoa selecionada como responsável', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.vulnerabilidades();
  await espera();
  w.abrirDrawerVulnerabilidade();
  await w.novaPessoaDeVulnerabilidade();
  assert.ok(aberto(w, 'drawerPessoa'), 'cadastro de Pessoa aberto');
  assert.ok(!aberto(w, 'drawerVulnerabilidade'), 'vulnerabilidade escondida (não destruída)');
  w.document.getElementById('pessoaNome').value = 'Ana Souza';
  await w.salvarPessoaCadastro();
  await espera();
  assert.ok(!aberto(w, 'drawerPessoa'), 'cadastro fechou');
  assert.ok(aberto(w, 'drawerVulnerabilidade'), 'voltou para a vulnerabilidade');
  assert.strictEqual(w.document.getElementById('vulnResponsavel').value, 'Ana Souza', 'pessoa nova já selecionada');
  assert.strictEqual(w._drawerPaiEmpilhados.length, 0);
  w.close();
});

test('desistir do cadastro rápido volta para a origem sem selecionar nada', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.vulnerabilidades();
  await espera();
  w.abrirDrawerVulnerabilidade();
  await w.novaPessoaDeVulnerabilidade();
  w.eval('_fecharModalPessoaSemSalvar()');
  assert.ok(aberto(w, 'drawerVulnerabilidade'));
  assert.strictEqual(w.document.getElementById('vulnResponsavel').value, '');
  assert.strictEqual(w.__salvos.length, 0);
  w.close();
});

test('Fornecedor -> + Nova área: grava, volta com a área já adicionada como relacionada e não mexe em grade de outra tela', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }], getDependencias: [{ id: 'f1', categoria: 'Fornecedores', nome: 'Forn' }] });
  await w.fornecedores();
  await espera();
  w.abrirDrawerFornecedorCadastro();
  await w.novaAreaDeFornecedor();
  assert.ok(aberto(w, 'modal'), 'modal de Área aberto por cima');
  w.document.getElementById('fNome').value = 'Jurídico';
  await w.salvarArea();
  await espera();
  assert.ok(aberto(w, 'drawerFornecedorCadastro'), 'voltou para o fornecedor');
  assert.deepStrictEqual([...w._fornAreasRel], ['Jurídico']);
  assert.match(w.document.getElementById('fornAreasRelChips').textContent, /Jurídico/);
  w.close();
});

test('Fornecedor -> + Nova pessoa: cadastra por cima e volta com a pessoa como relacionada (papel escolhido ou "Outro")', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }], getDependencias: [{ id: 'f1', categoria: 'Fornecedores', nome: 'Forn' }] });
  await w.fornecedores();
  await espera();
  w.abrirDrawerFornecedorCadastro();
  await w.novaPessoaDeFornecedor();
  assert.ok(aberto(w, 'drawerPessoa'), 'cadastro de Pessoa aberto por cima');
  w.document.getElementById('pessoaNome').value = 'Ana Souza';
  await w.salvarPessoaCadastro();
  await espera();
  assert.ok(aberto(w, 'drawerFornecedorCadastro'), 'voltou para o fornecedor');
  assert.strictEqual(w._fornPessoasRel.length, 1);
  assert.strictEqual(w._fornPessoasRel[0].nome, 'Ana Souza');
  assert.strictEqual(w._fornPessoasRel[0].papel, 'Outro', 'sem papel escolhido antes, entra como "Outro" (ajustavel na lista)');
  assert.match(w.document.getElementById('fornPessoasRelTabela').textContent, /Ana Souza/);
  w.close();
});

test('Pessoa -> + Novo produto: produto criado aparece na liderança da pessoa', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.pessoas();
  await espera();
  w.abrirModalPessoa();
  await w.novoProdutoDePessoa();
  assert.ok(aberto(w, 'modalProdutoSoftware'));
  w.document.getElementById('prodSoftNome').value = 'Fortes Ponto';
  await w.salvarProdutoSoftware();
  await espera();
  assert.ok(aberto(w, 'drawerPessoa'), 'voltou para a pessoa');
  assert.ok(!aberto(w, 'modalProdutoSoftware'));
  w.close();
});

test('troca de tela descarta qualquer cadastro rápido empilhado', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.vulnerabilidades();
  await espera();
  w.abrirDrawerVulnerabilidade();
  await w.novaPessoaDeVulnerabilidade();
  assert.strictEqual(w._drawerPaiEmpilhados.length, 1);
  w._perfilCarregado = true;
  w.location.hash = '#areas';
  w.route();
  assert.strictEqual(w._drawerPaiEmpilhados.length, 0);
  w.close();
});

test('nenhum "Gerenciar X" abre outra aba do navegador', () => {
  const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /target="_blank"[^>]*>[^<]*(Gerenciar|Cadastrar nova)/);
  assert.doesNotMatch(app, /window\.open\('#pessoas\?editPessoa=/);
});

test('Contrato -> + Novo tipo / + Novo status: o item criado volta selecionado no campo do contrato', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.contratos();
  await espera();
  w.abrirDrawerContrato();
  await espera();
  await w.novoItemListaDeContrato('tipos');
  assert.ok(aberto(w, 'drawerListaContrato'), 'drawer da lista aberto por cima');
  assert.strictEqual(w.document.getElementById('listaContratoSituacao'), null, 'Tipo não tem campo Situação');
  w.document.getElementById('listaContratoNome').value = 'Licença de software';
  await w.salvarItemListaContrato();
  await espera();
  assert.ok(aberto(w, 'drawerContrato'), 'voltou para o contrato');
  const tipo = w.document.getElementById('contratoTipo');
  assert.ok(tipo.value, 'tipo novo selecionado');
  // Status usa o mesmo drawer, recriado com o campo Situação.
  await w.novoItemListaDeContrato('status');
  assert.ok(w.document.getElementById('listaContratoSituacao'), 'Status tem campo Situação');
  w.document.getElementById('listaContratoNome').value = 'Em vigor';
  await w.salvarItemListaContrato();
  await espera();
  assert.ok(aberto(w, 'drawerContrato'));
  assert.ok(w.document.getElementById('contratoStatus').value, 'status novo selecionado');
  w.close();
});

test('Contrato -> + Novo fornecedor: fornecedor criado volta selecionado no contrato', async () => {
  const w = carregar({ getAreas: [{ nome: 'TI' }] });
  await w.contratos();
  await espera();
  w.abrirDrawerContrato();
  await espera();
  await w.novoFornecedorDeContrato();
  assert.ok(aberto(w, 'drawerFornecedorCadastro'));
  w.document.getElementById('fornCadNome').value = 'Nuvem S.A.';
  await w.salvarFornecedorCadastro();
  await espera();
  assert.ok(aberto(w, 'drawerContrato'), 'voltou para o contrato');
  const sel = w.document.getElementById('contratoFornecedor');
  assert.ok(sel.value && sel.options[sel.selectedIndex].textContent.includes('Nuvem S.A.'));
  w.close();
});
