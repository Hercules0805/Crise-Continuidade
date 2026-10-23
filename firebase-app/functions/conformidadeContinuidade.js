/**
 * Conformidade de Continuidade (23/10/2026): o ciclo de revisao de BIA, PCN e
 * DRP e a lista de pendencias que o Operador de Processos acompanha. Sem DOM.
 *
 * O que conta como "adequado":
 *   - BIA: todo processo tem BIA, revisado dentro do ciclo (biaMeses).
 *   - PCN: todo processo Tier 1/2 tem PCN, revisado dentro do ciclo (pcnMeses).
 *   - DRP: toda dependencia tecnica na cadeia de um processo Tier 1/2 tem DRP,
 *     revisado dentro do ciclo (drpMeses), e testado na frequencia declarada
 *     nas estrategias de teste.
 *   - Status manual (biaHomologada/bcpStatus/drpStatus) nao diz "Realizado"
 *     quando o plano nao existe.
 *
 * "Ultima revisao" de cada plano:
 *   - BIA: a resposta de BIA mais recente (biaUltimaEm) ou a revisao manual
 *     registrada (biaRevisao.ultimaEm) -- a mais nova das duas.
 *   - PCN: pcnRevisao.ultimaEm (carimbado ao salvar versao e ao registrar
 *     revisao); sem ele, a data da ultima versao em pcnSalvo.
 *   - DRP: drpRevisao.ultimaEm; sem ele, a data da ultima versao em drpSalvo.
 *
 * Calculado na leitura, nunca gravado. Quem chama injeta tierDe(processo) e
 * cadeiaDoProcesso(processo) (Criticidade e CadeiaDependencias no cliente; o
 * equivalente do servidor nas Functions).
 *
 * functions/conformidadeContinuidade.js e uma copia IDENTICA deste arquivo (o
 * teste tests/conformidade-continuidade.test.js confere): o deploy de
 * Functions nao empacota public/ (ver functions/historicoRisco.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConformidadeContinuidade = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CICLOS_PADRAO = { biaMeses: 12, pcnMeses: 12, drpMeses: 12, avisoDias: 30 };

  var STATUS = { VIGENTE: 'vigente', VENCENDO: 'vencendo', VENCIDO: 'vencido', SEM_REGISTRO: 'sem-registro' };
  var ROTULO_STATUS = { vigente: 'Vigente', vencendo: 'Vencendo', vencido: 'Vencido', 'sem-registro': 'Sem registro' };

  var TIPO = { BIA: 'bia', PCN: 'pcn', DRP: 'drp', TESTE_DRP: 'teste-drp', DIVERGENCIA: 'divergencia' };
  var ROTULO_TIPO = { bia: 'BIA', pcn: 'PCN', drp: 'DRP', 'teste-drp': 'Teste de DRP', divergencia: 'Status divergente' };

  // Situacao da pendencia (o que a tabela filtra).
  var SITUACAO = { FALTANDO: 'faltando', VENCIDO: 'vencido', VENCENDO: 'vencendo', ATRASADO: 'atrasado', DIVERGENTE: 'divergente' };
  var ROTULO_SITUACAO = { faltando: 'Faltando', vencido: 'Vencido', vencendo: 'Vencendo', atrasado: 'Teste atrasado', divergente: 'Divergente' };
  var ORDEM_SITUACAO = { vencido: 0, faltando: 1, atrasado: 2, divergente: 3, vencendo: 4 };

  function _texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function _norm(t) {
    return _texto(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** 'YYYY-MM-DD' de uma data ISO (ou ''), sem fuso. */
  function _dia(v) {
    var t = _texto(v);
    return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
  }

  function _inteiroPositivo(v, padrao) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? Math.round(n) : padrao;
  }

  /** Periodicidades validas (valor ausente/invalido cai no padrao). */
  function normalizarCiclos(cfg) {
    var c = cfg || {};
    return {
      biaMeses: _inteiroPositivo(c.biaMeses, CICLOS_PADRAO.biaMeses),
      pcnMeses: _inteiroPositivo(c.pcnMeses, CICLOS_PADRAO.pcnMeses),
      drpMeses: _inteiroPositivo(c.drpMeses, CICLOS_PADRAO.drpMeses),
      avisoDias: c.avisoDias === 0 ? 0 : _inteiroPositivo(c.avisoDias, CICLOS_PADRAO.avisoDias),
    };
  }

  function _somarDias(dia, dias) {
    var d = new Date(dia + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  /** Soma meses sem estourar o fim do mes (31/01 + 1 mes = 28 ou 29/02). */
  function _somarMeses(dia, meses) {
    var a = Number(dia.slice(0, 4)), m = Number(dia.slice(5, 7)) - 1, d = Number(dia.slice(8, 10));
    var alvo = new Date(Date.UTC(a, m + meses, 1));
    var ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    alvo.setUTCDate(Math.min(d, ultimoDia));
    return alvo.toISOString().slice(0, 10);
  }

  function _diasEntre(de, ate) {
    return Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000);
  }

  /** Data da proxima revisao ('YYYY-MM-DD'), ou null sem ultima revisao. */
  function proximaRevisao(ultimaISO, meses) {
    var dia = _dia(ultimaISO);
    return dia ? _somarMeses(dia, meses) : null;
  }

  /**
   * Situacao do ciclo: { status, ultima, proxima, dias } -- dias ate a proxima
   * revisao (negativo = atrasado). Vencendo = faltam avisoDias ou menos.
   */
  function statusCiclo(ultimaISO, meses, avisoDias, hojeISO) {
    var ultima = _dia(ultimaISO);
    if (!ultima) return { status: STATUS.SEM_REGISTRO, ultima: '', proxima: '', dias: null };
    var proxima = _somarMeses(ultima, meses);
    var dias = _diasEntre(_dia(hojeISO), proxima);
    var status = dias < 0 ? STATUS.VENCIDO : (dias <= avisoDias ? STATUS.VENCENDO : STATUS.VIGENTE);
    return { status: status, ultima: ultima, proxima: proxima, dias: dias };
  }

  function _versoes(campo) {
    if (Array.isArray(campo)) return campo;
    var t = _texto(campo);
    if (!t) return [];
    try {
      var v = JSON.parse(t);
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function _maisRecente(datas) {
    return datas.map(_dia).filter(Boolean).sort().pop() || '';
  }

  function temPCN(p) {
    return _versoes(p && p.pcnSalvo).length > 0;
  }

  function temDRP(dep) {
    return _versoes(dep && dep.drpSalvo).length > 0;
  }

  function temBIA(p) {
    return !!(p && (p.avaliado || _dia(p.biaUltimaEm) || _dia(p.biaRevisao && p.biaRevisao.ultimaEm)));
  }

  function ultimaRevisaoBia(p) {
    return _maisRecente([p && p.biaUltimaEm, p && p.biaRevisao && p.biaRevisao.ultimaEm]);
  }

  function ultimaRevisaoPcn(p) {
    var rev = p && p.pcnRevisao && p.pcnRevisao.ultimaEm;
    var versoes = _versoes(p && p.pcnSalvo);
    var ultVersao = versoes.length ? versoes[versoes.length - 1].data : '';
    return _maisRecente([rev, ultVersao]);
  }

  function ultimaRevisaoDrp(dep) {
    var rev = dep && dep.drpRevisao && dep.drpRevisao.ultimaEm;
    var versoes = _versoes(dep && dep.drpSalvo);
    var ultVersao = versoes.length ? versoes[versoes.length - 1].data : '';
    return _maisRecente([rev, ultVersao]);
  }

  // Frequencia de teste em texto livre ("Semestral", "a cada 3 meses") -> dias.
  var DIAS_FREQUENCIA = [
    [/\bdiari/, 1], [/\bsemanal/, 7], [/\bquinzenal/, 15], [/\bmensal/, 30], [/\bbimestral/, 60],
    [/\btrimestral/, 90], [/\bquadrimestral/, 120], [/\bsemestral/, 182], [/\banual/, 365], [/\bbienal/, 730],
  ];
  var DIAS_UNIDADE = { dia: 1, dias: 1, semana: 7, semanas: 7, mes: 30, meses: 30, ano: 365, anos: 365 };

  /** Dias entre testes a partir do texto da frequencia, ou null quando nao da para entender. */
  function diasDaFrequencia(texto) {
    var t = _norm(texto);
    if (!t) return null;
    var m = t.match(/(\d+)\s*(dias?|semanas?|mes|meses|anos?)\b/);
    if (m) return Number(m[1]) * DIAS_UNIDADE[m[2]];
    for (var i = 0; i < DIAS_FREQUENCIA.length; i++) {
      if (DIAS_FREQUENCIA[i][0].test(t)) return DIAS_FREQUENCIA[i][1];
    }
    return null;
  }

  /**
   * Teste do DRP contra a frequencia declarada: { status, ultimo, proximo,
   * frequenciaDias }. Vale a MENOR frequencia entre as estrategias (o teste
   * mais frequente prometido). status: 'em-dia' | 'atrasado' | 'nunca-testado'
   * | 'sem-frequencia' (nenhuma estrategia com frequencia legivel).
   */
  function testeDrp(dep, hojeISO) {
    var d = dep || {};
    var freqs = (Array.isArray(d.drpEstrategiasTeste) ? d.drpEstrategiasTeste : [])
      .map(function (e) { return diasDaFrequencia(e && e.frequencia); })
      .filter(function (n) { return n !== null; });
    var legado = d.drpTestes && diasDaFrequencia(d.drpTestes.frequenciaEsperada);
    if (legado) freqs.push(legado);
    var datas = (Array.isArray(d.drpRegistrosTeste) ? d.drpRegistrosTeste : []).map(function (r) { return r && r.data; });
    if (d.drpTestes) datas.push(d.drpTestes.dataUltimoTeste);
    var ultimo = _maisRecente(datas);
    if (!freqs.length) return { status: 'sem-frequencia', ultimo: ultimo, proximo: '', frequenciaDias: null };
    var freq = Math.min.apply(null, freqs);
    if (!ultimo) return { status: 'nunca-testado', ultimo: '', proximo: '', frequenciaDias: freq };
    var proximo = _somarDias(ultimo, freq);
    return { status: proximo < _dia(hojeISO) ? 'atrasado' : 'em-dia', ultimo: ultimo, proximo: proximo, frequenciaDias: freq };
  }

  function ehTierCritico(tier) {
    return /^Tier [12]\b/.test(_texto(tier));
  }

  /**
   * Status manual que diz "Realizado" sem o plano existir. depsSemDrp: as
   * dependencias da cadeia do processo sem DRP. Devolve [{ campo, mensagem }].
   */
  function divergencias(p, depsSemDrp) {
    var out = [];
    if (!p) return out;
    if (p.biaHomologada === 'BIA Realizado' && !temBIA(p)) {
      out.push({ campo: 'biaHomologada', mensagem: 'Status "BIA Realizado", mas o processo não tem resposta de BIA' });
    }
    if (p.bcpStatus === 'BCP Realizado' && !temPCN(p)) {
      out.push({ campo: 'bcpStatus', mensagem: 'Status "BCP Realizado", mas não há PCN salvo' });
    }
    if (p.drpStatus === 'DRP Realizado' && depsSemDrp && depsSemDrp.length) {
      out.push({ campo: 'drpStatus', mensagem: 'Status "DRP Realizado", mas ' + depsSemDrp.length + ' dependência(s) da cadeia sem DRP' });
    }
    return out;
  }

  function _pct(parte, total) {
    return total ? Math.round((parte / total) * 100) : null;
  }

  function _emDia(st) {
    return st === STATUS.VIGENTE || st === STATUS.VENCENDO;
  }

  /**
   * Avalia o conjunto. dados: { processos, dependencias, ciclos, hoje,
   * tierDe(p), cadeiaDoProcesso(p) -> [{ id, dep, nome, categoria, ausente }],
   * somenteCadeia }. somenteCadeia: so cobra DRP de dependencia que esta na
   * cadeia de algum dos processos recebidos (recorte do Gestor por area).
   * Devolve { indicadores, pendencias, ciclos }. Pendencia: { tipo, situacao,
   * alvo ('processo'|'dependencia'), id, nome, area, tier, mensagem, desde,
   * proxima, processos ([nomes], so em dependencia) }.
   */
  function avaliar(dados) {
    var d = dados || {};
    var hoje = _dia(d.hoje) || new Date().toISOString().slice(0, 10);
    var ciclos = normalizarCiclos(d.ciclos);
    var tierDe = d.tierDe || function (p) { return _texto(p && p.tier); };
    var cadeiaDe = d.cadeiaDoProcesso || function () { return []; };
    var processos = Array.isArray(d.processos) ? d.processos : [];
    var depPorId = {};
    (d.dependencias || []).forEach(function (dep) { if (dep && dep.id !== undefined) depPorId[String(dep.id)] = dep; });

    var pendencias = [];
    var ind = {
      processos: processos.length, biaEmDia: 0,
      criticos: 0, pcnEmDia: 0,
      depsCriticas: 0, drpEmDia: 0,
      testesAtrasados: 0, divergencias: 0,
    };
    var criticas = {}; // depId -> { dep, processos: [nomes] }
    var naCadeia = {}; // depId -> true (cadeia de qualquer processo recebido)

    processos.forEach(function (p) {
      var tier = tierDe(p) || '';
      var base = { alvo: 'processo', id: String(p.id), nome: _texto(p.processo), area: _texto(p.area), tier: tier };
      var cadeia = (cadeiaDe(p) || []).filter(function (it) { return it && !it.ausente && it.id !== undefined; });
      var critico = ehTierCritico(tier);

      // BIA
      var bia = statusCiclo(ultimaRevisaoBia(p), ciclos.biaMeses, ciclos.avisoDias, hoje);
      if (_emDia(bia.status)) ind.biaEmDia++;
      if (!temBIA(p)) {
        pendencias.push(Object.assign({ tipo: TIPO.BIA, situacao: SITUACAO.FALTANDO, mensagem: 'Processo sem BIA', desde: '', proxima: '' }, base));
      } else if (bia.status === STATUS.VENCIDO || bia.status === STATUS.VENCENDO) {
        pendencias.push(Object.assign({ tipo: TIPO.BIA, situacao: bia.status, mensagem: 'Revisão do BIA ' + (bia.status === STATUS.VENCIDO ? 'vencida' : 'vence em ' + bia.dias + ' dia(s)'), desde: bia.ultima, proxima: bia.proxima }, base));
      }

      // PCN: obrigatorio no Tier 1/2; o ciclo vale para qualquer PCN existente.
      var pcn = statusCiclo(ultimaRevisaoPcn(p), ciclos.pcnMeses, ciclos.avisoDias, hoje);
      if (critico) {
        ind.criticos++;
        if (temPCN(p) && _emDia(pcn.status)) ind.pcnEmDia++;
      }
      if (critico && !temPCN(p)) {
        pendencias.push(Object.assign({ tipo: TIPO.PCN, situacao: SITUACAO.FALTANDO, mensagem: tier.replace(/ \(.*\)$/, '') + ' sem PCN', desde: '', proxima: '' }, base));
      } else if (temPCN(p) && (pcn.status === STATUS.VENCIDO || pcn.status === STATUS.VENCENDO)) {
        pendencias.push(Object.assign({ tipo: TIPO.PCN, situacao: pcn.status, mensagem: 'Revisão do PCN ' + (pcn.status === STATUS.VENCIDO ? 'vencida' : 'vence em ' + pcn.dias + ' dia(s)'), desde: pcn.ultima, proxima: pcn.proxima }, base));
      }

      // Dependencias criticas (cadeia de processo Tier 1/2).
      var semDrp = [];
      cadeia.forEach(function (it) {
        var dep = it.dep || depPorId[String(it.id)];
        if (!dep) return;
        naCadeia[String(dep.id)] = true;
        if (!temDRP(dep)) semDrp.push(dep);
        if (!critico) return;
        var k = String(dep.id);
        if (!criticas[k]) criticas[k] = { dep: dep, processos: [] };
        if (criticas[k].processos.indexOf(base.nome) === -1) criticas[k].processos.push(base.nome);
      });

      divergencias(p, semDrp).forEach(function (dv) {
        ind.divergencias++;
        pendencias.push(Object.assign({ tipo: TIPO.DIVERGENCIA, situacao: SITUACAO.DIVERGENTE, mensagem: dv.mensagem, campo: dv.campo, desde: '', proxima: '' }, base));
      });
    });

    // DRP: dependencias criticas sem DRP; ciclo e teste de qualquer DRP existente.
    var vistos = {};
    Object.keys(criticas).forEach(function (k) {
      ind.depsCriticas++;
      var dep = criticas[k].dep;
      var drp = statusCiclo(ultimaRevisaoDrp(dep), ciclos.drpMeses, ciclos.avisoDias, hoje);
      if (temDRP(dep) && _emDia(drp.status)) ind.drpEmDia++;
      if (!temDRP(dep)) {
        vistos[k] = true;
        pendencias.push({ tipo: TIPO.DRP, situacao: SITUACAO.FALTANDO, alvo: 'dependencia', id: k, nome: _texto(dep.nome), area: '', tier: '', mensagem: 'Dependência crítica sem DRP', desde: '', proxima: '', processos: criticas[k].processos.slice() });
      }
    });
    Object.keys(depPorId).forEach(function (k) {
      var dep = depPorId[k];
      if (vistos[k] || !temDRP(dep) || (d.somenteCadeia && !naCadeia[k])) return;
      var procs = criticas[k] ? criticas[k].processos.slice() : [];
      var base = { alvo: 'dependencia', id: k, nome: _texto(dep.nome), area: '', tier: '', processos: procs };
      var drp = statusCiclo(ultimaRevisaoDrp(dep), ciclos.drpMeses, ciclos.avisoDias, hoje);
      if (drp.status === STATUS.VENCIDO || drp.status === STATUS.VENCENDO) {
        pendencias.push(Object.assign({ tipo: TIPO.DRP, situacao: drp.status, mensagem: 'Revisão do DRP ' + (drp.status === STATUS.VENCIDO ? 'vencida' : 'vence em ' + drp.dias + ' dia(s)'), desde: drp.ultima, proxima: drp.proxima }, base));
      }
      var t = testeDrp(dep, hoje);
      if (t.status === 'atrasado' || t.status === 'nunca-testado') {
        ind.testesAtrasados++;
        pendencias.push(Object.assign({ tipo: TIPO.TESTE_DRP, situacao: SITUACAO.ATRASADO, mensagem: t.status === 'atrasado' ? 'Teste previsto para ' + t.proximo.split('-').reverse().join('/') : 'DRP nunca testado', desde: t.ultimo, proxima: t.proximo }, base));
      }
    });

    pendencias.sort(function (a, b) {
      return (ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao])
        || (ehTierCritico(b.tier) - ehTierCritico(a.tier))
        || a.nome.localeCompare(b.nome);
    });

    return {
      ciclos: ciclos,
      hoje: hoje,
      pendencias: pendencias,
      indicadores: {
        processos: ind.processos,
        biaEmDia: ind.biaEmDia,
        biaPct: _pct(ind.biaEmDia, ind.processos),
        criticos: ind.criticos,
        pcnEmDia: ind.pcnEmDia,
        pcnPct: _pct(ind.pcnEmDia, ind.criticos),
        depsCriticas: ind.depsCriticas,
        drpEmDia: ind.drpEmDia,
        drpPct: _pct(ind.drpEmDia, ind.depsCriticas),
        testesAtrasados: ind.testesAtrasados,
        divergencias: ind.divergencias,
      },
    };
  }

  /** Contagem de pendencias por situacao e por tipo (resumo do e-mail e dos filtros). */
  function contar(pendencias) {
    var porSituacao = {}, porTipo = {};
    (pendencias || []).forEach(function (p) {
      porSituacao[p.situacao] = (porSituacao[p.situacao] || 0) + 1;
      porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
    });
    return { total: (pendencias || []).length, porSituacao: porSituacao, porTipo: porTipo };
  }

  return {
    CICLOS_PADRAO: CICLOS_PADRAO,
    STATUS: STATUS,
    ROTULO_STATUS: ROTULO_STATUS,
    TIPO: TIPO,
    ROTULO_TIPO: ROTULO_TIPO,
    SITUACAO: SITUACAO,
    ROTULO_SITUACAO: ROTULO_SITUACAO,
    normalizarCiclos: normalizarCiclos,
    proximaRevisao: proximaRevisao,
    statusCiclo: statusCiclo,
    temPCN: temPCN,
    temDRP: temDRP,
    temBIA: temBIA,
    ultimaRevisaoBia: ultimaRevisaoBia,
    ultimaRevisaoPcn: ultimaRevisaoPcn,
    ultimaRevisaoDrp: ultimaRevisaoDrp,
    diasDaFrequencia: diasDaFrequencia,
    testeDrp: testeDrp,
    ehTierCritico: ehTierCritico,
    divergencias: divergencias,
    avaliar: avaliar,
    contar: contar,
  };
}));
