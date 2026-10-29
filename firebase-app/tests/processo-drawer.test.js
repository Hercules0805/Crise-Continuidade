// Drawer de Processo (revisao de 21/10/2026): tabela de Fornecedores do BCP,
// aba DRP (DRPs das dependencias que sustentam o processo),
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
      if (/^(salvar|excluir|criar)/.test(nome)) { gravacoes.push({ nome, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)) }); return { success: true, id: 'novo-id' }; }
      if (nome === 'invalidate') return undefined;
      if (nome === 'get') return { versoes: [{ versao: 1, html: '<h2>1. Objetivo</h2><p>Recuperar o SRV-01</p>' }] };
      return JSON.parse(JSON.stringify(dados[nome] === undefined ? [] : dados[nome]));
    },
  });
  ['util.js', 'dependencia-duplicidade.js', 'areas-hierarquia.js', 'processos-indicadores.js', 'perfis.js', 'criticidade.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js',
    'cvss31.js', 'risco-consolidado.js', 'cadeia-dependencias.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js', 'contrato-ciclo.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts = (window.__toasts || []).concat(m); };');
  await w.processos();
  return { w, doc: w.document, gravacoes };
}

const esperar = () => new Promise((r) => setTimeout(r, 20));

test('BCP: sem as secoes Equipe de crise e Fornecedores (28/10/2026); salvar nao mexe no Plano B/SLA gravados', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('bcp');
  const painel = doc.getElementById('painel-bcp').textContent;
  assert.doesNotMatch(painel, /Equipe de crise|Fornecedores/);
  assert.strictEqual(doc.getElementById('bcpContatosCrise'), null);
  assert.strictEqual(doc.getElementById('bcpFornecedoresTabela'), null);
  assert.match(painel, /PCN Gerado[\s\S]*Levantamento PCN/);
  await w.salvarProcesso();
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.ok(!('bcpSlas' in g) && !('bcpPlanoBProvedores' in g), 'campos fora do payload: o gravado fica');
  assert.strictEqual(JSON.stringify(g.bcpContatos), JSON.stringify(['ana']), 'equipe de crise continua (editada no PCN)');
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

test('Dependencias: cartoes so dos Servicos e dos 4 Ps; Servico achado pela busca; tecnico direto vai para o bloco legado', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.editarProcesso('p1');
  w.trocarAbaProcesso('dependencias');
  const tabela = doc.getElementById('fDependenciaTabela');
  const cartoes = [...tabela.querySelectorAll('.deps-cartao')].map((c) => c.dataset.categoria);
  assert.strictEqual(JSON.stringify(cartoes), JSON.stringify(['Serviços', 'Produtos de Software', 'Pessoas', 'Instalações', 'Fornecedores', 'Processos Internos']));
  // Portal RH suporta o processo pelo processoIds legado, mas ainda nao esta no processo: aparece na busca.
  doc.getElementById('depsBusca').value = 'portal';
  w.buscarDependenciaProcesso();
  assert.match(doc.getElementById('depsBuscaResultados').textContent, /Portal RH/, 'servico disponivel para escolha');
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

test('drawer: 5 abas (Dependencias propria; Avaliacao dentro do BIA), faixa de selos calculados e sem os selects antigos', async () => {
  const { w, doc } = await carregar(['seguranca'], comPerguntas());
  w.editarProcesso('p1');
  assert.deepStrictEqual([...doc.querySelectorAll('#drawerProcesso [role="tab"]')].map((b) => b.textContent.trim()), ['Identificação', 'Dependências', 'BIA', 'BCP', 'DRP']);
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

// ---- Aba Dependencias e BIA reordenado (28/10/2026) ----
const PESSOAS_TI = [
  { id: 'bia', nome: 'Bia Lima', categoria: 'Pessoas', areas: ['TI'], detalhes: 'Analista', instalacao: { id: 'sede', nome: 'Sede' } },
  { id: 'caio', nome: 'Caio Rocha', categoria: 'Pessoas', areas: ['RH'] },
];
const FORN_INATIVO = { id: 'fx', nome: 'Fornecedor Inativo', categoria: 'Fornecedores', ativo: false };
const comDeps = (extra) => Object.assign({ getDependencias: DEPS.concat(PESSOAS_TI, [FORN_INATIVO]) }, extra || {});
const abrirDeps = async (id, extra) => {
  const r = await carregar(['seguranca'], comDeps(extra));
  r.w.editarProcesso(id);
  r.w.trocarAbaProcesso('dependencias');
  return r;
};
const buscar = (w, doc, texto) => { doc.getElementById('depsBusca').value = texto; w.buscarDependenciaProcesso(); return doc.getElementById('depsBuscaResultados'); };
const tecla = (w, key) => w.teclaBuscaDependenciaProcesso({ key, preventDefault() {} });

test('BIA: impacto e tempos antes do questionario; link e e-mail do formulario de dependencias na aba Dependencias', async () => {
  const { w, doc } = await carregar(['seguranca'], comPerguntas());
  w.editarProcesso('p3');
  const bia = doc.getElementById('painel-bia');
  const html = bia.innerHTML;
  assert.ok(html.indexOf('id="fDescricao"') < html.indexOf('id="avaliacaoPerguntas"'), 'impacto antes das perguntas');
  assert.ok(html.indexOf('id="fMTD"') < html.indexOf('premissas-avaliacao'), 'tempos antes das premissas');
  assert.match(bia.querySelector('.bia-impacto-tempos__titulo').textContent, /Impacto e tempos de recuperação/);
  // Link/e-mail sao do formulario de DEPENDENCIAS (bia-dependencias.html): ficam na aba Dependencias.
  assert.match(doc.getElementById('depsPedirDono').textContent, /Pedir ao dono do processo[\s\S]*Copiar link[\s\S]*Enviar por e-mail/);
  assert.doesNotMatch(bia.textContent, /Copiar link/);
  assert.strictEqual(doc.querySelector('#painel-bia #fDependenciaTabela'), null, 'dependencias sairam do BIA');
  assert.ok(doc.querySelector('#painel-dependencias #fDependenciaTabela'));
});

test('Dependencias: busca unica acha varias categorias; Enter adiciona o primeiro, seta+Enter o segundo; busca limpa e mantem o foco', async () => {
  const { w, doc } = await abrirDeps('p2');
  const grupos = (t) => [...buscar(w, doc, t).querySelectorAll('.deps-busca__grupo-titulo')].map((g) => g.textContent.trim());
  const ga = grupos('a');
  const ge = grupos('e');
  assert.ok(ga.some((g) => /Pessoas/.test(g)) && ga.some((g) => /Serviços/.test(g)), ga.join('|'));
  assert.ok(ge.some((g) => /Instalações/.test(g)) && ge.some((g) => /Fornecedores/.test(g)), ge.join('|'));
  // Pessoas por nome e por area, sem acento.
  const r2 = buscar(w, doc, 'bia');
  const primeiro = r2.querySelector('.deps-busca__opcao');
  assert.match(primeiro.textContent, /Bia Lima/);
  assert.match(primeiro.textContent, /Analista · TI/);
  tecla(w, 'Enter');
  assert.strictEqual(JSON.stringify(w._dependenciaSelecionadas.map((s) => s.id)), JSON.stringify(['bia']));
  assert.strictEqual(doc.getElementById('depsBusca').value, '', 'busca limpa');
  assert.ok(doc.getElementById('depsBuscaResultados').hidden);
  assert.strictEqual(doc.activeElement, doc.getElementById('depsBusca'), 'foco fica na busca');
  buscar(w, doc, 'o');
  const segundo = w._depsBusca.itens[1];
  tecla(w, 'ArrowDown');
  tecla(w, 'Enter');
  assert.ok(w._dependenciaSelecionadas.some((s) => String(s.id) === String(segundo.id)), 'seta para baixo e Enter adiciona o segundo');
});

test('Dependencias: "+ Criar" para Pessoas/Instalacoes/Fornecedores, nunca Processo; inativo e tecnico nao aparecem', async () => {
  const { w, doc } = await abrirDeps('p2');
  const res = buscar(w, doc, 'Zélia Nova');
  const criar = [...res.querySelectorAll('.deps-busca__opcao--criar')].map((o) => o.textContent);
  assert.deepStrictEqual(criar.map((t) => t.replace(/.* em /, '')), ['Pessoas', 'Instalações', 'Fornecedores']);
  assert.ok(!criar.some((t) => /Processos|Serviços/.test(t)));
  assert.doesNotMatch(buscar(w, doc, 'inativo').textContent, /Fornecedor Inativo/);
  assert.doesNotMatch(buscar(w, doc, 'oracle').textContent, /Oracle/, 'Banco de Dados entra pelo Servico');
});

test('Dependencias: cobertura com alerta no Tier 1/2; sugestoes da area e da lotacao; cadeia com DRP', async () => {
  const { w, doc } = await abrirDeps('p3', { getPerguntas: PERGUNTAS, getProcessos: [P1, P2, AVALIADO] });
  const pilulas = [...doc.querySelectorAll('#depsCobertura .deps-cobertura__pilula')].map((b) => b.textContent.trim());
  assert.ok(pilulas.some((t) => /^⚠ Fornecedores 0$/.test(t)), pilulas.join('|'));
  assert.ok(!pilulas.some((t) => /⚠ Processos/.test(t)), 'Processos Internos nao e obrigatorio');
  const cartaoPessoas = () => doc.getElementById('depsCartao-pessoas');
  assert.match(cartaoPessoas().textContent, /Sugeridos \(da área TI\):[\s\S]*\+ Bia Lima/);
  assert.doesNotMatch(cartaoPessoas().textContent, /Caio Rocha/, 'so da area do processo');
  w.selecionarDependenciaCategoria('Bia Lima', 'Pessoas', 'bia');
  assert.doesNotMatch(cartaoPessoas().querySelector('.deps-cartao__sugestoes') ? cartaoPessoas().querySelector('.deps-cartao__sugestoes').textContent : '', /Bia Lima/, 'escolhida sai das sugestoes');
  assert.match(cartaoPessoas().textContent, /Bia Lima[\s\S]*Analista · TI/, 'detalhe da pessoa');
  assert.match(doc.getElementById('depsCartao-instalacoes').textContent, /Sugeridos \(lotação das pessoas escolhidas\):[\s\S]*\+ Sede/);
  w.selecionarDependenciaCategoria('Sede', 'Instalações', 'sede');
  assert.match(doc.getElementById('depsCartao-instalacoes').textContent, /⚠ sem instalação alternativa/, 'Tier 2 sem alternativa');
  w.selecionarDependenciaCategoria('Portal RH', 'Serviços', 's1');
  const cadeia = doc.querySelector('#fDependenciaTabela .deps-cadeia summary').textContent;
  assert.match(cadeia, /Cadeia que sustenta o processo: \d+ itens? · \d+ com DRP/);
});

test('Dependencias: item com cadastro removido continua visivel, "(removida)"', async () => {
  const P2X = { ...P2, dependenciaItens: [{ id: 'saiu', nome: 'Pessoa Antiga', categoria: 'Pessoas' }] };
  const { doc } = await abrirDeps('p2', { getProcessos: [P1, P2X] });
  const chip = [...doc.querySelectorAll('#depsCartao-pessoas .dep-tag-item')].find((el) => /Pessoa Antiga/.test(el.textContent));
  assert.ok(chip, 'removida aparece no cartao');
  assert.match(chip.textContent, /\(removida\)/);
  assert.ok(chip.classList.contains('dep-tag-item--removida'));
});

// ---- Produtos de Software Fortes e pessoas herdadas (28/10/2026) ----
const PRODUTOS = [{ id: 'ps1', nome: 'Fortes Ponto', area: 'Produto', ativo: true }, { id: 'ps9', nome: 'Antigo', ativo: false }];
const PESSOAS_PROD = [
  { id: 'tl', categoria: 'Pessoas', nome: 'Tadeu Lead', areas: ['Produto'], techLead: true, techLeadProdutos: ['ps1'] },
  { id: 'po', categoria: 'Pessoas', nome: 'Paula Owner', areas: ['Produto'], productOwner: true, productOwnerProdutos: ['ps1'], liderSuporte: true, liderSuporteProdutos: ['ps1'] },
  { id: 'stk', categoria: 'Pessoas', nome: 'Sergio Stake', areas: ['RH'] },
];
const SERVICO_STK = { id: 's5', nome: 'Folha Online', dependenciaItens: [], stakeholders: [{ id: 'stk', nome: 'Sergio Stake' }] };
const comProdutos = (extra) => Object.assign({
  getDependencias: DEPS.concat(PESSOAS_PROD),
  getProdutosSoftware: PRODUTOS,
  getServicos: SERVICOS.concat([SERVICO_STK]),
}, extra || {});

test('Produtos: cartao "Produtos de Software Fortes"; busca acha so os ativos; adicionar herda as pessoas (sem ×, com a origem)', async () => {
  const { w, doc } = await carregar(['seguranca'], comProdutos());
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  assert.match(doc.getElementById('depsCartao-produtos-de-software').textContent, /Produtos de Software Fortes/);
  const res = buscar(w, doc, 'fortes');
  assert.match(res.textContent, /Produtos[\s\S]*Fortes Ponto/);
  assert.doesNotMatch(buscar(w, doc, 'antigo').textContent, /Antigo/, 'produto inativo fora');
  w.selecionarDependenciaCategoria('Fortes Ponto', 'Produtos de Software', 'ps1');
  assert.match(doc.getElementById('depsCartao-produtos-de-software').textContent, /Tech Lead: Tadeu Lead · Product Owner: Paula Owner · Liderança de Suporte: Paula Owner/);
  const chips = [...doc.querySelectorAll('#depsCartao-pessoas .dep-tag-item')];
  assert.deepStrictEqual(chips.map((c) => c.textContent.replace(/×/g, '').trim()), ['🔗 Tadeu Lead', '🔗 Paula Owner']);
  assert.ok(chips.every((c) => c.classList.contains('dep-tag-item--herdada') && !c.querySelector('button')), 'herdada sem ×');
  assert.match(doc.getElementById('depsCartao-pessoas').textContent, /via Fortes Ponto \(Product Owner, Liderança de Suporte\)/);
  assert.match((w.__toasts || []).join(' '), /2 pessoa\(s\) herdada\(s\): Tadeu Lead, Paula Owner/);
});

test('Produtos: tirar o produto tira as herdadas; a escolhida a mao tambem fica; Servico herda a Sustentacao (stakeholders antigos)', async () => {
  const { w, doc } = await carregar(['seguranca'], comProdutos());
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  w.selecionarDependenciaCategoria('Fortes Ponto', 'Produtos de Software', 'ps1');
  w.selecionarDependenciaCategoria('Paula Owner', 'Pessoas', 'po'); // ja herdada -> passa a ser manual tambem
  const po = w._dependenciaSelecionadas.find((s) => s.id === 'po');
  assert.strictEqual(po.manual, true);
  assert.ok([...doc.querySelectorAll('#depsCartao-pessoas .dep-tag-item')].find((c) => /Paula/.test(c.textContent)).querySelector('button'), 'herdada + manual tem ×');
  const idxProduto = w._dependenciaSelecionadas.findIndex((s) => s.categoria === 'Produtos de Software');
  w.removerDependenciaTag(idxProduto);
  assert.strictEqual(JSON.stringify(w._dependenciaSelecionadas.map((s) => s.id)), JSON.stringify(['po']), 'Tadeu saiu; Paula ficou (manual)');
  assert.strictEqual(w._dependenciaSelecionadas[0].herdadoDe, undefined);
  w.selecionarDependenciaCategoria('Folha Online', 'Serviços', 's5');
  const stk = w._dependenciaSelecionadas.find((s) => s.id === 'stk');
  assert.ok(stk && stk.herdadoDe[0].tipo === 'servico' && stk.herdadoDe[0].funcoes[0] === 'Sustentação do serviço', 'stakeholder antigo vira Sustentação');
  assert.match(doc.getElementById('depsCartao-servicos').textContent, /1 responsável de sustentação herdado/);
});

test('Produtos: abrir processo cujo produto ganhou pessoa mostra o aviso; salvar grava herdadoDe', async () => {
  // Gravado so com o produto e o Tadeu herdado; a Paula entrou no produto depois.
  const P2X = { ...P2, dependenciaItens: [
    { categoria: 'Produtos de Software', id: 'ps1', nome: 'Fortes Ponto' },
    { categoria: 'Pessoas', id: 'tl', nome: 'Tadeu Lead', herdadoDe: [{ tipo: 'produto', id: 'ps1', nome: 'Fortes Ponto', funcoes: ['Tech Lead'] }] },
  ] };
  const { w, doc, gravacoes } = await carregar(['seguranca'], comProdutos({ getProcessos: [P1, P2X] }));
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  assert.match(doc.querySelector('#fDependenciaTabela .deps-aviso-sync').textContent, /Atualizado pelos produtos e serviços: \+1 \(Paula Owner\)[\s\S]*salve para gravar/);
  await w.salvarProcesso();
  const itens = gravacoes.find((x) => x.nome === 'salvarProcesso').arg.dependenciaItens;
  const paula = itens.find((it) => it.id === 'po');
  assert.ok(paula && paula.herdadoDe[0].funcoes.includes('Product Owner'), 'herdadoDe vai no payload');
  assert.ok(itens.some((it) => it.categoria === 'Produtos de Software' && it.id === 'ps1'));
});

// ---- Instalações: Site de Produção e Site de Sustentação (28/10/2026) ----
const DC = { id: 'dc', nome: 'Data center', categoria: 'Instalações', tipoInstalacao: 'Data center' };
const SEDE_SP = { id: 'sedesp', nome: 'Sede SP', categoria: 'Instalações', tipoInstalacao: 'Sede' };
const AWS = { id: 'aws', nome: 'Site AWS', categoria: 'Instalações' };
const BETO = { id: 'beto', nome: 'Beto', categoria: 'Pessoas', instalacao: { id: 'sedesp', nome: 'Sede SP' } };
const SERV_DC = { id: 's7', nome: 'Hospedagem', dependenciaItens: [ref(DC)] };
const comInst = (extra) => Object.assign({ getDependencias: DEPS.concat([DC, SEDE_SP, AWS, BETO]), getServicos: SERVICOS.concat([SERV_DC]) }, extra || {});
const nomesEm = (doc, id) => [...doc.querySelectorAll(`#${id} .dep-tag-item`)].map((c) => c.textContent.replace(/×/g, '').trim());

test('Instalacoes: processo antigo abre classificado pelo tipo, com aviso; sem tipo fica "A classificar"; salvar grava papeis', async () => {
  const P3 = { id: 'p3', area: 'TI', processo: 'Hospedar', dependenciaItens: [ref(DC), ref(SEDE_SP), ref(AWS)], bcpContatos: [] };
  const { w, doc, gravacoes } = await carregar(['seguranca'], comInst({ getProcessos: [P1, P2, P3] }));
  w.editarProcesso('p3');
  w.trocarAbaProcesso('dependencias');
  assert.match(doc.querySelector('#fDependenciaTabela .deps-aviso-sync').textContent, /Instalações classificadas pelo tipo: Data center → Produção, Sede SP → Sustentação — salve para gravar/);
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-producao'), ['Data center']);
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-sustentacao'), ['Sede SP']);
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-classificar'), ['Site AWS']);
  assert.match(doc.getElementById('depsCartao-instalacoes').textContent, /Site de Produção[\s\S]*hospeda a solução tecnológica[\s\S]*Site de Sustentação[\s\S]*abriga as pessoas de suporte/);
  w.definirPapelInstalacao(w._dependenciaSelecionadas.findIndex((s) => s.id === 'aws'), 'producao');
  assert.strictEqual(doc.getElementById('depsInst-classificar'), null, 'nada a classificar');
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-producao'), ['Data center', 'Site AWS']);
  await w.salvarProcesso();
  const itens = gravacoes.find((x) => x.nome === 'salvarProcesso').arg.dependenciaItens;
  assert.strictEqual(JSON.stringify(itens.filter((it) => it.categoria === 'Instalações').map((it) => [it.id, it.papeis])),
    JSON.stringify([['dc', ['producao']], ['sedesp', ['sustentacao']], ['aws', ['producao']]]));
});

test('Instalacoes: busca com "+ Producao"; mesmo site nos dois papeis; × tira so o papel da subsecao', async () => {
  const { w, doc } = await carregar(['seguranca'], comInst());
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  const res = buscar(w, doc, 'sede sp');
  const linha = [...res.querySelectorAll('.deps-busca__opcao')].find((el) => /Sede SP/.test(el.textContent));
  assert.deepStrictEqual([...linha.querySelectorAll('.deps-busca__papel')].map((b) => b.textContent), ['+ Produção', '+ Sustentação']);
  w.escolherResultadoBuscaDependencia(Number(linha.dataset.i), 'producao');
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-producao'), ['Sede SP'], 'papel escolhido vence o tipo');
  w.selecionarDependenciaCategoria('Sede SP', 'Instalações', 'sedesp', 'sustentacao');
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-sustentacao'), ['Sede SP']);
  assert.strictEqual(w._dependenciaSelecionadas.filter((s) => s.id === 'sedesp').length, 1, 'um item so');
  assert.strictEqual(doc.querySelector('#depsCobertura').textContent.match(/Instalações (\d+)/)[1], '1');
  const idx = () => w._dependenciaSelecionadas.findIndex((s) => s.id === 'sedesp');
  w.removerPapelInstalacao(idx(), 'producao');
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-producao'), []);
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-sustentacao'), ['Sede SP'], 'continua na sustentacao');
  w.removerPapelInstalacao(idx(), 'sustentacao');
  assert.strictEqual(idx(), -1, 'sem papel, sai do processo');
  // Sem papel pedido: o do tipo; tipo vazio vai para "A classificar".
  w.selecionarDependenciaCategoria('Data center', 'Instalações', 'dc');
  w.selecionarDependenciaCategoria('Site AWS', 'Instalações', 'aws');
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-producao'), ['Data center']);
  assert.deepStrictEqual(nomesEm(doc, 'depsInst-classificar'), ['Site AWS']);
});

test('Instalacoes: Producao sugere o site da cadeia dos Servicos; Sustentacao sugere a lotacao das pessoas', async () => {
  const { w, doc } = await carregar(['seguranca'], comInst());
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  w.selecionarDependenciaCategoria('Hospedagem', 'Serviços', 's7');
  w.selecionarDependenciaCategoria('Beto', 'Pessoas', 'beto');
  assert.match(doc.getElementById('depsInst-producao').textContent, /Sugeridos \(na cadeia dos Serviços escolhidos\):[\s\S]*\+ Data center/);
  assert.match(doc.getElementById('depsInst-sustentacao').textContent, /Sugeridos \(lotação das pessoas escolhidas\):[\s\S]*\+ Sede SP/);
  w.selecionarDependenciaCategoria('Sede SP', 'Instalações', 'sedesp', 'sustentacao');
  assert.doesNotMatch(doc.getElementById('depsInst-sustentacao').textContent, /Sugeridos/, 'ja escolhida sai da sugestao');
});

// ---- Processos sugeridos pela IA (28/10/2026) ----
test('Processos: "Sugerir com IA" no cartao; marcados entram como Processos Internos; desmarcado fica de fora', async () => {
  const P3 = { id: 'p3', area: 'TI', processo: 'Infra', dependenciaItens: [], bcpContatos: [] };
  const { w, doc, gravacoes } = await carregar(['seguranca'], {
    getProcessos: [P1, P2, P3],
    'post:sugerirTextoIA': { success: true, processos: [{ id: 'p1', nome: 'Folha', area: 'TI', motivo: 'Recebe a folha' }, { id: 'p3', nome: 'Infra', area: 'TI', motivo: 'Usa os servidores' }] },
  });
  w.editarProcesso('p2');
  w.trocarAbaProcesso('dependencias');
  assert.ok(doc.querySelector('#depsCartao-processos-internos #btnSugerirProcessosIA'), 'botao no cartao Processos');
  await w.sugerirProcessosComIA();
  assert.strictEqual(JSON.stringify(gravacoes.find((x) => x.nome === 'post:sugerirTextoIA').arg), JSON.stringify({ alvo: 'processo-processos', id: 'p2' }));
  const caixa = doc.getElementById('sugestaoProcessosIA');
  assert.match(caixa.textContent, /Folha · TI — Recebe a folha[\s\S]*Infra · TI — Usa os servidores/);
  caixa.querySelector('input[data-sugestao-processo="p3"]').checked = false;
  w.adicionarSugestoesProcessosIA();
  const nomes = [...doc.querySelectorAll('#depsCartao-processos-internos .dep-tag-item')].map((c) => c.textContent.replace(/×/g, '').trim());
  assert.deepStrictEqual(nomes, ['Folha']);
  assert.strictEqual(doc.getElementById('sugestaoProcessosIA').textContent.trim(), '', 'caixa fecha');
  await w.salvarProcesso();
  const itens = gravacoes.find((x) => x.nome === 'salvarProcesso').arg.dependenciaItens;
  assert.ok(itens.some((it) => it.categoria === 'Processos Internos' && it.id === 'p1'));
});

// ---- "+ Criar" por perfil (28/10/2026): Operador de Processos cria so o cadastro basico ----
const abrirDepsComo = async (perfis, id) => {
  const r = await carregar(perfis, comDeps());
  r.w.editarProcesso(id);
  r.w.trocarAbaProcesso('dependencias');
  return r;
};
const opcoesCriar = (res) => [...res.querySelectorAll('.deps-busca__opcao--criar')].map((o) => o.textContent.replace(/.* em /, ''));

test('Dependencias: operador de processos ve "+ Criar" de Pessoas/Instalacoes/Fornecedores e cria pelo cadastro basico', async () => {
  const { w, doc, gravacoes } = await abrirDepsComo(['operador_processos'], 'p2');
  assert.deepStrictEqual(opcoesCriar(buscar(w, doc, 'Zélia Nova')), ['Pessoas', 'Instalações', 'Fornecedores']);
  w.adicionarDependenciaCategoria('Zélia Nova', 'Pessoas');
  await esperar();
  const g = gravacoes.find((x) => x.nome === 'criarDependenciaBasica');
  assert.deepStrictEqual(g.arg, { categoria: 'Pessoas', nome: 'Zélia Nova' });
  assert.ok(!gravacoes.some((x) => x.nome === 'salvarDependencia'), 'nao regrava o documento inteiro');
  const vinculada = w._dependenciaSelecionadas.find((s) => s.nome === 'Zélia Nova');
  assert.strictEqual(vinculada.id, 'novo-id');
});

test('Dependencias: gestor nao ve "+ Criar"; ve a quem pedir, e criar por fora e barrado com aviso', async () => {
  const { w, doc, gravacoes } = await abrirDepsComo(['gestor'], 'p2');
  const res = buscar(w, doc, 'Zélia Nova');
  assert.deepStrictEqual(opcoesCriar(res), []);
  assert.match(res.textContent, /Peça a Admin, Segurança ou TI para cadastrar/);
  w.adicionarDependenciaCategoria('Zélia Nova', 'Pessoas');
  await esperar();
  assert.ok(!gravacoes.some((x) => x.nome === 'criarDependenciaBasica'));
  assert.ok(!w._dependenciaSelecionadas.some((s) => s.nome === 'Zélia Nova'));
  assert.ok(w.__toasts.some((t) => /não está no cadastro/.test(t)));
});

test('Dependencias: operador administrativo so cria fornecedor; SI cria as tres', async () => {
  // O Operador Administrativo so consulta processos, mas a regra de "+ Criar" e por perfil.
  const { w: wsi, doc: dsi } = await abrirDepsComo(['seguranca'], 'p2');
  assert.deepStrictEqual(opcoesCriar(buscar(wsi, dsi, 'Zélia Nova')), ['Pessoas', 'Instalações', 'Fornecedores']);
  const W = (await carregar(['operador'], comDeps())).w;
  assert.strictEqual(W.Perfis.podeCriarDependenciaPeloProcesso(['operador'], 'Fornecedores'), true);
  assert.strictEqual(W.Perfis.podeCriarDependenciaPeloProcesso(['operador'], 'Pessoas'), false);
});

test('Dependencias: "+ Criar" de nome que outra pessoa acabou de cadastrar vincula o existente', async () => {
  const { w, gravacoes } = await abrirDepsComo(['operador_processos'], 'p2');
  w.API = new Proxy({}, { get: (_, nome) => async (arg) => {
    if (nome === 'criarDependenciaBasica') { gravacoes.push({ nome, arg }); return { success: true, id: 'ja-existe', duplicado: true, dado: { id: 'ja-existe', nome: 'Zélia Nova', categoria: 'Pessoas' } }; }
    return nome === 'invalidate' ? undefined : [];
  } });
  w.adicionarDependenciaCategoria('Zélia Nova', 'Pessoas');
  await esperar();
  assert.strictEqual(w._dependenciaSelecionadas.find((s) => s.nome === 'Zélia Nova').id, 'ja-existe');
  assert.strictEqual(w.dependenciasCatalogo.filter((d) => d.nome === 'Zélia Nova').length, 1, 'sem placeholder duplicado');
});

// Cadastro de Processos (28/10/2026): a aba Identificacao mostra o que vem do
// cadastro geral (so leitura) e leva ate ele para editar.
test('Identificacao: resumo do Cadastro de Processos com link "Editar no cadastro"', async () => {
  const P = { ...P1, categoriaId: 'intersetorial', criadorId: 'ana', aprovadorId: '', links: [{ titulo: 'Fluxo', url: 'https://wiki/folha' }] };
  const { w, doc } = await carregar(['operador_processos'], { getProcessos: [P, P2], getCategoriasProcesso: [{ id: 'intersetorial', nome: 'Intersetorial', ativo: true }] });
  w.editarProcesso('p1');
  const resumo = doc.getElementById('fCadastroResumo');
  assert.notStrictEqual(resumo.style.display, 'none');
  assert.match(resumo.textContent, /Categoria: Intersetorial · Criador: Ana · Aprovador: –/);
  assert.strictEqual(resumo.querySelector('a[href="https://wiki/folha"]').textContent, 'Fluxo');
  assert.strictEqual(resumo.querySelector('a[href^="#cadastro-processos"]').getAttribute('href'), '#cadastro-processos?processo=p1');
  // "+ Novo processo" virou o atalho para o cadastro geral.
  assert.match(doc.getElementById('app').innerHTML, /location.hash='#cadastro-processos'/);
});

// Herdados do Cadastro de Processos (29/10/2026): Nome, Area e Descricao
// Funcional so leitura aqui; o Salvar nao grava a Descricao Funcional por cima.
test('Identificacao: Nome, Area e Descricao Funcional herdados do cadastro (so leitura, fora do payload)', async () => {
  const { w, doc, gravacoes } = await carregar(['seguranca'], { getProcessos: [{ ...P1, descricaoFuncional: 'Paga a folha.' }, P2] });
  w.editarProcesso('p1');
  assert.ok(doc.getElementById('fProcesso').disabled);
  assert.ok(doc.getElementById('fArea').disabled);
  assert.ok(doc.getElementById('fDescricaoFuncional').readOnly);
  assert.strictEqual(doc.getElementById('fDescricaoFuncional').value, 'Paga a folha.');
  assert.strictEqual(doc.getElementById('btnSugerirFuncional'), null, 'a IA da descricao fica no cadastro principal');
  assert.notStrictEqual(doc.getElementById('fHerdadoDica').style.display, 'none');
  doc.getElementById('fProcesso').value = 'Outro nome';
  await w.salvarProcesso();
  const g = gravacoes.find((x) => x.nome === 'salvarProcesso').arg;
  assert.ok(!('descricaoFuncional' in g));
  assert.strictEqual(g.processo, 'Folha', 'nome vem do registro aberto');
  assert.strictEqual(g.area, 'TI');
});

test('Identificacao: processo novo (caminho antigo) continua editavel', async () => {
  const { w, doc } = await carregar(['seguranca']);
  w.abrirModalProcesso();
  assert.ok(!doc.getElementById('fProcesso').disabled);
  assert.ok(!doc.getElementById('fDescricaoFuncional').readOnly);
  assert.strictEqual(doc.getElementById('fHerdadoDica').style.display, 'none');
});
