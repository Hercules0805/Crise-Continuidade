/**
 * Painel de Vulnerabilidades (visao executiva, 19/10/2026).
 *
 * Toda a conta do painel mora aqui, sem DOM: a tela (app.js,
 * vulnerabilidadesPainel) so desenha o que estas funcoes devolvem. Cada bloco
 * responde a uma pergunta da diretoria:
 *   1. exposicao atual          -> exposicao(), porProduto()
 *   2. melhorando ou piorando   -> serieMensal(), mttr()
 *   3. o que exige acao agora   -> acaoImediata()
 *   4. prazos estao sendo cumpridos -> cumprimentoPrazo(), atraso(), porEquipe()
 *   5. servicos e dados criticos -> processosExpostos(), exposicaoDados(), semVinculo()
 * Referencias NIST: CSF 2.0 ID.RA / GV.RM, SP 800-40 (metricas de correcao),
 * SP 800-55 (medidas).
 *
 * DECISOES:
 *   - Prazo e SO a Data Prevista de Correcao digitada (nao existe politica de
 *     SLA por severidade). Sem data = "sem prazo definido", contado a parte.
 *   - "Em aberto" = mesma regra de _vulnEmAberto em app.js: tudo que nao esta
 *     Corrigida nem Aceita. Aceita sai do backlog, mas aparece como risco assumido.
 *   - Serie mensal: o fechamento de um mes passado vem da foto gravada pelo
 *     servidor (painel_vulnerabilidades/{AAAA-MM}, functions/painelVulnerabilidades.js)
 *     quando existe; senao e reconstruido pelas datas (deteccao, correcao, aceite)
 *     com a severidade de HOJE -- o banco nao guarda a severidade de antes.
 *     O mes corrente e sempre o estado ao vivo, para bater com os cards.
 *
 * Carregar DEPOIS de vulnerabilidade-severidade.js e criticidade.js. Tambem
 * exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vulnerabilidade-severidade.js'), require('./criticidade.js'), require('./cadeia-dependencias.js'));
  } else {
    root.VulnerabilidadePainel = factory(root.VulnerabilidadeSeveridade, root.Criticidade, root.CadeiaDependencias);
  }
}(typeof self !== 'undefined' ? self : this, function (Sev, Criticidade, Cadeia) {
  'use strict';

  var SEVERIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
  var SEM_SEVERIDADE = 'Não informado';

  /**
   * Peso de cada severidade no Indice de Exposicao (um numero so, comparavel
   * mes a mes). Escala quase geometrica de proposito: 1 Critica pesa mais que
   * 4 Medias. Sem severidade informada pesa 0 (e contada a parte), para nao
   * inventar gravidade.
   */
  var PESO = { 'Crítica': 10, 'Alta': 5, 'Média': 2, 'Baixa': 1 };

  /** Mesma "nota" do servidor (vulnerabilidadeRisco._nota) para comparar com o limiar. */
  var NOTA_POR_SEVERIDADE = { 'Crítica': 9.5, 'Alta': 7.5, 'Média': 5, 'Baixa': 2 };

  var ORDEM_TIER = {};
  ORDEM_TIER[Criticidade.TIER.T1] = 3;
  ORDEM_TIER[Criticidade.TIER.T2] = 2;
  ORDEM_TIER[Criticidade.TIER.T3] = 1;
  ORDEM_TIER[Criticidade.TIER.PENDENTE] = 0;

  var MOTIVO = {
    CRITICA: 'Crítica',
    EXPLOIT: 'Alta com exploit',
    ATRASADA: 'Atrasada',
    TIER1: 'Processo Tier 1',
    SEM_RISCO: 'Acima do limiar sem risco',
  };

  var SUBTIPO_DADOS = 'LGPD/Privacidade';
  var IMPACTO_LEGAL_ALTO = ['Alto', 'Grave'];

  // ---------------------------------------------------------------- basico

  function _data(s) {
    var t = String(s || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
  }

  function hojeISO(hoje) {
    return _data(hoje) || new Date().toISOString().slice(0, 10);
  }

  function diasEntre(de, ate) {
    var a = _data(de), b = _data(ate);
    if (!a || !b) return null;
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  function _somarDias(dataISO, dias) {
    var d = new Date(_data(dataISO) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function severidade(v) {
    return Sev.faixa(v).rotulo;
  }

  function nota(v) {
    var c = v ? v.cvss : null;
    if (c !== null && c !== undefined && c !== '' && Number.isFinite(Number(c))) return Number(c);
    return NOTA_POR_SEVERIDADE[v && v.severidadeManual] || null;
  }

  function emAberto(v) {
    return !!v && ['Corrigida', 'Aceita'].indexOf(v.statusCorrecao) === -1;
  }

  function atrasada(v, hoje) {
    var p = _data(v && v.dataPrevistaCorrecao);
    return !!p && p < hojeISO(hoje) && emAberto(v);
  }

  function semPrazo(v) {
    return emAberto(v) && !_data(v.dataPrevistaCorrecao);
  }

  function _media(nums) {
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (s, n) { return s + n; }, 0) / nums.length);
  }

  function _pct(n, d) {
    return d > 0 ? Math.round((n / d) * 100) : null;
  }

  function _contagemVazia() {
    var c = {};
    SEVERIDADES.forEach(function (s) { c[s] = 0; });
    c[SEM_SEVERIDADE] = 0;
    return c;
  }

  function _indice(porSeveridade) {
    return SEVERIDADES.reduce(function (s, f) { return s + (porSeveridade[f] || 0) * PESO[f]; }, 0);
  }

  // ------------------------------------------------- 1. exposicao atual

  /** Backlog de hoje por severidade, indice ponderado e aceitas (risco assumido). */
  function exposicao(vulns) {
    var porSeveridade = _contagemVazia();
    var aceitasPorSeveridade = _contagemVazia();
    var abertas = 0, aceitas = 0;
    (vulns || []).forEach(function (v) {
      var s = severidade(v);
      if (emAberto(v)) { abertas++; porSeveridade[s] = (porSeveridade[s] || 0) + 1; }
      else if (v.statusCorrecao === 'Aceita') { aceitas++; aceitasPorSeveridade[s] = (aceitasPorSeveridade[s] || 0) + 1; }
    });
    return {
      abertas: abertas,
      porSeveridade: porSeveridade,
      criticasAltas: porSeveridade['Crítica'] + porSeveridade['Alta'],
      semSeveridade: porSeveridade[SEM_SEVERIDADE],
      indice: _indice(porSeveridade),
      aceitas: aceitas,
      aceitasPorSeveridade: aceitasPorSeveridade,
    };
  }

  /** Backlog por produto, mais exposto primeiro (indice, depois quantidade). `nomeDe(v)` vem da tela. */
  function porProduto(vulns, nomeDe) {
    var mapa = {};
    (vulns || []).filter(emAberto).forEach(function (v) {
      var nome = (nomeDe ? nomeDe(v) : v.produto) || 'Sem produto';
      var g = mapa[nome] || (mapa[nome] = { nome: nome, total: 0, porSeveridade: _contagemVazia() });
      g.total++;
      g.porSeveridade[severidade(v)]++;
    });
    return Object.keys(mapa).map(function (k) {
      var g = mapa[k];
      g.indice = _indice(g.porSeveridade);
      return g;
    }).sort(function (a, b) { return (b.indice - a.indice) || (b.total - a.total) || a.nome.localeCompare(b.nome, 'pt-BR'); });
  }

  // ------------------------------------------------- 2. tendencia

  /** Ultimos `n` meses ('AAAA-MM'), terminando no mes de `hoje`, mais antigo primeiro. */
  function mesesAte(hoje, n) {
    var h = hojeISO(hoje);
    var ano = Number(h.slice(0, 4)), mes = Number(h.slice(5, 7));
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var m = mes - i, a = ano;
      while (m <= 0) { m += 12; a--; }
      out.push(a + '-' + String(m).padStart(2, '0'));
    }
    return out;
  }

  function fimDoMes(mes) {
    var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  }

  /**
   * Quando a vulnerabilidade saiu do backlog. Corrigida: Data de Correcao;
   * Aceita: dataAceite (gravada pelo servidor desde 19/10/2026). Sem a data
   * especifica, a ultima edicao; sem nada, a propria deteccao (nunca conta
   * como aberta no passado -- melhor sub-contar que inventar backlog).
   * '' = ainda em aberto.
   */
  function dataSaida(v) {
    if (emAberto(v)) return '';
    var propria = v.statusCorrecao === 'Corrigida' ? _data(v.dataCorrecao) : _data(v.dataAceite);
    return propria || _data(v.atualizadoEm) || _data(v.dataDeteccao) || '0000-00-00';
  }

  /** Estava no backlog no fim do dia `data`? Sem data de deteccao nao da para dizer (fica fora da serie). */
  function abertaEm(v, data) {
    var det = _data(v && v.dataDeteccao);
    if (!det || det > data) return false;
    var saida = dataSaida(v);
    return !saida || saida > data;
  }

  function _fotoDoFimDoMes(vulns, mes) {
    var fim = fimDoMes(mes);
    var porSeveridade = _contagemVazia();
    var abertas = 0, atrasadas = 0, semPrazoN = 0;
    vulns.forEach(function (v) {
      if (!abertaEm(v, fim)) return;
      abertas++;
      porSeveridade[severidade(v)]++;
      // Mesmo instante da foto do servidor (madrugada do dia seguinte): prazo
      // que venceu no ultimo dia do mes ja conta como atrasado.
      var p = _data(v.dataPrevistaCorrecao);
      if (p && p <= fim) atrasadas++;
      if (!p) semPrazoN++;
    });
    return { abertas: abertas, porSeveridade: porSeveridade, atrasadas: atrasadas, semPrazo: semPrazoN };
  }

  function _movimentoDoMes(vulns, mes) {
    var novas = 0, corrigidas = 0;
    vulns.forEach(function (v) {
      if (_data(v.dataDeteccao).slice(0, 7) === mes) novas++;
      if (v.statusCorrecao === 'Corrigida' && _data(v.dataCorrecao).slice(0, 7) === mes) corrigidas++;
    });
    return { novas: novas, corrigidas: corrigidas };
  }

  /**
   * Um ponto por mes: { mes, abertas, criticasAltas, indice, atrasadas,
   * semPrazo, novas, corrigidas, fonte: 'foto' | 'reconstruida' | 'atual' }.
   * `fotos` = documentos de painel_vulnerabilidades (so faz sentido SEM filtro
   * na tela: a foto e da empresa inteira).
   */
  function serieMensal(vulns, opcoes) {
    var o = opcoes || {};
    var lista = vulns || [];
    var hoje = hojeISO(o.hoje);
    var mesAtual = hoje.slice(0, 7);
    var fotos = {};
    (o.fotos || []).forEach(function (f) { if (f && f.mes) fotos[f.mes] = f; });
    return mesesAte(hoje, o.meses || 12).map(function (mes) {
      var p;
      if (mes === mesAtual) {
        var e = exposicao(lista);
        p = {
          abertas: e.abertas, porSeveridade: e.porSeveridade,
          atrasadas: lista.filter(function (v) { return atrasada(v, hoje); }).length,
          semPrazo: lista.filter(semPrazo).length,
          fonte: 'atual',
        };
      } else if (fotos[mes]) {
        var f = fotos[mes];
        var ps = _contagemVazia();
        Object.keys(f.porSeveridade || {}).forEach(function (k) { ps[k] = Number(f.porSeveridade[k]) || 0; });
        p = { abertas: Number(f.abertas) || 0, porSeveridade: ps, atrasadas: Number(f.atrasadas) || 0, semPrazo: Number(f.semPrazo) || 0, fonte: 'foto' };
      } else {
        p = _fotoDoFimDoMes(lista, mes);
        p.fonte = 'reconstruida';
      }
      var mov = fotos[mes] && mes !== mesAtual
        ? { novas: Number(fotos[mes].novas) || 0, corrigidas: Number(fotos[mes].corrigidas) || 0 }
        : _movimentoDoMes(lista, mes);
      return {
        mes: mes,
        abertas: p.abertas,
        criticasAltas: (p.porSeveridade['Crítica'] || 0) + (p.porSeveridade['Alta'] || 0),
        indice: _indice(p.porSeveridade),
        porSeveridade: p.porSeveridade,
        atrasadas: p.atrasadas,
        semPrazo: p.semPrazo,
        novas: mov.novas,
        corrigidas: mov.corrigidas,
        fonte: p.fonte,
      };
    });
  }

  /** Corrigidas com Data de Correcao no intervalo [de, ate]. */
  function _corrigidasEntre(vulns, de, ate) {
    return (vulns || []).filter(function (v) {
      var c = _data(v.dataCorrecao);
      return v.statusCorrecao === 'Corrigida' && c && c >= de && c <= ate;
    });
  }

  /**
   * Tempo medio de correcao (dias, deteccao -> correcao) das corrigidas no
   * intervalo, no geral e por severidade. `n` = quantas entraram na conta.
   */
  function mttr(vulns, de, ate) {
    var porSeveridade = {};
    var todos = [];
    _corrigidasEntre(vulns, de, ate).forEach(function (v) {
      var d = diasEntre(v.dataDeteccao, v.dataCorrecao);
      if (d === null || d < 0) return;
      todos.push(d);
      var s = severidade(v);
      (porSeveridade[s] = porSeveridade[s] || []).push(d);
    });
    var out = { media: _media(todos), n: todos.length, porSeveridade: {} };
    Object.keys(porSeveridade).forEach(function (s) {
      out.porSeveridade[s] = { media: _media(porSeveridade[s]), n: porSeveridade[s].length };
    });
    return out;
  }

  /**
   * Entradas x saidas no intervalo: novas (detectadas) e corrigidas. Taxa de
   * fechamento = corrigidas / novas (acima de 100% = o backlog esta caindo).
   */
  function movimento(vulns, de, ate) {
    var novas = (vulns || []).filter(function (v) { var d = _data(v.dataDeteccao); return d && d >= de && d <= ate; }).length;
    var corrigidas = _corrigidasEntre(vulns, de, ate).length;
    return { novas: novas, corrigidas: corrigidas, saldo: novas - corrigidas, taxaFechamento: _pct(corrigidas, novas) };
  }

  /** Janela movel de `dias` terminando hoje e a janela imediatamente anterior, para comparar. */
  function janelas(hoje, dias) {
    var h = hojeISO(hoje);
    var ini = _somarDias(h, -(dias - 1));
    return {
      atual: { de: ini, ate: h },
      anterior: { de: _somarDias(ini, -dias), ate: _somarDias(ini, -1) },
    };
  }

  // ------------------------------------------------- 3. acao imediata

  /**
   * Processos de negocio que dependem de alguma dependencia afetada (mesma
   * cadeia de vulnerabilidadeRisco.processosAfetados). Com `rede` =
   * { servicos, dependencias }, pela cadeia inteira (Processo -> Servico ->
   * componentes); sem ela, so o vinculo direto.
   */
  function processosDaVulnerabilidade(v, processos, rede) {
    var ids = {};
    (Array.isArray(v && v.dependenciasAfetadas) ? v.dependenciasAfetadas : []).forEach(function (d) {
      if (d && d.id) ids[String(d.id)] = true;
    });
    if (!Object.keys(ids).length) return [];
    if (rede && Cadeia) {
      var achados = {};
      Object.keys(ids).forEach(function (id) {
        Cadeia.processosQueDependemDe(id, { processos: processos, servicos: rede.servicos, dependencias: rede.dependencias })
          .forEach(function (x) { achados[String(x.processo.id)] = true; });
      });
      return (processos || []).filter(function (p) { return p && achados[String(p.id)]; });
    }
    return (processos || []).filter(function (p) {
      return p && Array.isArray(p.dependenciaItens) && p.dependenciaItens.some(function (d) { return d && d.id && ids[String(d.id)]; });
    });
  }

  /**
   * Vulnerabilidades em aberto que pedem acao ja, com o porque. Criterios:
   * Critica; Alta com exploit publico; prazo vencido; atinge processo Tier 1;
   * acima do limiar de risco sem risco aberto (so quando `riscoAberto(id)` e
   * informado -- o Gestor nao le o Registro inteiro).
   * Devolve [{ v, motivos[], prioridade, diasAtraso, processosTier1 }], maior prioridade primeiro.
   */
  function acaoImediata(vulns, ctx) {
    var c = ctx || {};
    var hoje = hojeISO(c.hoje);
    var limiar = Number.isFinite(Number(c.limiar)) ? Number(c.limiar) : 7;
    var out = [];
    (vulns || []).filter(emAberto).forEach(function (v) {
      var s = severidade(v);
      var motivos = [];
      var prioridade = PESO[s] || 0;
      if (s === 'Crítica') { motivos.push(MOTIVO.CRITICA); prioridade += 100; }
      if (s === 'Alta' && v.exploitDisponivel === 'Sim') { motivos.push(MOTIVO.EXPLOIT); prioridade += 50; }
      var t1 = processosDaVulnerabilidade(v, c.processos, c.rede).filter(function (p) {
        return Criticidade.tierDoProcesso(p) === Criticidade.TIER.T1;
      });
      if (t1.length) { motivos.push(MOTIVO.TIER1); prioridade += 60; }
      var diasAtraso = atrasada(v, hoje) ? diasEntre(v.dataPrevistaCorrecao, hoje) : 0;
      if (diasAtraso > 0) { motivos.push(MOTIVO.ATRASADA); prioridade += 40 + Math.min(diasAtraso, 30); }
      var n = nota(v);
      if (typeof c.riscoAberto === 'function' && n !== null && n >= limiar && !c.riscoAberto(v.id)) {
        motivos.push(MOTIVO.SEM_RISCO); prioridade += 20;
      }
      if (!motivos.length) return;
      out.push({ v: v, motivos: motivos, prioridade: prioridade, diasAtraso: diasAtraso, processosTier1: t1 });
    });
    return out.sort(function (a, b) {
      return (b.prioridade - a.prioridade) || String(a.v.dataDeteccao || '').localeCompare(String(b.v.dataDeteccao || ''));
    });
  }

  // ------------------------------------------------- 4. prazos

  /**
   * Corrigidas no intervalo que tinham Data Prevista: quantas sairam ate a
   * data. As sem Data Prevista nao entram no percentual (contadas a parte).
   */
  function cumprimentoPrazo(vulns, de, ate) {
    var corrigidas = _corrigidasEntre(vulns, de, ate);
    var comPrazo = corrigidas.filter(function (v) { return _data(v.dataPrevistaCorrecao); });
    var noPrazo = comPrazo.filter(function (v) { return _data(v.dataCorrecao) <= _data(v.dataPrevistaCorrecao); }).length;
    return {
      corrigidas: corrigidas.length,
      comPrazo: comPrazo.length,
      noPrazo: noPrazo,
      foraDoPrazo: comPrazo.length - noPrazo,
      semPrazoDefinido: corrigidas.length - comPrazo.length,
      pct: _pct(noPrazo, comPrazo.length),
    };
  }

  /** Atrasadas hoje (com o atraso medio em dias) e abertas sem prazo definido. */
  function atraso(vulns, hoje) {
    var h = hojeISO(hoje);
    var abertas = (vulns || []).filter(emAberto);
    var dias = abertas.filter(function (v) { return atrasada(v, h); }).map(function (v) { return diasEntre(v.dataPrevistaCorrecao, h); });
    var sem = abertas.filter(semPrazo).length;
    return {
      atrasadas: dias.length,
      diasMedio: _media(dias),
      diasMaximo: dias.length ? Math.max.apply(null, dias) : null,
      semPrazo: sem,
      pctSemPrazo: _pct(sem, abertas.length),
      abertas: abertas.length,
    };
  }

  /** Desempenho por Equipe Responsavel: backlog, atraso e cumprimento de prazo na janela. */
  function porEquipe(vulns, de, ate, hoje) {
    var h = hojeISO(hoje);
    var mapa = {};
    (vulns || []).forEach(function (v) {
      var nome = String(v.equipeResponsavel || '').trim() || 'Sem equipe definida';
      (mapa[nome] = mapa[nome] || []).push(v);
    });
    return Object.keys(mapa).map(function (nome) {
      var lista = mapa[nome];
      var at = atraso(lista, h);
      var cp = cumprimentoPrazo(lista, de, ate);
      return {
        equipe: nome,
        abertas: at.abertas,
        atrasadas: at.atrasadas,
        semPrazo: at.semPrazo,
        corrigidas: cp.corrigidas,
        pctNoPrazo: cp.pct,
        mttr: mttr(lista, de, ate).media,
      };
    }).filter(function (e) { return e.abertas || e.corrigidas; })
      .sort(function (a, b) { return (b.atrasadas - a.atrasadas) || (b.abertas - a.abertas) || a.equipe.localeCompare(b.equipe, 'pt-BR'); });
  }

  // ------------------------------------------------- 5. servicos e dados criticos

  function _piorSeveridade(lista) {
    for (var i = 0; i < SEVERIDADES.length; i++) {
      if (lista.indexOf(SEVERIDADES[i]) !== -1) return SEVERIDADES[i];
    }
    return SEM_SEVERIDADE;
  }

  /**
   * Processos de negocio atingidos por vulnerabilidades em aberto, mais
   * critico primeiro (Tier, depois indice). E `porTier`: quantos processos
   * expostos em cada Tier.
   */
  function processosExpostos(vulns, processos, rede) {
    var mapa = {};
    (vulns || []).filter(emAberto).forEach(function (v) {
      var s = severidade(v);
      processosDaVulnerabilidade(v, processos, rede).forEach(function (p) {
        var g = mapa[p.id] || (mapa[p.id] = {
          id: p.id, processo: p.processo || '', area: p.area || '', tier: Criticidade.tierDoProcesso(p),
          vulnerabilidades: [], severidades: [], porSeveridade: _contagemVazia(),
        });
        g.vulnerabilidades.push(v.id);
        g.severidades.push(s);
        g.porSeveridade[s]++;
      });
    });
    var lista = Object.keys(mapa).map(function (k) {
      var g = mapa[k];
      return {
        id: g.id, processo: g.processo, area: g.area, tier: g.tier,
        total: g.vulnerabilidades.length, vulnerabilidades: g.vulnerabilidades,
        piorSeveridade: _piorSeveridade(g.severidades), indice: _indice(g.porSeveridade),
      };
    }).sort(function (a, b) {
      return ((ORDEM_TIER[b.tier] || 0) - (ORDEM_TIER[a.tier] || 0)) || (b.indice - a.indice) || a.processo.localeCompare(b.processo, 'pt-BR');
    });
    var porTier = {};
    [Criticidade.TIER.T1, Criticidade.TIER.T2, Criticidade.TIER.T3, Criticidade.TIER.PENDENTE].forEach(function (t) { porTier[t] = 0; });
    lista.forEach(function (p) { porTier[p.tier] = (porTier[p.tier] || 0) + 1; });
    return { processos: lista, porTier: porTier };
  }

  /**
   * Exposicao legal e de dados pessoais em aberto: subtipo LGPD/Privacidade,
   * ou Nao Conformidade com exposicao legal Alta/Grave (matriz de impacto da
   * aba Severidade -- "Alto" ja inclui expor dado pessoal).
   */
  function exposicaoDados(vulns) {
    var lista = (vulns || []).filter(function (v) {
      if (!emAberto(v)) return false;
      if (v.subtipo === SUBTIPO_DADOS) return true;
      var imp = v.severidadeCriterios && v.severidadeCriterios.impacto;
      return v.tipo === 'Não Conformidade' && IMPACTO_LEGAL_ALTO.indexOf(imp) !== -1;
    });
    return { total: lista.length, lgpd: lista.filter(function (v) { return v.subtipo === SUBTIPO_DADOS; }).length, vulnerabilidades: lista };
  }

  /** Em aberto sem dependencia vinculada: nao da para saber qual servico atingem. */
  function semVinculo(vulns) {
    var abertas = (vulns || []).filter(emAberto);
    var sem = abertas.filter(function (v) {
      return !(Array.isArray(v.dependenciasAfetadas) && v.dependenciasAfetadas.some(function (d) { return d && d.id; }));
    }).length;
    return { total: sem, pct: _pct(sem, abertas.length) };
  }

  // ------------------------------------------------- textos

  var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function rotuloMes(mes) {
    return MESES_CURTOS[Number(mes.slice(5, 7)) - 1] + '/' + mes.slice(2, 4);
  }

  var ROTULO_FONTE = {
    atual: 'Hoje (ao vivo)',
    foto: 'Fechamento do mês (foto gravada)',
    reconstruida: 'Reconstruído pelas datas (severidade de hoje)',
  };

  /** Linhas da dica de um mes do grafico (texto puro; a tela escapa e monta o HTML). */
  function linhasDicaMes(ponto) {
    var p = ponto || {};
    var saldo = (p.novas || 0) - (p.corrigidas || 0);
    return [
      rotuloMes(p.mes) + ' · ' + (ROTULO_FONTE[p.fonte] || ''),
      'Em aberto: ' + p.abertas + ' (Críticas + Altas: ' + p.criticasAltas + ')',
      'Índice de exposição: ' + p.indice,
      'Novas: ' + p.novas + ' · Corrigidas: ' + p.corrigidas + ' · Saldo: ' + (saldo > 0 ? '+' : '') + saldo,
      'Atrasadas: ' + p.atrasadas + ' · Sem prazo: ' + p.semPrazo,
    ];
  }

  // ------------------------------------------------- filtros do relatorio (20/10/2026)

  var SEM = '__sem__';
  var ROTULO_SEVERIDADE_MINIMA = { 'Média': 'Média ou mais grave', 'Alta': 'Alta ou mais grave', 'Crítica': 'Só Crítica' };

  function _brData(iso) {
    var t = _data(iso);
    return t ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : '';
  }

  /**
   * Escopo do relatorio: { produto, equipe, responsavel, tipo, severidadeMinima,
   * detectadoDe, detectadoAte }. Vazio = todos; '__sem__' = sem valor (produto,
   * equipe, responsavel) e '__sem_tipo__' = nao classificada. `ctx.nomeProduto(v)`
   * resolve o nome do produto (catalogo ou texto antigo).
   */
  function filtrar(vulns, filtros, ctx) {
    var f = filtros || {};
    var nomeProduto = (ctx && ctx.nomeProduto) || function (v) { return v.produto || ''; };
    var igual = function (valor, alvo) { return alvo === SEM ? !String(valor || '').trim() : String(valor || '') === alvo; };
    var min = SEVERIDADES.indexOf(f.severidadeMinima);
    var de = _data(f.detectadoDe), ate = _data(f.detectadoAte);
    return (vulns || []).filter(function (v) {
      if (f.produto && !igual(nomeProduto(v), f.produto)) return false;
      if (f.equipe && !igual(v.equipeResponsavel, f.equipe)) return false;
      if (f.responsavel && !igual(v.responsavel, f.responsavel)) return false;
      if (f.tipo === '__sem_tipo__') { if (v.tipo) return false; } else if (f.tipo && v.tipo !== f.tipo) return false;
      if (min !== -1) {
        // SEVERIDADES vai da mais grave para a menos grave.
        var i = SEVERIDADES.indexOf(severidade(v));
        if (i === -1 || i > min) return false;
      }
      if (de || ate) {
        var d = _data(v.dataDeteccao);
        if (!d || (de && d < de) || (ate && d > ate)) return false;
      }
      return true;
    });
  }

  function temFiltro(filtros) {
    var f = filtros || {};
    return Object.keys(f).some(function (k) { return f[k]; });
  }

  /** Frase do escopo para o documento, a lista de edicoes e a IA. */
  function descreverFiltros(filtros) {
    var f = filtros || {};
    var sem = function (v, txt) { return v === SEM ? txt : v; };
    var partes = [];
    if (f.produto) partes.push('Produto: ' + sem(f.produto, 'sem produto'));
    if (f.equipe) partes.push('Equipe: ' + sem(f.equipe, 'sem equipe'));
    if (f.responsavel) partes.push('Responsável: ' + sem(f.responsavel, 'sem responsável'));
    if (f.tipo) partes.push('Tipo: ' + (f.tipo === '__sem_tipo__' ? 'não classificada' : f.tipo));
    if (f.severidadeMinima) partes.push(ROTULO_SEVERIDADE_MINIMA[f.severidadeMinima] || f.severidadeMinima);
    if (f.detectadoDe || f.detectadoAte) {
      partes.push('Detectadas' + (f.detectadoDe ? ' de ' + _brData(f.detectadoDe) : '') + (f.detectadoAte ? ' até ' + _brData(f.detectadoAte) : ''));
    }
    return partes.length ? partes.join(' · ') : 'Empresa inteira';
  }

  // ------------------------------------------------- relatorio executivo (20/10/2026)

  /**
   * Tudo que o Relatorio Executivo de Vulnerabilidades mostra, calculado uma
   * vez so (o documento, os destaques e os indicadores da IA leem daqui).
   * `ctx` = { hoje, meses, fotos, processos, limiar, riscoAberto, nomeProduto, janela }.
   */
  function dadosRelatorio(vulns, ctx) {
    var c = ctx || {};
    var hoje = hojeISO(c.hoje);
    var j = janelas(hoje, c.janela || 90);
    var serie = serieMensal(vulns, { meses: c.meses || 12, hoje: hoje, fotos: c.fotos });
    return {
      hoje: hoje,
      janela: c.janela || 90,
      exposicao: exposicao(vulns),
      produtos: porProduto(vulns, c.nomeProduto),
      serie: serie,
      mttrAtual: mttr(vulns, j.atual.de, j.atual.ate),
      mttrAnterior: mttr(vulns, j.anterior.de, j.anterior.ate),
      movimento: movimento(vulns, j.atual.de, j.atual.ate),
      acao: acaoImediata(vulns, { hoje: hoje, processos: c.processos || [], rede: c.rede, limiar: c.limiar, riscoAberto: c.riscoAberto }),
      cumprimento: cumprimentoPrazo(vulns, j.atual.de, j.atual.ate),
      atraso: atraso(vulns, hoje),
      equipes: porEquipe(vulns, j.atual.de, j.atual.ate, hoje),
      processosExpostos: processosExpostos(vulns, c.processos || [], c.rede),
      dados: exposicaoDados(vulns),
      semVinculo: semVinculo(vulns),
    };
  }

  function _plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }

  /** Frases montadas dos numeros (sem IA), sempre no topo do relatorio. */
  function destaques(d) {
    var e = d.exposicao;
    var out = [];
    var ant = d.serie.length > 1 ? d.serie[d.serie.length - 2] : null;
    var varTxt = '';
    if (ant) {
      var dif = e.abertas - ant.abertas;
      varTxt = dif ? ' (' + (dif > 0 ? '+' : '') + dif + ' vs. ' + rotuloMes(ant.mes) + ')' : ' (igual a ' + rotuloMes(ant.mes) + ')';
    }
    out.push(_plural(e.abertas, 'vulnerabilidade em aberto', 'vulnerabilidades em aberto') + varTxt + '; ' + _plural(e.criticasAltas, 'é Crítica ou Alta', 'são Críticas ou Altas') + '. Índice de exposição: ' + e.indice + '.');
    if (d.acao.length) out.push(_plural(d.acao.length, 'vulnerabilidade exige', 'vulnerabilidades exigem') + ' ação imediata.');
    if (d.atraso.atrasadas) out.push(_plural(d.atraso.atrasadas, 'está atrasada', 'estão atrasadas') + ' (atraso médio de ' + d.atraso.diasMedio + ' dias).');
    if (d.atraso.semPrazo) out.push(_plural(d.atraso.semPrazo, 'em aberto não tem', 'em aberto não têm') + ' data prevista de correção.');
    if (d.cumprimento.pct !== null) out.push(d.cumprimento.pct + '% das corrigidas nos últimos ' + d.janela + ' dias saíram no prazo (' + d.cumprimento.noPrazo + ' de ' + d.cumprimento.comPrazo + ').');
    if (d.mttrAtual.media !== null) out.push('Tempo médio de correção: ' + d.mttrAtual.media + ' dias' + (d.mttrAnterior.media !== null ? ' (' + d.mttrAnterior.media + ' nos ' + d.janela + ' dias anteriores).' : '.'));
    var t1 = d.processosExpostos.porTier[Criticidade.TIER.T1] || 0;
    if (t1) out.push(_plural(t1, 'processo Tier 1 está exposto', 'processos Tier 1 estão expostos') + '.');
    if (d.dados.total) out.push(_plural(d.dados.total, 'vulnerabilidade com exposição legal ou de dados pessoais', 'vulnerabilidades com exposição legal ou de dados pessoais') + '.');
    return out;
  }

  /** O que vai para a IA: numeros agregados e os 10 itens de topo (codigo, nome, severidade, motivos). */
  function indicadoresParaIA(d) {
    var e = d.exposicao;
    return {
      emAberto: e.abertas,
      porSeveridade: e.porSeveridade,
      criticasEAltas: e.criticasAltas,
      indiceDeExposicao: e.indice,
      aceitas: e.aceitas,
      produtosMaisExpostos: d.produtos.slice(0, 5).map(function (p) { return { produto: p.nome, emAberto: p.total, indice: p.indice }; }),
      tendenciaMensal: d.serie.map(function (p) { return { mes: p.mes, emAberto: p.abertas, criticasEAltas: p.criticasAltas, novas: p.novas, corrigidas: p.corrigidas }; }),
      janelaDias: d.janela,
      tempoMedioCorrecaoDias: d.mttrAtual.media,
      tempoMedioCorrecaoJanelaAnteriorDias: d.mttrAnterior.media,
      novasNaJanela: d.movimento.novas,
      corrigidasNaJanela: d.movimento.corrigidas,
      percentualNoPrazo: d.cumprimento.pct,
      atrasadas: d.atraso.atrasadas,
      atrasoMedioDias: d.atraso.diasMedio,
      semPrazoDefinido: d.atraso.semPrazo,
      acaoImediata: d.acao.length,
      principaisAcaoImediata: d.acao.slice(0, 10).map(function (x) { return { codigo: x.v.codigo || '', nome: x.v.nome || '', severidade: severidade(x.v), motivos: x.motivos }; }),
      equipesComAtraso: d.equipes.filter(function (q) { return q.atrasadas; }).map(function (q) { return { equipe: q.equipe, atrasadas: q.atrasadas, emAberto: q.abertas }; }),
      processosExpostosPorTier: d.processosExpostos.porTier,
      exposicaoLegalOuDadosPessoais: d.dados.total,
      emAbertoSemDependenciaVinculada: d.semVinculo.total,
    };
  }

  return {
    SEM: SEM,
    filtrar: filtrar,
    temFiltro: temFiltro,
    descreverFiltros: descreverFiltros,
    dadosRelatorio: dadosRelatorio,
    destaques: destaques,
    indicadoresParaIA: indicadoresParaIA,
    SEVERIDADES: SEVERIDADES,
    SEM_SEVERIDADE: SEM_SEVERIDADE,
    PESO: PESO,
    MOTIVO: MOTIVO,
    severidade: severidade,
    nota: nota,
    emAberto: emAberto,
    atrasada: atrasada,
    semPrazo: semPrazo,
    diasEntre: diasEntre,
    exposicao: exposicao,
    porProduto: porProduto,
    mesesAte: mesesAte,
    fimDoMes: fimDoMes,
    dataSaida: dataSaida,
    abertaEm: abertaEm,
    serieMensal: serieMensal,
    mttr: mttr,
    movimento: movimento,
    janelas: janelas,
    processosDaVulnerabilidade: processosDaVulnerabilidade,
    acaoImediata: acaoImediata,
    cumprimentoPrazo: cumprimentoPrazo,
    atraso: atraso,
    porEquipe: porEquipe,
    processosExpostos: processosExpostos,
    exposicaoDados: exposicaoDados,
    semVinculo: semVinculo,
    rotuloMes: rotuloMes,
    linhasDicaMes: linhasDicaMes,
  };
}));
