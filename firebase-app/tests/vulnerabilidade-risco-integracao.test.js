// Vulnerabilidades <-> Registro de Riscos, norteado pelo NIST (15/10/2026):
// vinculo navegavel, atraso, painel de exposicao, limiar, apetite, residual,
// exigencias por status e reavaliacao. app.js real no jsdom, API de teste.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const HOJE = new Date().toISOString().slice(0, 10);
const ONTEM = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const vbase = (extra) => Object.assign({
  nome: 'Falha', produto: '', produtoSoftwareId: '', dependenciasAfetadas: [], cvss: null, severidadeManual: 'Média',
  statusCorrecao: 'Pendente', dataDeteccao: '2026-01-10', origemDeteccao: '', tipo: 'Má Configuração', subtipo: '',
  metodoDeteccao: '', cvssVetor: '', cwe: '', cve: '', responsavel: 'Ana', severidadeCriterios: { impacto: '', facilidade: '' },
}, extra);
const VULNS = [
  vbase({ id: 'v1', codigo: '2026-001', nome: 'Com risco aceito', cvss: 9.8 }),
  vbase({ id: 'v2', codigo: '2026-002', nome: 'Atrasada', dataPrevistaCorrecao: ONTEM }),
  vbase({ id: 'v3', codigo: '2026-003', nome: 'Alta sem risco', severidadeManual: 'Alta' }),
  vbase({ id: 'v4', codigo: '2026-004', nome: 'Corrigida', statusCorrecao: 'Corrigida', cvss: 9.8, dataPrevistaCorrecao: ONTEM }),
];
const rbase = (extra) => Object.assign({
  area: '', titulo: 'Risco', status: 'Identificado', origem: 'Manual', categorias: ['Operacional'], probabilidade: '', impacto: '',
  planoAcao: [], kris: [], impactoFinanceiroComponentes: [], historicoReavaliacao: '',
}, extra);
const RISCOS = [
  rbase({ id: 'r1', titulo: 'Risco da v1', origem: 'Vulnerabilidade', vulnerabilidadeId: 'v1', vulnerabilidadeCodigo: '2026-001', status: 'Aceito', probabilidade: 'Alta', impacto: 'Crítico', alertaAutomacao: 'Severidade caiu para Média (abaixo do limiar 7).' }),
  rbase({ id: 'r2', titulo: 'Vencido', status: 'Em Tratamento', probabilidade: 'Baixa', impacto: 'Baixo', proximaReavaliacao: ONTEM, estrategiaTratamento: 'Transferir' }),
  rbase({ id: 'r3', titulo: 'Novo sem avaliação' }),
  rbase({ id: 'r4', titulo: 'Com residual', probabilidade: 'Média', impacto: 'Moderado', probabilidadeResidual: 'Baixa', impactoResidual: 'Baixo' }),
];

async function carregar(opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = { risco: [], config: [] };
  const toasts = [];
  const confirms = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = o.perfis || ['admin']; w.USER_PERFIL = (o.perfis || ['admin'])[0];
  w.USER_EMAIL = 'eu@x.com';
  w.confirm = (m) => { confirms.push(m); return o.confirmar !== false; };
  const dados = {
    getVulnerabilidades: VULNS, getRiscos: RISCOS, getAreas: [{ id: 'a1', nome: 'TI' }],
    getDependencias: [{ id: 'pp', categoria: 'Pessoas', nome: 'Ana' }, { id: 'pq', categoria: 'Pessoas', nome: 'Diretor' }],
    getConfigVulnerabilidade: { limiarCvss: 7 }, getConfigRiscos: { apetite: 'Moderado' },
  };
  w.API = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'invalidate') return () => {};
      return async (arg) => {
        if (nome === 'salvarRisco') { gravacoes.risco.push(JSON.parse(JSON.stringify(arg))); return { success: true, id: arg.id || 'novo' }; }
        if (nome === 'salvarConfigVulnerabilidade' || nome === 'salvarConfigRiscos') { gravacoes.config.push({ nome, arg }); return { success: true }; }
        const d = dados[nome];
        return d === undefined ? [] : JSON.parse(JSON.stringify(d));
      };
    },
    set: () => true,
  });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); };');
  w.__toasts = toasts;
  return { w, doc: w.document, gravacoes, toasts, confirms };
}

const linhaVuln = (doc, id) => doc.querySelector(`.chk-vulnerabilidade[data-id="${id}"]`).closest('tr');

// ---------------------------------------------------------------- Vulnerabilidades

test('vulnerabilidade: risco Aceito conta como ativo; o link abre O risco (#riscos?risco=)', async () => {
  const { w, doc } = await carregar();
  await w.vulnerabilidades();
  const a = linhaVuln(doc, 'v1').querySelector('a[href^="#riscos"]');
  assert.ok(a, 'selo do risco aparece');
  assert.equal(a.getAttribute('href'), '#riscos?risco=r1');
  assert.match(a.textContent, /Risco aceito/);
});

test('vulnerabilidade: selo "Atrasada" e filtro Atrasadas (corrigida não conta)', async () => {
  const { w, doc } = await carregar();
  await w.vulnerabilidades();
  assert.ok(linhaVuln(doc, 'v2').querySelector('.vuln-atrasada'));
  assert.ok(!linhaVuln(doc, 'v4').querySelector('.vuln-atrasada'));
  doc.getElementById('filtroVulnStatus').value = '__atrasadas__';
  w.renderizarVulnerabilidades();
  assert.deepStrictEqual([...doc.querySelectorAll('.chk-vulnerabilidade')].map((c) => c.dataset.id), ['v2']);
});

test('lista: aviso "acima do limiar sem risco" com atalho de seleção (a exposição fica no Painel de Vulnerabilidades)', async () => {
  const { w, doc } = await carregar();
  await w.vulnerabilidades();
  const painel = doc.getElementById('vulnPainelExposicao').textContent.replace(/\s+/g, ' ');
  assert.doesNotMatch(painel, /Em aberto/, 'a exposição saiu da lista');
  assert.match(painel, /Acima do limiar sem risco: 1/);
  w.selecionarVulnSemRisco();
  assert.match(doc.getElementById('btnExportarVulnRiscos').textContent, /\(1\)/);
  assert.ok(linhaVuln(doc, 'v3').querySelector('.chk-vulnerabilidade').checked);
});

test('limiar: Admin edita e salva; Segurança só vê o valor', async () => {
  const adm = await carregar();
  await adm.w.vulnerabilidades();
  adm.doc.getElementById('vulnLimiarCvss').value = '8';
  await adm.w.salvarLimiarVulnerabilidade();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(adm.gravacoes.config)), [{ nome: 'salvarConfigVulnerabilidade', arg: { limiarCvss: 8 } }]);
  const si = await carregar({ perfis: ['seguranca'] });
  await si.w.vulnerabilidades();
  assert.equal(si.doc.getElementById('vulnLimiarCvss'), null);
  assert.match(si.doc.getElementById('vulnLimiarBox').textContent, /CVSS\s*7/);
});

// ---------------------------------------------------------------- Registro de Riscos

test('riscos: selos Acima do apetite / Reavaliação vencida / Revisar e filtro Situação', async () => {
  const { w, doc } = await carregar();
  await w.riscos();
  const linha = (titulo) => [...doc.querySelectorAll('#riscoRows tr')].find((tr) => tr.textContent.includes(titulo));
  assert.match(linha('Risco da v1').textContent, /Acima do apetite/);
  assert.match(linha('Risco da v1').textContent, /Revisar/);
  assert.match(linha('Vencido').textContent, /Reavaliação vencida/);
  const ids = () => [...doc.querySelectorAll('#riscoRows tr')].map((tr) => tr.textContent.match(/Risco da v1|Vencido|Novo sem avaliação|Com residual/)[0]);
  doc.getElementById('filtroRiscoSituacao').value = 'apetite'; w.filtrarRiscos();
  assert.deepStrictEqual(ids(), ['Risco da v1']);
  doc.getElementById('filtroRiscoSituacao').value = 'reavaliacao'; w.filtrarRiscos();
  assert.deepStrictEqual(ids(), ['Vencido']);
  doc.getElementById('filtroRiscoSituacao').value = 'alerta'; w.filtrarRiscos();
  assert.deepStrictEqual(ids(), ['Risco da v1']);
  assert.match(doc.getElementById('riscoApetiteBox').textContent, /1 risco\(s\) acima do apetite/);
});

test('riscos: coluna Residual e cabeçalho/colgroup alinhados', async () => {
  const { w, doc } = await carregar();
  await w.riscos();
  const tr = [...doc.querySelectorAll('#riscoRows tr')].find((x) => x.textContent.includes('Com residual'));
  assert.equal(doc.querySelectorAll('#listaRiscos thead th').length, tr.children.length);
  assert.equal(doc.querySelectorAll('#listaRiscos colgroup col').length, tr.children.length);
  assert.ok(tr.querySelector('[title^="Residual: Baixo (4 de 25)"]'), 'Baixa x Baixo = 4, nível Baixo (escala NIST 5x5)');
});

test('drawer: cartão da vulnerabilidade de origem com link, e alerta da automação', async () => {
  const { w, doc } = await carregar();
  await w.riscos();
  await w.editarRisco('r1');
  await new Promise((r) => setTimeout(r, 20));
  const card = doc.getElementById('rOrigemVulnCard');
  assert.notEqual(card.style.display, 'none');
  assert.match(card.textContent, /Vulnerabilidade 2026-001 — Com risco aceito/);
  assert.equal(card.querySelector('a').getAttribute('href'), '#vulnerabilidades?vuln=v1');
  assert.match(doc.getElementById('rAlertaAutomacao').textContent, /Revisar: Severidade caiu/);
  await w.editarRisco('r3');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.getElementById('rOrigemVulnCard').style.display, 'none');
  assert.equal(doc.getElementById('rAlertaAutomacao').style.display, 'none');
});

test('drawer: "Corporativo (sem área)" existe e um risco sem área pode ser salvo', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.riscos();
  await w.editarRisco('r3');
  assert.equal(doc.getElementById('rArea').options[0].textContent, 'Corporativo (sem área)');
  doc.getElementById('rTitulo').value = 'Novo sem avaliação (editado)';
  await w.salvarRisco();
  assert.equal(gravacoes.risco.length, 1);
  assert.equal(gravacoes.risco[0].area, '');
});

test('drawer: função CSF vem da origem quando vazia', async () => {
  const { w, doc } = await carregar();
  await w.riscos();
  await w.editarRisco('r1');
  assert.equal(doc.getElementById('rFuncaoCsf').value, 'Identificar');
  await w.editarRisco('r3');
  assert.equal(doc.getElementById('rFuncaoCsf').value, '');
});

test('exigências na mudança de status: Aceito acima do apetite pede justificativa, reavaliação e aprovador', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  await w.riscos();
  await w.editarRisco('r2'); // Em Tratamento, Baixa x Baixo
  w.selecionarCelulaRisco('inerente', 'Alta', 'Muito alto');
  doc.getElementById('rStatus').value = 'Aceito';
  doc.getElementById('rProximaReavaliacao').value = '';
  await w.salvarRisco();
  assert.equal(gravacoes.risco.length, 0);
  assert.match(toasts.at(-1), /Para o status "Aceito" falta: Justificativa do aceite; Próxima reavaliação; Aprovador do aceite/);
  doc.getElementById('rJustificativaAceite').value = 'Custo de correção maior que o impacto';
  doc.getElementById('rProximaReavaliacao').value = '2027-01-01';
  doc.getElementById('rAprovadorAceite').value = 'Diretor';
  await w.salvarRisco();
  assert.equal(gravacoes.risco.length, 1);
  assert.equal(gravacoes.risco[0].aprovadorAceite, 'Diretor');
  assert.equal(gravacoes.risco[0].justificativaAceite, 'Custo de correção maior que o impacto');
});

test('mudança de status/score registra a reavaliação: data, linha no histórico e próxima sugerida', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.riscos();
  await w.editarRisco('r4'); // Identificado, Média x Moderado = 4
  w.selecionarCelulaRisco('inerente', 'Moderada', 'Alto'); // Média->Moderada(3) x Alto(4) = 12, nível Moderado
  doc.getElementById('rProximaReavaliacao').value = '';
  await w.salvarRisco();
  const g = gravacoes.risco[0];
  assert.equal(g.dataUltimaReavaliacao, HOJE);
  assert.ok(g.historicoReavaliacao.includes(`${HOJE} — eu@x.com: status Identificado → Em Avaliação (automático); score 9 → 12`), g.historicoReavaliacao);
  const esperado = new Date(HOJE + 'T00:00:00Z'); esperado.setUTCDate(esperado.getUTCDate() + 180);
  assert.equal(g.proximaReavaliacao, esperado.toISOString().slice(0, 10), 'nível Moderado -> 180 dias');
  assert.equal(g.status, 'Em Avaliação', 'avaliado: o status avança sozinho');
});

test('sem mudança de status nem score, nada de histórico novo nem exigência (registro antigo não trava)', async () => {
  const { w, doc, gravacoes } = await carregar();
  await w.riscos();
  await w.editarRisco('r1'); // Aceito sem justificativa/aprovador gravados
  doc.getElementById('rTitulo').value = 'Risco da v1 (editado)';
  await w.salvarRisco();
  assert.equal(gravacoes.risco.length, 1);
  assert.equal(gravacoes.risco[0].historicoReavaliacao, '');
});

test('encerrar à mão o risco de vulnerabilidade não corrigida pede confirmação; cancelar não grava', async () => {
  const { w, doc, gravacoes, confirms } = await carregar({ confirmar: false });
  await w.riscos();
  await w.editarRisco('r1');
  await new Promise((r) => setTimeout(r, 20)); // cache das vulnerabilidades
  doc.getElementById('rStatus').value = 'Encerrado';
  doc.getElementById('rJustificativaEncerramento').value = 'Não se aplica mais';
  await w.salvarRisco();
  assert.match(confirms.at(-1), /2026-001 continua "Pendente"/);
  assert.equal(gravacoes.risco.length, 0);
});
