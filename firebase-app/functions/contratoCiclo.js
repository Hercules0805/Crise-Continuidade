/**
 * Regra unica do ciclo de vida do contrato (prazos, renovacao, alertas).
 *
 * ESTE ARQUIVO EXISTE EM DOIS LUGARES, COM CONTEUDO IDENTICO:
 *   public/contrato-ciclo.js     -> tela (window.ContratoCiclo)
 *   functions/contratoCiclo.js   -> varredura diaria (require)
 * O deploy do hosting nao leva functions/ e o das functions nao leva public/,
 * entao nao da para um importar o outro. O teste tests/contrato-ciclo.test.js
 * falha se as duas copias divergirem — altere uma, copie para a outra.
 *
 * DECISOES 15/10/2026 (Hercules):
 *   - Rateio entre areas e so Sim/Nao (sem percentual).
 *   - Alertas aparecem no painel e sao gravados pela varredura diaria. Desde
 *     16/10/2026 tambem saem por e-mail (functions/notificacoes.js), usando
 *     estas mesmas regras.
 *   - Status do contrato e lista configuravel; o que diz se ele conta como
 *     vigente e a SITUACAO do status (pre | vigente | expirada | encerrado), nao
 *     o nome. 'expirada' (16/10/2026) = a vigencia acabou sem renovacao: nao e
 *     vigente (nao conta no custo, nao gera alerta nem renova sozinha), mas
 *     tambem nao foi encerrado formalmente.
 *
 * DATAS: tudo em ISO 'YYYY-MM-DD', contas em UTC para nao andar um dia com o
 * fuso. dataFim e o ULTIMO dia de vigencia (inclusivo).
 *
 * PRAZO DE AVISO: so importa quando o contrato renova sozinho. Se ninguem
 * avisar ate dataFim - avisoCancelamentoDias, ele renova. Contrato que pode
 * ser cancelado a qualquer momento nao tem essa armadilha, entao nao alerta.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContratoCiclo = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITUACAO = { PRE: 'pre', VIGENTE: 'vigente', EXPIRADA: 'expirada', ENCERRADO: 'encerrado' };
  var SITUACOES = [SITUACAO.PRE, SITUACAO.VIGENTE, SITUACAO.EXPIRADA, SITUACAO.ENCERRADO];

  /** Faixas de "vence em" (dias). */
  var FAIXAS_VENCIMENTO = [30, 60, 90];
  /** Quantos dias antes da data-limite do aviso a janela de decisao abre. */
  var JANELA_AVISO_DIAS = 30;
  /** Diferenca tolerada entre valor global e mensal x vigencia. */
  var TOLERANCIA_VALORES = 0.10;
  /** Teto de ciclos de renovacao automatica aplicados de uma vez. */
  var MAX_CICLOS = 50;

  var ALERTA = {
    VENCIDO: 'vencido',
    VENCE_EM: 'vence_em',
    JANELA_CANCELAMENTO: 'janela_cancelamento',
    AVISO_PERDIDO: 'aviso_perdido',
    REAJUSTE_PROXIMO: 'reajuste_proximo',
    SEM_GESTOR: 'sem_gestor',
    VALORES_DIVERGENTES: 'valores_divergentes',
  };

  /**
   * Valores iniciais das listas configuraveis (usados pelo seed e pelo botao
   * "Cadastrar valores padrão" das telas de lista). Depois de cadastrados, o
   * que vale e o que esta no banco -- estes sao so o ponto de partida.
   */
  var PADROES = {
    tipos: [
      'Prestação de serviços', 'Licenciamento de software', 'Assinatura de software (SaaS)',
      'Manutenção e suporte técnico', 'Fornecimento de equipamentos', 'Telecomunicações e conectividade',
      'Backup e recuperação', 'Serviços de cibersegurança', 'Serviços de data center',
    ].map(function (nome) { return { nome: nome }; }),
    indexadores: [
      'IPCA', 'IGP-M', 'INPC', 'IGP-DI', 'IPC-Fipe', 'INCC', 'IST (Telecomunicações)',
      'Selic', 'CDI', 'Dólar (PTAX)', 'Sem reajuste',
    ].map(function (nome) { return { nome: nome }; }),
    status: [
      { nome: 'Em elaboração', situacao: SITUACAO.PRE },
      { nome: 'Em negociação', situacao: SITUACAO.PRE },
      { nome: 'Vigente', situacao: SITUACAO.VIGENTE },
      { nome: 'Em renovação', situacao: SITUACAO.VIGENTE },
      { nome: 'Suspenso', situacao: SITUACAO.VIGENTE },
      { nome: 'Vigência expirada', situacao: SITUACAO.EXPIRADA },
      { nome: 'Encerrado', situacao: SITUACAO.ENCERRADO },
      { nome: 'Cancelado', situacao: SITUACAO.ENCERRADO },
    ],
  };

  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
    'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  function _parse(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function _iso(d) {
    return d ? d.toISOString().slice(0, 10) : '';
  }

  function hojeIso(agora) {
    var d = agora ? new Date(agora) : new Date();
    // Data local (o usuario e a varredura estao em America/Sao_Paulo).
    var y = d.getFullYear(), mo = d.getMonth() + 1, da = d.getDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  function somarDias(iso, n) {
    var d = _parse(iso);
    if (!d) return '';
    d.setUTCDate(d.getUTCDate() + n);
    return _iso(d);
  }

  /** Soma meses; dia que nao existe no mes de destino cai no ultimo dia. */
  function somarMeses(iso, n) {
    var d = _parse(iso);
    if (!d) return '';
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + n, dia = d.getUTCDate();
    var ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return _iso(new Date(Date.UTC(y, m, Math.min(dia, ultimo))));
  }

  /** Dias de `de` ate `ate` (negativo se `ate` ja passou). */
  function diasEntre(de, ate) {
    var a = _parse(de), b = _parse(ate);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /** Inicio do periodo vigente: a ultima renovacao, ou o inicio do contrato. */
  function inicioDoPeriodo(c) {
    return (c && (c.dataUltimaRenovacao || c.dataInicio)) || '';
  }

  /** Meses cheios entre inicio e fim (fim inclusivo). 01/01 a 31/12 = 12. */
  function vigenciaEmMeses(inicio, fim) {
    var a = _parse(inicio), b = _parse(somarDias(fim, 1));
    if (!a || !b || b <= a) return null;
    var meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) {
      // Inicio em dia que nao existe no mes do fim (ex.: 31/01 -> 28/02) ainda e mes cheio.
      var ultimoDoMes = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
      if (b.getUTCDate() !== ultimoDoMes) meses -= 1;
    }
    return meses > 0 ? meses : null;
  }

  /** Ultimo dia de vigencia para um periodo que comeca em `inicio` e dura `meses`. */
  function fimPelaVigencia(inicio, meses) {
    var n = Number(meses);
    if (!inicio || !(n > 0)) return '';
    return somarDias(somarMeses(inicio, n), -1);
  }

  /** Data-limite para avisar o cancelamento sem cair na renovacao. */
  function dataLimiteAviso(c) {
    if (!c || !c.dataFim) return '';
    var dias = Number(c.avisoCancelamentoDias) || 0;
    return somarDias(c.dataFim, -dias);
  }

  /** Situacao (pre|vigente|encerrado) do status do contrato, pela lista configuravel. */
  function situacaoDoStatus(statusId, listaStatus) {
    var s = (listaStatus || []).find(function (x) { return x && x.id === statusId; });
    return s && SITUACOES.indexOf(s.situacao) >= 0 ? s.situacao : '';
  }

  function _vigenciaDoContrato(c) {
    var v = Number(c.vigenciaMeses);
    if (v > 0) return v;
    return vigenciaEmMeses(inicioDoPeriodo(c), c.dataFim);
  }

  /**
   * Alertas do contrato em `hoje`. So contratos com status de situacao
   * 'vigente' alertam: contrato em negociacao ou encerrado nao vence.
   * Cada alerta: { codigo, nivel: 'perigo'|'aviso'|'info', rotulo, dias? }.
   */
  function calcularAlertas(c, opts) {
    opts = opts || {};
    var hoje = opts.hoje || hojeIso();
    if (!c || opts.situacao !== SITUACAO.VIGENTE) return [];
    var alertas = [];

    var dFim = c.dataFim ? diasEntre(hoje, c.dataFim) : null;
    if (dFim !== null && dFim < 0) {
      alertas.push({
        codigo: ALERTA.VENCIDO, nivel: 'perigo', dias: dFim,
        rotulo: c.renovacaoAutomatica ? 'Vencido — renovação automática pendente' : 'Vencido há ' + (-dFim) + ' dia(s)',
      });
    } else if (dFim !== null) {
      for (var i = 0; i < FAIXAS_VENCIMENTO.length; i++) {
        if (dFim <= FAIXAS_VENCIMENTO[i]) {
          alertas.push({
            codigo: ALERTA.VENCE_EM, nivel: i === 0 ? 'perigo' : (i === 1 ? 'aviso' : 'info'),
            dias: dFim, faixa: FAIXAS_VENCIMENTO[i],
            rotulo: dFim === 0 ? 'Vence hoje' : 'Vence em ' + dFim + ' dia(s)',
          });
          break;
        }
      }
    }

    if (dFim !== null && dFim >= 0 && c.renovacaoAutomatica && !c.cancelamentoQualquerMomento &&
        Number(c.avisoCancelamentoDias) > 0) {
      var dAviso = diasEntre(hoje, dataLimiteAviso(c));
      if (dAviso < 0) {
        alertas.push({
          codigo: ALERTA.AVISO_PERDIDO, nivel: 'aviso', dias: dAviso,
          rotulo: 'Prazo de aviso encerrado — vai renovar',
        });
      } else if (dAviso <= JANELA_AVISO_DIAS) {
        alertas.push({
          codigo: ALERTA.JANELA_CANCELAMENTO, nivel: dAviso <= 7 ? 'perigo' : 'aviso', dias: dAviso,
          rotulo: dAviso === 0 ? 'Último dia para avisar cancelamento' : 'Avisar cancelamento em até ' + dAviso + ' dia(s)',
        });
      }
    }

    var mes = Number(c.mesReajuste);
    if (mes >= 1 && mes <= 12) {
      var mesAtual = Number(hoje.slice(5, 7));
      var proximo = mesAtual === 12 ? 1 : mesAtual + 1;
      if (mes === mesAtual || mes === proximo) {
        alertas.push({
          codigo: ALERTA.REAJUSTE_PROXIMO, nivel: 'info',
          rotulo: (mes === mesAtual ? 'Reajuste neste mês' : 'Reajuste em ' + MESES[mes - 1]),
        });
      }
    }

    if (!c.gestor || !String(c.gestor.nome || '').trim()) {
      alertas.push({ codigo: ALERTA.SEM_GESTOR, nivel: 'aviso', rotulo: 'Sem gestor do contrato' });
    }

    if (valoresDivergentes(c)) {
      alertas.push({ codigo: ALERTA.VALORES_DIVERGENTES, nivel: 'info', rotulo: 'Valor global ≠ mensal × vigência' });
    }

    return alertas;
  }

  /** Valor global difere de mensal x vigencia em mais que a tolerancia. */
  function valoresDivergentes(c) {
    var g = Number(c && c.valorGlobal), m = Number(c && c.valorMensal);
    var v = c ? _vigenciaDoContrato(c) : null;
    if (!(g > 0) || !(m > 0) || !(v > 0)) return false;
    return Math.abs(g - m * v) / g > TOLERANCIA_VALORES;
  }

  /** Proximo periodo apos o fim atual: { dataUltimaRenovacao, dataFim } ou null. */
  function proximaRenovacao(c) {
    if (!c || !c.dataFim) return null;
    var v = _vigenciaDoContrato(c);
    if (!(v > 0)) return null;
    var inicio = somarDias(c.dataFim, 1);
    return { dataUltimaRenovacao: inicio, dataFim: fimPelaVigencia(inicio, v) };
  }

  /**
   * Renovacao automatica que a varredura deve aplicar em `hoje`.
   * Devolve { dataUltimaRenovacao, dataFim, ciclos } ou null se nada a fazer.
   * Aplica quantos ciclos forem precisos ate o fim alcancar hoje (contrato
   * cadastrado com fim antigo), com teto de MAX_CICLOS.
   */
  function renovacaoAutomaticaDevida(c, opts) {
    opts = opts || {};
    var hoje = opts.hoje || hojeIso();
    if (!c || opts.situacao !== SITUACAO.VIGENTE || !c.renovacaoAutomatica || !c.dataFim) return null;
    if (diasEntre(hoje, c.dataFim) >= 0) return null;
    var atual = { dataFim: c.dataFim, dataUltimaRenovacao: c.dataUltimaRenovacao, dataInicio: c.dataInicio,
      vigenciaMeses: _vigenciaDoContrato(c) };
    var ciclos = 0;
    while (diasEntre(hoje, atual.dataFim) < 0 && ciclos < MAX_CICLOS) {
      var p = proximaRenovacao(atual);
      if (!p) return null;
      atual.dataUltimaRenovacao = p.dataUltimaRenovacao;
      atual.dataFim = p.dataFim;
      ciclos++;
    }
    return { dataUltimaRenovacao: atual.dataUltimaRenovacao, dataFim: atual.dataFim, ciclos: ciclos };
  }

  /** Compara duas listas de alertas pelo que a tela mostra (codigo + rotulo). */
  function alertasIguais(a, b) {
    var chave = function (l) {
      return (l || []).map(function (x) { return x.codigo + '|' + x.rotulo; }).sort().join(';');
    };
    return chave(a) === chave(b);
  }

  // ============================================================
  // SLA DO CONTRATO (15/10/2026)
  // ------------------------------------------------------------
  // Todo tempo de SLA e gravado em MINUTOS (a tela mostra numero + unidade).
  // O RTO/RPO EXIGIDO vem de outro lugar e em texto: as opcoes fixas do BIA
  // ('< 4 horas', '4h a 8h'...) e o texto livre da dependencia ('4 horas').
  // horasDoRto le os dois e devolve o LIMITE SUPERIOR em horas -- '4h a 8h'
  // vale 8: e o maximo que o negocio tolera. O que nao da para ler vira null,
  // e null nunca alerta: melhor nao comparar do que acusar incompatibilidade
  // inventada.
  // ============================================================

  var SEVERIDADES_SLA = ['Crítica', 'Alta', 'Média', 'Baixa'];
  var COBERTURAS_SLA = ['24x7', '24x5', '12x5', '8x5', 'Outro'];
  var PERIODOS_DISPONIBILIDADE = ['mensal', 'trimestral', 'anual'];
  var MINUTOS_NO_PERIODO = { mensal: 30 * 24 * 60, trimestral: 91 * 24 * 60, anual: 365 * 24 * 60 };

  function _minutos(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  function _texto(v) {
    return String(v === null || v === undefined ? '' : v).trim();
  }

  /** SLA no formato canonico: sempre o objeto inteiro, campo vazio = null/''. */
  function normalizarSla(sla) {
    var s = sla && typeof sla === 'object' ? sla : {};
    var atend = Array.isArray(s.atendimento) ? s.atendimento : [];
    var pct = s.disponibilidadePct === '' || s.disponibilidadePct === null || s.disponibilidadePct === undefined
      ? null : Number(s.disponibilidadePct);
    return {
      cobertura: COBERTURAS_SLA.indexOf(s.cobertura) >= 0 ? s.cobertura : '',
      coberturaDetalhe: _texto(s.coberturaDetalhe),
      atendimento: SEVERIDADES_SLA.map(function (sev) {
        var linha = atend.find(function (a) { return a && a.severidade === sev; }) || {};
        return { severidade: sev, respostaMin: _minutos(linha.respostaMin) };
      }),
      disponibilidadePct: pct !== null && isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct * 1000) / 1000 : null,
      disponibilidadePeriodo: PERIODOS_DISPONIBILIDADE.indexOf(s.disponibilidadePeriodo) >= 0 ? s.disponibilidadePeriodo : 'mensal',
      rtoMin: _minutos(s.rtoMin),
      rpoMin: _minutos(s.rpoMin),
      janelaManutencao: _texto(s.janelaManutencao),
      penalidade: _texto(s.penalidade),
    };
  }

  /** Algum campo de SLA preenchido? (contrato sem SLA nao entra no DRP como "SLA vazio"). */
  function temSla(sla) {
    var s = normalizarSla(sla);
    return !!(s.cobertura || s.disponibilidadePct !== null || s.rtoMin !== null || s.rpoMin !== null ||
      s.janelaManutencao || s.penalidade ||
      s.atendimento.some(function (a) { return a.respostaMin !== null; }));
  }

  /** 30 -> '30 min', 240 -> '4 h', 90 -> '1 h 30 min', 2880 -> '2 dias'. Vazio -> ''. */
  function formatarDuracao(min) {
    if (min === null || min === undefined || min === '' || !isFinite(Number(min))) return '';
    var m = Math.round(Number(min));
    if (m < 60) return m + ' min';
    if (m % 1440 === 0) return (m / 1440) + (m === 1440 ? ' dia' : ' dias');
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  /** Minutos de parada que a disponibilidade contratada permite no periodo (99,9% mensal ~ 43 min). */
  function indisponibilidadePermitida(pct, periodo) {
    var p = Number(pct);
    if (pct === null || pct === undefined || pct === '' || !isFinite(p) || p < 0 || p > 100) return null;
    var total = MINUTOS_NO_PERIODO[periodo] || MINUTOS_NO_PERIODO.mensal;
    return Math.round(total * (100 - p) / 100);
  }

  /**
   * RTO/RPO exigido (texto) -> limite superior em HORAS, ou null.
   * '< 1 hora' 1 | '< 4 horas' 4 | '4h a 8h' 8 | '8h a 24h' 24 | '0 (nenhuma perda)' 0
   * '> 24 horas' null (sem limite) | '4 horas' 4 | '30 min' 0.5 | '1 dia' 24 | ilegivel null.
   */
  function horasDoRto(texto) {
    var t = _texto(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!t) return null;
    if (/nenhuma perda/.test(t) || /^0(\s|$|\()/.test(t)) return 0;
    if (/^>/.test(t) || /^mais de/.test(t)) return null;
    var re = /(\d+(?:[.,]\d+)?)\s*(minutos?|min|horas?|hrs?|h|dias?|d)?/g;
    var achados = [], m;
    while ((m = re.exec(t)) !== null) achados.push(m);
    if (!achados.length) return null;
    var ult = achados[achados.length - 1];
    var n = Number(ult[1].replace(',', '.'));
    var unidade = ult[2] || (achados.length > 1 && achados[0][2]) || 'h';
    if (/^min/.test(unidade)) return n / 60;
    if (/^d/.test(unidade)) return n * 24;
    return n;
  }

  /**
   * O que o fornecedor garante (sla) contra o que o negocio exige (alvos).
   * alvos: [{ origem, tipo: 'dependencia'|'processo', rto, rpo }] (rto/rpo em texto).
   * Devolve um item por problema: { codigo, nivel, rotulo, origem, exigidoMin, garantidoMin }.
   */
  function compararSlaComRto(sla, alvos) {
    var s = normalizarSla(sla);
    var itens = [];
    (alvos || []).forEach(function (alvo) {
      if (!alvo) return;
      var origem = _texto(alvo.origem) || 'Não identificado';
      var rtoH = horasDoRto(alvo.rto);
      if (rtoH !== null) {
        var exigido = Math.round(rtoH * 60);
        if (s.rtoMin === null) {
          itens.push({ codigo: 'sla_sem_rto', nivel: 'aviso', origem: origem, exigidoMin: exigido, garantidoMin: null,
            rotulo: 'Fornecedor não garante RTO; ' + origem + ' exige ' + formatarDuracao(exigido) });
        } else if (s.rtoMin > exigido) {
          itens.push({ codigo: 'sla_rto_incompativel', nivel: 'perigo', origem: origem, exigidoMin: exigido, garantidoMin: s.rtoMin,
            rotulo: 'RTO garantido ' + formatarDuracao(s.rtoMin) + ' > exigido ' + formatarDuracao(exigido) + ' (' + origem + ')' });
        }
      }
      var rpoH = horasDoRto(alvo.rpo);
      if (rpoH !== null && s.rpoMin !== null) {
        var exigidoRpo = Math.round(rpoH * 60);
        if (s.rpoMin > exigidoRpo) {
          itens.push({ codigo: 'sla_rpo_incompativel', nivel: 'perigo', origem: origem, exigidoMin: exigidoRpo, garantidoMin: s.rpoMin,
            rotulo: 'RPO garantido ' + formatarDuracao(s.rpoMin) + ' > exigido ' + formatarDuracao(exigidoRpo) + ' (' + origem + ')' });
        }
      }
    });
    return itens;
  }

  /** Um chip por tipo de problema, com a contagem -- para a grade e o cabecalho. */
  function resumirComparacaoSla(itens) {
    var rotulos = {
      sla_rto_incompativel: 'SLA: RTO incompatível',
      sla_rpo_incompativel: 'SLA: RPO incompatível',
      sla_sem_rto: 'SLA sem RTO garantido',
    };
    var por = {};
    (itens || []).forEach(function (i) {
      if (!por[i.codigo]) por[i.codigo] = { codigo: i.codigo, nivel: i.nivel, n: 0, detalhes: [] };
      por[i.codigo].n++;
      por[i.codigo].detalhes.push(i.rotulo);
    });
    return Object.keys(por).map(function (k) {
      var x = por[k];
      return { codigo: x.codigo, nivel: x.nivel, rotulo: rotulos[x.codigo] + (x.n > 1 ? ' (' + x.n + ')' : ''), titulo: x.detalhes.join('\n') };
    });
  }

  return {
    SEVERIDADES_SLA: SEVERIDADES_SLA,
    COBERTURAS_SLA: COBERTURAS_SLA,
    PERIODOS_DISPONIBILIDADE: PERIODOS_DISPONIBILIDADE,
    normalizarSla: normalizarSla,
    temSla: temSla,
    formatarDuracao: formatarDuracao,
    indisponibilidadePermitida: indisponibilidadePermitida,
    horasDoRto: horasDoRto,
    compararSlaComRto: compararSlaComRto,
    resumirComparacaoSla: resumirComparacaoSla,
    SITUACAO: SITUACAO,
    SITUACOES: SITUACOES,
    ALERTA: ALERTA,
    MESES: MESES,
    PADROES: PADROES,
    FAIXAS_VENCIMENTO: FAIXAS_VENCIMENTO,
    JANELA_AVISO_DIAS: JANELA_AVISO_DIAS,
    TOLERANCIA_VALORES: TOLERANCIA_VALORES,
    MAX_CICLOS: MAX_CICLOS,
    hojeIso: hojeIso,
    somarDias: somarDias,
    somarMeses: somarMeses,
    diasEntre: diasEntre,
    inicioDoPeriodo: inicioDoPeriodo,
    vigenciaEmMeses: vigenciaEmMeses,
    fimPelaVigencia: fimPelaVigencia,
    dataLimiteAviso: dataLimiteAviso,
    situacaoDoStatus: situacaoDoStatus,
    calcularAlertas: calcularAlertas,
    valoresDivergentes: valoresDivergentes,
    proximaRenovacao: proximaRenovacao,
    renovacaoAutomaticaDevida: renovacaoAutomaticaDevida,
    alertasIguais: alertasIguais,
  };
}));
