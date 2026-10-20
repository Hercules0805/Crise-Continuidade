/**
 * Relatorio Executivo de Riscos (20/10/2026): toda a conta do documento, sem
 * DOM. A tela (app.js, _htmlRelatorioExecutivoRiscos) so desenha.
 *
 * Organizado pelas etapas do NIST SP 800-39 (Enquadrar/Avaliar/Responder/
 * Monitorar), com a escala 5x5 do SP 800-30 e o apetite do CSF 2.0 GV.RM-02:
 *   panorama()        -> quanto risco temos (carga, nivel, apetite, R$)
 *   mapaCalor()       -> onde ele esta na matriz, inerente x residual
 *   principais()      -> os que mais pesam (carga = score x peso do Tier)
 *   tratamento()      -> resposta: estrategia, plano 5W2H, aceites
 *   monitoramento()   -> reavaliacao vencida, KRI fora da meta, alertas
 *   serieMensalHistorico() -> fechamento de cada mes (historico_risco)
 *
 * Reaproveita as regras de risco-consolidado.js (nada de regra nova de nivel,
 * apetite, atraso ou reavaliacao aqui). Carregar DEPOIS dele. Tambem exporta
 * como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./risco-consolidado.js'));
  } else {
    root.RiscoRelatorio = factory(root.RiscoConsolidado);
  }
}(typeof self !== 'undefined' ? self : this, function (RC) {
  'use strict';

  var ESTRATEGIAS = ['Mitigar', 'Transferir', 'Evitar', 'Aceitar'];
  var SEM_ESTRATEGIA = 'Não definida';
  var STATUS = ['Identificado', 'Em Avaliação', 'Em Tratamento', 'Em Monitoramento', 'Aceito', 'Encerrado'];

  function _hoje(h) {
    var t = String(h || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
  }

  function _dias(de, ate) {
    return Math.round((Date.parse(String(ate).slice(0, 10) + 'T00:00:00Z') - Date.parse(String(de).slice(0, 10) + 'T00:00:00Z')) / 86400000);
  }

  function _numero(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function ativos(riscos) {
    return (riscos || []).filter(RC.contaNoConsolidado);
  }

  function _contar(lista, chave, ordem, rotuloVazio) {
    var c = {};
    (ordem || []).forEach(function (k) { c[k] = 0; });
    lista.forEach(function (r) {
      var k = chave(r) || rotuloVazio;
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }

  // ------------------------------------------------- panorama

  /**
   * Quanto risco a empresa carrega hoje. `critForn` = criticidade por
   * fornecedor (mesmo mapa da tela de Riscos). Encerrados ficam fora de tudo,
   * menos da contagem por status.
   */
  function panorama(riscos, processos, critForn, apetite) {
    var todos = riscos || [];
    var at = ativos(todos);
    var cons = RC.consolidar(todos, processos, critForn);
    var comR$ = at.filter(function (r) { return _numero(r.impactoFinanceiro) !== null; });
    return {
      ativos: at.length,
      encerrados: todos.length - at.length,
      carga: cons.empresa.carga,
      composicao: cons.empresa.composicao,
      semAvaliacao: cons.empresa.semAvaliacao,
      piorScore: cons.empresa.piorScore,
      piorNivel: cons.empresa.piorFaixa ? cons.empresa.piorFaixa.rotulo : null,
      impactoFinanceiro: comR$.reduce(function (s, r) { return s + _numero(r.impactoFinanceiro); }, 0),
      semImpactoFinanceiro: at.length - comR$.length,
      apetite: RC.normalizarNivel(apetite) || RC.APETITE_PADRAO,
      acimaDoApetite: at.filter(function (r) { return RC.acimaDoApetite(r, apetite); }).length,
      porStatus: _contar(todos, function (r) { return r.status || 'Identificado'; }, STATUS),
      porOrigem: _contar(at, function (r) { return r.origem || 'Manual'; }, []),
      areas: cons.areas,
    };
  }

  // ------------------------------------------------- mapa de calor

  /**
   * Contagem de riscos ativos por celula P x I. `contagem[p][i]`, com p e i
   * nos indices de RC.PROBABILIDADES / RC.IMPACTOS (0 = Muito baixa/o).
   * 'residual' usa probabilidadeResidual/impactoResidual; quem nao tem a
   * avaliacao fica em `semAvaliacao` (nunca vira "risco baixo").
   */
  function mapaCalor(riscos, tipo) {
    var residual = tipo === 'residual';
    var contagem = [0, 1, 2, 3, 4].map(function () { return [0, 0, 0, 0, 0]; });
    var avaliados = 0, semAvaliacao = 0;
    ativos(riscos).forEach(function (r) {
      var p = RC.PROBABILIDADES.indexOf(RC.normalizarProbabilidade(residual ? r.probabilidadeResidual : r.probabilidade));
      var i = RC.IMPACTOS.indexOf(RC.normalizarImpacto(residual ? r.impactoResidual : r.impacto));
      if (p === -1 || i === -1) { semAvaliacao++; return; }
      contagem[p][i]++;
      avaliados++;
    });
    return { tipo: residual ? 'residual' : 'inerente', contagem: contagem, avaliados: avaliados, semAvaliacao: semAvaliacao };
  }

  // ------------------------------------------------- principais

  /** Os `n` riscos ativos de maior carga (score x peso do Tier/fornecedor). Sem avaliacao ficam de fora. */
  function principais(riscos, processos, critForn, apetite, n) {
    var porId = RC.indexarProcessos(processos);
    return ativos(riscos).map(function (r) {
      return {
        r: r,
        carga: RC.cargaDoRisco(r, porId, critForn),
        score: RC.scoreDoRisco(r),
        nivel: RC.nivelDoRisco(r),
        nivelResidual: RC.nivelResidual(r),
        acimaDoApetite: RC.acimaDoApetite(r, apetite),
      };
    }).filter(function (x) { return x.carga !== null; })
      .sort(function (a, b) { return (b.carga - a.carga) || (b.score - a.score) || String(a.r.titulo || '').localeCompare(String(b.r.titulo || ''), 'pt-BR'); })
      .slice(0, n || 10);
  }

  // ------------------------------------------------- resposta ao risco

  function _respostaDefinida(r) {
    var est = r.estrategiaTratamento;
    if (!est) return false;
    if (est === 'Mitigar') return Array.isArray(r.planoAcao) && r.planoAcao.length > 0;
    if (est === 'Aceitar') return String(r.justificativaAceite || '').trim() !== '';
    return String(r.estrategiaDescricao || '').trim() !== '';
  }

  /**
   * SP 800-39 "Responder": estrategias, andamento do plano de acao 5W2H
   * (Atrasado pela mesma regra da tela, RC.statusDaAcao), riscos acima do
   * apetite ainda sem resposta e os aceites (com o aprovador exigido quando o
   * risco passa do apetite).
   */
  function tratamento(riscos, apetite, hoje) {
    var h = _hoje(hoje);
    var at = ativos(riscos);
    var acoes = { total: 0, concluidas: 0, emAndamento: 0, pendentes: 0, atrasadas: 0 };
    var atrasadas = [];
    at.forEach(function (r) {
      (Array.isArray(r.planoAcao) ? r.planoAcao : []).forEach(function (a) {
        if (!a) return;
        acoes.total++;
        var st = RC.statusDaAcao(a, h);
        if (st === 'Concluído') acoes.concluidas++;
        else if (st === 'Atrasado') {
          acoes.atrasadas++;
          atrasadas.push({ r: r, acao: a, quando: String(a.quando).slice(0, 10), diasAtraso: _dias(a.quando, h) });
        } else if (st === 'Em andamento') acoes.emAndamento++;
        else acoes.pendentes++;
      });
    });
    atrasadas.sort(function (a, b) { return b.diasAtraso - a.diasAtraso; });
    var semResposta = at.filter(function (r) { return RC.acimaDoApetite(r, apetite) && !_respostaDefinida(r); });
    var aceites = at.filter(function (r) { return r.status === 'Aceito'; }).map(function (r) {
      var acima = RC.acimaDoApetite(r, apetite);
      var aprovador = String(r.aprovadorAceite || '').trim();
      return {
        r: r,
        nivel: RC.nivelDoRisco(r),
        acimaDoApetite: acima,
        aprovador: aprovador,
        justificativa: String(r.justificativaAceite || '').trim(),
        semAprovador: acima && !aprovador,
      };
    }).sort(function (a, b) { return (b.semAprovador - a.semAprovador) || (RC.ORDEM_NIVEL.indexOf(b.nivel) - RC.ORDEM_NIVEL.indexOf(a.nivel)); });
    return {
      porEstrategia: _contar(at, function (r) { return ESTRATEGIAS.indexOf(r.estrategiaTratamento) !== -1 ? r.estrategiaTratamento : ''; }, ESTRATEGIAS.concat(SEM_ESTRATEGIA), SEM_ESTRATEGIA),
      acoes: acoes,
      pctAcoesConcluidas: acoes.total ? Math.round((acoes.concluidas / acoes.total) * 100) : null,
      acoesAtrasadas: atrasadas,
      semResposta: semResposta,
      aceites: aceites,
      aceitesSemAprovador: aceites.filter(function (a) { return a.semAprovador; }).length,
    };
  }

  // ------------------------------------------------- monitoramento

  /**
   * SP 800-39 "Monitorar": reavaliacao vencida (RC.reavaliacaoVencida), sem
   * data de reavaliacao, KRI fora da meta (callback da tela, que conhece o
   * cadastro de indicadores) e alertas da automacao ainda nao revisados.
   */
  function monitoramento(riscos, hoje, kriForaDaMeta) {
    var h = _hoje(hoje);
    var at = ativos(riscos);
    var vencidas = at.filter(function (r) { return RC.reavaliacaoVencida(r, h); })
      .map(function (r) { return { r: r, data: String(r.proximaReavaliacao).slice(0, 10), diasAtraso: _dias(r.proximaReavaliacao, h) }; })
      .sort(function (a, b) { return b.diasAtraso - a.diasAtraso; });
    return {
      reavaliacaoVencida: vencidas,
      semReavaliacao: at.filter(function (r) { return !r.proximaReavaliacao; }).length,
      kriForaDaMeta: typeof kriForaDaMeta === 'function' ? at.filter(kriForaDaMeta) : [],
      alertas: at.filter(function (r) { return String(r.alertaAutomacao || '').trim() !== ''; }),
    };
  }

  // ------------------------------------------------- tendencia

  function mesesAte(hoje, n) {
    var h = _hoje(hoje);
    var ano = Number(h.slice(0, 4)), mes = Number(h.slice(5, 7));
    var out = [];
    for (var k = n - 1; k >= 0; k--) {
      var m = mes - k, a = ano;
      while (m <= 0) { m += 12; a--; }
      out.push(a + '-' + String(m).padStart(2, '0'));
    }
    return out;
  }

  /**
   * Um ponto por mes a partir dos retratos diarios (historico_risco): o
   * ULTIMO retrato do mes da a carga, o R$ e quantos riscos contavam; as
   * mudancas de todos os dias do mes somam os riscos novos e os que sairam
   * (encerrados ou excluidos). Mes sem retrato: valores null (nao zero --
   * ausencia de dado nao e risco zero).
   */
  function serieMensalHistorico(historico, meses, hoje) {
    var porMes = {};
    (historico || []).forEach(function (d) {
      if (!d || !d.dia) return;
      var m = String(d.dia).slice(0, 7);
      (porMes[m] = porMes[m] || []).push(d);
    });
    return mesesAte(hoje, meses || 12).map(function (mes) {
      var dias = (porMes[mes] || []).slice().sort(function (a, b) { return String(a.dia).localeCompare(String(b.dia)); });
      if (!dias.length) return { mes: mes, dia: null, carga: null, impactoFinanceiro: null, contados: null, novos: null, sairam: null };
      var ultimo = dias[dias.length - 1];
      var novos = 0, sairam = 0;
      dias.forEach(function (d) {
        (Array.isArray(d.mudancas) ? d.mudancas : []).forEach(function (m) {
          if (m.tipo === 'novo') novos++;
          else if (m.tipo === 'encerrado' || m.tipo === 'excluido') sairam++;
        });
      });
      var emp = ultimo.empresa || {};
      return {
        mes: mes,
        dia: ultimo.dia,
        carga: _numero(emp.carga),
        impactoFinanceiro: _numero(emp.impactoFinanceiro),
        contados: _numero(emp.contados),
        novos: novos,
        sairam: sairam,
      };
    });
  }

  // ------------------------------------------------- textos e IA

  var _MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function rotuloMes(mes) {
    return _MESES[Number(mes.slice(5, 7)) - 1] + '/' + mes.slice(2, 4);
  }

  function _plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }

  /**
   * Frases montadas dos numeros (sem IA), sempre no topo do relatorio. `d` =
   * { panorama, tratamento, monitoramento, serie }.
   */
  function destaques(d) {
    var p = d.panorama, t = d.tratamento, m = d.monitoramento;
    var out = [];
    var altos = (p.composicao['Muito alto'] || 0) + (p.composicao['Alto'] || 0);
    out.push(_plural(p.ativos, 'risco ativo', 'riscos ativos') + ', carga de ' + p.carga + ' pontos; ' + _plural(altos, 'é de nível Alto ou Muito alto', 'são de nível Alto ou Muito alto') + '.');
    out.push(p.acimaDoApetite
      ? _plural(p.acimaDoApetite, 'risco acima', 'riscos acima') + ' do apetite (até ' + p.apetite + ')' + (t.semResposta.length ? ', ' + t.semResposta.length + ' sem resposta definida.' : ', todos com resposta definida.')
      : 'Nenhum risco acima do apetite (até ' + p.apetite + ').');
    var serie = (d.serie || []).filter(function (x) { return x.carga !== null; });
    if (serie.length >= 2) {
      var a = serie[serie.length - 2], b = serie[serie.length - 1];
      var dif = b.carga - a.carga;
      out.push('Carga ' + (dif > 0 ? 'subiu ' + dif : dif < 0 ? 'caiu ' + (-dif) : 'estável') + (dif ? ' pontos' : '') + ' de ' + rotuloMes(a.mes) + ' para ' + rotuloMes(b.mes) + '.');
    }
    if (t.acoes.total) out.push(t.acoes.concluidas + ' de ' + _plural(t.acoes.total, 'ação', 'ações') + ' do plano concluídas' + (t.acoes.atrasadas ? '; ' + _plural(t.acoes.atrasadas, 'atrasada', 'atrasadas') + '.' : '.'));
    if (t.aceites.length) out.push(_plural(t.aceites.length, 'risco aceito', 'riscos aceitos') + (t.aceitesSemAprovador ? ', ' + t.aceitesSemAprovador + ' acima do apetite sem aprovador registrado.' : '.'));
    if (m.reavaliacaoVencida.length) out.push(_plural(m.reavaliacaoVencida.length, 'reavaliação vencida', 'reavaliações vencidas') + '.');
    if (p.impactoFinanceiro) out.push('Impacto financeiro estimado: R$ ' + p.impactoFinanceiro.toLocaleString('pt-BR') + (p.semImpactoFinanceiro ? ' (' + p.semImpactoFinanceiro + ' sem estimativa).' : '.'));
    return out;
  }

  /**
   * O que vai para a IA: so numeros agregados e os 10 principais (titulo,
   * area, nivel) -- nunca o documento do risco inteiro.
   */
  function indicadoresParaIA(d) {
    var p = d.panorama, t = d.tratamento, m = d.monitoramento;
    return {
      riscosAtivos: p.ativos,
      cargaEmpresa: p.carga,
      composicaoPorNivel: p.composicao,
      semAvaliacao: p.semAvaliacao,
      apetite: p.apetite,
      acimaDoApetite: p.acimaDoApetite,
      acimaDoApetiteSemResposta: t.semResposta.length,
      impactoFinanceiroEstimado: p.impactoFinanceiro,
      riscosSemEstimativaFinanceira: p.semImpactoFinanceiro,
      porStatus: p.porStatus,
      porOrigem: p.porOrigem,
      porEstrategia: t.porEstrategia,
      planoDeAcao: t.acoes,
      aceites: t.aceites.length,
      aceitesAcimaDoApetiteSemAprovador: t.aceitesSemAprovador,
      reavaliacoesVencidas: m.reavaliacaoVencida.length,
      riscosSemDataDeReavaliacao: m.semReavaliacao,
      riscosComKriForaDaMeta: m.kriForaDaMeta.length,
      alertasDeAutomacaoPendentes: m.alertas.length,
      cargaPorArea: p.areas.slice(0, 8).map(function (a) { return { area: a.area, carga: a.carga, riscos: a.contados }; }),
      principais: (d.principais || []).map(function (x) {
        return { titulo: x.r.titulo || '', area: RC.areaDoRisco(x.r), nivel: x.nivel, nivelResidual: x.nivelResidual, carga: x.carga, estrategia: x.r.estrategiaTratamento || '', status: x.r.status || '' };
      }),
      tendenciaMensal: (d.serie || []).filter(function (x) { return x.carga !== null; }).map(function (x) { return { mes: x.mes, carga: x.carga, novos: x.novos, sairam: x.sairam }; }),
    };
  }

  return {
    ESTRATEGIAS: ESTRATEGIAS,
    SEM_ESTRATEGIA: SEM_ESTRATEGIA,
    STATUS: STATUS,
    ativos: ativos,
    panorama: panorama,
    mapaCalor: mapaCalor,
    principais: principais,
    tratamento: tratamento,
    monitoramento: monitoramento,
    mesesAte: mesesAte,
    serieMensalHistorico: serieMensalHistorico,
    rotuloMes: rotuloMes,
    destaques: destaques,
    indicadoresParaIA: indicadoresParaIA,
  };
}));
