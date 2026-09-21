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

  var PERFIL = {
    ADMIN: 'admin',
    GESTOR: 'gestor',
    FORNECEDORES: 'fornecedores',
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
  var TELAS = {};
  TELAS[PERFIL.ADMIN] = '*';
  TELAS[PERFIL.GESTOR] = [
    'processos', 'pcns', 'riscos',
    'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
    'admin',
  ];
  TELAS[PERFIL.FORNECEDORES] = [
    'fornecedores', 'fornecedores-cadastro', 'fornecedores-criterios',
  ];

  var CATALOGO = [
    {
      valor: PERFIL.ADMIN,
      rotulo: 'Administrador',
      descricao: 'Acesso total: catálogos, régua do BIA, processos, riscos, indicadores e fornecedores.',
      exigeArea: false,
    },
    {
      valor: PERFIL.GESTOR,
      rotulo: 'Gestor de área',
      descricao: 'Vê tudo, mas só altera os processos e riscos da própria área.',
      exigeArea: true,
    },
    {
      valor: PERFIL.FORNECEDORES,
      rotulo: 'Fornecedores',
      descricao: 'Avalia fornecedores e gerencia os critérios de avaliação. Vê o resto sem poder alterar.',
      exigeArea: false,
    },
  ];

  /**
   * Normaliza o que veio do banco.
   *
   * Perfil desconhecido NAO virou admin por acidente: cai no padrao, que e o
   * menor acesso. Um erro de digitacao no console do Firebase nao pode promover
   * ninguem.
   */
  function normalizar(valor) {
    var v = String(valor || '').trim().toLowerCase();
    var achado = CATALOGO.find(function (p) { return p.valor === v; });
    return achado ? achado.valor : PERFIL_PADRAO;
  }

  function conhecido(valor) {
    var v = String(valor || '').trim().toLowerCase();
    return CATALOGO.some(function (p) { return p.valor === v; });
  }

  function rotulo(valor) {
    var achado = CATALOGO.find(function (p) { return p.valor === normalizar(valor); });
    return achado ? achado.rotulo : '';
  }

  /** So o perfil de gestor esta amarrado a uma area. */
  function exigeArea(valor) {
    var achado = CATALOGO.find(function (p) { return p.valor === normalizar(valor); });
    return !!achado && achado.exigeArea;
  }

  function ehAdmin(valor) {
    return normalizar(valor) === PERFIL.ADMIN;
  }

  /**
   * Ve esta tela.
   *
   * Tela desconhecida devolve false, sempre: a resposta para "essa tela e sua?"
   * nunca e "deve ser".
   */
  function podeVerTela(valor, pagina) {
    var permitidas = TELAS[normalizar(valor)];
    if (permitidas === '*') return true;
    if (!permitidas) return false;
    return permitidas.indexOf(String(pagina || '')) !== -1;
  }

  function telasDoPerfil(valor) {
    var permitidas = TELAS[normalizar(valor)];
    return permitidas === '*' ? '*' : (permitidas || []).slice();
  }

  /**
   * Manda no modulo de fornecedores: cadastrar, editar e apagar fornecedor,
   * cadastrar criterio e avaliar.
   *
   * O fornecedor mora em /dependencias, junto com Infraestrutura, Pessoas,
   * Sistemas e Processos Internos, que sao do BIA. Este perfil manda SO na
   * categoria Fornecedores — ver categoriaDeFornecedor e a regra do banco.
   */
  function podeGerenciarFornecedores(valor) {
    var p = normalizar(valor);
    return p === PERFIL.ADMIN || p === PERFIL.FORNECEDORES;
  }

  /** As categorias de /dependencias que sao "fornecedor". */
  var CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];

  function categoriaDeFornecedor(categoria) {
    return CATEGORIAS_FORNECEDOR.indexOf(String(categoria || '').trim()) !== -1;
  }

  /**
   * Pode mexer nesta linha de /dependencias.
   *
   * Admin mexe em qualquer categoria. O perfil de fornecedores mexe apenas em
   * fornecedor: sem esta guarda, quem avalia fornecedor poderia apagar as
   * dependencias de infraestrutura e sistemas que o BIA inteiro usa.
   */
  function podeMexerNaDependencia(valor, categoria) {
    if (ehAdmin(valor)) return true;
    return podeGerenciarFornecedores(valor) && categoriaDeFornecedor(categoria);
  }

  /**
   * Quem mexe em perfil de outras pessoas.
   *
   * So admin, e de proposito: se o perfil de fornecedores pudesse editar
   * perfis, ele se promoveria a admin em dois cliques e o limite nao seria
   * limite nenhum.
   */
  function podeGerenciarPerfis(valor) {
    return ehAdmin(valor);
  }

  return {
    PERFIL: PERFIL,
    PERFIL_PADRAO: PERFIL_PADRAO,
    CATALOGO: CATALOGO,
    normalizar: normalizar,
    conhecido: conhecido,
    rotulo: rotulo,
    exigeArea: exigeArea,
    ehAdmin: ehAdmin,
    TELAS: TELAS,
    CATEGORIAS_FORNECEDOR: CATEGORIAS_FORNECEDOR,
    podeVerTela: podeVerTela,
    telasDoPerfil: telasDoPerfil,
    categoriaDeFornecedor: categoriaDeFornecedor,
    podeMexerNaDependencia: podeMexerNaDependencia,
    podeGerenciarFornecedores: podeGerenciarFornecedores,
    podeGerenciarPerfis: podeGerenciarPerfis,
  };
}));
