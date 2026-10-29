// Vulnerabilidades: Tipo/Subtipo (lista fixa em dois niveis), Metodo de Deteccao e
// "Reportado por" (15/10/2026). app.js real no jsdom, API de teste que registra gravacoes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

const base = (extra) => Object.assign({
  nome: 'Falha', produto: 'Servidor X', produtoSoftwareId: '', cvss: null, severidadeManual: 'Média', statusCorrecao: 'Pendente',
  dataDeteccao: '2026-01-10', origemDeteccao: '', tipo: '', subtipo: '', metodoDeteccao: '', cvssVetor: '',
  severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);
const VULNS = [
  base({ id: 'v1', codigo: '2026-001', nome: 'TestComplete [Não licenciado]', tipo: 'Não Conformidade', subtipo: 'Licenciamento', metodoDeteccao: 'Auditoria Interna', origemDeteccao: 'Dev Ponto' }),
  base({ id: 'v2', codigo: '2026-002', nome: 'CPF exposto', origemDeteccao: 'Cliente da UN JP' }),
  base({ id: 'v3', codigo: '2026-003', nome: 'Porta RDP aberta', tipo: 'Má Configuração', subtipo: 'Subtipo Antigo', metodoDeteccao: 'Varredura manual' }),
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
  const toasts = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['seguranca']; w.USER_PERFIL = 'seguranca';
  w.confirm = () => true;
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
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  w.__toasts = toasts;
  await w.vulnerabilidades();
  return { w, doc: w.document, gravacoes, toasts };
}

const opcoes = (sel) => [...sel.options].map((o) => o.value);
const trocarTipo = (w, doc, tipo) => { doc.getElementById('vulnTipo').value = tipo; w.trocarTipoVulnerabilidade(); };

test('drawer: os 7 tipos, Subtipo depende do Tipo, e a dica explica o tipo e a tratativa', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade();
  const tipos = opcoes(doc.getElementById('vulnTipo')).filter(Boolean);
  assert.equal(tipos.length, 7);
  assert.ok(tipos.includes('Não Conformidade') && tipos.includes('Fraqueza de Arquitetura / Rede'));
  assert.ok(doc.getElementById('vulnSubtipo').disabled, 'sem tipo, subtipo travado');
  trocarTipo(w, doc, 'Não Conformidade');
  assert.deepStrictEqual(opcoes(doc.getElementById('vulnSubtipo')), ['', 'Licenciamento', 'LGPD/Privacidade', 'Política Interna', 'PCI-DSS', 'Outro']);
  assert.match(doc.getElementById('vulnTipoDica').textContent, /orçamentária ou jurídica/);
  doc.getElementById('vulnSubtipo').value = 'LGPD/Privacidade';
  trocarTipo(w, doc, 'Software Obsoleto / EOL');
  assert.equal(doc.getElementById('vulnSubtipo').value, '', 'trocar o tipo limpa o subtipo');
  assert.ok(opcoes(doc.getElementById('vulnSubtipo')).includes('Sistema Operacional'));
  assert.match(doc.getElementById('vulnTipoDica').textContent, /migração/);
});

test('drawer: abre com o que esta gravado; "Reportado por" mostra o antigo origemDeteccao', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('v1');
  assert.equal(doc.getElementById('vulnTipo').value, 'Não Conformidade');
  assert.equal(doc.getElementById('vulnSubtipo').value, 'Licenciamento');
  assert.equal(doc.getElementById('vulnMetodoDeteccao').value, 'Auditoria Interna');
  assert.equal(doc.getElementById('vulnOrigemDeteccao').value, 'Dev Ponto');
  const rotulo = doc.getElementById('vulnOrigemDeteccao').parentElement.querySelector('label').textContent;
  assert.equal(rotulo, 'Reportado por');
});

test('drawer: subtipo e metodo fora da lista continuam visiveis, marcados', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('v3');
  const sub = doc.getElementById('vulnSubtipo');
  assert.equal(sub.value, 'Subtipo Antigo');
  assert.match(sub.selectedOptions[0].textContent, /\(fora da lista\)/);
  const met = doc.getElementById('vulnMetodoDeteccao');
  assert.equal(met.value, 'Varredura manual');
  assert.match(met.selectedOptions[0].textContent, /\(fora da lista\)/);
});

test('Tipo obrigatorio: salvar sem tipo avisa, volta para a Identificacao e nao grava', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  w.abrirDrawerVulnerabilidade('v2');
  w.trocarAbaVulnerabilidade('correcao');
  const ok = await w.salvarVulnerabilidade();
  assert.ok(!ok);
  assert.equal(gravacoes.length, 0);
  assert.equal(toasts.at(-1), 'Informe o tipo da vulnerabilidade.');
  assert.notEqual(doc.getElementById('painel-vuln-identificacao').style.display, 'none');
});

test('salvar com tipo grava tipo, subtipo e metodo', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('v2');
  trocarTipo(w, doc, 'Não Conformidade');
  doc.getElementById('vulnSubtipo').value = 'LGPD/Privacidade';
  doc.getElementById('vulnMetodoDeteccao').value = 'Report de Cliente';
  await w.salvarVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].tipo, 'Não Conformidade');
  assert.equal(gravacoes[0].subtipo, 'LGPD/Privacidade');
  assert.equal(gravacoes[0].metodoDeteccao, 'Report de Cliente');
  assert.equal(gravacoes[0].origemDeteccao, 'Cliente da UN JP', 'quem reportou nao se perde');
});

test('grade: coluna Tipo com subtipo; sem tipo = "Não classificada"; filtro Tipo e "Não classificada"', async () => {
  const { w, doc } = await carregar();
  const linha = (id) => doc.querySelector(`.chk-vulnerabilidade[data-id="${id}"]`).closest('tr');
  assert.match(linha('v1').textContent, /Não Conformidade\s*·?\s*Licenciamento/);
  assert.match(linha('v2').textContent, /Não classificada/);
  assert.equal(doc.querySelectorAll('thead th').length, linha('v1').children.length);
  assert.equal(doc.querySelectorAll('colgroup col').length, linha('v1').children.length);
  doc.getElementById('filtroVulnTipo').value = '__sem_tipo__';
  w.renderizarVulnerabilidades();
  assert.deepStrictEqual([...doc.querySelectorAll('.chk-vulnerabilidade')].map((c) => c.dataset.id), ['v2']);
  doc.getElementById('filtroVulnTipo').value = 'Má Configuração';
  w.renderizarVulnerabilidades();
  assert.deepStrictEqual([...doc.querySelectorAll('.chk-vulnerabilidade')].map((c) => c.dataset.id), ['v3']);
  doc.getElementById('filtroVulnTipo').value = '';
  doc.getElementById('buscaVulnerabilidade').value = 'licenciamento';
  w.renderizarVulnerabilidades();
  assert.deepStrictEqual([...doc.querySelectorAll('.chk-vulnerabilidade')].map((c) => c.dataset.id), ['v1'], 'a busca acha pelo subtipo');
});

test('lote: Tipo + Subtipo + Metodo; trocar o Tipo sem Subtipo zera o subtipo', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.toggleVulnerabilidadeSelecionada('v1', true);
  w.toggleVulnerabilidadeSelecionada('v3', true);
  w.abrirDrawerVulnerabilidadeLote();
  assert.ok(doc.getElementById('loteVulnSubtipo').disabled, 'sem tipo escolhido, subtipo do lote travado');
  doc.getElementById('loteVulnTipo').value = 'Controle de Acesso / IAM';
  w._popularSubtipoLoteVuln();
  assert.ok(opcoes(doc.getElementById('loteVulnSubtipo')).includes('Ausência de MFA'));
  doc.getElementById('loteVulnMetodo').value = 'Pentest';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes, ['v1', 'v3'].map((id) => ({ id, tipo: 'Controle de Acesso / IAM', subtipo: '', metodoDeteccao: 'Pentest' })));
});

test('lote: o campo de texto do lote agora se chama "Reportado por"', async () => {
  const { doc } = await carregar();
  assert.equal(doc.getElementById('loteVulnOrigem').parentElement.querySelector('label').textContent, 'Reportado por');
});

test('clonar copia tipo, subtipo e metodo; clonar selecionadas recusa as nao classificadas', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  w.clonarVulnerabilidade('v1');
  assert.equal(doc.getElementById('vulnTipo').value, 'Não Conformidade');
  assert.equal(doc.getElementById('vulnSubtipo').value, 'Licenciamento');
  assert.equal(doc.getElementById('vulnMetodoDeteccao').value, 'Auditoria Interna');
  w._fecharDrawerVulnerabilidadeSemSalvar && w._fecharDrawerVulnerabilidadeSemSalvar();
  w.toggleVulnerabilidadeSelecionada('v1', true);
  w.toggleVulnerabilidadeSelecionada('v2', true);
  await w.clonarVulnerabilidadesSelecionadas();
  assert.equal(gravacoes.length, 0);
  assert.equal(toasts.at(-1), 'Classifique o Tipo antes de clonar: 2026-002.');
  w.toggleVulnerabilidadeSelecionada('v2', false);
  await w.clonarVulnerabilidadesSelecionadas();
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0].tipo, 'Não Conformidade');
  assert.equal(gravacoes[0].subtipo, 'Licenciamento');
  assert.equal(gravacoes[0].metodoDeteccao, 'Auditoria Interna');
});
