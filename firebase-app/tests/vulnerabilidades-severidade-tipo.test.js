// Aba Severidade alinhada ao Tipo da vulnerabilidade (15/10/2026): metodo principal
// por tipo, alternativa recolhida, matriz com texto do tipo e aviso de divergencia.
// app.js real no jsdom, API de teste que registra gravacoes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const Cvss31 = require('../public/cvss31.js');

const base = (extra) => Object.assign({
  nome: 'Falha', produto: 'Servidor X', produtoSoftwareId: '', cvss: null, severidadeManual: '', statusCorrecao: 'Pendente',
  dataDeteccao: '2026-01-10', origemDeteccao: '', tipo: '', subtipo: '', metodoDeteccao: '', cvssVetor: '',
  severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);
const VETOR = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N'; // 5.3
const VULNS = [
  base({ id: 'semTipo', codigo: '2026-001' }),
  base({ id: 'tecnica', codigo: '2026-002', tipo: 'Falha de Aplicação Web / API' }),
  base({ id: 'tecnicaManual', codigo: '2026-003', tipo: 'Má Configuração', severidadeManual: 'Alta' }),
  base({ id: 'eol', codigo: '2026-004', tipo: 'Software Obsoleto / EOL' }),
  base({ id: 'eolComCve', codigo: '2026-005', tipo: 'Software Obsoleto / EOL', cvss: 9.8 }),
  base({ id: 'nc', codigo: '2026-006', tipo: 'Não Conformidade', severidadeManual: 'Média', severidadeCriterios: { impacto: 'Alto', facilidade: 'Possível' } }),
  base({ id: 'ncComCvss', codigo: '2026-007', tipo: 'Não Conformidade', cvss: 5.3, cvssVetor: VETOR, severidadeManual: 'Média' }),
];

async function carregar() {
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
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
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'combobox-busca.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // Pergunta "Há alterações não salvas" (16/10/2026): estes testes escolhem Salvar.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = () => {}; _perguntarAlteracoesNaoSalvas = async () => "salvar";');
  await w.vulnerabilidades();
  return { w, doc: w.document, gravacoes };
}

// Onde cada secao esta: 'principal', 'alternativa', 'oculta'.
function lugar(doc, id) {
  const el = doc.getElementById(id);
  if (el.closest('#vulnSevPrincipal')) return 'principal';
  if (el.closest('#vulnSevAlternativa')) return 'alternativa';
  if (el.closest('#vulnSevOculto')) return 'oculta';
  return 'fora';
}
const ordemPrincipal = (doc) => [...doc.getElementById('vulnSevPrincipal').children].map((e) => e.id);
const visivel = (el) => el.style.display !== 'none';
const cartoes = (doc) => [...doc.querySelectorAll('#vulnSemCvssCriterios button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
const trocarTipo = (w, doc, tipo) => { doc.getElementById('vulnTipo').value = tipo; w.trocarTipoVulnerabilidade(); };

test('sem tipo: os dois metodos abertos, CVSS primeiro, e a dica para escolher o tipo', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('semTipo');
  assert.deepStrictEqual(ordemPrincipal(doc), ['vulnSecaoCvss', 'vulnSecaoMatriz']);
  assert.equal(doc.getElementById('vulnSevAlternativa').style.display, 'none');
  assert.match(doc.getElementById('vulnSevMetodo').textContent, /Escolha o Tipo na Identificação/);
});

test('tipos tecnicos: CVSS principal, matriz recolhida (e fechada sem dado)', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('tecnica');
  assert.equal(lugar(doc, 'vulnSecaoCvss'), 'principal');
  assert.equal(lugar(doc, 'vulnSecaoMatriz'), 'alternativa');
  assert.equal(doc.getElementById('vulnSevAlternativa').open, false);
  assert.match(doc.getElementById('vulnSevAlternativaTitulo').textContent, /CVSS não se aplica/);
  assert.match(doc.getElementById('vulnSevMetodo').textContent, /Falha de Aplicação Web \/ API: CVSS 3\.1/);
  // texto padrao da matriz
  assert.match(doc.getElementById('vulnSemCvssCriterios').textContent, /Qual o impacto se acontecer\?/);
});

test('tipo tecnico com severidade manual gravada: a matriz alternativa abre sozinha', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('tecnicaManual');
  assert.equal(lugar(doc, 'vulnSecaoMatriz'), 'alternativa');
  assert.equal(doc.getElementById('vulnSevAlternativa').open, true);
});

test('EOL: matriz principal com perguntas proprias; CVSS recolhido, e aberto quando ja ha CVSS', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('eol');
  assert.equal(lugar(doc, 'vulnSecaoMatriz'), 'principal');
  assert.equal(lugar(doc, 'vulnSecaoCvss'), 'alternativa');
  assert.equal(doc.getElementById('vulnSevAlternativa').open, false);
  assert.match(doc.getElementById('vulnSemCvssCriterios').textContent, /Quão crítico é o ativo obsoleto\?/);
  assert.match(doc.getElementById('vulnSemCvssCriterios').textContent, /Quão exposto ele está\?/);
  assert.ok(cartoes(doc).some((t) => t.startsWith('Exploit ativo')));
  w.abrirDrawerVulnerabilidade('eolComCve');
  assert.equal(doc.getElementById('vulnSevAlternativa').open, true, 'CVSS gravado nao fica escondido');
});

test('IAM e Arquitetura: matriz principal com texto proprio', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('semTipo');
  trocarTipo(w, doc, 'Controle de Acesso / IAM');
  assert.equal(lugar(doc, 'vulnSecaoMatriz'), 'principal');
  assert.match(doc.getElementById('vulnSemCvssCriterios').textContent, /O que o acesso indevido permite\?/);
  trocarTipo(w, doc, 'Fraqueza de Arquitetura / Rede');
  assert.match(doc.getElementById('vulnSemCvssCriterios').textContent, /O que um atacante alcança/);
  assert.ok(cartoes(doc).some((t) => t.startsWith('Internet sem barreira')));
});

test('Nao Conformidade: so a matriz; CVSS nem aparece; perguntas de exposicao legal e chance de ser apontada', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('nc');
  assert.deepStrictEqual(ordemPrincipal(doc), ['vulnSecaoMatriz']);
  assert.equal(lugar(doc, 'vulnSecaoCvss'), 'oculta');
  assert.equal(doc.getElementById('vulnSevAlternativa').style.display, 'none');
  const texto = doc.getElementById('vulnSemCvssCriterios').textContent;
  assert.match(texto, /Qual a exposição legal, regulatória ou contratual\?/);
  assert.match(texto, /Qual a chance de ser apontada/);
  assert.ok(cartoes(doc).some((t) => t.startsWith('Já apontada')));
  assert.ok(!visivel(doc.getElementById('vulnSevDivergencia')), 'sem CVSS, sem aviso');
});

test('os criterios gravados continuam os codigos canonicos; o cartao marcado e o de mesma posicao', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('nc'); // impacto Alto, facilidade Possivel
  const marcados = cartoes(doc).filter((t) => t.includes('✓'));
  assert.deepStrictEqual(marcados.map((t) => t.split(' ✓')[0]), ['Alto', 'Possível']);
  // marcar "Já apontada" (posicao 3) grava o codigo canonico "Muito fácil" e sugere pela mesma regua
  w.selecionarCriterioSemCvssVulnerabilidade('facilidade', 3);
  assert.equal(w._vulnSemCvss.facilidade, 'Muito fácil');
  assert.equal(doc.getElementById('vulnSeveridadeManual').value, Cvss31.sugerirSeveridade('Alto', 'Muito fácil'));
  await w.salvarVulnerabilidade();
  assert.deepStrictEqual(gravacoes[0].severidadeCriterios, { impacto: 'Alto', facilidade: 'Muito fácil' });
});

test('trocar o tipo realinha a aba sem apagar respostas nem valores', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('nc');
  trocarTipo(w, doc, 'Má Configuração');
  assert.equal(lugar(doc, 'vulnSecaoCvss'), 'principal');
  assert.equal(lugar(doc, 'vulnSecaoMatriz'), 'alternativa');
  assert.deepStrictEqual({ ...w._vulnSemCvss }, { impacto: 'Alto', facilidade: 'Possível' });
  assert.equal(doc.getElementById('vulnSeveridadeManual').value, 'Média');
  assert.equal(doc.getElementById('vulnSevAlternativa').open, true, 'matriz com dado abre sozinha');
});

test('divergencia: Nao Conformidade com CVSS avisa (aba e Identificacao); "Limpar CVSS" zera nota, vetor e respostas', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.abrirDrawerVulnerabilidade('ncComCvss');
  assert.ok(visivel(doc.getElementById('vulnSevDivergencia')));
  assert.ok(visivel(doc.getElementById('vulnTipoAlerta')));
  assert.match(doc.getElementById('vulnBadgeSeveridade').textContent, /Média/, 'CVSS 5,3 manda (Média)');
  w.limparCvssVulnerabilidade();
  assert.equal(doc.getElementById('vulnCvss').value, '');
  assert.deepStrictEqual({ ...w._vulnCvssRespostas }, {});
  assert.ok(!visivel(doc.getElementById('vulnSevDivergencia')));
  assert.ok(!visivel(doc.getElementById('vulnTipoAlerta')));
  assert.match(doc.getElementById('vulnBadgeSeveridade').textContent, /Média/, 'agora vem da severidade manual');
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 1, 'limpar suja o formulario: Fechar grava');
  assert.equal(gravacoes[0].cvss, null);
  assert.equal(gravacoes[0].cvssVetor, '');
});

test('divergencia acompanha a edicao: trocar para Nao Conformidade com CVSS avisa; digitar CVSS avisa; nunca limpa sozinho', async () => {
  const { w, doc } = await carregar();
  w.abrirDrawerVulnerabilidade('eolComCve');
  assert.ok(!visivel(doc.getElementById('vulnSevDivergencia')));
  trocarTipo(w, doc, 'Não Conformidade');
  assert.ok(visivel(doc.getElementById('vulnSevDivergencia')));
  assert.equal(doc.getElementById('vulnCvss').value, '9.8', 'trocar o tipo nao apaga o CVSS');
  w.abrirDrawerVulnerabilidade('nc');
  doc.getElementById('vulnCvss').value = '4.0';
  w.atualizarBadgeSeveridadeVulnerabilidade();
  assert.ok(visivel(doc.getElementById('vulnSevDivergencia')));
});

test('abrir e fechar sem mexer nao grava, em qualquer metodo', async () => {
  const { w, gravacoes } = await carregar();
  for (const id of ['semTipo', 'tecnica', 'eolComCve', 'nc', 'ncComCvss']) {
    w.abrirDrawerVulnerabilidade(id);
    await w.fecharDrawerVulnerabilidade();
  }
  assert.equal(gravacoes.length, 0);
});
