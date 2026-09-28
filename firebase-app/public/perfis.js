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
  var TELAS_ADMIN_EXCLUSIVAS = ['perfis', 'perguntas'];
  var TELAS = {};
  TELAS[PERFIL.ADMIN] = '*';
  TELAS[PERFIL.SEGURANCA] = [
    'processos', 'pcns', 'drp', 'riscos',
    'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
    'dependencias', 'areas', 'pessoas',
    'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios',
    'admin',
  ];
  TELAS[PERFIL.TI] = [
    'drp', 'dependencias',
  ];
  TELAS[PERFIL.GESTOR] = [
    'processos', 'pcns', 'drp', 'riscos',
    'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
    'admin',
  ];

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

  /**
   * Ve esta tela. Uniao dos perfis; tela desconhecida devolve false, sempre.
   */
  function podeVerTela(valor, pagina) {
    var telas = telasDoPerfil(valor);
    if (telas === '*') return true;
    return telas.indexOf(String(pagina || '')) !== -1;
  }

  // ---- Poderes por modulo (uniao dos perfis) ----

  /** Gerar PCN: Admin ou Seguranca (PCN e do processo/BIA; TI nao gera). */
  function podeGerarPCN(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Gerar DRP (via IA): Admin ou Seguranca (TI opera, mas nao gera). */
  function podeGerarDRP(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
  }

  /** Operar o DRP (editar parametros/conteudo, abrir, gerenciar): Admin, Seguranca ou TI. */
  function podeOperarDRP(valor) {
    return ehAdmin(valor) || ehSeguranca(valor) || ehTI(valor);
  }

  /** Editar Riscos: Admin ou Seguranca (gestor edita os da propria area, tratado por area). */
  function podeEditarRiscos(valor) {
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
   * Antes existia um perfil 'fornecedores' so pra isso; agora e Admin ou
   * Seguranca da Informacao.
   */
  function podeGerenciarFornecedores(valor) {
    return ehAdmin(valor) || ehSeguranca(valor);
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
    podeVerTela: podeVerTela,
    telasDoPerfil: telasDoPerfil,
    categoriaDeFornecedor: categoriaDeFornecedor,
    podeMexerNaDependencia: podeMexerNaDependencia,
    podeMexerNaArea: podeMexerNaArea,
    podeGerenciarFornecedores: podeGerenciarFornecedores,
    podeGerenciarPerfis: podeGerenciarPerfis,
    podeGerarPCN: podeGerarPCN,
    podeGerarDRP: podeGerarDRP,
    podeOperarDRP: podeOperarDRP,
    podeEditarRiscos: podeEditarRiscos,
    podeEditarIndicadores: podeEditarIndicadores,
    podeEditarPerguntas: podeEditarPerguntas,
    podeEditarRegua: podeEditarRegua,
  };
}));
