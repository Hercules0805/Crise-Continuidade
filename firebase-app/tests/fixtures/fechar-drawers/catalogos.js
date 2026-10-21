window.__rodar = async () => {
  const res = [];
  const ok = (c, m) => res.push((c ? 'OK  ' : 'FALHA ') + m);
  const toasts = [];
  showToast = (m) => { toasts.push(m); };
  renderizarRiscos = () => {};
  renderizarVulnerabilidades = () => {};
  const calls = window.__calls;
  const n = (nome) => (calls[nome] || []).length;
  const aberto = (id) => document.getElementById(id).classList.contains('open');
  const set = (id, v) => { document.getElementById(id).value = v; };
  const html = (fn) => document.body.insertAdjacentHTML('beforeend', fn());
  // Pergunta "Há alterações não salvas" (DECISÃO 16/10/2026): o teste escolhe a
  // resposta (padrão Salvar) e conta quantas vezes ela foi feita.
  let respostaFechar = 'salvar';
  let perguntas = 0;
  _perguntarAlteracoesNaoSalvas = async () => { perguntas++; return respostaFechar; };
  const zera = () => { Object.keys(calls).forEach((k) => delete calls[k]); toasts.length = 0; perguntas = 0; respostaFechar = 'salvar'; };

  // ------------------------------------------------------------ Vulnerabilidade
  html(_htmlDrawerVulnerabilidade);
  const v1 = { id: 'v1', codigo: '2026-001', ticketReport: '', produto: 'P', versao: '', nome: 'Alpha', cwe: '', cve: '', descricao: '', dataDeteccao: '', origemDeteccao: '', exploitDisponivel: '', cvss: null, severidadeManual: '', equipeResponsavel: '', responsavel: '', ticketCorrecao: '', statusCorrecao: 'Pendente', dataPrevistaCorrecao: '', dataCorrecao: '', evidenciaCorrecao: '', observacoes: '', tipo: 'Má Configuração', subtipo: '', metodoDeteccao: '' };
  vulnerabilidadesData = [v1];
  zera(); abrirDrawerVulnerabilidade('v1'); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0 && !aberto('drawerVulnerabilidade'), 'vuln: abrir e fechar sem mexer = 0 gravacoes, fechou');
  zera(); abrirDrawerVulnerabilidade('v1'); set('vulnNome', 'Beta'); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && !aberto('drawerVulnerabilidade'), 'vuln: mexeu e fechou = 1 gravacao, fechou');
  zera(); abrirDrawerVulnerabilidade('v1'); set('vulnNome', 'Gama'); await salvarVulnerabilidade(); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && !aberto('drawerVulnerabilidade'), 'vuln: Salvar e depois Fechar = 1 gravacao no total');
  zera(); abrirDrawerVulnerabilidade(); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0 && !aberto('drawerVulnerabilidade') && toasts.length === 0, 'vuln: novo em branco + Fechar = fecha sem criar e sem aviso');
  zera(); abrirDrawerVulnerabilidade(); set('vulnNome', 'Nova'); set('vulnTipo', 'Má Configuração'); set('vulnProduto', 'X'); await salvarVulnerabilidade(); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1, 'vuln: novo preenchido, Salvar + Fechar = 1 gravacao (nao cria duplicado)');
  zera(); abrirDrawerVulnerabilidade('v1'); set('vulnNome', ''); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0 && aberto('drawerVulnerabilidade') && toasts.length === 1, 'vuln: apagou o nome + Fechar = aviso e continua aberto');
  _fecharDrawerVulnerabilidadeSemSalvar();

  // ------------------------------------------------------------ Vulnerabilidade: aba Severidade por criterios
  const marcarCvss = (cod, op) => {
    const mi = Cvss31.METRICAS.findIndex((m) => m.codigo === cod);
    selecionarCriterioCvssVulnerabilidade(mi, Cvss31.METRICAS[mi].opcoes.findIndex((o) => o.codigo === op));
  };
  const campoCvss = () => document.getElementById('vulnCvss');
  vulnerabilidadesData = [{ ...v1, id: 'v2', codigo: '2026-002', nome: 'Sev', cvss: null, cvssVetor: '' }];
  zera(); abrirDrawerVulnerabilidade('v2');
  [['AV', 'N'], ['AC', 'L'], ['PR', 'N'], ['UI', 'N'], ['S', 'U'], ['C', 'H'], ['I', 'H']].forEach(([c, o]) => marcarCvss(c, o));
  ok(campoCvss().value === '' && /Faltam 1 crit/.test(document.getElementById('vulnCvssResultado').textContent), 'severidade: 7 de 8 criterios = sem nota, avisa que falta 1');
  marcarCvss('A', 'H');
  ok(campoCvss().value === '9.8' && campoCvss().readOnly && /Crítica/.test(document.getElementById('vulnBadgeSeveridade').textContent), 'severidade: 8 criterios = CVSS 9.8, campo so-leitura, badge Critica');
  await fecharDrawerVulnerabilidade();
  const salvo = (calls.salvarVulnerabilidade || [])[0] && calls.salvarVulnerabilidade[0][0];
  ok(n('salvarVulnerabilidade') === 1 && salvo.cvss === 9.8 && salvo.cvssVetor === 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 'severidade: Fechar grava a nota E o vetor');
  zera(); abrirDrawerVulnerabilidade('v2');
  ok(window._vulnCvssRespostas.AV === 'N' && campoCvss().readOnly && campoCvss().value === '9.8', 'severidade: reabrir traz os criterios marcados');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'severidade: reabrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirDrawerVulnerabilidade('v2'); marcarCvss('A', 'H');
  ok(campoCvss().value === '' && !campoCvss().readOnly, 'severidade: desmarcar um criterio limpa a nota calculada e libera o campo');
  marcarCvss('A', 'H'); limparCriteriosCvssVulnerabilidade();
  ok(campoCvss().value === '' && Cvss31.faltam(window._vulnCvssRespostas) === 8, 'severidade: Limpar criterios zera tudo');
  document.getElementById('vulnCvssVetorColar').value = 'lixo'; colarVetorCvssVulnerabilidade();
  ok(document.getElementById('vulnCvssVetorAviso').style.display === 'block' && campoCvss().value === '', 'severidade: vetor invalido avisa e nao muda nada');
  document.getElementById('vulnCvssVetorColar').value = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N'; colarVetorCvssVulnerabilidade();
  ok(campoCvss().value === '6.1' && window._vulnCvssRespostas.S === 'C', 'severidade: colar vetor do relatorio marca os criterios e calcula 6.1');
  _fecharDrawerVulnerabilidadeSemSalvar();
  zera(); abrirDrawerVulnerabilidade('v2'); limparCriteriosCvssVulnerabilidade();
  selecionarCriterioSemCvssVulnerabilidade('impacto', 3); selecionarCriterioSemCvssVulnerabilidade('facilidade', 3);
  ok(document.getElementById('vulnSeveridadeManual').value === 'Crítica', 'severidade: matriz Grave x Muito facil sugere Critica no seletor');
  document.getElementById('vulnSeveridadeManual').value = 'Alta';
  await fecharDrawerVulnerabilidade();
  const salvo2 = calls.salvarVulnerabilidade[0][0];
  ok(salvo2.severidadeManual === 'Alta' && salvo2.severidadeCriterios.impacto === 'Grave' && salvo2.cvss === null, 'severidade: a pessoa troca a sugestao e grava a troca + os criterios');
  zera(); abrirDrawerVulnerabilidade('v2'); marcarCvss('AV', 'L'); marcarCvss('C', 'L');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && calls.salvarVulnerabilidade[0][0].cvssVetor === 'CVSS:3.1/AV:L/C:L', 'severidade: avaliacao pela metade tambem e gravada (vetor parcial)');
  zera(); abrirDrawerVulnerabilidade('v2');
  ok(window._vulnCvssRespostas.AV === 'L' && window._vulnCvssRespostas.C === 'L' && campoCvss().value === '' && !campoCvss().readOnly, 'severidade: avaliacao pela metade volta marcada, sem nota');
  _fecharDrawerVulnerabilidadeSemSalvar();

  // ------------------------------------------------------------ Vulnerabilidade: aba Correcao (Responsavel de Pessoas, Equipe da area)
  pessoasData = [
    { id: 'pa', nome: 'Ana Souza', categoria: 'Pessoas', areas: ['Segurança da Informação'], setor: 'Segurança da Informação' },
    { id: 'pb', nome: 'Bruno Lima', categoria: 'Pessoas', areas: ['TI', 'Diretoria', 'Financeiro'], setor: 'TI' },
    { id: 'pc', nome: 'Carla Dias', categoria: 'Pessoas', areas: [], setor: '' },
    { id: 'pd', nome: 'Davi Reis', categoria: 'Pessoas', areas: [], setor: 'Suporte' },
  ];
  window.areasData = [{ nome: 'Segurança da Informação' }, { nome: 'TI' }, { nome: 'Suporte' }];
  // jsdom nao roda atributos inline (onchange="..."): chama o mesmo handler da tela.
  const escolher = (id, valor) => { set(id, valor); if (id === 'vulnResponsavel') _equipePelaPessoaVuln(); };
  const opcoes = (id) => [...document.getElementById(id).options].map((o) => o.value);
  const dica = () => document.getElementById('vulnEquipeDica').textContent;
  vulnerabilidadesData = [
    { ...v1, id: 'v3', codigo: '2026-003', nome: 'Corr', responsavel: 'Ana Souza', equipeResponsavel: 'Segurança da Informação' },
    { ...v1, id: 'v4', codigo: '2026-004', nome: 'Antiga', responsavel: 'NOGUEIRA, Thiago', equipeResponsavel: 'Dev RH' },
  ];
  zera(); abrirDrawerVulnerabilidade('v3');
  ok(opcoes('vulnResponsavel').includes('Bruno Lima') && opcoes('vulnEquipeResponsavel').includes('TI'), 'correcao: responsavel lista as Pessoas e equipe lista as Areas');
  ok(document.getElementById('vulnResponsavel').value === 'Ana Souza' && document.getElementById('vulnEquipeResponsavel').value === 'Segurança da Informação', 'correcao: registro gravado abre com pessoa e equipe selecionadas');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'correcao: abrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirDrawerVulnerabilidade('v3'); escolher('vulnResponsavel', 'Bruno Lima');
  ok(document.getElementById('vulnEquipeResponsavel').value === 'TI' && /Também em: Diretoria, Financeiro/.test(dica()), 'correcao: pessoa com 3 areas = equipe vira a principal e a dica lista as outras');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && calls.salvarVulnerabilidade[0][0].responsavel === 'Bruno Lima' && calls.salvarVulnerabilidade[0][0].equipeResponsavel === 'TI', 'correcao: Fechar grava responsavel e equipe');
  zera(); abrirDrawerVulnerabilidade('v3');
  const equipeAntes = document.getElementById('vulnEquipeResponsavel').value;
  escolher('vulnResponsavel', 'Carla Dias');
  ok(equipeAntes !== '' && document.getElementById('vulnEquipeResponsavel').value === equipeAntes && /não tem área cadastrada/.test(dica()), 'correcao: pessoa sem area nao apaga a equipe atual e avisa');
  escolher('vulnResponsavel', 'Davi Reis');
  ok(document.getElementById('vulnEquipeResponsavel').value === 'Suporte', 'correcao: area vinda so do setor (areas[] vazio) tambem preenche');
  set('vulnEquipeResponsavel', 'TI');
  ok(document.getElementById('vulnResponsavel').value === 'Davi Reis', 'correcao: trocar so a equipe nao mexe no responsavel');
  _fecharDrawerVulnerabilidadeSemSalvar();
  zera(); abrirDrawerVulnerabilidade('v4');
  ok(document.getElementById('vulnResponsavel').value === 'NOGUEIRA, Thiago' && document.getElementById('vulnEquipeResponsavel').value === 'Dev RH' && /não cadastrado como pessoa/.test(document.getElementById('vulnResponsavel').selectedOptions[0].textContent), 'correcao: valores antigos fora do cadastro abrem selecionados como opcao extra (nada some)');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'correcao: registro antigo, abrir e fechar sem mexer = 0 gravacoes (nao reescreve o dado antigo)');
  zera(); abrirDrawerVulnerabilidade(); escolher('vulnResponsavel', 'Ana Souza'); set('vulnNome', 'Nova com resp'); set('vulnProduto', 'P');
  ok(document.getElementById('vulnEquipeResponsavel').value === 'Segurança da Informação', 'correcao: registro novo tambem preenche a equipe');
  _fecharDrawerVulnerabilidadeSemSalvar();
  pessoasData = [];

  // ------------------------------------------------------------ Vulnerabilidade: Produto de Software + Ativo afetado
  produtosSoftwareData = [
    { id: 'ps1', nome: 'Fortes RH', ativo: true },
    { id: 'ps2', nome: 'Colabore', ativo: true },
    { id: 'ps3', nome: 'Conecta', ativo: true },
    { id: 'ps9', nome: 'Antigo', ativo: false },
  ];
  pessoasData = [
    { id: 'u1', nome: 'Ana Souza', categoria: 'Pessoas', areas: ['Segurança da Informação'], techLead: true, techLeadProdutos: ['ps1'] },
    { id: 'u2', nome: 'Bruno Lima', categoria: 'Pessoas', areas: ['TI'], techLead: true, techLeadProdutos: ['ps2'] },
    { id: 'u3', nome: 'Carla Dias', categoria: 'Pessoas', areas: [], techLead: true, techLeadProdutos: ['ps2'] },
    { id: 'u4', nome: 'Davi Reis', categoria: 'Pessoas', areas: ['TI'], techLead: false, techLeadProdutos: [] },
  ];
  window.areasData = [{ nome: 'Segurança da Informação' }, { nome: 'TI' }];
  const escolherProduto = (id) => { set('vulnProdutoSoftware', id); _sugerirResponsavelPeloProdutoVuln(); };
  const campoProd = () => document.getElementById('vulnProdutoSoftware');
  vulnerabilidadesData = [
    { ...v1, id: 'v5', codigo: '2026-005', nome: 'Com produto', produto: '', produtoSoftwareId: 'ps1' },
    { ...v1, id: 'v6', codigo: '2026-006', nome: 'Produto inativo', produto: 'Módulo X', produtoSoftwareId: 'ps9' },
    { ...v1, id: 'v7', codigo: '2026-007', nome: 'Produto sumiu', produto: '', produtoSoftwareId: 'ps-removido' },
    { ...v1, id: 'v8', codigo: '2026-008', nome: 'So ativo', produto: '.NET', produtoSoftwareId: '' },
  ];
  zera(); abrirDrawerVulnerabilidade('v8');
  ok(opcoes('vulnProdutoSoftware').join('|') === '|ps2|ps3|ps1', 'produto: o seletor lista so os produtos ATIVOS, em ordem alfabetica (Colabore, Conecta, Fortes RH)');
  ok([...document.querySelectorAll('#drawerVulnerabilidade label')].some((l) => l.textContent.trim() === 'Dependências afetadas') && document.getElementById('vulnProdutoLegado').style.display === 'block' && document.getElementById('vulnProdutoLegadoTexto').textContent === '.NET', 'produto: "Ativo afetado" virou "Dependências afetadas"; o texto antigo aparece como legado');
  ok(document.getElementById('vulnProduto').value === '.NET' && campoProd().value === '', 'produto: registro antigo (so texto) abre com o ativo afetado e sem produto vinculado');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'produto: registro antigo, abrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirDrawerVulnerabilidade('v5');
  ok(campoProd().value === 'ps1' && document.getElementById('vulnProduto').value === '', 'produto: registro com produto vinculado abre com o produto selecionado');
  ok(document.getElementById('vulnResponsavel').value === '' && document.getElementById('vulnResponsavelDica').textContent === '', 'produto: abrir um registro NAO recalcula a sugestao de responsavel');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'produto: vinculado, abrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirDrawerVulnerabilidade('v6');
  ok(campoProd().selectedOptions[0].textContent === 'Antigo (inativo)', 'produto: produto vinculado desativado continua visivel, marcado "(inativo)"');
  await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0, 'produto: com produto inativo, abrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirDrawerVulnerabilidade('v7');
  ok(/\(removido\)/.test(campoProd().selectedOptions[0].textContent), 'produto: produto removido do catalogo continua visivel, marcado "(removido)"');
  _fecharDrawerVulnerabilidadeSemSalvar();
  // gravacao: so produto, so ativo, nenhum
  zera(); abrirDrawerVulnerabilidade(); set('vulnNome', 'So produto'); set('vulnTipo', 'Má Configuração'); escolherProduto('ps3'); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && calls.salvarVulnerabilidade[0][0].produtoSoftwareId === 'ps3' && calls.salvarVulnerabilidade[0][0].produto === '', 'produto: so o Produto de Software basta (grava o id, ativo vazio)');
  _vulnDepsCatalogo = [{ id: 'dep1', categoria: 'Servidor', nome: 'Servidor X' }];
  zera(); abrirDrawerVulnerabilidade(); set('vulnNome', 'So dependencia'); set('vulnTipo', 'Má Configuração'); set('vulnDepCategoria', 'Servidor'); _popularItensDependenciaVuln(); set('vulnDepItem', 'dep1'); adicionarDependenciaVuln(); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && calls.salvarVulnerabilidade[0][0].produtoSoftwareId === '' && calls.salvarVulnerabilidade[0][0].produto === '' && JSON.stringify(calls.salvarVulnerabilidade[0][0].dependenciasAfetadas) === JSON.stringify([{ id: 'dep1', categoria: 'Servidor', nome: 'Servidor X' }]), 'produto: so uma dependencia afetada tambem basta');
  zera(); abrirDrawerVulnerabilidade(); set('vulnNome', 'Sem nada'); set('vulnTipo', 'Má Configuração'); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 0 && aberto('drawerVulnerabilidade') && toasts[0] === 'Informe o produto de software ou ao menos uma dependência afetada.', 'produto: nenhum dos dois = aviso e o drawer continua aberto');
  _fecharDrawerVulnerabilidadeSemSalvar();
  zera(); abrirDrawerVulnerabilidade('v8'); escolherProduto('ps1'); await fecharDrawerVulnerabilidade();
  ok(n('salvarVulnerabilidade') === 1 && calls.salvarVulnerabilidade[0][0].produtoSoftwareId === 'ps1' && calls.salvarVulnerabilidade[0][0].produto === '.NET', 'produto: ligar um registro antigo a um produto mantem o ativo afetado');
  // sugestao pelo Tech Lead
  zera(); abrirDrawerVulnerabilidade(); escolherProduto('ps1');
  ok(document.getElementById('vulnResponsavel').value === 'Ana Souza' && document.getElementById('vulnEquipeResponsavel').value === 'Segurança da Informação' && /Sugerido: Tech Lead de Fortes RH/.test(document.getElementById('vulnResponsavelDica').textContent), 'sugestao: produto com 1 Tech Lead preenche responsavel e equipe (area da pessoa)');
  _fecharDrawerVulnerabilidadeSemSalvar();
  zera(); abrirDrawerVulnerabilidade(); escolherProduto('ps2');
  ok(document.getElementById('vulnResponsavel').value === '' && /Tech Leads de Colabore: Bruno Lima, Carla Dias/.test(document.getElementById('vulnResponsavelDica').textContent), 'sugestao: varios Tech Leads so sao listados, nada e preenchido');
  escolherProduto('ps3');
  ok(/Nenhum Tech Lead cadastrado para Conecta/.test(document.getElementById('vulnResponsavelDica').textContent) && document.getElementById('vulnResponsavel').value === '', 'sugestao: produto sem Tech Lead avisa');
  escolherProduto('');
  ok(document.getElementById('vulnResponsavelDica').textContent === '', 'sugestao: tirar o produto limpa a dica');
  _fecharDrawerVulnerabilidadeSemSalvar();
  zera(); abrirDrawerVulnerabilidade(); set('vulnResponsavel', 'Davi Reis'); set('vulnEquipeResponsavel', 'TI'); escolherProduto('ps1');
  ok(document.getElementById('vulnResponsavel').value === 'Davi Reis' && document.getElementById('vulnEquipeResponsavel').value === 'TI' && /Tech Lead de Fortes RH: Ana Souza/.test(document.getElementById('vulnResponsavelDica').textContent), 'sugestao: responsavel ja escolhido NUNCA e sobrescrito (so informa quem e o Tech Lead)');
  _fecharDrawerVulnerabilidadeSemSalvar();
  // grade
  ok(_nomeProdutoVuln({ produtoSoftwareId: 'ps1', produto: 'Área Restrita' }) === 'Fortes RH', 'grade: com vinculo mostra o nome do produto do catalogo');
  ok(_nomeProdutoVuln({ produtoSoftwareId: '', produto: '.NET' }) === '.NET', 'grade: sem vinculo mostra o texto antigo');
  ok(_nomeProdutoVuln({ produtoSoftwareId: 'sumiu', produto: '' }) === '(produto removido)', 'grade: vinculo para produto removido e sem texto mostra "(produto removido)"');
  ok(/Fortes RH<div[^>]*>Ativo: Área Restrita<\/div>/.test(_htmlCelulaProdutoVuln({ produtoSoftwareId: 'ps1', produto: 'Área Restrita' })), 'grade: produto vinculado + ativo afetado diferente mostra "Ativo: …" embaixo');
  ok(_htmlCelulaProdutoVuln({ produtoSoftwareId: 'ps1', produto: 'fortes rh' }) === 'Fortes RH', 'grade: ativo igual ao nome do produto nao se repete');
  ok(_htmlCelulaProdutoVuln({ produtoSoftwareId: '', produto: '.NET' }) === '.NET' && _htmlCelulaProdutoVuln({}) === '-', 'grade: sem vinculo, igual a antes; sem nada, traco');
  ok(!/<img/.test(_htmlCelulaProdutoVuln({ produtoSoftwareId: '', produto: '<img src=x>' })), 'grade: texto do ativo sai escapado');
  pessoasData = [];

  // ------------------------------------------------------------ Servico
  html(_htmlDrawerServico);
  servicosData = [{ id: 's1', nome: 'Serv', descricao: 'd', dependenciaItens: [] }];
  window.dependenciasCatalogo = [];
  zera(); abrirDrawerServico('s1'); await fecharDrawerServico();
  ok(n('salvarServico') === 0 && !aberto('drawerServico'), 'servico: sem mexer = 0 gravacoes');
  zera(); abrirDrawerServico('s1'); set('servicoNome', 'Serv2'); await fecharDrawerServico();
  ok(n('salvarServico') === 1 && !aberto('drawerServico'), 'servico: mexeu = 1 gravacao');
  zera(); abrirDrawerServico(); await fecharDrawerServico();
  ok(n('salvarServico') === 0 && !aberto('drawerServico') && toasts.length === 0, 'servico: novo em branco fecha sem criar');
  zera(); abrirDrawerServico('s1'); window._servicoDependencias.push({ categoria: 'Servidor', nome: 'X', id: 'd1' }); await fecharDrawerServico();
  ok(n('salvarServico') === 1, 'servico: so adicionou dependencia (estado fora do input) = grava');

  // ------------------------------------------------------------ Backup
  html(_htmlDrawerBackup);
  backupsData = [{ id: 'b1', nome: 'Bk', descricao: '', servicoIds: ['s1'], servidorId: '', stakeholderId: '', jobs: [] }];
  pessoasData = [];
  zera(); abrirDrawerBackup('b1'); await fecharDrawerBackup();
  ok(n('salvarBackup') === 0 && !aberto('drawerBackup'), 'backup: sem mexer = 0 gravacoes');
  zera(); abrirDrawerBackup('b1'); set('backupNome', 'Bk2'); await fecharDrawerBackup();
  ok(n('salvarBackup') === 1 && !aberto('drawerBackup'), 'backup: mexeu = 1 gravacao');
  zera(); abrirDrawerBackup('b1'); window._backupJobs.push({ nome: 'job' }); await fecharDrawerBackup();
  ok(n('salvarBackup') === 1, 'backup: so adicionou job (estado fora do input) = grava');
  zera(); abrirDrawerBackup(); await fecharDrawerBackup();
  ok(n('salvarBackup') === 0 && !aberto('drawerBackup'), 'backup: novo em branco fecha sem criar (serv. vazio)');

  // DECISAO 21/10/2026: varios servicos, ferramenta, modo/escopo; stakeholder foi pro Servico.
  servicosData = [{ id: 's1', nome: 'Serv', descricao: 'd', dependenciaItens: [] }, { id: 's2', nome: 'ERP', descricao: '', dependenciaItens: [] }];
  ferramentasBackupData = [{ id: 'f1', nome: 'Veeam', ativo: true }, { id: 'f9', nome: 'Outra', ativo: true }];
  zera(); abrirDrawerBackup('b1'); document.getElementById('backupServicoAdd').value = 's2'; adicionarServicoBackup(); await fecharDrawerBackup();
  const pb = (window.__calls.salvarBackup || [])[0];
  ok(n('salvarBackup') === 1 && pb && JSON.stringify(pb[0].servicoIds) === '["s1","s2"]', 'backup: adicionou 2o servico = grava servicoIds com os dois');
  ok(pb && !('servicoId' in pb[0]) && !('stakeholderId' in pb[0]), 'backup: payload nao leva mais servicoId nem stakeholder');
  zera(); abrirDrawerBackup('b1'); set('backupFerramenta', 'f9'); _ajustarFerramentaOutraBackup(); set('backupFerramentaOutra', 'Rsync'); selecionarModoBackup('Diretório / Arquivos');
  ok(document.getElementById('backupEscopoLabel').textContent === 'Caminhos', 'backup: modo Diretorio troca o rotulo do Escopo para Caminhos');
  set('backupEscopo', '/var/www'); await fecharDrawerBackup();
  const pf = ((window.__calls.salvarBackup || [])[0] || [])[0] || {};
  ok(pf.ferramentaId === 'f9' && pf.ferramentaNome === 'Outra' && pf.ferramentaOutra === 'Rsync' && pf.modo === 'Diretório / Arquivos' && pf.escopo === '/var/www',
    'backup: grava ferramenta (com texto de Outra), modo e escopo');
  ok(_nomeFerramentaBackup(pf) === 'Rsync', 'grade: ferramenta Outra mostra o texto digitado');
  backupsData = [{ id: 'b1', nome: 'Bk', servicoIds: ['s1'], jobs: [{ nome: 'j', tipo: 'Diferencial', destino: '' }], modo: 'Snapshot' }];
  zera(); abrirDrawerBackup('b1');
  ok(document.getElementById('backupAvisosModo').style.display === 'block', 'backup: Snapshot com job Diferencial sem destino mostra aviso');
  await fecharDrawerBackup();
  ok(n('salvarBackup') === 0, 'backup: aviso de modo nao suja o formulario');

  // Stakeholders no Servico: herdados dos backups sem sujar o Fechar; salvar grava a lista.
  pessoasData = [{ id: 'p1', nome: 'Ana', categoria: 'Pessoas' }, { id: 'p2', nome: 'Bia', categoria: 'Pessoas' }];
  servicosData = [{ id: 's1', nome: 'Serv', descricao: 'd', dependenciaItens: [], stakeholders: [] }];
  backupsData = [{ id: 'b1', nome: 'Bk', servicoIds: ['s1'], stakeholderId: 'p1', stakeholderNome: 'Ana', jobs: [] },
    { id: 'b2', nome: 'Bk2', servicoIds: ['s1', 's9'], stakeholderId: 'p1', stakeholderNome: 'Ana', jobs: [] }];
  zera(); abrirDrawerServico('s1');
  ok(window._servicoStakeholders.length === 1 && window._servicoStakeholders[0].id === 'p1', 'servico: sem lista propria herda o stakeholder (distinto) dos backups');
  ok(document.getElementById('servicoStakeholdersMigrados').style.display === 'block', 'servico: avisa que veio dos backups');
  await fecharDrawerServico();
  ok(n('salvarServico') === 0, 'servico: stakeholder herdado nao suja o Fechar');
  zera(); abrirDrawerServico('s1'); document.getElementById('servicoStakeholderAdd').value = 'p2'; adicionarStakeholderServico(); await fecharDrawerServico();
  const ps = ((window.__calls.salvarServico || [])[0] || [])[0] || {};
  ok(n('salvarServico') === 1 && JSON.stringify((ps.stakeholders || []).map((p) => p.id)) === '["p1","p2"]', 'servico: adicionou pessoa = grava stakeholders');
  servicosData = [{ id: 's1', nome: 'Serv', dependenciaItens: [], stakeholders: [{ id: 'p2', nome: 'Bia' }] }];
  zera(); abrirDrawerServico('s1');
  ok(window._servicoStakeholders.length === 1 && window._servicoStakeholders[0].id === 'p2', 'servico: com lista propria ignora o stakeholder legado dos backups');
  await fecharDrawerServico();
  pessoasData = [];

  // ------------------------------------------------------------ Perguntas de Criticidade
  html(_htmlDrawerCriticidadePergunta);
  criticidadeFornecedorPerguntasData = [{ id: 'p1', texto: 'T', ativa: true, ordem: 1, opcoes: [{ rotulo: 'a', score: 1 }] }];
  zera(); abrirDrawerCriticidadePergunta('p1'); await fecharDrawerCriticidadePergunta();
  ok(n('salvarCriticidadeFornecedorPergunta') === 0 && !aberto('drawerCriticidadePergunta'), 'criticidade: sem mexer = 0 gravacoes');
  zera(); window.__lentos.getCriticidadeFornecedorPerguntas = 400;
  abrirDrawerCriticidadePergunta('p1'); set('critPergTexto', 'T2');
  const t0 = Date.now(); await fecharDrawerCriticidadePergunta(); const dt = Date.now() - t0;
  ok(n('salvarCriticidadeFornecedorPergunta') === 1 && !aberto('drawerCriticidadePergunta') && dt < 300, `criticidade: mexeu = 1 gravacao e NAO espera a releitura do catalogo (${dt} ms)`);
  ok(criticidadeFornecedorPerguntasData.some((p) => p.id === 'p1' && p.texto === 'T2'), 'criticidade: lista local ja mostra o texto novo');
  await new Promise((r) => setTimeout(r, 500));
  ok(n('getCriticidadeFornecedorPerguntas') === 1, 'criticidade: releitura roda em segundo plano');
  delete window.__lentos.getCriticidadeFornecedorPerguntas;

  // ------------------------------------------------------------ Pessoa
  html(_htmlDrawerPessoa);
  pessoasData = [{ id: 'pe1', categoria: 'Pessoas', nome: 'Ana', detalhes: '', areas: [], setor: '', liderImediato: '', telefone: '', email: 'ana@x.com', perfis: ['gestor'] }];
  perfisData = [];
  zera(); abrirModalPessoa('pe1'); await fecharModalPessoa();
  ok(n('salvarDependencia') === 0 && !aberto('drawerPessoa'), 'pessoa: sem mexer = 0 gravacoes');
  zera(); window.__lentos.salvarPerfilAcesso = 500;
  abrirModalPessoa('pe1'); set('pessoaNome', 'Ana B');
  const t1 = Date.now(); await fecharModalPessoa(); const dt1 = Date.now() - t1;
  ok(n('salvarDependencia') === 1 && !aberto('drawerPessoa') && dt1 < 400, `pessoa: mexeu = 1 gravacao e NAO espera o espelho de perfil (${dt1} ms)`);
  await new Promise((r) => setTimeout(r, 700));
  ok(n('salvarPerfilAcesso') === 1 && n('getPerfis') === 1, 'pessoa: espelho de perfil e recarga rodaram em segundo plano');
  delete window.__lentos.salvarPerfilAcesso;
  zera(); abrirModalPessoa('pe1'); document.querySelector('#pessoaPerfilBox .pessoa-perfil-check').checked = !document.querySelector('#pessoaPerfilBox .pessoa-perfil-check').checked;
  await fecharModalPessoa();
  ok(n('salvarDependencia') === 1, 'pessoa: mexer so nos checkboxes de perfil conta como mudanca');
  zera(); abrirModalPessoa(); await fecharModalPessoa();
  ok(n('salvarDependencia') === 0 && !aberto('drawerPessoa'), 'pessoa: novo em branco fecha sem criar');

  // ---- Pessoa: lideranca em produtos (Tech Lead / Team Lead)
  produtosSoftwareData = [
    { id: 'ps1', nome: 'Fortes Ponto', ativo: true },
    { id: 'ps2', nome: 'Fortes RH', ativo: true },
    { id: 'ps3', nome: 'Antigo', ativo: false },
  ];
  const chips = (funcao) => [...document.querySelectorAll(`#pessoa${funcao}Produtos button`)].map((b) => b.textContent.trim());
  const pessoaPayload = () => calls.salvarDependencia[0][0];
  zera(); abrirModalPessoa('pe1');
  ok(!document.getElementById('pessoaTechLead').checked && chips('TechLead').length === 0, 'lideranca: pessoa antiga (sem os campos) abre sem funcao e sem chips');
  await fecharModalPessoa();
  ok(n('salvarDependencia') === 0, 'lideranca: abrir e fechar sem mexer = 0 gravacoes');
  zera(); abrirModalPessoa('pe1');
  document.getElementById('pessoaTechLead').checked = true; alternarLiderancaPessoa('techLead');
  ok(chips('TechLead').join('|') === 'Fortes Ponto|Fortes RH', 'lideranca: marcar Tech Lead mostra so os produtos ATIVOS');
  await fecharModalPessoa();
  ok(n('salvarDependencia') === 1 && pessoaPayload().techLead === true && pessoaPayload().techLeadProdutos.length === 0 && pessoaPayload().teamLead === false, 'lideranca: marcar a funcao sem produto grava techLead:true com lista vazia');
  zera(); abrirModalPessoa('pe1');
  document.getElementById('pessoaTechLead').checked = true; alternarLiderancaPessoa('techLead');
  alternarProdutoLiderancaPessoa('techLead', 'ps1'); alternarProdutoLiderancaPessoa('techLead', 'ps2');
  document.getElementById('pessoaTeamLead').checked = true; alternarLiderancaPessoa('teamLead'); alternarProdutoLiderancaPessoa('teamLead', 'ps2');
  await fecharModalPessoa();
  ok(pessoaPayload().techLeadProdutos.join() === 'ps1,ps2' && pessoaPayload().teamLeadProdutos.join() === 'ps2', 'lideranca: cada funcao grava os SEUS produtos');
  zera(); abrirModalPessoa('pe1');
  alternarProdutoLiderancaPessoa('techLead', 'ps2');
  await fecharModalPessoa();
  ok(n('salvarDependencia') === 1, 'lideranca: so marcar/desmarcar um produto ja conta como mudanca');
  zera(); abrirModalPessoa('pe1');
  document.getElementById('pessoaTechLead').checked = false; alternarLiderancaPessoa('techLead');
  ok(window._pessoaLideranca.techLeadProdutos.length === 0 && chips('TechLead').length === 0, 'lideranca: desmarcar a funcao limpa os produtos dela');
  _fecharModalPessoaSemSalvar();
  pessoasData[0].techLead = true; pessoasData[0].techLeadProdutos = ['ps3', 'ps-removido'];
  zera(); abrirModalPessoa('pe1');
  ok(chips('TechLead').some((t) => /Antigo \(inativo\) ✓/.test(t)) && chips('TechLead').some((t) => /\(removido\) ✓/.test(t)), 'lideranca: produto inativo e produto removido continuam visiveis, marcados');
  await fecharModalPessoa();
  ok(n('salvarDependencia') === 0, 'lideranca: abrir e fechar com produto inativo/removido nao reescreve nada');
  ok(_resumoLiderancaPessoa(pessoasData[0])[0].nomes.join() === 'Antigo', 'lideranca: resumo da grade mostra o inativo pelo nome e esconde o removido');
  pessoasData[0].techLead = false; pessoasData[0].techLeadProdutos = [];

  // ------------------------------------------------------------ Fornecedor (aba Dados)
  html(_htmlDrawerFornecedorCadastro);
  fornecedoresData = [{ id: 'fo1', categoria: 'Fornecedores', nome: 'Forn', nomeFantasia: '', cnpj: '', categoriaFornecedor: '', subcategoriaFornecedor: '', gestoresContrato: [], tic: true, detalhes: '', setor: '', endereco: '', pessoas: [], canaisSuporte: [] }];
  categoriasFornecedorData = []; subcategoriasFornecedorData = []; criteriosFornecedorData = []; avaliacoesFornecedorData = [];
  zera(); abrirDrawerFornecedorCadastro('fo1'); await fecharDrawerFornecedorCadastro();
  ok(n('salvarDependencia') === 0 && !aberto('drawerFornecedorCadastro'), 'fornecedor: sem mexer = 0 gravacoes');
  zera(); abrirDrawerFornecedorCadastro('fo1'); set('fornCadNome', 'Forn2'); await fecharDrawerFornecedorCadastro();
  ok(n('salvarDependencia') === 1 && !aberto('drawerFornecedorCadastro'), 'fornecedor: mexeu = 1 gravacao');
  zera(); abrirDrawerFornecedorCadastro('fo1'); window._fornecedorCanais.push({ tipo: 'E-mail', contato: 'a@b' }); await fecharDrawerFornecedorCadastro();
  ok(n('salvarDependencia') === 1, 'fornecedor: so adicionou canal de suporte = grava');
  zera(); abrirDrawerFornecedorCadastro(); await fecharDrawerFornecedorCadastro();
  ok(n('salvarDependencia') === 0 && !aberto('drawerFornecedorCadastro'), 'fornecedor: novo em branco fecha sem criar');
  zera(); respostaFechar = 'descartar'; abrirDrawerFornecedorCadastro('fo1'); set('fornObservacao', 'obs nova'); await fecharDrawerFornecedorCadastro();
  ok(perguntas === 1 && n('salvarDependencia') === 0 && !aberto('drawerFornecedorCadastro'), 'fornecedor: so mexeu na avaliacao = pergunta (antes descartava em silencio)');

  // ------------------------------------------------------------ Risco
  html(_htmlDrawerRisco);
  riscosAreasCache = [{ nome: 'TI' }]; riscosProcessosCache = [{ id: 'pr1', area: 'TI', processo: 'Proc' }];
  riscosFornecedoresCache = [{ id: 'fo1', nome: 'Forn' }]; indicadoresData = [{ id: 'i1', nome: 'Ind' }]; pessoasData = [];
  const r1 = { id: 'r1', area: 'TI', titulo: 'Risco 1', descricao: '', categorias: [], responsavel: '', reportadoPor: '', dataIdentificacao: '2026-10-01', status: 'Identificado', origem: 'Manual', probabilidade: '', impacto: '', planoAcao: [], kris: [], impactoFinanceiroComponentes: [] };
  zera(); await abrirDrawerRisco(r1); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco'), 'risco: sem mexer = 0 gravacoes');
  zera(); await abrirDrawerRisco(r1); set('rTitulo', 'Risco 1b'); await fecharDrawerRisco();
  ok(n('salvarRisco') === 1 && !aberto('drawerRisco'), 'risco: mexeu = 1 gravacao');
  zera(); await abrirDrawerRisco({ ...r1, id: '', titulo: 'Risco 1 (copia)' }); await fecharDrawerRisco();
  ok(n('salvarRisco') === 1 && !aberto('drawerRisco') && perguntas === 1, 'risco: COPIA (rascunho sem id) + Fechar pergunta; Salvar grava');
  zera(); respostaFechar = 'descartar'; await abrirDrawerRisco({ ...r1, id: '', titulo: 'Risco 1 (copia)' }); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco') && perguntas === 1, 'risco: COPIA + Fechar + Descartar = nao cria o registro');
  zera(); await abrirDrawerRisco(r1); await fecharDrawerRisco();
  ok(perguntas === 0, 'risco: sem mexer, Fechar nem pergunta');
  zera(); respostaFechar = 'descartar'; await abrirDrawerRisco(r1); set('rTitulo', 'Descartado'); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco') && perguntas === 1, 'risco: mexeu + Descartar = 0 gravacoes e fecha');
  zera(); respostaFechar = 'continuar'; await abrirDrawerRisco(r1); set('rTitulo', 'Continua'); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && aberto('drawerRisco') && perguntas === 1, 'risco: mexeu + Continuar editando = 0 gravacoes e continua aberto');
  respostaFechar = 'descartar';
  // O jsdom deste teste nao executa atributos onclick="..." (runScripts
  // 'outside-only'): liga o × ao Fechar do jeito que o navegador faria.
  Array.from(document.querySelectorAll('#drawerRisco .drawer-header button')).find((x) => x.textContent.trim() === '×')
    .addEventListener('click', () => fecharDrawerRisco());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco') && perguntas === 2, 'risco: Esc segue a mesma regra do Fechar (perguntou e descartou)');
  zera(); await abrirDrawerRisco(); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco') && toasts.length === 0, 'risco: novo em branco fecha sem criar e sem aviso');
  zera(); await abrirDrawerRisco(r1); set('rTitulo', 'Risco 1c'); await salvarRisco(); await fecharDrawerRisco();
  ok(n('salvarRisco') === 1, 'risco: Salvar + Fechar = 1 gravacao no total');
  zera(); window.USER_PERFIS = ['gestor']; await abrirDrawerRisco(r1); await fecharDrawerRisco();
  ok(n('salvarRisco') === 0 && !aberto('drawerRisco'), 'risco: perfil so-leitura fecha sem tentar gravar');
  window.USER_PERFIS = ['admin'];

  // ------------------------------------------------------------ Dependencia
  html(_htmlDrawerDependencia);
  areasData = [{ nome: 'TI', responsavel: 'x' }]; window.areasDisponiveis = areasData;
  const d1 = { id: 'd1', categoria: 'Servidor', nome: 'SRV', detalhes: '', rto: '', rpo: '', estrategia: '', responsavel: '', drpSalvo: '' };
  dependenciasData = [d1];
  zera(); abrirDrawerDependencia(d1); await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 0 && !aberto('drawerDependencia'), 'dependencia: sem mexer = 0 gravacoes');
  zera(); abrirDrawerDependencia(d1); set('depNome', 'SRV2'); await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 1 && !aberto('drawerDependencia'), 'dependencia: mexeu = 1 gravacao');
  zera(); abrirDrawerDependencia(d1); dependenciasData[0].drpSalvo = '[{"versao":1}]'; await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 0, 'dependencia: gerar DRP (muda drpSalvo em memoria) nao conta como edicao do formulario');
  zera(); abrirDrawerDependencia({ categoria: 'Servidor', nome: 'Semente' }); await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 1 && perguntas === 1, 'dependencia: rascunho com nome sugerido (sem id) + Fechar pergunta; Salvar grava');
  zera(); respostaFechar = 'descartar'; abrirDrawerDependencia({ categoria: 'Servidor', nome: 'Semente' }); await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 0 && !aberto('drawerDependencia'), 'dependencia: rascunho + Descartar = nao cria');
  zera(); abrirDrawerDependencia(); await fecharDrawerDependencia();
  ok(n('salvarDependencia') === 0 && !aberto('drawerDependencia'), 'dependencia: novo em branco fecha sem criar');

  return res;
};
