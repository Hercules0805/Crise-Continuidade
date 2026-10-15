/**
 * Avaliacao guiada da severidade de uma Vulnerabilidade (aba Severidade).
 *
 * 1) CVSS 3.1 (nota oficial 0-10): as 8 metricas base da especificacao FIRST
 *    (https://www.first.org/cvss/v3.1/specification-document), com pergunta e
 *    opcoes em portugues simples. O resultado vai para o MESMO campo `cvss`
 *    de sempre -- faixas NVD (vulnerabilidade-severidade.js), risco automatico
 *    e titulo do risco nao mudam.
 * 2) Sem CVSS (falha de processo etc.): matriz impacto x facilidade que SUGERE
 *    a severidade manual -- a pessoa ainda pode trocar.
 *
 * Exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Cvss31 = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var METRICAS = [
    { codigo: 'AV', grupo: 'Como o ataque acontece', pergunta: 'Por onde o ataque pode ser feito?', opcoes: [
      { codigo: 'N', rotulo: 'Pela internet', explicacao: 'Qualquer pessoa na internet alcança o sistema vulnerável.' },
      { codigo: 'A', rotulo: 'Pela rede interna / VPN', explicacao: 'Só quem está na mesma rede (escritório, VPN, mesma nuvem privada).' },
      { codigo: 'L', rotulo: 'Precisa de acesso à máquina', explicacao: 'O atacante precisa estar logado ou ter um programa rodando na máquina.' },
      { codigo: 'P', rotulo: 'Precisa de acesso físico', explicacao: 'Só com o equipamento na mão (pendrive, porta de manutenção).' },
    ] },
    { codigo: 'AC', grupo: 'Como o ataque acontece', pergunta: 'Quão difícil é explorar?', opcoes: [
      { codigo: 'L', rotulo: 'Fácil', explicacao: 'Funciona sempre, sem depender de nenhuma condição especial.' },
      { codigo: 'H', rotulo: 'Difícil', explicacao: 'Depende de condições fora do controle do atacante (configuração rara, momento exato, informação que ele não tem).' },
    ] },
    { codigo: 'PR', grupo: 'Como o ataque acontece', pergunta: 'Que acesso o atacante precisa ter antes?', opcoes: [
      { codigo: 'N', rotulo: 'Nenhum', explicacao: 'Funciona sem login (anônimo).' },
      { codigo: 'L', rotulo: 'Usuário comum', explicacao: 'Precisa de uma conta comum no sistema.' },
      { codigo: 'H', rotulo: 'Administrador', explicacao: 'Precisa de uma conta com privilégio alto (admin).' },
    ] },
    { codigo: 'UI', grupo: 'Como o ataque acontece', pergunta: 'Alguém do lado da vítima precisa fazer algo?', opcoes: [
      { codigo: 'N', rotulo: 'Não', explicacao: 'O atacante consegue sozinho.' },
      { codigo: 'R', rotulo: 'Sim', explicacao: 'Alguém precisa clicar num link, abrir um arquivo ou acessar uma página.' },
    ] },
    { codigo: 'S', grupo: 'Alcance', pergunta: 'O estrago passa para outros sistemas?', opcoes: [
      { codigo: 'U', rotulo: 'Não', explicacao: 'O dano fica no próprio componente vulnerável.' },
      { codigo: 'C', rotulo: 'Sim', explicacao: 'A partir dele, o atacante atinge outros componentes (ex.: do app para o servidor, do navegador para outros usuários).' },
    ] },
    { codigo: 'C', grupo: 'Impacto', pergunta: 'Vazamento de dados (confidencialidade)', opcoes: [
      { codigo: 'H', rotulo: 'Grave', explicacao: 'Acesso a todos os dados, ou a dados muito sensíveis (senhas, dados pessoais, financeiros).' },
      { codigo: 'L', rotulo: 'Parcial', explicacao: 'Acesso a parte dos dados, sem controle do que é lido.' },
      { codigo: 'N', rotulo: 'Nenhum', explicacao: 'Nenhum dado é exposto.' },
    ] },
    { codigo: 'I', grupo: 'Impacto', pergunta: 'Alteração de dados (integridade)', opcoes: [
      { codigo: 'H', rotulo: 'Grave', explicacao: 'Consegue alterar qualquer dado, ou dados críticos.' },
      { codigo: 'L', rotulo: 'Parcial', explicacao: 'Altera parte dos dados, com alcance limitado.' },
      { codigo: 'N', rotulo: 'Nenhum', explicacao: 'Nenhum dado pode ser alterado.' },
    ] },
    { codigo: 'A', grupo: 'Impacto', pergunta: 'Parada do serviço (disponibilidade)', opcoes: [
      { codigo: 'H', rotulo: 'Grave', explicacao: 'Derruba o serviço por completo, ou de forma persistente.' },
      { codigo: 'L', rotulo: 'Parcial', explicacao: 'Deixa lento ou indisponível em parte.' },
      { codigo: 'N', rotulo: 'Nenhum', explicacao: 'O serviço segue funcionando normalmente.' },
    ] },
  ];

  var CODIGOS = METRICAS.map(function (m) { return m.codigo; });

  // Pesos da especificacao CVSS 3.1 (secao 7.4).
  var PESOS = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
    AC: { L: 0.77, H: 0.44 },
    PR: { U: { N: 0.85, L: 0.62, H: 0.27 }, C: { N: 0.85, L: 0.68, H: 0.5 } },
    UI: { N: 0.85, R: 0.62 },
    CIA: { H: 0.56, L: 0.22, N: 0 },
  };

  function _valida(respostas) {
    var r = respostas || {};
    return METRICAS.every(function (m) {
      return m.opcoes.some(function (o) { return o.codigo === r[m.codigo]; });
    });
  }

  /** Quantas das 8 metricas ainda faltam responder. */
  function faltam(respostas) {
    var r = respostas || {};
    return METRICAS.filter(function (m) {
      return !m.opcoes.some(function (o) { return o.codigo === r[m.codigo]; });
    }).length;
  }

  /** Roundup da especificacao 3.1 (Apendice A): sem erro de ponto flutuante. */
  function _roundup(x) {
    var inteiro = Math.round(x * 100000);
    if (inteiro % 10000 === 0) return inteiro / 100000;
    return (Math.floor(inteiro / 10000) + 1) / 10;
  }

  /** Nota base CVSS 3.1 (0-10, 1 casa) ou null se faltar alguma metrica. */
  function calcular(respostas) {
    if (!_valida(respostas)) return null;
    var r = respostas;
    var mudouEscopo = r.S === 'C';
    var iss = 1 - (1 - PESOS.CIA[r.C]) * (1 - PESOS.CIA[r.I]) * (1 - PESOS.CIA[r.A]);
    var impacto = mudouEscopo
      ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
      : 6.42 * iss;
    var exploracao = 8.22 * PESOS.AV[r.AV] * PESOS.AC[r.AC] * PESOS.PR[mudouEscopo ? 'C' : 'U'][r.PR] * PESOS.UI[r.UI];
    if (impacto <= 0) return 0;
    return mudouEscopo
      ? _roundup(Math.min(1.08 * (impacto + exploracao), 10))
      : _roundup(Math.min(impacto + exploracao, 10));
  }

  function _opcaoValida(metrica, codigo) {
    var m = METRICAS.filter(function (x) { return x.codigo === metrica; })[0];
    return !!m && m.opcoes.some(function (o) { return o.codigo === codigo; });
  }

  /**
   * 'CVSS:3.1/AV:N/AC:L/...' ou '' se faltar alguma metrica. Com
   * { parcial: true }, devolve so as respondidas (ex.: 'CVSS:3.1/AV:N/AC:L') --
   * e assim que a tela guarda uma avaliacao pela metade, sem perde-la ao fechar;
   * '' quando nenhuma foi respondida.
   */
  function paraVetor(respostas, opts) {
    var r = respostas || {};
    if (opts && opts.parcial) {
      var pares = CODIGOS.filter(function (c) { return _opcaoValida(c, r[c]); }).map(function (c) { return c + ':' + r[c]; });
      return pares.length ? 'CVSS:3.1/' + pares.join('/') : '';
    }
    if (!_valida(r)) return '';
    return 'CVSS:3.1/' + CODIGOS.map(function (c) { return c + ':' + r[c]; }).join('/');
  }

  /**
   * Le um vetor de relatorio (pentest, fornecedor, NVD). Aceita CVSS:3.1 e
   * CVSS:3.0 (mesmas metricas base) em qualquer ordem; ignora metricas
   * temporais/ambientais (E, RL, RC, CR...). null se invalido ou incompleto --
   * com { parcial: true }, aceita incompleto (o que a propria tela gravou).
   */
  function lerVetor(texto, opts) {
    var t = String(texto || '').trim().toUpperCase();
    var m = t.match(/^CVSS:3\.[01]\/(.+)$/);
    if (!m) return null;
    var respostas = {};
    var ok = m[1].split('/').every(function (par) {
      var kv = par.split(':');
      if (kv.length !== 2) return false;
      if (CODIGOS.indexOf(kv[0]) === -1) return true;
      if (respostas[kv[0]] || !_opcaoValida(kv[0], kv[1])) return false;
      respostas[kv[0]] = kv[1];
      return true;
    });
    if (!ok) return null;
    if (opts && opts.parcial) return respostas;
    return _valida(respostas) ? respostas : null;
  }

  // ---- Sem CVSS: matriz impacto x facilidade -> severidade sugerida ----
  var IMPACTOS = [
    { codigo: 'Baixo', explicacao: 'Incômodo pequeno, sem dado sensível nem parada relevante.' },
    { codigo: 'Moderado', explicacao: 'Afeta parte dos usuários ou dados internos, com contorno.' },
    { codigo: 'Alto', explicacao: 'Expõe dados sensíveis ou para um processo importante.' },
    { codigo: 'Grave', explicacao: 'Vazamento amplo, fraude, parada do negócio ou impacto legal (LGPD).' },
  ];
  var FACILIDADES = [
    { codigo: 'Difícil', explicacao: 'Exige conhecimento interno raro ou várias condições juntas.' },
    { codigo: 'Possível', explicacao: 'Exige algum esforço ou acesso, mas acontece.' },
    { codigo: 'Fácil', explicacao: 'Qualquer usuário comum consegue, sem ferramenta especial.' },
    { codigo: 'Muito fácil', explicacao: 'Acontece sozinho ou já está acontecendo.' },
  ];
  // Linhas = impacto (Baixo..Grave), colunas = facilidade (Difícil..Muito fácil).
  var MATRIZ_SEM_CVSS = [
    ['Baixa', 'Baixa', 'Média', 'Média'],
    ['Baixa', 'Média', 'Média', 'Alta'],
    ['Média', 'Média', 'Alta', 'Crítica'],
    ['Média', 'Alta', 'Crítica', 'Crítica'],
  ];

  function _indice(lista, codigo) {
    for (var i = 0; i < lista.length; i++) if (lista[i].codigo === codigo) return i;
    return -1;
  }

  /** Severidade sugerida (Baixa/Média/Alta/Crítica) ou null se faltar um dos dois. */
  function sugerirSeveridade(impacto, facilidade) {
    var i = _indice(IMPACTOS, impacto);
    var f = _indice(FACILIDADES, facilidade);
    if (i === -1 || f === -1) return null;
    return MATRIZ_SEM_CVSS[i][f];
  }

  return {
    METRICAS: METRICAS,
    faltam: faltam,
    calcular: calcular,
    paraVetor: paraVetor,
    lerVetor: lerVetor,
    IMPACTOS: IMPACTOS,
    FACILIDADES: FACILIDADES,
    MATRIZ_SEM_CVSS: MATRIZ_SEM_CVSS,
    sugerirSeveridade: sugerirSeveridade,
  };
}));
