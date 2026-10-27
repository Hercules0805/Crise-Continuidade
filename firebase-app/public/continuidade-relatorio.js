/**
 * Relatorio de Status de Continuidade (27/10/2026): toda a conta do documento,
 * sem DOM. A tela (app.js, _htmlRelatorioContinuidade) so desenha.
 *
 * Nenhuma regra nova: os status vem de ConformidadeContinuidade.statusDosPlanos
 * (o que a faixa do drawer, a grade, o Dashboard e o "Processos por Area"
 * mostram) e as pendencias/indicadores de ConformidadeContinuidade.avaliar (a
 * tela Conformidade), sobre a cadeia de CadeiaDependencias e o Tier de
 * Criticidade. Assim o relatorio nunca contradiz as telas.
 *
 *   dadosRelatorio()    -> cobertura, porArea, porCategoria, revisoes, pendencias, indicadores
 *   variacao()          -> evolucao dos indicadores contra a edicao salva anterior
 *   destaques()         -> frases calculadas (o resumo quando nao ha IA)
 *   indicadoresParaIA() -> so agregados e os itens de topo, sem texto livre
 *
 * "Dependencia que pode ter DRP": o catalogo sem Pessoas e Processos Internos
 * (mesma exclusao da cadeia) e sem fornecedor inativo. Com recorte por area,
 * so as que estao na cadeia dos processos da area (como a Conformidade do
 * gestor). Carregar DEPOIS de criticidade.js, cadeia-dependencias.js e
 * conformidade-continuidade.js. Tambem exporta como CommonJS para node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./conformidade-continuidade.js'), require('./cadeia-dependencias.js'), require('./criticidade.js'));
  } else {
    root.ContinuidadeRelatorio = factory(root.ConformidadeContinuidade, root.CadeiaDependencias, root.Criticidade);
  }
}(typeof self !== 'undefined' ? self : this, function (CC, CD, CR) {
  'use strict';

  var CATEGORIAS_SEM_DRP = ['Pessoas', 'Pessoa', 'Processos Internos', 'Processo Interno', 'Serviços', 'Serviço'];
  var MAX_PENDENCIAS = 30;
  var MAX_REVISOES = 100;

  function _texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function _hoje(h) {
    var t = _texto(h).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
  }

  function _pct(parte, total) {
    return total ? Math.round((parte / total) * 100) : null;
  }

  /** Dependencia que entra na conta de DRP (fornecedor inativo fica fora, como nos seletores). */
  function podeTerDrp(dep) {
    return !!dep && dep.ativo !== false && CATEGORIAS_SEM_DRP.indexOf(_texto(dep.categoria)) < 0;
  }

  var BIA_REALIZADO = ['avaliado', 'homologado', 'vencido'];

  /**
   * insumos = { processos, dependencias, servicos, ciclos, hoje, area }.
   * area vazia = empresa inteira.
   */
  function dadosRelatorio(insumos) {
    var ins = insumos || {};
    var hoje = _hoje(ins.hoje);
    var ciclos = CC.normalizarCiclos(ins.ciclos);
    var area = _texto(ins.area);
    var servicos = ins.servicos || [];
    var deps = (ins.dependencias || []).filter(function (d) { return d && d.ativo !== false; });
    var processos = (ins.processos || []).filter(function (p) { return p && (!area || _texto(p.area) === area); });

    var cadeias = {};
    function cadeiaDe(p) {
      var k = String(p.id);
      if (!cadeias[k]) cadeias[k] = CD.cadeiaDoProcesso({ processo: p, dependencias: deps, servicos: servicos });
      return cadeias[k];
    }

    var aval = CC.avaliar({
      processos: processos, dependencias: deps, ciclos: ciclos, hoje: hoje,
      tierDe: CR.tierDoProcesso, cadeiaDoProcesso: cadeiaDe, somenteCadeia: !!area,
    });

    // ---- Processos: status de cada um ----
    var porTier = {};
    [CR.TIER.T1, CR.TIER.T2, CR.TIER.T3, CR.TIER.PENDENTE].forEach(function (t) { porTier[t] = 0; });
    var bia = { total: 0, realizados: 0, homologados: 0, emAvaliacao: 0, naoAvaliados: 0, vencidos: 0, aHomologar: 0 };
    var bcp = { comPcn: 0, criticos: 0, criticosComPcn: 0, criticosSemPcn: 0, vencidos: 0 };
    var drpProc = { criticos: 0, completo: 0, parcial: 0, semDrp: 0, vencido: 0, semDependencias: 0 };
    var naCadeia = {}, criticas = {};
    var areas = {};

    var linhas = processos.map(function (p) {
      var tier = CR.tierDoProcesso(p);
      var critico = CC.ehTierCritico(tier);
      var cadeia = cadeiaDe(p).filter(function (it) { return it && !it.ausente && it.dep; });
      var st = CC.statusDosPlanos(p, { tier: tier, cadeia: cadeia, ciclos: ciclos, hoje: hoje });
      porTier[tier] = (porTier[tier] || 0) + 1;

      bia.total++;
      if (BIA_REALIZADO.indexOf(st.bia.codigo) >= 0) bia.realizados++;
      if (st.bia.codigo === 'homologado') bia.homologados++;
      if (st.bia.codigo === 'em-avaliacao') bia.emAvaliacao++;
      if (st.bia.codigo === 'nao-avaliado') bia.naoAvaliados++;
      if (st.bia.codigo === 'vencido') bia.vencidos++;
      if (st.bia.codigo === 'avaliado') bia.aHomologar++;

      var temPcn = st.bcp.codigo === 'pcn-gerado' || st.bcp.codigo === 'vencido';
      if (temPcn) bcp.comPcn++;
      if (st.bcp.codigo === 'vencido') bcp.vencidos++;
      if (critico) {
        bcp.criticos++;
        if (temPcn) bcp.criticosComPcn++; else bcp.criticosSemPcn++;
        drpProc.criticos++;
        var cod = st.drp.codigo;
        if (cod === 'completo') drpProc.completo++;
        else if (cod === 'parcial') drpProc.parcial++;
        else if (cod === 'sem-drp') drpProc.semDrp++;
        else if (cod === 'vencido') drpProc.vencido++;
        else if (cod === 'sem-dependencias') drpProc.semDependencias++;
      }

      cadeia.forEach(function (it) {
        if (!podeTerDrp(it.dep)) return;
        naCadeia[String(it.dep.id)] = true;
        if (critico) criticas[String(it.dep.id)] = true;
      });

      var nomeArea = _texto(p.area) || '(sem área)';
      var a = areas[nomeArea] = areas[nomeArea] || { area: nomeArea, processos: 0, biaRealizados: 0, criticos: 0, criticosComPcn: 0, criticosDrpCompleto: 0, pendencias: 0 };
      a.processos++;
      if (BIA_REALIZADO.indexOf(st.bia.codigo) >= 0) a.biaRealizados++;
      if (critico) {
        a.criticos++;
        if (temPcn) a.criticosComPcn++;
        if (st.drp.codigo === 'completo') a.criticosDrpCompleto++;
      }
      return { p: p, tier: tier, critico: critico, st: st };
    });

    // ---- Dependencias ----
    var universo = deps.filter(function (d) { return podeTerDrp(d) && (!area || naCadeia[String(d.id)]); });
    var drpDeps = { total: universo.length, comDrp: 0, criticas: 0, criticasComDrp: 0, criticasEmDia: aval.indicadores.drpEmDia, testesAtrasados: 0, nuncaTestados: 0 };
    var cats = {};
    universo.forEach(function (d) {
      var tem = CC.temDRP(d);
      var critica = !!criticas[String(d.id)];
      if (tem) drpDeps.comDrp++;
      if (critica) { drpDeps.criticas++; if (tem) drpDeps.criticasComDrp++; }
      var nome = _texto(d.categoria) || 'Sem categoria';
      var c = cats[nome] = cats[nome] || { categoria: nome, total: 0, comDrp: 0, criticas: 0, criticasSemDrp: 0, testeEmDia: 0, testeAtrasado: 0, nuncaTestado: 0, semFrequencia: 0 };
      c.total++;
      if (tem) c.comDrp++;
      if (critica) { c.criticas++; if (!tem) c.criticasSemDrp++; }
      if (tem) {
        var t = CC.testeDrp(d, hoje).status;
        if (t === 'em-dia') c.testeEmDia++;
        else if (t === 'atrasado') { c.testeAtrasado++; drpDeps.testesAtrasados++; }
        else if (t === 'nunca-testado') { c.nuncaTestado++; drpDeps.nuncaTestados++; }
        else c.semFrequencia++;
      }
    });

    // ---- Pendencias e revisoes (as da Conformidade) ----
    var pend = aval.pendencias;
    pend.forEach(function (x) {
      if (x.alvo === 'processo') {
        var a = areas[x.area || '(sem área)'];
        if (a) a.pendencias++;
      }
    });
    var item = function (x) {
      return { tipo: x.tipo, situacao: x.situacao, alvo: x.alvo, nome: x.nome, area: x.area || '', tier: x.tier || '', mensagem: x.mensagem, desde: x.desde || '', proxima: x.proxima || '', processos: (x.processos || []).slice(0, 5) };
    };
    var T = CC.TIPO, S = CC.SITUACAO;
    var revisoes = {
      aHomologar: pend.filter(function (x) { return x.tipo === T.HOMOLOGACAO; }).slice(0, MAX_REVISOES).map(item),
      vencidas: pend.filter(function (x) { return x.situacao === S.VENCIDO && x.tipo !== T.TESTE_DRP; }).slice(0, MAX_REVISOES).map(item),
      vencendo: pend.filter(function (x) { return x.situacao === S.VENCENDO; }).slice(0, MAX_REVISOES).map(item),
      testes: pend.filter(function (x) { return x.tipo === T.TESTE_DRP; }).slice(0, MAX_REVISOES).map(item),
    };
    var contagem = CC.contar(pend);

    var porArea = Object.keys(areas).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (k) {
      var a = areas[k];
      return Object.assign({}, a, {
        pctBia: _pct(a.biaRealizados, a.processos),
        pctPcn: _pct(a.criticosComPcn, a.criticos),
        pctDrp: _pct(a.criticosDrpCompleto, a.criticos),
      });
    });
    var porCategoria = Object.keys(cats).map(function (k) { return Object.assign({}, cats[k], { pctDrp: _pct(cats[k].comDrp, cats[k].total) }); })
      .sort(function (a, b) { return (b.criticas - a.criticas) || (b.total - a.total) || a.categoria.localeCompare(b.categoria, 'pt-BR'); });

    var cobertura = {
      processos: { total: processos.length, porTier: porTier },
      bia: Object.assign(bia, { pctRealizados: _pct(bia.realizados, bia.total), pctHomologados: _pct(bia.homologados, bia.total) }),
      bcp: Object.assign(bcp, { pctCriticos: _pct(bcp.criticosComPcn, bcp.criticos) }),
      drp: {
        dependencias: Object.assign(drpDeps, {
          pct: _pct(drpDeps.comDrp, drpDeps.total),
          pctCriticas: _pct(drpDeps.criticasComDrp, drpDeps.criticas),
          pctCriticasEmDia: _pct(drpDeps.criticasEmDia, drpDeps.criticas),
        }),
        processos: Object.assign(drpProc, { pctCompleto: _pct(drpProc.completo, drpProc.criticos) }),
      },
    };

    return {
      hoje: hoje,
      area: area,
      ciclos: ciclos,
      cobertura: cobertura,
      porArea: porArea,
      porCategoria: porCategoria,
      revisoes: revisoes,
      pendencias: { total: contagem.total, porTipo: contagem.porTipo, porSituacao: contagem.porSituacao, itens: pend.slice(0, MAX_PENDENCIAS).map(item) },
      indicadores: indicadores(cobertura, contagem, revisoes),
    };
  }

  /** Numeros planos para a evolucao entre edicoes e para a IA. */
  function indicadores(cob, contagem, revisoes) {
    return {
      processos: cob.processos.total,
      biaRealizadosPct: cob.bia.pctRealizados,
      biaHomologadosPct: cob.bia.pctHomologados,
      pcnCriticosPct: cob.bcp.pctCriticos,
      drpDependenciasPct: cob.drp.dependencias.pct,
      drpCriticasPct: cob.drp.dependencias.pctCriticas,
      drpProcessosCompletoPct: cob.drp.processos.pctCompleto,
      pendencias: contagem.total,
      revisoesVencidas: revisoes.vencidas.length,
      testesAtrasados: revisoes.testes.length,
      aHomologar: revisoes.aHomologar.length,
    };
  }

  // Indicadores da evolucao: rotulo, unidade e se subir e bom.
  var EVOLUCAO = [
    { chave: 'biaRealizadosPct', rotulo: 'BIA realizado', unidade: 'pp', sobeBom: true },
    { chave: 'biaHomologadosPct', rotulo: 'BIA homologado', unidade: 'pp', sobeBom: true },
    { chave: 'pcnCriticosPct', rotulo: 'PCN nos Tier 1/2', unidade: 'pp', sobeBom: true },
    { chave: 'drpCriticasPct', rotulo: 'DRP nas dependências críticas', unidade: 'pp', sobeBom: true },
    { chave: 'drpDependenciasPct', rotulo: 'DRP no catálogo', unidade: 'pp', sobeBom: true },
    { chave: 'pendencias', rotulo: 'Pendências', unidade: 'n', sobeBom: false },
    { chave: 'revisoesVencidas', rotulo: 'Revisões vencidas', unidade: 'n', sobeBom: false },
    { chave: 'testesAtrasados', rotulo: 'Testes de DRP atrasados', unidade: 'n', sobeBom: false },
    { chave: 'processos', rotulo: 'Processos', unidade: 'n', sobeBom: null },
  ];

  /**
   * Evolucao contra a edicao anterior. anterior = { indicadores, geradoEm } ou
   * null. Devolve { desde, itens: [{ chave, rotulo, unidade, atual, anterior,
   * delta, tendencia: 'melhora'|'piora'|'igual'|'neutra' }] } ou null.
   */
  function variacao(atual, anterior) {
    if (!anterior || !anterior.indicadores) return null;
    var a = atual || {}, b = anterior.indicadores;
    return {
      desde: _texto(anterior.geradoEm).slice(0, 10),
      itens: EVOLUCAO.map(function (e) {
        var va = a[e.chave], vb = b[e.chave];
        var tem = typeof va === 'number' && typeof vb === 'number';
        var delta = tem ? va - vb : null;
        var tendencia = !tem ? 'neutra' : delta === 0 ? 'igual' : e.sobeBom === null ? 'neutra' : ((delta > 0) === e.sobeBom ? 'melhora' : 'piora');
        return { chave: e.chave, rotulo: e.rotulo, unidade: e.unidade, atual: typeof va === 'number' ? va : null, anterior: typeof vb === 'number' ? vb : null, delta: delta, tendencia: tendencia };
      }),
    };
  }

  function _fracao(n, total) {
    return total ? n + ' de ' + total + ' (' + _pct(n, total) + '%)' : '0';
  }

  /** Frases calculadas -- o resumo quando nao ha IA, e o contexto da lista de edicoes. */
  function destaques(d, evolucao) {
    var c = d.cobertura;
    var saida = [];
    if (!c.processos.total) return ['Nenhum processo no escopo.'];
    saida.push('BIA realizado em ' + _fracao(c.bia.realizados, c.bia.total) + ' processos; ' + c.bia.homologados + ' homologado(s).');
    saida.push(c.bcp.criticos
      ? 'PCN em ' + _fracao(c.bcp.criticosComPcn, c.bcp.criticos) + ' processos Tier 1/2' + (c.bcp.criticosSemPcn ? ' — ' + c.bcp.criticosSemPcn + ' ainda sem PCN.' : '.')
      : 'Nenhum processo Tier 1/2 no escopo (PCN não exigido).');
    var dd = c.drp.dependencias;
    if (dd.criticas) saida.push('DRP em ' + _fracao(dd.criticasComDrp, dd.criticas) + ' dependências críticas (cadeia de processos Tier 1/2); ' + _fracao(dd.comDrp, dd.total) + ' no catálogo.');
    else saida.push('DRP em ' + _fracao(dd.comDrp, dd.total) + ' dependências do catálogo; nenhuma na cadeia de processo Tier 1/2.');
    if (d.pendencias.total) {
      var vencidas = d.pendencias.porSituacao[CC.SITUACAO.VENCIDO] || 0;
      var faltando = d.pendencias.porSituacao[CC.SITUACAO.FALTANDO] || 0;
      saida.push(d.pendencias.total + ' pendência(s): ' + faltando + ' faltando, ' + vencidas + ' vencida(s), ' + d.revisoes.testes.length + ' teste(s) de DRP atrasado(s) e ' + d.revisoes.aHomologar.length + ' BIA a homologar.');
    } else {
      saida.push('Nenhuma pendência de BIA, PCN ou DRP no escopo.');
    }
    if (evolucao) {
      var mudou = evolucao.itens.filter(function (x) { return x.tendencia === 'melhora' || x.tendencia === 'piora'; });
      if (mudou.length) {
        var desde = evolucao.desde.split('-').reverse().join('/');
        saida.push('Desde ' + desde + ': ' + mudou.slice(0, 3).map(function (x) {
          return x.rotulo + ' ' + (x.delta > 0 ? '+' : '') + x.delta + (x.unidade === 'pp' ? ' p.p.' : '');
        }).join('; ') + '.');
      }
    }
    return saida;
  }

  /** Para a IA: so numeros, nomes e as pendencias de topo (sem descricoes nem e-mails). */
  function indicadoresParaIA(d, evolucao, escopo) {
    var c = d.cobertura;
    return {
      escopo: escopo || 'Empresa inteira',
      data: d.hoje,
      ciclosDeRevisaoMeses: { bia: d.ciclos.biaMeses, pcn: d.ciclos.pcnMeses, drp: d.ciclos.drpMeses },
      processos: c.processos,
      bia: c.bia,
      bcp: c.bcp,
      drpDependencias: c.drp.dependencias,
      drpProcessosTier12: c.drp.processos,
      porArea: d.porArea.map(function (a) { return { area: a.area, processos: a.processos, pctBia: a.pctBia, criticos: a.criticos, pctPcn: a.pctPcn, pctDrp: a.pctDrp, pendencias: a.pendencias }; }),
      porCategoria: d.porCategoria.map(function (x) { return { categoria: x.categoria, total: x.total, comDrp: x.comDrp, criticas: x.criticas, criticasSemDrp: x.criticasSemDrp, testeAtrasado: x.testeAtrasado, nuncaTestado: x.nuncaTestado }; }),
      pendencias: { total: d.pendencias.total, porTipo: d.pendencias.porTipo, porSituacao: d.pendencias.porSituacao },
      principaisPendencias: d.pendencias.itens.slice(0, 10).map(function (x) { return { tipo: x.tipo, situacao: x.situacao, nome: x.nome, area: x.area, tier: x.tier, mensagem: x.mensagem }; }),
      evolucao: evolucao ? { desde: evolucao.desde, itens: evolucao.itens.map(function (x) { return { indicador: x.rotulo, atual: x.atual, anterior: x.anterior, delta: x.delta, tendencia: x.tendencia }; }) } : null,
    };
  }

  return {
    CATEGORIAS_SEM_DRP: CATEGORIAS_SEM_DRP,
    EVOLUCAO: EVOLUCAO,
    podeTerDrp: podeTerDrp,
    dadosRelatorio: dadosRelatorio,
    variacao: variacao,
    destaques: destaques,
    indicadoresParaIA: indicadoresParaIA,
  };
}));
