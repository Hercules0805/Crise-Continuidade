// CWE e CVE conforme o Tipo da vulnerabilidade (15/10/2026): campo que o tipo nao
// usa some, a menos que ja tenha valor (ai fica com aviso e "Limpar").
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const base = (extra) => Object.assign({
  nome: 'Falha', produto: 'Servidor X', produtoSoftwareId: '', cvss: null, severidadeManual: 'Média', statusCorrecao: 'Pendente',
  dataDeteccao: '2026-01-10', origemDeteccao: '', tipo: '', subtipo: '', metodoDeteccao: '', cvssVetor: '', cwe: '', cve: '',
  severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);
const VULNS = [
  base({ id: 'semTipo', codigo: '2026-001' }),
  base({ id: 'nc', codigo: '2026-002', tipo: 'Não Conformidade' }),
  base({ id: 'ncComCwe', codigo: '2026-003', tipo: 'Não Conformidade', cwe: 'CWE-284' }),
  base({ id: 'web', codigo: '2026-004', tipo: 'Falha de Aplicação Web / API', cwe: 'CWE-284' }),
  base({ id: 'webComCve', codigo: '2026-005', tipo: 'Falha de Aplicação Web / API', cve: 'CVE-2026-1' }),
  base({ id: 'soft', codigo: '2026-006', tipo: 'Falha de Software (CVE / Bug)', subtipo: 'CVE Conhecido', cve: 'CVE-2025-55247' }),
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['seguranca']; w.USER_PERFIL = 'seguranca';
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (nome === 'salvarVulnerabilidade') { gravacoes.push(JSON.parse(JSON.stringify(arg))); return { success: true, id: arg.id || 'novo' }; }
      if (nome === 'getVulnerabilidades') return JSON.parse(JSON.stringify(VULNS));
      return [];
    },
    set: () => true,
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // Pergunta "Há alterações não salvas" (16/10/2026): estes testes escolhem Salvar.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {}; _perguntarAlteracoesNaoSalvas = async () => "salvar";');
  await w.vulnerabilidades();
  return { w, doc: w.document, gravacoes };
}

const vis = (doc, id) => doc.getElementById(id).style.display !== 'none';
const estado = (doc) => ({ cwe: vis(doc, 'vulnCampoCwe'), cve: vis(doc, 'vulnCampoCve'), linha: vis(doc, 'vulnLinhaCweCve') });
const trocarTipo = (w, doc, tipo) => { doc.getElementById('vulnTipo').value = tipo; w.trocarTipoVulnerabilidade(); };

const TABELA = {
  'Falha de Software (CVE / Bug)': { cwe: true, cve: true },
  'Software Obsoleto / EOL': { cwe: true, cve: true },
  'Má Configuração': { cwe: true, cve: true },
  'Falha de Aplicação Web / API': { cwe: true, cve: false },
  'Controle de Acesso / IAM': { cwe: true, cve: false },
  'Fraqueza de Arquitetura / Rede': { cwe: true, cve: false },
  'Não Conformidade': { cwe: false, cve: false },
};

test('cada tipo mostra CWE/CVE conforme a tabela; sem tipo mostra os dois', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('semTipo');
  assert.deepStrictEqual(estado(doc), { cwe: true, cve: true, linha: true });
  for (const [tipo, esperado] of Object.entries(TABELA)) {
    trocarTipo(w, doc, tipo);
    const e = estado(doc);
    assert.deepStrictEqual({ cwe: e.cwe, cve: e.cve }, esperado, tipo);
    assert.equal(e.linha, esperado.cwe || esperado.cve, `${tipo}: linha some quando nenhum aparece`);
  }
});

test('layout: com um so campo ele ocupa a linha; com os dois, duas colunas', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('semTipo');
  trocarTipo(w, doc, 'Controle de Acesso / IAM');
  assert.equal(doc.getElementById('vulnLinhaCweCve').style.gridTemplateColumns, '1fr');
  trocarTipo(w, doc, 'Má Configuração');
  assert.equal(doc.getElementById('vulnLinhaCweCve').style.gridTemplateColumns, '1fr 1fr');
});

test('Nao Conformidade sem CWE/CVE: a linha inteira sai do layout, sem aviso', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('nc');
  assert.deepStrictEqual(estado(doc), { cwe: false, cve: false, linha: false });
  assert.ok(!vis(doc, 'vulnCweAviso') && !vis(doc, 'vulnCveAviso'));
});

test('valor gravado num campo que o tipo nao usa continua visivel, com aviso; "Limpar" zera e o Fechar grava', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('ncComCwe');
  assert.deepStrictEqual(estado(doc), { cwe: true, cve: false, linha: true });
  assert.ok(vis(doc, 'vulnCweAviso'));
  assert.match(doc.getElementById('vulnCweAviso').textContent, /CWE não se aplica a Não Conformidade/);
  assert.equal(doc.getElementById('vulnCwe').value, 'CWE-284');
  w.limparCampoTecnicoVuln('cwe');
  assert.equal(doc.getElementById('vulnCwe').value, '');
  assert.deepStrictEqual(estado(doc), { cwe: false, cve: false, linha: false });
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].cwe, '');
});

test('Web/API: CWE normal; CVE gravado aparece com aviso', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('web');
  assert.deepStrictEqual(estado(doc), { cwe: true, cve: false, linha: true });
  assert.ok(!vis(doc, 'vulnCweAviso'));
  w.abrirDrawerVulnerabilidade('webComCve');
  assert.deepStrictEqual(estado(doc), { cwe: true, cve: true, linha: true });
  assert.ok(vis(doc, 'vulnCveAviso'));
  assert.match(doc.getElementById('vulnCveAviso').textContent, /CVE não se aplica a Falha de Aplicação Web \/ API/);
});

test('trocar o tipo nunca apaga CWE/CVE: so muda a visibilidade e o aviso', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('soft');
  trocarTipo(w, doc, 'Não Conformidade');
  assert.equal(doc.getElementById('vulnCve').value, 'CVE-2025-55247');
  assert.ok(vis(doc, 'vulnCampoCve') && vis(doc, 'vulnCveAviso'));
  trocarTipo(w, doc, 'Falha de Software (CVE / Bug)');
  assert.ok(!vis(doc, 'vulnCveAviso'));
});

test('subtipo "CVE Conhecido" mostra a dica do identificador', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('soft');
  assert.ok(vis(doc, 'vulnCveDica'));
  doc.getElementById('vulnSubtipo').value = 'Bug Interno';
  w._aplicarCamposPorTipoVuln();
  assert.ok(!vis(doc, 'vulnCveDica'));
});

test('abrir e fechar sem mexer nao grava', async () => {
  const { w, gravacoes } = await carregar();
  for (const id of VULNS.map((v) => v.id)) {
    w.abrirDrawerVulnerabilidade(id);
    await w.fecharDrawerVulnerabilidade();
  }
  assert.equal(gravacoes.length, 0);
});
