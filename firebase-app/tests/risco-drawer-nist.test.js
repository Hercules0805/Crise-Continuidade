// Drawer de Risco alinhado ao NIST (15/10/2026): 4 abas (SP 800-39), matriz
// 5x5 (SP 800-30), declaracao de risco, prioridade calculada, resposta com
// blocos condicionais, acao atrasada automatica, KRI ligado aos Indicadores,
// historico so de acrescimo e avanco automatico de status. app.js real no jsdom.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const HOJE = new Date().toISOString().slice(0, 10);
const ONTEM = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const rbase = (extra) => Object.assign({
  area: 'TI', titulo: 'Risco', status: 'Identificado', origem: 'Manual', categorias: ['Operacional'], probabilidade: '', impacto: '',
  planoAcao: [], kris: [], impactoFinanceiroComponentes: [], historicoReavaliacao: '', responsavel: '',
}, extra);
const RISCOS = [
  rbase({ id: 'novo', titulo: 'Sem avaliação' }),
  rbase({ id: 'legado', titulo: 'Escala antiga', probabilidade: 'Média', impacto: 'Crítico', indicadorId: 'i1', historicoReavaliacao: '2026-09-01 — a@x.com: criado' }),
  rbase({ id: 'mitigar', titulo: 'Com plano', probabilidade: 'Alta', impacto: 'Alto', status: 'Em Avaliação', responsavel: 'Ana', estrategiaTratamento: 'Mitigar',
    planoAcao: [{ acao: 'Trocar nobreak', quando: ONTEM, status: 'Pendente' }] }),
  rbase({ id: 'comkri', titulo: 'Com KRI gravado', kris: [{ indicadorId: 'i1', indicador: 'Patches', frequencia: 'Mensal' }] }),
];
const INDICADORES = [
  { id: 'i1', nome: 'Patches críticos aplicados', pilar: 'Proteger', metaMinima: 95, sentidoMeta: 'maiorMelhor', ultimoDesempenho: 80, ultimoMes: '2026-09', foraDaMeta: true, ativo: true },
  { id: 'i2', nome: 'Backups testados', metaMinima: 90, sentidoMeta: 'maiorMelhor', ultimoDesempenho: 97, ultimoMes: '2026-09', foraDaMeta: false, ativo: true },
];

async function abrir(id, opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
  const toasts = [];
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = o.perfis || ['admin']; w.USER_PERFIL = (o.perfis || ['admin'])[0];
  w.USER_EMAIL = 'eu@x.com';
  w.confirm = () => o.confirmar !== false;
  const dados = {
    getRiscos: RISCOS, getAreas: [{ id: 'a1', nome: 'TI' }], getIndicadoresSeguranca: INDICADORES,
    getDependencias: [{ id: 'p1', categoria: 'Pessoas', nome: 'Ana', email: 'eu@x.com' }, { id: 'p2', categoria: 'Pessoas', nome: 'Diretor' }],
    getConfigRiscos: { apetite: 'Moderado' },
  };
  w.API = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'invalidate') return () => {};
      return async (arg) => {
        if (nome === 'salvarRisco') { gravacoes.push(JSON.parse(JSON.stringify(arg))); return { success: true, id: arg.id || 'novoId' }; }
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
  await w.riscos();
  if (id === null) await w.abrirDrawerRisco();
  else await w.editarRisco(id);
  return { w, doc: w.document, gravacoes, toasts, $: (x) => w.document.getElementById(x) };
}

test('4 abas nas etapas do NIST SP 800-39 e trilha de etapas no topo', async () => {
  const { doc } = await abrir('novo');
  const abas = [...doc.querySelectorAll('[id^="tab-risco-"]')].map((b) => [b.firstChild.textContent.trim(), b.querySelector('div').textContent.trim()].join(' | '));
  assert.deepStrictEqual(abas, ['Identificação | ① Enquadrar', 'Avaliação | ② Avaliar', 'Resposta | ③ Responder', 'Monitoramento | ④ Monitorar']);
  assert.match(doc.getElementById('rEtapasNist').textContent, /Etapas NIST SP 800-39:.*① Enquadrar.*④ Monitorar/);
  assert.equal(doc.querySelectorAll('#rEtapasNist .risco-etapa.ok').length, 0, 'sem responsável e sem avaliação: nada concluído');
});

test('"Em Análise" saiu da lista de status', async () => {
  const { $ } = await abrir('novo');
  assert.ok(![...$('rStatus').options].some((o) => o.value === 'Em Análise'));
});

test('matriz 5x5: 25 células; clicar define P e I, nível pela matriz NIST, score e prioridade calculada (só leitura)', async () => {
  const { w, doc, $ } = await abrir('novo');
  assert.equal(doc.querySelectorAll('#rMatrizInerente .risco-celula').length, 25);
  w.selecionarCelulaRisco('inerente', 'Alta', 'Muito alto');
  assert.equal($('rProbabilidade').value, 'Alta');
  assert.equal($('rImpacto').value, 'Muito alto');
  assert.equal($('rScore').value, '20');
  assert.match($('rResumoAvaliacao').textContent, /Muito alto.*Score 20 de 25.*Acima do apetite/s);
  assert.ok($('rPrioridade').readOnly);
  assert.equal($('rPrioridade').value, 'Crítica');
  assert.ok(doc.querySelector('#rMatrizInerente .risco-celula.sel[data-p="Alta"][data-i="Muito alto"]'));
  assert.ok(doc.querySelector('#rEtapasNist .risco-etapa.ok'), 'Avaliar concluída');
});

test('rótulos antigos abrem normalizados (Média → Moderada, Crítico → Muito alto)', async () => {
  const { $ } = await abrir('legado');
  assert.equal($('rProbabilidade').value, 'Moderada');
  assert.equal($('rImpacto').value, 'Muito alto');
  assert.equal($('rScore').value, '15');
});

test('prioridade gravada é a calculada, nunca a escolhida', async () => {
  const { w, gravacoes } = await abrir('novo');
  w.selecionarCelulaRisco('inerente', 'Baixa', 'Moderado');
  await w.salvarRisco();
  assert.equal(gravacoes[0].prioridade, 'Baixa');
});

test('declaração de risco monta a frase e vira título com um clique (pergunta antes de substituir)', async () => {
  const { w, $ } = await abrir('novo');
  $('rFonteAmeaca').value = 'Ambiental';
  $('rEventoAmeaca').value = 'enchente no data center';
  $('rCondicaoPredisponente').value = 'sala no subsolo';
  $('rConsequencia').value = 'parada do faturamento';
  w._atualizarDeclaracaoRisco();
  assert.match($('rDeclaracaoSugerida').textContent, /Se enchente no data center \(fonte ambiental\), explorando sala no subsolo, então parada do faturamento\./);
  // Assíncrona desde 16/10/2026: pode perguntar (confirmarAcao) antes de substituir o título.
  await w.usarDeclaracaoRisco('titulo');
  assert.equal($('rTitulo').value, 'Se enchente no data center (fonte ambiental), explorando sala no subsolo, então parada do faturamento.');
  await w.salvarRisco();
});

test('declaração é gravada nos campos estruturados', async () => {
  const { w, $, gravacoes } = await abrir('novo');
  $('rFonteAmeaca').value = 'Adversária';
  $('rEventoAmeaca').value = 'ransomware';
  await w.salvarRisco();
  assert.equal(gravacoes[0].fonteAmeaca, 'Adversária');
  assert.equal(gravacoes[0].eventoAmeaca, 'ransomware');
});

test('Resposta: Aceitar mostra o bloco de aceite e esconde a descrição; Mitigar mostra o plano', async () => {
  const { w, $ } = await abrir('novo');
  $('rEstrategiaTratamento').value = 'Aceitar'; w._atualizarBlocosResposta();
  assert.equal($('rBlocoAceite').style.display, 'block');
  assert.equal($('rBlocoDescricaoResposta').style.display, 'none');
  assert.equal($('rBlocoPlano').style.display, 'none');
  $('rEstrategiaTratamento').value = 'Mitigar'; w._atualizarBlocosResposta();
  assert.equal($('rBlocoAceite').style.display, 'none');
  assert.equal($('rBlocoPlano').style.display, 'block');
  assert.equal($('rRotuloDescricaoResposta').textContent, 'Medidas de mitigação');
  $('rEstrategiaTratamento').value = 'Transferir'; w._atualizarBlocosResposta();
  assert.match($('rRotuloDescricaoResposta').textContent, /seguro, contrato, fornecedor/);
});

test('ação com prazo vencido fica "Atrasado" sozinha (na tela e no que é gravado); não há opção manual', async () => {
  const { w, doc, $, gravacoes } = await abrir('mitigar');
  assert.ok(doc.querySelector('#planoAcaoTabela .pa-atrasado'));
  assert.ok(![...$('paStatus').options].some((o) => o.value === 'Atrasado'));
  await w.salvarRisco();
  assert.equal(gravacoes[0].planoAcao[0].status, 'Atrasado');
});

test('status avança sozinho: Em Avaliação + Mitigar com ação -> Em Tratamento', async () => {
  const { w, gravacoes, toasts } = await abrir('mitigar');
  await w.salvarRisco();
  assert.equal(gravacoes[0].status, 'Em Tratamento');
  assert.match(toasts.at(-1), /Status avançado para "Em Tratamento"/);
  assert.match(gravacoes[0].historicoReavaliacao, /status Em Avaliação → Em Tratamento \(automático\)/);
});

test('status escolhido pela pessoa não é sobrescrito pelo avanço automático', async () => {
  const { w, $, gravacoes } = await abrir('mitigar');
  $('rStatus').value = 'Em Monitoramento';
  await w.salvarRisco();
  assert.equal(gravacoes[0].status, 'Em Monitoramento');
});

test('KRI ligado: o antigo "Indicador relacionado" vira o primeiro KRI, com meta, resultado e status do cadastro', async () => {
  const { doc } = await abrir('legado');
  const linha = doc.querySelector('#krisTabela .kri-linha');
  assert.equal(linha.dataset.vinculado, '1');
  assert.match(linha.textContent, /Patches críticos aplicados/);
  assert.match(linha.textContent, /≥ 95%/);
  assert.match(linha.textContent, /80%/);
  assert.equal(linha.querySelector('.kri-status').textContent, 'Fora da meta');
});

test('KRI ligado é gravado só como vínculo; indicadorId do risco vem do primeiro KRI; repetir é recusado', async () => {
  const { w, $, gravacoes, toasts } = await abrir('novo');
  $('kriIndicadorId').value = 'i2';
  w.adicionarKriItem();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(w._riscoKris)), [{ indicadorId: 'i2', indicador: 'Backups testados', frequencia: 'Mensal' }]);
  $('kriIndicadorId').value = 'i2';
  w.adicionarKriItem();
  assert.match(toasts.at(-1), /já é um KRI/);
  await w.salvarRisco();
  assert.equal(gravacoes[0].indicadorId, 'i2');
});

test('KRI livre continua possível', async () => {
  const { w, $ } = await abrir('novo');
  $('kriIndicadorId').value = '__livre__'; w._alternarKriLivre();
  assert.equal($('kriCamposLivres').style.display, 'block');
  $('kriIndicador').value = 'Tempo de resposta do SOC';
  $('kriStatus').value = 'Atenção';
  w.adicionarKriItem();
  assert.equal(w._riscoKris[0].indicador, 'Tempo de resposta do SOC');
  assert.ok(!w._riscoKris[0].indicadorId);
});

test('grade: selo e filtro "KRI fora da meta"', async () => {
  const { w, doc } = await abrir('novo');
  const linha = (t) => [...doc.querySelectorAll('#riscoRows tr')].find((tr) => tr.textContent.includes(t));
  assert.match(linha('Com KRI gravado').textContent, /KRI fora da meta/, 'o status vem do indicador (fora da meta), não do que foi digitado');
  assert.ok(!/KRI fora da meta/.test(linha('Com plano').textContent));
  doc.getElementById('filtroRiscoSituacao').value = 'kri';
  w.filtrarRiscos();
  const titulos = [...doc.querySelectorAll('#riscoRows tr')].map((tr) => tr.querySelector('td.title') && tr.querySelector('td.title').textContent);
  assert.deepStrictEqual(titulos, ['Com KRI gravado']);
});

test('histórico é log só de acréscimo: a nota entra no fim, com data e autor, e nada antigo some', async () => {
  const { w, doc, $, gravacoes } = await abrir('legado');
  assert.equal($('rHistoricoReavaliacao').style.display, 'none', 'texto livre escondido');
  assert.equal(doc.querySelectorAll('#rHistoricoLog .risco-historico-linha').length, 1);
  $('rNovaNotaHistorico').value = 'Revisado com o time de TI';
  w.adicionarNotaHistoricoRisco();
  const linhas = [...doc.querySelectorAll('#rHistoricoLog .risco-historico-linha')].map((d) => d.textContent);
  assert.deepStrictEqual(linhas, [`${HOJE} — eu@x.com: Revisado com o time de TI`, '2026-09-01 — a@x.com: criado'], 'mais recente primeiro');
  await w.salvarRisco();
  assert.match(gravacoes[0].historicoReavaliacao, /^2026-09-01 — a@x.com: criado\n/);
});

test('risco novo: "Reportado por" = quem está logado, data de identificação = hoje', async () => {
  const { $ } = await abrir(null);
  assert.equal($('rReportadoPor').value, 'Ana');
  assert.equal($('rDataIdentificacao').value, HOJE);
});

test('estimativa financeira fica recolhida quando não há dado; residual na matriz mini', async () => {
  const { w, doc, $ } = await abrir('novo');
  assert.equal($('rBlocoFinanceiro').open, false);
  w.selecionarCelulaRisco('residual', 'Baixa', 'Baixo');
  assert.equal($('rScoreResidual').textContent, '4 — Baixo');
  assert.ok(doc.querySelector('#rMatrizResidual .risco-celula.sel'));
  w.limparResidualRisco();
  assert.equal($('rScoreResidual').textContent, '–');
});

test('quem só visualiza não clica na matriz', async () => {
  const { doc } = await abrir('novo', { perfis: ['gestor'] });
  assert.ok([...doc.querySelectorAll('#rMatrizInerente .risco-celula')].every((b) => b.disabled));
});

test('abrir e fechar sem mexer não grava (risco antigo com indicador migrado e ação atrasada)', async () => {
  for (const id of ['novo', 'legado', 'mitigar']) {
    const { w, gravacoes } = await abrir(id);
    await w.fecharDrawerRisco();
    assert.equal(gravacoes.length, 0, id);
  }
});
