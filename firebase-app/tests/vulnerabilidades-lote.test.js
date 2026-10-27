// Vulnerabilidades: coluna de selecao, edicao em lote e clonar (15/10/2026).
// app.js real no jsdom, com a API trocada por dados de teste que registram as gravacoes.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');
const ANO = new Date().getFullYear();
const cod = (n) => `${ANO}-${String(n).padStart(3, '0')}`;

// 25 vulnerabilidades: a grade tem 20 por pagina.
function vulns() {
  return Array.from({ length: 25 }, (_, i) => ({
    id: `v${i + 1}`, codigo: cod(i + 1), nome: `Falha ${i + 1}`, produto: 'Servidor X', produtoSoftwareId: '',
    cvss: i === 0 ? 9.1 : null, severidadeManual: 'Alta', statusCorrecao: 'Em Correção',
    dataDeteccao: '2026-01-10', dataPrevistaCorrecao: '2026-03-01', dataCorrecao: '2026-02-01',
    ticketCorrecao: 'TCK-1', evidenciaCorrecao: 'print.png', responsavel: 'Ana Souza', equipeResponsavel: 'TI',
    cwe: 'CWE-79', cve: 'CVE-2026-0001', versao: '1.2', descricao: 'desc', origemDeteccao: 'Pentest',
    exploitDisponivel: 'Sim', observacoes: 'obs', ticketReport: 'REP-9', tipo: 'Má Configuração', subtipo: 'Hardening Ausente', metodoDeteccao: 'Pentest', cvssVetor: '', severidadeCriterios: { impacto: '', facilidade: '' },
  }));
}
const PESSOAS = [
  { id: 'd1', categoria: 'Pessoas', nome: 'Ana Souza', areas: ['TI'] },
  { id: 'd2', categoria: 'Pessoas', nome: 'Bruno Lima', areas: ['Comercial'] },
  { id: 'd3', categoria: 'Pessoas', nome: 'Sem Area', areas: [] },
];
const AREAS = [{ id: 'a1', nome: 'TI' }, { id: 'a2', nome: 'Comercial' }];
const PRODUTOS = [{ id: 'pr1', nome: 'Fortes Ponto', ativo: true }];

async function carregar(opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM('<body><div id="app"></div><div id="toast"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const gravacoes = [];
  const toasts = [];
  let seq = 0;
  w.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 't' } }) };
  w.GRC360 = {}; w.APP_API_URL = ''; w.USER_PERFIS = ['seguranca']; w.USER_PERFIL = 'seguranca';
  w.confirm = () => true;
  const dados = {
    getVulnerabilidades: o.vulns || vulns(), getRiscos: o.riscos || [], getDependencias: PESSOAS, getAreas: AREAS, getProdutosSoftware: PRODUTOS,
  };
  w.API = new Proxy({}, {
    get: (_, nome) => async (arg) => {
      if (nome === 'salvarVulnerabilidade') {
        if (o.falhaEm && o.falhaEm === arg.id) throw new Error('sem permissão');
        gravacoes.push(JSON.parse(JSON.stringify(arg)));
        return { success: true, id: arg.id || `novo${++seq}` };
      }
      return JSON.parse(JSON.stringify(dados[nome] || []));
    },
    set: () => true,
  });
  ['util.js', 'dependencia-duplicidade.js', 'perfis.js', 'criticidade.js', 'cadeia-dependencias.js', 'fornecedor-score.js', 'fornecedor-criticidade.js', 'vulnerabilidade-severidade.js', 'cvss31.js', 'risco-consolidado.js', 'servico-composicao.js', 'mapa-continuidade.js', 'conformidade-continuidade.js', 'sanitizar-pcn.js']
    .forEach((f) => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8')));
  // Pergunta "Há alterações não salvas" (16/10/2026): estes testes escolhem Salvar.
  w.eval(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8') + '\n;showToast = (m) => { window.__toasts.push(m); }; _perguntarAlteracoesNaoSalvas = async () => "salvar";');
  w.__toasts = toasts;
  await w.vulnerabilidades();
  return { w, doc: w.document, gravacoes, toasts };
}

const marcar = (doc, id, checked = true) => {
  const el = doc.querySelector(`.chk-vulnerabilidade[data-id="${id}"]`);
  el.checked = checked;
  return el;
};
const selecionar = (w, doc, id) => w.toggleVulnerabilidadeSelecionada(id, true);

test('grade: primeira coluna com checkbox por linha e "marcar todos" no cabecalho; 20 linhas na pagina', async () => {
  const { doc } = await carregar();
  assert.ok(doc.getElementById('chkTodasVulnerabilidades'));
  assert.equal(doc.querySelectorAll('#vulnerabilidadeRows .chk-vulnerabilidade').length, 20);
  const primeiraLinha = doc.querySelector('#vulnerabilidadeRows tr');
  assert.ok(primeiraLinha.firstElementChild.querySelector('input.chk-vulnerabilidade'));
  assert.equal(doc.querySelectorAll('thead th').length, primeiraLinha.children.length, 'cabecalho e linha com o mesmo numero de colunas');
  assert.equal(doc.querySelectorAll('colgroup col').length, primeiraLinha.children.length);
});

test('botoes de lote e clonar so aparecem com selecao, com o contador', async () => {
  const { w, doc } = await carregar();
  assert.equal(doc.getElementById('btnEditarVulnLote').style.display, 'none');
  assert.equal(doc.getElementById('btnClonarVulnSelecionadas').style.display, 'none');
  w.toggleVulnerabilidadeSelecionada('v1', true);
  w.toggleVulnerabilidadeSelecionada('v2', true);
  assert.equal(doc.getElementById('btnEditarVulnLote').style.display, 'inline-block');
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /Editar selecionadas \(2\)/);
  assert.match(doc.getElementById('btnClonarVulnSelecionadas').textContent, /Clonar selecionadas \(2\)/);
  w.toggleVulnerabilidadeSelecionada('v1', false);
  w.toggleVulnerabilidadeSelecionada('v2', false);
  assert.equal(doc.getElementById('btnEditarVulnLote').style.display, 'none');
});

test('"marcar todos" cobre so a pagina visivel, e a selecao sobrevive a troca de pagina', async () => {
  const { w, doc } = await carregar();
  w.toggleTodasVulnerabilidades(true);
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /\(20\)/);
  assert.equal(doc.getElementById('chkTodasVulnerabilidades').checked, true);
  w.irParaPaginaVulnerabilidades(1);
  assert.equal(doc.querySelectorAll('.chk-vulnerabilidade').length, 5);
  assert.equal(doc.getElementById('chkTodasVulnerabilidades').checked, false, 'a pagina 2 ainda nao esta marcada');
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /\(20\)/, 'a selecao da pagina 1 continua');
  w.toggleTodasVulnerabilidades(true);
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /\(25\)/);
  w.irParaPaginaVulnerabilidades(-1);
  assert.ok([...doc.querySelectorAll('.chk-vulnerabilidade')].every((c) => c.checked), 'volta marcada');
  w.toggleTodasVulnerabilidades(false);
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /\(5\)/, 'desmarcar a pagina 1 deixa as 5 da pagina 2');
});

test('o checkbox nao abre o drawer; a linha continua abrindo', async () => {
  const { w, doc } = await carregar();
  const chk = doc.querySelector('.chk-vulnerabilidade');
  assert.match(chk.parentElement.getAttribute('onclick'), /stopPropagation/);
  const tr = doc.querySelector('#vulnerabilidadeRows tr');
  assert.match(tr.getAttribute('onclick'), /abrirDrawerVulnerabilidade\('/);
  w.abrirDrawerVulnerabilidade('v3');
  assert.equal(doc.getElementById('vulnId').value, 'v3');
});

test('lote: grava SO os campos alterados, uma vulnerabilidade por vez', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  ['v1', 'v2', 'v3'].forEach((id) => selecionar(w, doc, id));
  w.abrirDrawerVulnerabilidadeLote();
  assert.match(doc.getElementById('loteVulnTitulo').textContent, /3 vulnerabilidade/);
  doc.getElementById('loteVulnStatus').value = 'Corrigida';
  doc.getElementById('loteVulnDataCorrecao').value = '2026-10-15';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes, ['v1', 'v2', 'v3'].map((id) => ({ id, statusCorrecao: 'Corrigida', dataCorrecao: '2026-10-15' })));
  assert.match(toasts.at(-1), /3 vulnerabilidade\(s\) atualizada/);
  assert.equal(doc.getElementById('btnEditarVulnLote').style.display, 'none', 'selecao limpa depois de aplicar');
  assert.equal(doc.getElementById('drawerVulnerabilidadeLote').classList.contains('open'), false);
  w.irParaPaginaVulnerabilidades(1); // v1..v3 (codigos mais antigos) ficam na pagina 2
  assert.equal((doc.getElementById('vulnerabilidadeRows').textContent.match(/Corrigida/g) || []).length, 3);
});

test('lote: nada alterado -> aviso e nenhuma gravacao', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  selecionar(w, doc, 'v1');
  w.abrirDrawerVulnerabilidadeLote();
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.equal(gravacoes.length, 0);
  assert.equal(toasts.at(-1), 'Escolha ao menos um campo para alterar.');
});

test('lote: escolher o Responsavel preenche a Equipe pela area da pessoa; Equipe escolhida vale; pessoa sem area nao mexe', async () => {
  const { w, doc, gravacoes } = await carregar();
  selecionar(w, doc, 'v1');
  w.abrirDrawerVulnerabilidadeLote();
  doc.getElementById('loteVulnResponsavel').value = 'Bruno Lima';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes[0], { id: 'v1', responsavel: 'Bruno Lima', equipeResponsavel: 'Comercial' });

  selecionar(w, doc, 'v2');
  w.abrirDrawerVulnerabilidadeLote();
  doc.getElementById('loteVulnResponsavel').value = 'Bruno Lima';
  doc.getElementById('loteVulnEquipe').value = 'TI';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes[1], { id: 'v2', responsavel: 'Bruno Lima', equipeResponsavel: 'TI' });

  selecionar(w, doc, 'v3');
  w.abrirDrawerVulnerabilidadeLote();
  doc.getElementById('loteVulnResponsavel').value = 'Sem Area';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes[2], { id: 'v3', responsavel: 'Sem Area' });
});

test('lote: produto, origem, exploit e severidade manual; o aviso conta as que tem CVSS', async () => {
  const { w, doc, gravacoes } = await carregar();
  ['v1', 'v2'].forEach((id) => selecionar(w, doc, id)); // v1 tem CVSS
  w.abrirDrawerVulnerabilidadeLote();
  const aviso = doc.getElementById('loteVulnAvisoCvss');
  assert.notEqual(aviso.style.display, 'none');
  assert.match(aviso.textContent, /^1 das selecionadas têm CVSS/);
  doc.getElementById('loteVulnProdutoSoftware').value = 'pr1';
  doc.getElementById('loteVulnOrigem').value = 'Scanner';
  doc.getElementById('loteVulnExploit').value = '';
  doc.getElementById('loteVulnSeveridade').value = 'Crítica';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes[0], { id: 'v1', produtoSoftwareId: 'pr1', origemDeteccao: 'Scanner', exploitDisponivel: '', severidadeManual: 'Crítica' });
});

test('lote: erro numa vulnerabilidade nao para as outras e e reportado', async () => {
  const { w, doc, gravacoes, toasts } = await carregar({ falhaEm: 'v2' });
  ['v1', 'v2', 'v3'].forEach((id) => selecionar(w, doc, id));
  w.abrirDrawerVulnerabilidadeLote();
  doc.getElementById('loteVulnStatus').value = 'Aceita';
  await w.aplicarEdicaoLoteVulnerabilidades();
  assert.deepStrictEqual(gravacoes.map((g) => g.id), ['v1', 'v3']);
  assert.match(toasts.at(-1), /2 de 3 atualizada.*Erro em: .*sem permissão/);
});

test('clonar (icone): abre o drawer preenchido, SEM id, com codigo novo, "(copia)" e o ciclo de correcao zerado', async () => {
  const { w, doc, gravacoes } = await carregar();
  w.clonarVulnerabilidade('v5');
  assert.equal(doc.getElementById('vulnId').value, '');
  assert.equal(doc.getElementById('vulnDrawerTitulo').textContent, 'Nova Vulnerabilidade');
  assert.equal(doc.getElementById('vulnCodigo').value, cod(26));
  assert.equal(doc.getElementById('vulnNome').value, 'Falha 5 (cópia)');
  assert.equal(doc.getElementById('vulnStatusCorrecao').value, 'Pendente');
  ['vulnDataPrevistaCorrecao', 'vulnDataCorrecao', 'vulnTicketCorrecao', 'vulnEvidenciaCorrecao'].forEach((id) => {
    assert.equal(doc.getElementById(id).value, '', id);
  });
  assert.equal(doc.getElementById('vulnDataDeteccao').value, new Date().toISOString().slice(0, 10));
  assert.equal(doc.getElementById('vulnCwe').value, 'CWE-79');
  assert.equal(doc.getElementById('vulnCve').value, 'CVE-2026-0001');
  assert.equal(doc.getElementById('vulnResponsavel').value, 'Ana Souza');
  assert.equal(doc.getElementById('vulnObservacoes').value, 'obs');
  assert.equal(gravacoes.length, 0, 'nada gravado so por abrir a copia');
  // rascunho: Fechar grava, e grava como registro NOVO (sem id).
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 1);
  assert.ok(!gravacoes[0].id);
  assert.equal(gravacoes[0].nome, 'Falha 5 (cópia)');
  assert.equal(gravacoes[0].codigo, cod(26));
});

test('clonar (icone) de um registro nao deixa o editar de outro "sujo": abrir um registro existente e fechar sem mexer nao grava', async () => {
  const { w, gravacoes } = await carregar();
  w.clonarVulnerabilidade('v5');
  w.abrirDrawerVulnerabilidade('v2');
  await w.fecharDrawerVulnerabilidade();
  assert.equal(gravacoes.length, 0);
});

test('clonar selecionadas: cria N copias direto, com codigos sequenciais distintos, e limpa a selecao', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  ['v1', 'v2', 'v3'].forEach((id) => selecionar(w, doc, id));
  await w.clonarVulnerabilidadesSelecionadas();
  assert.deepStrictEqual(gravacoes.map((g) => g.codigo), [cod(26), cod(27), cod(28)]);
  assert.deepStrictEqual(gravacoes.map((g) => g.nome), ['Falha 1 (cópia)', 'Falha 2 (cópia)', 'Falha 3 (cópia)']);
  gravacoes.forEach((g) => {
    assert.ok(!g.id);
    assert.equal(g.statusCorrecao, 'Pendente');
    assert.equal(g.dataCorrecao, '');
    assert.equal(g.evidenciaCorrecao, '');
    assert.equal(g.cwe, 'CWE-79');
  });
  assert.equal(gravacoes[0].cvss, 9.1, 'o CVSS e copiado');
  assert.match(toasts.at(-1), new RegExp(`3 cópia\\(s\\) criada\\(s\\): ${cod(26)} a ${cod(28)}`));
  assert.equal(doc.getElementById('btnClonarVulnSelecionadas').style.display, 'none');
  assert.match(doc.getElementById('contadorVulnerabilidades').textContent, /28 vulnerabilidades/);
});

test('clonar selecionadas: erro parcial e reportado, as outras copias sao criadas', async () => {
  const { w, doc, gravacoes, toasts } = await carregar();
  ['v1', 'v2'].forEach((id) => selecionar(w, doc, id));
  const original = w.API.salvarVulnerabilidade;
  let n = 0;
  w.API = new Proxy({}, { get: (_, nome) => async (arg) => {
    if (nome === 'salvarVulnerabilidade') {
      if (++n === 1) throw new Error('falha de rede');
      gravacoes.push(arg); return { success: true, id: 'ok' + n };
    }
    return original ? [] : [];
  } });
  await w.clonarVulnerabilidadesSelecionadas();
  assert.equal(gravacoes.length, 1);
  assert.match(toasts.at(-1), /1 de 2 cópia\(s\) criada\(s\)\. Erro em: .*falha de rede/);
});

test('excluir uma vulnerabilidade a tira da selecao', async () => {
  const { w, doc } = await carregar();
  selecionar(w, doc, 'v1'); selecionar(w, doc, 'v2');
  await w.excluirVulnerabilidade('v1');
  assert.match(doc.getElementById('btnEditarVulnLote').textContent, /\(1\)/);
});

test('o drawer de lote tem os campos combinados e o padrao "Nao alterar"', async () => {
  const { w, doc } = await carregar();
  selecionar(w, doc, 'v1');
  w.abrirDrawerVulnerabilidadeLote(); // os selects de pessoas/areas/produtos sao montados ao abrir
  ['loteVulnStatus', 'loteVulnResponsavel', 'loteVulnEquipe', 'loteVulnProdutoSoftware', 'loteVulnExploit', 'loteVulnSeveridade']
    .forEach((id) => assert.ok(doc.querySelector(`#${id} option[value="__manter__"]`), id));
  ['loteVulnTicketCorrecao', 'loteVulnDataPrevista', 'loteVulnDataCorrecao', 'loteVulnOrigem'].forEach((id) => assert.ok(doc.getElementById(id), id));
});

// ------------------------------------------------------------------
// Exportar para Riscos em lote (15/10/2026): mesma acao de servidor da
// exportacao individual, uma por vez; pula quem ja tem risco aberto.
// ------------------------------------------------------------------
function apiDeExportacao(w, opcoes) {
  const o = opcoes || {};
  const chamadas = { post: [], getRiscos: 0 };
  w.API = new Proxy({}, {
    get: (_, nome) => {
      if (nome === 'invalidate') return () => {};
      if (nome === 'post') {
        return async (acao, corpo) => {
          chamadas.post.push({ acao, id: corpo.id });
          if (o.falhaEm === corpo.id) throw new Error('sem permissão');
          if ((o.jaExisteEm || []).includes(corpo.id)) return { success: true, jaExiste: true };
          return { success: true, id: 'r-' + corpo.id };
        };
      }
      if (nome === 'getRiscos') return async () => { chamadas.getRiscos++; return o.riscosDepois || []; };
      return async () => [];
    },
    set: () => true,
  });
  return chamadas;
}

test('exportar: botao so aparece com selecao, com o contador', async () => {
  const { w, doc } = await carregar();
  assert.equal(doc.getElementById('btnExportarVulnRiscos').style.display, 'none');
  w.toggleVulnerabilidadeSelecionada('v1', true);
  w.toggleVulnerabilidadeSelecionada('v2', true);
  assert.equal(doc.getElementById('btnExportarVulnRiscos').style.display, 'inline-block');
  assert.match(doc.getElementById('btnExportarVulnRiscos').textContent, /Exportar para Riscos \(2\)/);
});

test('exportar: uma chamada por selecionada; pula antes do servidor quem ja tem risco aberto; recarrega riscos e limpa selecao', async () => {
  const { w, doc, toasts } = await carregar({ riscos: [{ id: 'rx', origem: 'Vulnerabilidade', vulnerabilidadeId: 'v2', status: 'Identificado' }] });
  const mensagens = [];
  w.confirm = (m) => { mensagens.push(m); return true; };
  ['v1', 'v2', 'v3'].forEach((id) => w.toggleVulnerabilidadeSelecionada(id, true));
  const chamadas = apiDeExportacao(w, { riscosDepois: [{ id: 'r1', origem: 'Vulnerabilidade', vulnerabilidadeId: 'v1', status: 'Identificado' }] });
  await w.exportarVulnerabilidadesParaRiscos();
  assert.deepStrictEqual(chamadas.post, [{ acao: 'importarVulnerabilidadeParaRisco', id: 'v1' }, { acao: 'importarVulnerabilidadeParaRisco', id: 'v3' }]);
  assert.match(mensagens[0], /para 2 vulnerabilidade\(s\)\?/);
  assert.match(mensagens[0], /1 já têm risco aberto e serão puladas/);
  assert.equal(chamadas.getRiscos, 1, 'riscos recarregados para a grade mostrar o link');
  assert.equal(toasts.at(-1), '✅ 2 risco(s) criado(s), 1 já existiam.');
  assert.equal(doc.getElementById('btnExportarVulnRiscos').style.display, 'none', 'selecao limpa');
});

test('exportar: "jaExiste" do servidor conta como ja existia; erro numa nao para as outras', async () => {
  const { w, toasts } = await carregar();
  ['v1', 'v2', 'v3'].forEach((id) => w.toggleVulnerabilidadeSelecionada(id, true));
  const chamadas = apiDeExportacao(w, { jaExisteEm: ['v1'], falhaEm: 'v2' });
  await w.exportarVulnerabilidadesParaRiscos();
  assert.deepStrictEqual(chamadas.post.map((c) => c.id), ['v1', 'v2', 'v3']);
  assert.match(toasts.at(-1), /^⚠️ 1 risco\(s\) criado\(s\), 1 já existiam\. Erro em: .*sem permissão/);
});

test('exportar: todas ja com risco aberto -> so aviso, sem chamar o servidor nem confirmar', async () => {
  const { w, toasts } = await carregar({ riscos: ['v1', 'v2'].map((id) => ({ id: 'r' + id, origem: 'Vulnerabilidade', vulnerabilidadeId: id, status: 'Em Tratamento' })) });
  let confirmou = false;
  w.confirm = () => { confirmou = true; return true; };
  ['v1', 'v2'].forEach((id) => w.toggleVulnerabilidadeSelecionada(id, true));
  const chamadas = apiDeExportacao(w);
  await w.exportarVulnerabilidadesParaRiscos();
  assert.equal(chamadas.post.length, 0);
  assert.equal(confirmou, false);
  assert.match(toasts.at(-1), /Todas as 2 selecionada\(s\) já têm risco aberto/);
});

test('exportar: o confirm avisa quantas estao Corrigida/Aceita; cancelar nao chama nada', async () => {
  const vs = vulns();
  vs[0].statusCorrecao = 'Corrigida';
  vs[1].statusCorrecao = 'Aceita';
  const { w } = await carregar({ vulns: vs });
  const mensagens = [];
  w.confirm = (m) => { mensagens.push(m); return false; };
  ['v1', 'v2', 'v3'].forEach((id) => w.toggleVulnerabilidadeSelecionada(id, true));
  const chamadas = apiDeExportacao(w);
  await w.exportarVulnerabilidadesParaRiscos();
  assert.match(mensagens[0], /2 estão Corrigida\/Aceita — o risco será criado mesmo assim/);
  assert.equal(chamadas.post.length, 0);
});

test('exportar: risco Aceito/Encerrado nao conta como aberto (exporta de novo)', async () => {
  const { w } = await carregar({ riscos: [{ id: 'rx', origem: 'Vulnerabilidade', vulnerabilidadeId: 'v1', status: 'Encerrado' }] });
  w.toggleVulnerabilidadeSelecionada('v1', true);
  const chamadas = apiDeExportacao(w);
  await w.exportarVulnerabilidadesParaRiscos();
  assert.deepStrictEqual(chamadas.post.map((c) => c.id), ['v1']);
});
