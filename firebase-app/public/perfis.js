/**
 * Regra unica dos perfis de acesso.
 *
 * ANTES DESTA PECA o sistema tinha dois perfis, 'admin' e 'gestor', com os
 * nomes escritos a mao em cada tela (mais de vinte `USER_PERFIL === 'admin'`)
 * e repetidos nas regras do banco. Nao havia tela para gerenciar perfil: cada
 * pessoa nova era um documento digitado a mao no console do Firebase, e
 * ninguem conseguia ver quem tinha qual acesso sem entrar la.
 *
 * DECISAO 21/09/2026: entra um terceiro perfil, so para fornecedores, porque a
 * pessoa da Seguranca da Informacao precisa avaliar fornecedor e nada mais.
 * Dar admin resolveria em um minuto e deixaria ela mudar as perguntas do BIA,
 * a regua de criticidade e qualquer risco de qualquer area — acesso maior que
 * a necessidade e achado de auditoria.
 *
 * O PRINCIPIO: quem pode uma coisa nao pode as outras por consequencia. Toda
 * pergunta de permissao passa por uma funcao daqui, nunca por comparacao de
 * texto solta na tela.
 *
 * AS REGRAS DO BANCO ESPELHAM ESTES NOMES. firestore.rules nao consegue
 * importar JavaScript, entao os textos 'admin', 'gestor' e 'fornecedores'
 * aparecem nos dois lugares. Mudar um nome aqui exige mudar la — e existe um
 * teste que falha se a lista daqui sair do combinado.
 *
 * Carregar ANTES de api.js e app.js. Tambem exporta como modulo CommonJS para
 * poder ser testada com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Perfis = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // DECISAO 28/09/2026: RBAC cumulativo. Uma pessoa pode ter VARIOS perfis
  // (ex.: TI + Gestor). O poder e a UNIAO dos perfis: pode se QUALQUER perfil
  // conceder. Toda funcao aqui aceita string OU array (compat com o campo
  // antigo `perfil` string e com o novo `perfis[]`).
  var PERFIL = {
    ADMIN: 'admin',
    SEGURANCA: 'seguranca',
    TI: 'ti',
    GESTOR: 'gestor',
    OPERADOR: 'operador',
    OPERADOR_PROCESSOS: 'operador_processos',
  };

  /** O perfil de quem nao esta cadastrado. O menor acesso possivel. */
  var PERFIL_PADRAO = PERFIL.GESTOR;

  /**
   * As telas que cada perfil ve.
   *
   * ANTES ISTO ERA UMA LISTA DO QUE ESCONDER, e foi por isso que quebrou: quem
   * tem o perfil de fornecedores continuava vendo Processos, PCNs, Riscos e
   * Indicadores, porque nenhuma dessas telas estava na lista de esconder. Lista
   * de exclusao erra por omissao — basta esquecer um nome, ou criar uma tela
   * nova, para abrir acesso sem ninguem perceber.
   *
   * Agora e o contrario: cada perfil DECLARA o que ve, e tela que nao esta aqui
   * nao aparece nem abre. Tela nova nasce invisivel ate alguem decidir de quem
   * ela e — que e o lado certo para errar.
   */
  // Telas de cada perfil (allowlist). SEGURANCA faz tudo menos as 3 telas
  // proprias do Admin (perfis, perguntas, config de respostas/regua). TI opera
  // o DRP (ve DRP e o Catalogo de Dependencias, que e onde os parametros DRP
  // sao editados). GESTOR mantem o de sempre.
  // 'notificacoes-email' (16/10/2026): configuracao e log dos alertas por e-mail.
  var TELAS_ADMIN_EXCLUSIVAS = ['perfis', 'perguntas', 'notificacoes-email'];
  var TELAS = {};
  TELAS[PERFIL.ADMIN] = '*';
  TELAS[PERFIL.SEGURANCA] = [
    'processos', 'cadastro-processos', 'processos-categorias', 'processos-dashboard', 'processos-relatorios', 'pcns', 'drp', 'riscos-dashboard', 'riscos', 'monitor', 'riscos-relatorio', 'vulnerabilidades', 'vulnerabilidades-painel', 'vulnerabilidades-relatorio',
    // Threat Intelligence (26/10/2026): triagem das acoes recomendadas e inventario de software.
    'threat-intel',
    'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
    'dependencias', 'areas', 'pessoas', 'relatorios', 'continuidade-relatorio', 'mapa', 'servicos', 'servicos-relatorio', 'catalogo-backup', 'catalogo-backup-ferramentas', 'produtos-software',
    'terceiros-dashboard', 'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios', 'fornecedores-subcategorias', 'fornecedores-criticidade',
    'contratos', 'contratos-tipos', 'contratos-indexadores', 'contratos-status',
    'admin', 'conformidade',
  ];
  // DECISAO 02/10/2026: Servicos sai da posse de TI -- quem gerencia agora e so
  // Seguranca da Informacao ("Seguranca de Sistemas" no pedido do usuario). TI
  // mantem DRP/Dependencias/Relatorios, que continuam sendo dele.
  // DECISAO 03/10/2026: Backup deixou de ter tela propria (virou aba do drawer
  // de Servico) -- revertido na DECISAO 04/10/2026: Backup volta a ter tela
  // propria ("catalogo-backup"), mesma posse de 'servicos' (Admin + Seguranca).
  // DECISAO 21/10/2026: 'catalogo-backup-ferramentas' (lista de Ferramentas de
  // Backup) tem a mesma posse do Catalogo do Backup.
  // DECISAO 21/10/2026: 'servicos-relatorio' (Relatorios de Servicos) tem a
  // mesma posse de 'servicos' -- sem Gestor, porque nao ha compartilhamento.
  // DECISAO 21/10/2026: Mapa de Continuidade (tudo o que se conecta no nucleo
  // BIA/PCN/DRP) para Admin, Seguranca e TI. O TI nao le contratos: o mapa
  // dele vem sem Contratos, com aviso.
  TELAS[PERFIL.TI] = [
    'drp', 'dependencias', 'mapa', 'relatorios',
  ];
  // DECISAO 14/10/2026: Operador Administrativo (assistente administrativo de TI e
  // SI). Nao e tecnico: GERENCIA fornecedores (5 telas) e so CONSULTA Processos,
  // Pessoas e Areas; gera Relatorios (leitura). Sem DRP, PCN, riscos, indicadores,
  // perfis ou perguntas. Processos primeiro: e a pagina inicial dele.
  TELAS[PERFIL.OPERADOR] = [
    'processos', 'cadastro-processos', 'processos-categorias', 'processos-dashboard', 'processos-relatorios', 'pessoas', 'areas', 'relatorios',
    'terceiros-dashboard', 'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios', 'fornecedores-subcategorias', 'fornecedores-criticidade',
    'contratos', 'contratos-tipos', 'contratos-indexadores', 'contratos-status',
  ];
  // DECISAO 15/10/2026: Contratos tem a mesma posse de Fornecedores (Admin, SI,
  // Operador). O Gestor so CONSULTA os contratos da propria area.
  // DECISAO 19/10/2026: o Gestor ve o Painel de Vulnerabilidades (visao
  // executiva, so leitura), mas nao a lista nem o cadastro.
  // DECISAO 20/10/2026: o Gestor abre as telas de relatorio do menu Riscos,
  // mas SO para ver o que foi compartilhado com ele (no de Riscos, so a area
  // dele) -- gerar e ver as edicoes da equipe continua com Admin/Seguranca
  // (podeGerarRelatorioExecutivo).
  // DECISAO 23/10/2026: Dashboard de Terceiros (números que saíram das listas de
  // Fornecedores e Contratos) -- quem vê Fornecedores ou Contratos; a tela mostra
  // só a seção que o perfil vê (Gestor: só Contratos, da área dele).
  TELAS[PERFIL.GESTOR] = [
    'processos', 'cadastro-processos', 'processos-categorias', 'processos-dashboard', 'processos-relatorios', 'pcns', 'drp', 'riscos-dashboard', 'riscos', 'riscos-relatorio', 'vulnerabilidades-painel', 'vulnerabilidades-relatorio',
    'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
    'contratos', 'terceiros-dashboard',
    'admin', 'conformidade',
  ];
  // DECISAO 23/10/2026: Operador de Processos -- documenta e monitora os
  // processos da empresa inteira (sem recorte de area). OPERA Processos, BIA e
  // PCN; so CONSULTA DRP, Dependencias, Mapa, Areas e Pessoas. Abre no Painel
  // de Conformidade (o que esta vencido, faltando ou a homologar).
  TELAS[PERFIL.OPERADOR_PROCESSOS] = [
    'conformidade', 'admin', 'processos', 'cadastro-processos', 'processos-categorias', 'processos-dashboard', 'processos-relatorios', 'pcns', 'drp', 'dependencias', 'mapa', 'areas', 'pessoas', 'relatorios',
    // DECISAO 27/10/2026: Relatorio de Status de Continuidade (edicoes salvas + IA) para Admin, SI e Operador de Processos.
    'continuidade-relatorio',
  ];

  // Tela inicial de cada perfil (DECISAO 16/10/2026): escolha explicita, nao
  // mais "a 1a tela da lista". Admin, SI e Gestor abrem no Dashboard de
  // Continuidade (visao geral). TI abre no DRP (e o trabalho dele). Operador
  // continua em Processos (DECISAO 14/10/2026). Com varios perfis vale a
  // ordem abaixo (o de maior alcance primeiro).
  var PAGINA_INICIAL = {};
  PAGINA_INICIAL[PERFIL.ADMIN] = 'admin';
  PAGINA_INICIAL[PERFIL.SEGURANCA] = 'admin';
  PAGINA_INICIAL[PERFIL.GESTOR] = 'admin';
  PAGINA_INICIAL[PERFIL.OPERADOR] = 'processos';
  PAGINA_INICIAL[PERFIL.TI] = 'drp';
  PAGINA_INICIAL[PERFIL.OPERADOR_PROCESSOS] = 'conformidade';
  var ORDEM_PAGINA_INICIAL = [PERFIL.ADMIN, PERFIL.SEGURANCA, PERFIL.OPERADOR_PROCESSOS, PERFIL.GESTOR, PERFIL.OPERADOR, PERFIL.TI];

  var CATALOGO = [
    {
      valor: PERFIL.ADMIN,
      rotulo: 'Administrador',
      descricao: 'Acesso total, incluindo perfis de acesso, perguntas do BIA e a régua de criticidade.',
      exigeArea: false,
    },
    {
      valor: PERFIL.SEGURANCA,
      rotulo: 'Segurança da Informação',
      descricao: 'Opera todos os módulos; só não faz atividades próprias do Admin (perfis de acesso, perguntas e régua do BIA).',
      exigeArea: false,
    },
    {
      valor: PERFIL.TI,
      rotulo: 'TI',
      descricao: 'Opera o DRP: parâmetros e conteúdo do plano de recuperação das dependências.',
      exigeArea: false,
    },
    {
      valor: PERFIL.OPERADOR,
      rotulo: 'Operador Administrativo',
      descricao: 'Perfil administrativo, não técnico: gerencia fornecedores e consulta processos, pessoas e áreas. Sem acesso a DRP, PCN, riscos ou perfis.',
      exigeArea: false,
    },
    {
      valor: PERFIL.OPERADOR_PROCESSOS,
      rotulo: 'Operador de Processos',
      descricao: 'Documenta e monitora os processos de todas as áreas: edita processos, BIA e PCN, registra revisões e acompanha a conformidade. DRP só em leitura.',
      exigeArea: false,
    },
    {
      valor: PERFIL.GESTOR,
      rotulo: 'Gestor de área',
      descricao: 'Vê tudo, mas só altera os processos e riscos da própria área.',
      exigeArea: true,
    },
  ];

  /** Um perfil conhecido, ou null. Tolera maiuscula/espaco -- e so isso. */
  function _um(valor) {
    var v = String(valor || '').trim().toLowerCase();
    return CATALOGO.some(function (p) { return p.valor === v; }) ? v : null;
  }

  /**
   * Resolve string OU array num array de perfis conhecidos (sem duplicatas).
   * Vazio/tudo-desconhecido -> [PERFIL_PADRAO], o menor acesso. E o que impede
   * um erro de digitacao no console do Firebase de promover ninguem.
   */
  function _perfisDe(valor) {
    var bruto = Array.isArray(valor) ? valor : [valor];
    var out = [];
    bruto.forEach(function (v) {
      var p = _um(v);
      if (p && out.indexOf(p) === -1) out.push(p);
    });
    return out.length ? out : [PERFIL_PADRAO];
  }

  function _tem(valor, perfil) {
    return _perfisDe(valor).indexOf(perfil) !== -1;
  }

  /**
   * Normaliza para UMA string (o perfil "principal" = o primeiro conhecido).
   * Mantido por compat com o campo antigo `perfil` string e com USER_PERFIL.
   */
  function normalizar(valor) {
    return _perfisDe(valor)[0];
  }

  /** Lista normalizada de perfis (sem duplicatas, sem desconhecidos). */
  function normalizarLista(valor) {
    return _perfisDe(valor).slice();
  }

  function conhecido(valor) {
    return _um(valor) !== null;
  }

  function rotulo(valor) {
    var p = _um(valor);
    if (p) { var a = CATALOGO.find(function (x) { return x.valor === p; }); return a ? a.rotulo : ''; }
    // Lista de perfis -> junta os rotulos.
    var lista = _perfisDe(valor);
    return lista.map(function (v) { var a = CATALOGO.find(function (x) { return x.valor === v; }); return a ? a.rotulo : v; }).join(', ');
  }

  /** Exige area se QUALQUER perfil for Gestor. */
  function exigeArea(valor) {
    return _tem(valor, PERFIL.GESTOR);
  }

  function ehAdmin(valor) {
    return _tem(valor, PERFIL.ADMIN);
  }

  function ehSeguranca(valor) {
    return _tem(valor, PERFIL.SEGURANCA);
  }

  function ehTI(valor) {
    return _tem(valor, PERFIL.TI);
  }

  function ehOperador(valor) {
    return _tem(valor, PERFIL.OPERADOR);
  }

  function ehOperadorProcessos(valor) {
    return _tem(valor, PERFIL.OPERADOR_PROCESSOS);
  }

  /** Uniao das telas de todos os perfis do usuario. Admin ve tudo. */
  function telasDoPerfil(valor) {
    var lista = _perfisDe(valor);
    if (lista.indexOf(PERFIL.ADMIN) !== -1) return '*';
    var set = {};
    lista.forEach(function (p) {
      (TELAS[p] || []).forEach(function (t) { set[t] = true; });
    });
    return Object.keys(set);
  }

  /** Tela inicial (ver PAGINA_INICIAL): a do perfil de maior alcance que a pessoa tem. */
  function paginaInicial(valor) {
    var lista = normalizarLista(valor);
    for (var i = 0; i < ORDEM_PAGINA_INICIAL.length; i++) {
      var p = ORDEM_PAGINA_INICIAL[i];
      if (lista.indexOf(p) !== -1 && podeVerTela(valor, PAGINA_INICIAL[p])) return PAGINA_INICIAL[p];
    }
    var telas = telasDoPerfil(valor);
    return telas === '*' ? 'admin' : (telas[0] || 'processos');
  }

  /**
   * Ve esta tela. Uniao dos perfis; tela desconhecida devolve false, sempre.
   */
  function podeVerTela(valor, pagina) {
    var telas = telasDoPerfil(valor);
    if (telas === '*') return true;
    return telas.indexOf(String(pagina || '')) !== -1;
  }

  // ---- Poderes por modulo (uniao dos perfis) ----

  /**
   * Gerar/editar/excluir PCN: Admin, Seguranca ou Operador de Processos (PCN e
   * do processo/BIA; TI nao gera). Mesmo recorte de PERFIS_PCN no servidor.
   */
  function podeGerarPCN(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperadorProcessos(valor);
  }

  /**
   * Homologar o BIA (27/10/2026): validar a avaliacao feita (quem/quando).
   * Mesmos perfis que geram o PCN -- o Gestor avalia, mas nao homologa.
   */
  function podeHomologarBIA(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperadorProcessos(valor);
  }

  /** Gerar DRP (via IA): Admin ou Seguranca (TI opera, mas nao gera). */
  function podeGerarDRP(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Operar o DRP (editar parametros/conteudo, abrir, gerenciar): Admin, Seguranca ou TI. */
  function podeOperarDRP(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehTI(valor);
  }

  /**
   * Abrir o DRP gerado e os roteiros de teste SO PARA LER: quem opera o DRP e o
   * Operador de Processos (DECISAO 23/10/2026 -- monitora o DRP, nao edita).
   * Mesmo recorte de PERFIS_DRP_LEITURA no servidor (obterDRP/obterRoteiroTeste).
   */
  function podeVerConteudoDRP(valor) {
    return podeOperarDRP(valor) || ehOperadorProcessos(valor);
  }

  /**
   * Registrar a revisao periodica de um plano ('bia' | 'pcn' | 'drp'). BIA e
   * PCN sao de quem edita processos corporativamente (Admin, SI, Operador de
   * Processos); a revisao do DRP e de quem opera o DRP.
   */
  function podeRegistrarRevisao(valor, tipo) {
    if (tipo === 'drp') return podeOperarDRP(valor);
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperadorProcessos(valor);
  }

  /** Periodicidades do ciclo de revisao (config_continuidade/ciclos): Admin ou Seguranca. */
  function podeEditarCiclos(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Editar Riscos: Admin ou Seguranca (gestor edita os da propria area, tratado por area). */
  function podeEditarRiscos(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /**
   * Relatorios Executivos de Vulnerabilidades e de Riscos (DECISAO 20/10/2026):
   * so Admin e Seguranca -- TI e Operador veem a tela Relatorios, mas nao estes
   * cards. Mesmo recorte conferido no servidor (gerarResumoExecutivo).
   */
  function podeGerarRelatorioExecutivo(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Editar Indicadores de Seguranca: Admin ou Seguranca. */
  function podeEditarIndicadores(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Perguntas do BIA: atividade propria do Admin (SI nao mexe). */
  function podeEditarPerguntas(valor) {
    return ehAdmin(valor);
  }

  /** Regua de criticidade / config de respostas: atividade propria do Admin. */
  function podeEditarRegua(valor) {
    return ehAdmin(valor);
  }

  /**
   * Modulo de fornecedores (cadastrar, editar, apagar, criterio, avaliar).
   * Antes existia um perfil 'fornecedores' so pra isso; agora e Admin,
   * Seguranca da Informacao ou Operador Administrativo (14/10/2026). No banco, o
   * operador so escreve em /dependencias quando a categoria e Fornecedor.
   */
  function podeGerenciarFornecedores(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperador(valor);
  }

  /**
   * Contratos (cadastrar, editar, eventos, listas de tipo/indexador/status):
   * mesma posse de Fornecedores. Gestor ve os da propria area, sem editar.
   */
  function podeEditarContratos(valor) {
    return podeGerenciarFornecedores(valor);
  }

  /**
   * Mostrar os controles de edicao de Processos (novo, editar, excluir, enviar
   * questionario): Admin, Seguranca, Operador de Processos (todas as areas) ou
   * Gestor (por area). Operador Administrativo so consulta.
   */
  function podeEditarProcessos(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperadorProcessos(valor) || exigeArea(valor);
  }

  /** DECISAO 29/10/2026: Categorias de Processo -- quem opera processos de todas as areas. */
  function podeGerenciarCategoriasProcesso(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehOperadorProcessos(valor);
  }

  /** Cadastrar/editar/excluir Pessoas (vivem em /dependencias): Admin, Seguranca ou TI. */
  function podeEditarPessoas(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehTI(valor);
  }

  /** As categorias de /dependencias que sao "fornecedor". */
  var CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];

  function categoriaDeFornecedor(categoria) {
    return CATEGORIAS_FORNECEDOR.indexOf(String(categoria || '').trim()) !== -1;
  }

  /**
   * Pode mexer nesta linha de /dependencias.
   *
   * Admin e Seguranca mexem em qualquer categoria. TI mexe no catalogo de
   * dependencias porque e ali que os Parametros DRP sao editados (operar o DRP).
   */
  function podeMexerNaDependencia(valor, categoria) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehTI(valor);
  }

  /**
   * DECISAO 28/10/2026: categorias que o "+ Criar" da aba Dependencias do
   * processo oferece -- os Ps que nao sao tecnicos. O Operador de Processos so
   * CRIA estas (cadastro basico: nome e categoria); completar o cadastro fica
   * com quem mexe no catalogo. Espelha a regra de /dependencias.
   */
  var CATEGORIAS_CRIAVEIS_PELO_PROCESSO = ['Pessoas', 'Pessoa', 'Instalações', 'Instalação', 'Fornecedores', 'Fornecedor'];

  /** Pode criar esta categoria pelo "+ Criar" do processo. */
  function podeCriarDependenciaPeloProcesso(valor, categoria) {
    var cat = String(categoria || '').trim();
    if (podeMexerNaDependencia(valor)) return true;
    if (ehOperador(valor) && categoriaDeFornecedor(cat)) return true;
    return ehOperadorProcessos(valor) && CATEGORIAS_CRIAVEIS_PELO_PROCESSO.indexOf(cat) !== -1;
  }

  /** Cadastrar/editar/excluir Produtos de Software (Administracao): Admin ou Seguranca. */
  function podeGerenciarProdutosSoftware(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Pode mexer no cadastro de Areas: Admin ou Seguranca. */
  function podeMexerNaArea(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /**
   * Quem mexe em perfil de outras pessoas. SO admin -- se outro perfil
   * pudesse, se promoveria a admin e o limite nao seria limite nenhum.
   */
  function podeGerenciarPerfis(valor) {
    return ehAdmin(valor);
  }

  return {
    PERFIL: PERFIL,
    PERFIL_PADRAO: PERFIL_PADRAO,
    CATALOGO: CATALOGO,
    TELAS: TELAS,
    TELAS_ADMIN_EXCLUSIVAS: TELAS_ADMIN_EXCLUSIVAS,
    CATEGORIAS_FORNECEDOR: CATEGORIAS_FORNECEDOR,
    normalizar: normalizar,
    normalizarLista: normalizarLista,
    conhecido: conhecido,
    rotulo: rotulo,
    exigeArea: exigeArea,
    ehAdmin: ehAdmin,
    ehSeguranca: ehSeguranca,
    ehTI: ehTI,
    ehOperador: ehOperador,
    ehOperadorProcessos: ehOperadorProcessos,
    podeVerTela: podeVerTela,
    telasDoPerfil: telasDoPerfil,
    paginaInicial: paginaInicial,
    PAGINA_INICIAL: PAGINA_INICIAL,
    categoriaDeFornecedor: categoriaDeFornecedor,
    CATEGORIAS_CRIAVEIS_PELO_PROCESSO: CATEGORIAS_CRIAVEIS_PELO_PROCESSO,
    podeCriarDependenciaPeloProcesso: podeCriarDependenciaPeloProcesso,
    podeMexerNaDependencia: podeMexerNaDependencia,
    podeMexerNaArea: podeMexerNaArea,
    podeGerenciarProdutosSoftware: podeGerenciarProdutosSoftware,
    podeGerenciarFornecedores: podeGerenciarFornecedores,
    podeEditarContratos: podeEditarContratos,
    podeEditarProcessos: podeEditarProcessos,
    podeGerenciarCategoriasProcesso: podeGerenciarCategoriasProcesso,
    podeEditarPessoas: podeEditarPessoas,
    podeGerenciarPerfis: podeGerenciarPerfis,
    podeGerarPCN: podeGerarPCN,
    podeHomologarBIA: podeHomologarBIA,
    podeGerarDRP: podeGerarDRP,
    podeOperarDRP: podeOperarDRP,
    podeVerConteudoDRP: podeVerConteudoDRP,
    podeRegistrarRevisao: podeRegistrarRevisao,
    podeEditarCiclos: podeEditarCiclos,
    podeEditarRiscos: podeEditarRiscos,
    podeGerarRelatorioExecutivo: podeGerarRelatorioExecutivo,
    podeEditarIndicadores: podeEditarIndicadores,
    podeEditarPerguntas: podeEditarPerguntas,
    podeEditarRegua: podeEditarRegua,
  };
}));
