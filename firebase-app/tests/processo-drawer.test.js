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
    get: (_, nome) => nome === 'post' ? async (acao, corpo) => {
      // API.post(acao, corpo): salvarRespostas, sugerirImpactoProcesso... registrados como 'post:<acao>'.
      gravacoes.push({ nome: 'post:' + acao, arg: JSON.parse(JSON.stringify(corpo === undefined ? null : corpo)) });
      const r = dados['post:' + acao];
      return r === undefined ? { success: true } : JSON.parse(JSON.stringify(r));
    } : async (arg) => {
      if (/^(salvar|excluir)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      if (nome === 'get') return { versoes: [{ versao: 1, html: '<h2>1. Objetivo</h2><p>Recuperar o SRV-01</p>' }] };
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
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
  assert.match(tabela.textContent, /restrito a Admin, Segurança, TI e Operador de Processos/);
});

test('DRP: operador de processos abre a previa e o DRP, mas nao gerencia (23/10/2026)', async () => {
  const { w, doc } = await carregar(['operador_processos']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('drp');
  await esperar();
  const tabela = doc.getElementById('drpProcessoTabela');
  assert.ok(tabela.querySelector('button[title="Abrir o DRP completo"]'));
  assert.ok(!tabela.querySelector('button[title="Parâmetros DRP e geração, na tela de DRP"]'));
});

test('BIA: dependencia cujo cadastro foi removido vira chip cinza "(removida)"; Vinculos mostra servico e instalacao', async () => {
  const { w, doc } = await carregar(['seguranca'], { getProcessos: [{ ...P1, dependenciaItens: P1.dependenciaItens.concat([{ id: 'sumiu-f', nome: 'Fornecedor Velho', categoria: 'Fornecedores' }]) }, P2] });
  w.editarProcesso('p1');
  const chip = [...doc.querySelectorAll('#fDependenciaTabela .dep-tag-item')].find((el) => /Fornecedor Velho/.test(el.textContent));
  assert.ok(chip.classList.contains('dep-tag-item--removida'));
  assert.match(chip.textContent, /\(removida\)/);
  await esperar();
  const vinc = doc.getElementById('processoVinculos').textContent;
  assert.match(vinc, /Portal RH/);
  assert.match(vinc, /Sede/);
  assert.match(vinc, /1 pessoa lotada/);
  assert.match(vinc, /sem instalação alternativa/);
  assert.match(vinc, /2 dependências da aba BIA apontam para cadastro removido/);
});

// ---- Hierarquia Processo -> Servico -> componentes (21/10/2026) ----

test('BIA: linhas so dos Servicos e dos 4 Ps; Servico mostra o que contem; tecnico direto vai para o bloco legado', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  const tabela = doc.getElementById('fDependenciaTabela');
  const linhas = [...tabela.querySelectorAll('tbody > tr > td:first-child')].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
  const esperadas = ['Serviços', 'Fornecedores', 'Pessoas', 'Instalações', 'Processos Internos'];
  assert.strictEqual(linhas.length, esperadas.length);
  esperadas.forEach((cat, i) => assert.ok(linhas[i].includes(cat), cat + ' em ' + linhas[i]));
  // Portal RH suporta o processo pelo processoIds legado -> aparece como disponivel? Nao: ainda nao esta no processo.
  assert.match(tabela.textContent, /Portal RH/, 'servico disponivel para escolha');
  const legado = tabela.querySelector('.legado-tecnico');
  assert.ok(legado, 'bloco de legado');
  assert.match(legado.textContent, /Ligações técnicas diretas \(legado\) — 2/);
  assert.match(legado.textContent, /SRV-01/);
  assert.match(legado.textContent, /Sistema Antigo/);
  assert.match(legado.textContent, /Nenhum Serviço contém este item/, 'SRV-01 nao esta em nenhum servico do catalogo');
});

test('BIA: "Trocar por Servico X" tira o item tecnico e poe o Servico que o contem; salvar leva no payload', async () => {
  const PORTAL = { id: 's9', nome: 'Folha Web', dependenciaItens: [ref(SRV)] };
  const { w, doc, gravacoes } = await carregar(['seguranca'], { getServicos: [PORTAL] });
  w.editarProcesso('p1');
  const botao = [...doc.querySelectorAll('.legado-tecnico button')].find((b) => /Trocar por Folha Web/.test(b.textContent));
  assert.ok(botao, 'sugestao do servico que contem o SRV-01');
  w.eval(botao.getAttribute('onclick')); // jsdom (outside-only) nao roda onclick inline
  const tabela = doc.getElementById('fDependenciaTabela');
  assert.match(tabela.querySelector('.servico-resumo-bia').textContent, /Folha Web · SRV-01, Oracle/);
  assert.doesNotMatch(tabela.querySelector('.legado-tecnico').textContent, /SRV-01/);
  await w.salvarProcesso();
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.ok(g.dependenciaItens.some((it) => it.categoria === 'Serviços' && it.id === 's9'));
  assert.ok(!g.dependenciaItens.some((it) => it.id === 'srv'));
});

test('BIA: categoria tecnica nao entra mais pelo processo', async () => {
  const { w } = await carregar(['seguranca']);
  w.editarProcesso('p2');
  w.selecionarDependenciaCategoria('Oracle', 'Banco de Dados', 'db');
  assert.strictEqual(w._dependenciaSelecionadas.length, 0);
  assert.match((w.__toasts || []).join(' '), /entram pelo Serviço/);
});

test('detalhe somente leitura mostra MTD (campo do formulario), nao o antigo MTPD', async () => {
  const { w, doc } = await carregar(['operador'], { getProcessos: [{ ...P2, mtd: '24 horas' }] });
  w.verDetalhesProcesso('p2');
  const txt = doc.getElementById('modalDetalhesConteudo').textContent;
  assert.match(txt, /MTD/);
  assert.match(txt, /24 horas/);
  assert.doesNotMatch(txt, /MTPD/);
});


// ---- Status calculados, Homologar BIA, IA e UX do drawer (27/10/2026) ----
const PERGUNTAS = [
  { id: 'q1', pergunta: 'Afeta clientes?', categoria: 'Impacto em Clientes', ativa: true },
  { id: 'q2', pergunta: 'Perda financeira?', categoria: 'Impacto Financeiro', ativa: true },
];
const AVALIADO = { id: 'p3', area: 'TI', processo: 'Cobrança', dependenciaItens: [], bcpContatos: [], avaliado: true, score: 6,
  respostas: { 'Afeta clientes?': 4, 'Perda financeira?': 2 }, biaUltimaEm: '2026-10-20T10:00:00Z', biaRespondidas: 2, biaTotalPerguntas: 2,
  tier: 'Tier 2 (Essencial)', nomesAnteriores: ['TI||Cobranca velha'], bcpPapeisCrise: '{"Ana":"Coordenadora"}', rto: '< 4 horas', rtoOrigem: 'sugerido' };
const comPerguntas = (extra) => Object.assign({ getPerguntas: PERGUNTAS, getProcessos: [P1, P2, AVALIADO] }, extra || {});
const selos = (doc) => doc.getElementById('processoSelosPlanos').textContent.replace(/\s+/g, ' ').trim();

test('drawer: 4 abas (Avaliacao dentro do BIA), faixa de selos calculados e sem os selects antigos', async () => {
  const { w, doc } = await carregar(['seguranca'], comPerguntas());
  w.editarProcesso('p1');
  assert.deepStrictEqual([...doc.querySelectorAll('#drawerProcesso [role="tab"]')].map((b) => b.textContent.trim()), ['Identificação', 'BIA', 'BCP', 'DRP']);
  ['fBiaHomologada', 'fBcpStatus', 'fDrpStatus', 'painel-avaliacao', 'fBiaScoreInfo'].forEach((id) => assert.strictEqual(doc.getElementById(id), null, id));
  assert.match(selos(doc), /BIA Não avaliado/);
  assert.match(selos(doc), /BCP Sem PCN/);
  assert.match(selos(doc), /DRP /);
  assert.ok(doc.querySelector('#painel-bcp #levantamentoStatus'), 'Levantamento PCN foi para o BCP');
  w.trocarAbaProcesso('avaliacao');
  assert.notStrictEqual(doc.getElementById('painel-bia').style.display, 'none', 'link antigo ?aba=avaliacao cai no BIA');
});

test('BIA: progresso "x de y", selo ao vivo "Em avaliacao"; salvar grava a resposta uma vez e nao regrava sem mudanca', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca'], comPerguntas());
  w.editarProcesso('p2');
  w.trocarAbaProcesso('bia');
  assert.match(doc.getElementById('avaliacaoProgresso').textContent, /0 de 2/);
  const radio = doc.querySelector('#avaliacaoPerguntas input[name="avalInline0"][value="4"]');
  radio.checked = true;
  w.calcularScoreInline();
  assert.match(doc.getElementById('avaliacaoProgresso').textContent, /1 de 2/);
  assert.match(selos(doc), /BIA Em avaliação/, 'ao vivo, antes de salvar');
  await w.salvarProcesso();
  assert.strictEqual(gravacoes.filter((g) => g.nome === 'post:salvarRespostas').length, 1);
  await w.salvarProcesso();
  assert.strictEqual(gravacoes.filter((g) => g.nome === 'post:salvarRespostas').length, 1, 'sem mudanca, sem resposta nova');
});

test('Homologar BIA: so com o questionario completo, por quem pode; grava quem/quando e o selo vira Homologado', async () => {
  const { w, doc, gravacoes } = await carregar(['operador_processos'], comPerguntas());
  w.confirmarAcao = async () => true;
  w.editarProcesso('p3');
  assert.match(selos(doc), /BIA Avaliado/);
  w.trocarAbaProcesso('bia');
  assert.ok(doc.getElementById('btnHomologarBia'), 'botao para quem homologa');
  await w.homologarBIA();
  const g = gravacoes.filter((x) => x.nome === 'salvarProcesso').pop().arg;
  assert.strictEqual(g.id, 'p3');
  assert.ok(g.biaHomologacao && g.biaHomologacao.em, 'quem/quando');
  assert.deepStrictEqual(Object.keys(g).sort(), ['biaHomologacao', 'id'], 'so a homologacao');
  assert.match(selos(doc), /BIA Homologado/);
  assert.ok(!doc.getElementById('btnHomologarBia'));
  // Gestor avalia, mas nao homologa.
  const ge = await carregar(['gestor'], comPerguntas());
  ge.w.editarProcesso('p3');
  ge.w.trocarAbaProcesso('bia');
  assert.ok(!ge.doc.getElementById('btnHomologarBia'));
  assert.match(ge.doc.getElementById('biaHomologacaoAcao').textContent, /Admin, Segurança ou Operador de Processos/);
});

test('IA: "Sugerir com IA" mostra a sugestao para revisar; "Usar este texto" pede confirmacao quando ja ha texto', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca'], comPerguntas({ 'post:sugerirImpactoProcesso': { texto: 'Sem este processo, clientes nao recebem boletos.' } }));
  let perguntou = 0;
  w.confirmarAcao = async () => { perguntou++; return true; };
  w.editarProcesso('p3');
  assert.notStrictEqual(doc.getElementById('btnSugerirImpacto').style.display, 'none');
  doc.getElementById('fDescricao').value = 'Texto antigo';
  await w.sugerirImpactoComIA();
  assert.strictEqual(JSON.stringify(gravacoes.filter((g) => g.nome === 'post:sugerirImpactoProcesso').map((g) => g.arg)), JSON.stringify([{ id: 'p3' }]));
  assert.match(doc.getElementById('sugestaoImpacto').textContent, /revise antes de usar[\s\S]*clientes nao recebem boletos/);
  assert.strictEqual(doc.getElementById('fDescricao').value, 'Texto antigo', 'nada muda sozinho');
  await w.usarSugestaoImpacto();
  assert.strictEqual(perguntou, 1);
  assert.strictEqual(doc.getElementById('fDescricao').value, 'Sem este processo, clientes nao recebem boletos.');
  assert.strictEqual(doc.getElementById('sugestaoImpacto').textContent.trim(), '');
  // Processo novo (sem id): sem o botao.
  w.abrirModalProcesso();
  assert.strictEqual(doc.getElementById('btnSugerirImpacto').style.display, 'none');
});

test('UX: salvar mescla sobre o registro (nao perde tier, nomes antigos, papeis); RTO "sugerido pela avaliacao" ate trocar', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca'], comPerguntas());
  w.editarProcesso('p3');
  assert.match(doc.getElementById('fRTODica').textContent, /Sugerido pela avaliação do BIA/);
  await w.salvarProcesso();
  const reg = w.processosData.find((p) => p.id === 'p3');
  assert.strictEqual(reg.tier, 'Tier 2 (Essencial)');
  assert.strictEqual(JSON.stringify(reg.nomesAnteriores), JSON.stringify(['TI||Cobranca velha']));
  assert.strictEqual(reg.bcpPapeisCrise, '{"Ana":"Coordenadora"}');
  assert.strictEqual(gravacoes.filter((g) => g.nome === 'salvarProcesso').pop().arg.rtoOrigem, 'sugerido');
  doc.getElementById('fRTO').value = '8h a 24h';
  doc.getElementById('fRTO').onchange();
  assert.doesNotMatch(doc.getElementById('fRTODica').textContent, /Sugerido/);
  await w.salvarProcesso();
  assert.strictEqual(gravacoes.filter((g) => g.nome === 'salvarProcesso').pop().arg.rtoOrigem, 'manual');
});

test('grade: coluna Planos pelos status calculados (title com o detalhe)', async () => {
  const { doc } = await carregar(['seguranca'], comPerguntas());
  const marcas = [...doc.querySelectorAll('.plano-mark')].map((m) => m.getAttribute('title'));
  assert.ok(marcas.some((t) => /^BIA: Avaliado — Falta homologar/.test(t)), 'p3');
  assert.ok(marcas.some((t) => /^BIA: Não avaliado/.test(t)));
  assert.ok(doc.querySelector('.plano-mark--falta'), 'nao avaliado = vermelho');
});
