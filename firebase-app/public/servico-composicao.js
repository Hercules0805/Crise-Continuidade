/**
 * Composicao de Servicos (21/10/2026): hierarquia de dependencias e o alerta de
 * RTO/RPO/MTTR, sem DOM. As telas (app.js) so desenham.
 *
 * Hierarquia: Processo -> Servico -> Infra -> Servidor -> Banco ...
 *   servico.dependenciaItens  -> dependencias logo abaixo do servico
 *   dependencia.componentes   -> dependencias logo abaixo da dependencia
 * Uma dependencia pode estar abaixo de varias (grafo sem ciclo, nao arvore).
 *
 * Alerta pelo CAMINHO CRITICO: para cada atributo soma-se o valor ao longo de
 * cada cadeia (servico ate a folha); a cadeia de maior soma e comparada com o
 * valor do servico. Irmaos contam em paralelo. Valor ausente nao vale 0: marca
 * a conta como "incompleta". Calculado na leitura, nunca gravado.
 *
 * Valores em minutos (rtoMin/rpoMin/mttrMin). Enquanto a migracao nao roda, o
 * texto legado rto/rpo da dependencia e lido com parseDuracao().
 *
 * Tambem exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ServicoComposicao = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ATRIBUTOS = ['rto', 'rpo', 'mttr'];
  var ROTULO_ATRIBUTO = { rto: 'RTO', rpo: 'RPO', mttr: 'MTTR' };
  var UNIDADES = { min: 1, h: 60, d: 1440 };
  var RAIZ = '__servico__';

  var STATUS = {
    alerta: 'Alerta',
    incompleto: 'Incompleto',
    'sem-parametros': 'Sem parâmetros',
    'sem-dependencias': 'Sem dependências',
    ok: 'OK',
  };

  function _texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  /**
   * Texto livre -> minutos, ou null quando ilegivel/sem limite.
   * '< 1 hora' 60 | '4h a 8h' 480 | '0 (nenhuma perda)' 0 | '30 min' 30 | '1 dia' 1440 | '> 24 horas' null.
   */
  function parseDuracao(texto) {
    if (typeof texto === 'number') return isFinite(texto) && texto >= 0 ? texto : null;
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
    if (!isFinite(n)) return null;
    var unidade = ult[2] || (achados.length > 1 && achados[0][2]) || 'h';
    if (/^min/.test(unidade)) return Math.round(n);
    if (/^d/.test(unidade)) return Math.round(n * 1440);
    return Math.round(n * 60);
  }

  /** Minutos -> '45 min' | '4 h' | '1 h 30 min' | '2 d' | '1 d 6 h'. null -> '—'. */
  function formatarDuracao(min) {
    if (min === null || min === undefined || !isFinite(min)) return '—';
    var m = Math.round(min);
    if (m < 60) return m + ' min';
    if (m < 1440) {
      var h = Math.floor(m / 60), r = m % 60;
      return h + ' h' + (r ? ' ' + r + ' min' : '');
    }
    var d = Math.floor(m / 1440), rh = Math.round((m % 1440) / 60);
    return d + ' d' + (rh ? ' ' + rh + ' h' : '');
  }

  /** Minutos -> {valor, unidade} na maior unidade exata, para preencher o formulario. */
  function paraUnidade(min) {
    if (min === null || min === undefined || !isFinite(min)) return { valor: '', unidade: 'h' };
    if (min > 0 && min % 1440 === 0) return { valor: min / 1440, unidade: 'd' };
    if (min > 0 && min % 60 === 0) return { valor: min / 60, unidade: 'h' };
    if (min === 0) return { valor: 0, unidade: 'h' };
    return { valor: min, unidade: 'min' };
  }

  /** {valor, unidade} do formulario -> minutos, ou null quando vazio/invalido. */
  function deUnidade(valor, unidade) {
    if (valor === null || valor === undefined || _texto(valor) === '') return null;
    var n = Number(String(valor).replace(',', '.'));
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n * (UNIDADES[unidade] || 60));
  }

  /** Valor do atributo em minutos (campo numerico; texto legado para rto/rpo). */
  function valorMin(item, atributo) {
    if (!item) return null;
    var v = item[atributo + 'Min'];
    if (typeof v === 'number' && isFinite(v) && v >= 0) return v;
    if (v !== null && v !== undefined && v !== '' && isFinite(Number(v)) && Number(v) >= 0) return Number(v);
    if (atributo === 'rto' || atributo === 'rpo') return parseDuracao(item[atributo]);
    return null;
  }

  function _indice(deps) {
    var porId = {}, porNome = {};
    (deps || []).forEach(function (d) {
      if (!d || !d.id) return;
      porId[d.id] = d;
      var n = _texto(d.nome).toLowerCase();
      if (n && !porNome[n]) porNome[n] = d;
    });
    return { porId: porId, porNome: porNome };
  }

  function _resolver(ref, idx) {
    if (!ref) return null;
    if (ref.id && idx.porId[ref.id]) return idx.porId[ref.id];
    var n = _texto(ref.nome).toLowerCase();
    if (!ref.id && n && idx.porNome[n]) return idx.porNome[n];
    return null;
  }

  function _refsFilhos(item) {
    return Array.isArray(item && item.componentes) ? item.componentes : [];
  }

  /**
   * Grafo do servico. nos[id] = { id, nome, categoria, nivel, valores{rto,rpo,mttr},
   * filhos[], pais[], ausente }. arestas = [{ de, para, ciclo }]. A raiz e RAIZ.
   * Nivel = maior distancia ate o servico (servico 0, filhos diretos >= 1).
   * Uma referencia que fecha ciclo vira aresta { ciclo: true } e nao e seguida.
   */
  function montarGrafo(servico, deps) {
    var idx = _indice(deps);
    var nos = {}, arestas = [], ciclos = [];
    nos[RAIZ] = { id: RAIZ, nome: _texto(servico && servico.nome) || 'Serviço', categoria: 'Serviço', nivel: 0, valores: {}, filhos: [], pais: [], raiz: true };
    ATRIBUTOS.forEach(function (a) { nos[RAIZ].valores[a] = valorMin(servico, a); });

    function no(ref) {
      var d = _resolver(ref, idx);
      var id = d ? d.id : (ref.id || ('nome:' + _texto(ref.nome)));
      if (!nos[id]) {
        var valores = {};
        ATRIBUTOS.forEach(function (a) { valores[a] = d ? valorMin(d, a) : null; });
        nos[id] = {
          id: id,
          nome: d ? _texto(d.nome) : _texto(ref.nome),
          categoria: d ? _texto(d.categoria) : _texto(ref.categoria),
          nivel: 0, valores: valores, filhos: [], pais: [], ausente: !d, _dep: d,
        };
      }
      return nos[id];
    }

    // DFS com cores: 1 = no caminho atual (cinza), 2 = terminado.
    var cor = {};
    function visitar(pai, refs) {
      cor[pai.id] = 1;
      refs.forEach(function (ref) {
        if (!ref || (!ref.id && !_texto(ref.nome))) return;
        var filho = no(ref);
        if (pai.filhos.indexOf(filho.id) >= 0) return;
        if (cor[filho.id] === 1 || filho.id === RAIZ) {
          arestas.push({ de: pai.id, para: filho.id, ciclo: true });
          ciclos.push([pai.id, filho.id]);
          return;
        }
        pai.filhos.push(filho.id);
        filho.pais.push(pai.id);
        arestas.push({ de: pai.id, para: filho.id, ciclo: false });
        if (!cor[filho.id]) visitar(filho, _refsFilhos(filho._dep));
      });
      cor[pai.id] = 2;
    }
    visitar(nos[RAIZ], Array.isArray(servico && servico.dependenciaItens) ? servico.dependenciaItens : []);

    // Nivel = caminho mais longo a partir da raiz (grafo ja sem ciclo).
    var ordem = _ordemTopologica(nos);
    ordem.forEach(function (id) {
      nos[id].filhos.forEach(function (f) {
        if (nos[f].nivel < nos[id].nivel + 1) nos[f].nivel = nos[id].nivel + 1;
      });
    });
    Object.keys(nos).forEach(function (id) { delete nos[id]._dep; });

    return { raiz: RAIZ, nos: nos, arestas: arestas, ciclos: ciclos, ordem: ordem };
  }

  function _ordemTopologica(nos) {
    var visto = {}, saida = [];
    function v(id) {
      if (visto[id]) return;
      visto[id] = true;
      nos[id].filhos.forEach(v);
      saida.push(id);
    }
    v(RAIZ);
    Object.keys(nos).forEach(v);
    return saida.reverse();
  }

  /** Dependencias do grafo (sem a raiz). */
  function nosDependencia(grafo) {
    return Object.keys(grafo.nos).filter(function (id) { return id !== grafo.raiz; }).map(function (id) { return grafo.nos[id]; });
  }

  /**
   * Maior soma do atributo da raiz ate uma folha (a raiz nao entra na soma).
   * { soma, caminho:[ids], incompleto, semValor:[ids] }. Sem dependencias: soma null.
   * incompleto = alguma dependencia do grafo nao tem o valor (qualquer uma pode
   * estar no caminho critico de verdade), e entao a soma e um piso.
   */
  function caminhoCritico(grafo, atributo) {
    var nos = grafo.nos;
    var semValor = nosDependencia(grafo).filter(function (n) { return n.valores[atributo] === null || n.valores[atributo] === undefined; }).map(function (n) { return n.id; });
    if (!nos[grafo.raiz].filhos.length) return { soma: null, caminho: [], incompleto: false, semValor: [] };

    var melhor = {}, prox = {};
    grafo.ordem.slice().reverse().forEach(function (id) {
      var n = nos[id];
      var proprio = id === grafo.raiz ? 0 : (n.valores[atributo] || 0);
      var maxFilho = 0, escolhido = null;
      n.filhos.forEach(function (f) {
        if (escolhido === null || melhor[f] > maxFilho) { maxFilho = melhor[f]; escolhido = f; }
      });
      melhor[id] = proprio + maxFilho;
      prox[id] = escolhido;
    });

    var caminho = [], atual = prox[grafo.raiz];
    while (atual) { caminho.push(atual); atual = prox[atual]; }
    return { soma: melhor[grafo.raiz], caminho: caminho, incompleto: semValor.length > 0, semValor: semValor };
  }

  /**
   * Avaliacao do servico. atributos[a] = { limite, soma, caminho, excede, incompleto,
   * semLimite, semValor }. status: alerta > sem-dependencias > sem-parametros > incompleto > ok.
   * Uma soma que ja passa do limite e alerta mesmo incompleta (so pode crescer).
   */
  function avaliarServico(servico, deps, grafo) {
    var g = grafo || montarGrafo(servico, deps);
    var atributos = {};
    var algumExcede = false, algumIncompleto = false, algumLimite = false, algumSemLimite = false;
    ATRIBUTOS.forEach(function (a) {
      var limite = valorMin(servico, a);
      var cc = caminhoCritico(g, a);
      var excede = limite !== null && cc.soma !== null && cc.soma > limite;
      atributos[a] = {
        limite: limite, soma: cc.soma, caminho: cc.caminho, excede: excede,
        incompleto: cc.incompleto, semLimite: limite === null, semValor: cc.semValor,
      };
      if (excede) algumExcede = true;
      if (cc.incompleto) algumIncompleto = true;
      if (limite !== null) algumLimite = true; else algumSemLimite = true;
    });
    var temDeps = g.nos[g.raiz].filhos.length > 0;
    var status = algumExcede ? 'alerta'
      : !temDeps ? 'sem-dependencias'
      : !algumLimite ? 'sem-parametros'
      : (algumIncompleto || algumSemLimite || g.ciclos.length) ? 'incompleto'
      : 'ok';
    return { grafo: g, atributos: atributos, status: status, rotuloStatus: STATUS[status] };
  }

  /** Frase do alerta de cada atributo que excede, para a faixa do drawer. */
  function mensagensAlerta(avaliacao) {
    return ATRIBUTOS.filter(function (a) { return avaliacao.atributos[a].excede; }).map(function (a) {
      var x = avaliacao.atributos[a];
      return ROTULO_ATRIBUTO[a] + ' das dependências (caminho crítico) = ' + formatarDuracao(x.soma) +
        ' > ' + ROTULO_ATRIBUTO[a] + ' do serviço = ' + formatarDuracao(x.limite);
    });
  }

  /** Ids de todas as dependencias abaixo de id (componentes, recursivo). */
  function descendentes(id, deps) {
    var idx = _indice(deps), saida = {};
    (function v(atual) {
      _refsFilhos(idx.porId[atual]).forEach(function (ref) {
        var d = _resolver(ref, idx);
        if (d && !saida[d.id] && d.id !== id) { saida[d.id] = true; v(d.id); }
      });
    }(id));
    return Object.keys(saida);
  }

  /** Ids de todas as dependencias acima de id (quem a tem como componente, recursivo). */
  function ancestrais(id, deps) {
    var idx = _indice(deps), pais = {};
    (deps || []).forEach(function (d) {
      _refsFilhos(d).forEach(function (ref) {
        var f = _resolver(ref, idx);
        if (f) (pais[f.id] = pais[f.id] || []).push(d.id);
      });
    });
    var saida = {};
    (function v(atual) {
      (pais[atual] || []).forEach(function (p) {
        if (!saida[p] && p !== id) { saida[p] = true; v(p); }
      });
    }(id));
    return Object.keys(saida);
  }

  /** Quem esta logo acima de id: { dependencias:[dep], servicos:[servico] }. */
  function acimaDe(id, deps, servicos) {
    var idx = _indice(deps);
    function contem(lista) {
      return (lista || []).some(function (ref) { var d = _resolver(ref, idx); return d && d.id === id; });
    }
    return {
      dependencias: (deps || []).filter(function (d) { return d.id !== id && contem(d.componentes); }),
      servicos: (servicos || []).filter(function (s) { return contem(s.dependenciaItens); }),
    };
  }

  /** Ids que nao podem virar componente de id: ele mesmo e quem esta acima dele. */
  function bloqueadosComoComponente(id, deps) {
    return id ? [id].concat(ancestrais(id, deps)) : [];
  }

  // ---- Relatorio de Composicao de Servicos (21/10/2026) ----
  // Escopo: { servico: id, processo: id, status: chave de STATUS, categoria: categoria
  // de dependencia }. Vazio = todos. O retrato do relatorio (dadosRelatorio) e
  // JSON puro: e o que a edicao salva guarda.

  var ORDEM_STATUS = ['alerta', 'incompleto', 'sem-parametros', 'sem-dependencias', 'ok'];

  function temFiltro(f) {
    return !!(f && (f.servico || f.processo || f.status || f.categoria));
  }

  function _passa(servico, av, f) {
    if (!f) return true;
    if (f.servico && String(servico.id) !== String(f.servico)) return false;
    if (f.processo && !(servico.processoIds || []).some(function (p) { return String(p.id) === String(f.processo); })) return false;
    if (f.status && av.status !== f.status) return false;
    if (f.categoria && !nosDependencia(av.grafo).some(function (n) { return n.categoria === f.categoria; })) return false;
    return true;
  }

  /** [{ servico, avaliacao }] dos servicos no escopo, do mais grave ao OK e por nome. */
  function filtrarServicos(servicos, deps, filtros) {
    return (servicos || []).map(function (s) { return { servico: s, avaliacao: avaliarServico(s, deps) }; })
      .filter(function (x) { return _passa(x.servico, x.avaliacao, filtros); })
      .sort(function (a, b) {
        return (ORDEM_STATUS.indexOf(a.avaliacao.status) - ORDEM_STATUS.indexOf(b.avaliacao.status)) ||
          _texto(a.servico.nome).localeCompare(_texto(b.servico.nome), 'pt-BR');
      });
  }

  /** Texto do escopo; nomes = { servico(id), processo(id) } para trocar id por nome. */
  function descreverFiltros(f, nomes) {
    if (!temFiltro(f)) return 'Empresa inteira';
    var n = nomes || {};
    var partes = [];
    if (f.servico) partes.push('Serviço: ' + (n.servico ? n.servico(f.servico) : f.servico));
    if (f.processo) partes.push('Processo: ' + (n.processo ? n.processo(f.processo) : f.processo));
    if (f.status) partes.push('Composição: ' + (STATUS[f.status] || f.status));
    if (f.categoria) partes.push('Com dependência de ' + f.categoria);
    return partes.join(' · ');
  }

  /**
   * Conta do documento. processos = [{id, area, processo}] (nome atual dos vinculados).
   * d = { totais, servicos[], excedentes[], semValores[], ciclos[] }.
   */
  function dadosRelatorio(servicos, deps, processos, filtros) {
    var nomeProc = {};
    (processos || []).forEach(function (p) { nomeProc[String(p.id)] = [p.area, p.processo].filter(Boolean).join(' · '); });
    var escopo = filtrarServicos(servicos, deps, filtros);
    var porStatus = {};
    ORDEM_STATUS.forEach(function (k) { porStatus[k] = 0; });
    var excedem = { rto: 0, rpo: 0, mttr: 0 };
    var linhas = [], excedentes = [], ciclos = [];
    var semValor = {};

    escopo.forEach(function (x) {
      var s = x.servico, av = x.avaliacao, g = av.grafo;
      porStatus[av.status]++;
      var atributos = {};
      ATRIBUTOS.forEach(function (a) {
        var at = av.atributos[a];
        var cadeia = at.caminho.map(function (id) { var no = g.nos[id]; return { nome: no.nome, categoria: no.categoria, valor: no.valores[a] }; });
        atributos[a] = { limite: at.limite, soma: at.soma, excede: at.excede, incompleto: at.incompleto, semLimite: at.semLimite, cadeia: cadeia };
        if (at.excede) {
          excedem[a]++;
          excedentes.push({ servico: _texto(s.nome), atributo: a, limite: at.limite, soma: at.soma, incompleto: at.incompleto, cadeia: cadeia });
        }
      });
      nosDependencia(g).forEach(function (no) {
        var faltam = ATRIBUTOS.filter(function (a) { return no.valores[a] === null || no.valores[a] === undefined; });
        if (!faltam.length) return;
        var item = semValor[no.id] = semValor[no.id] || { nome: no.nome, categoria: no.categoria, faltam: faltam.map(function (a) { return ROTULO_ATRIBUTO[a]; }), servicos: [] };
        if (item.servicos.indexOf(_texto(s.nome)) < 0) item.servicos.push(_texto(s.nome));
      });
      g.ciclos.forEach(function (c) { ciclos.push({ servico: _texto(s.nome), de: g.nos[c[0]].nome, para: g.nos[c[1]].nome }); });
      linhas.push({
        id: s.id, nome: _texto(s.nome), status: av.status, rotuloStatus: av.rotuloStatus,
        dependencias: nosDependencia(g).length,
        processos: (s.processoIds || []).map(function (p) { return nomeProc[String(p.id)] || _texto(p.nome); }),
        atributos: atributos,
      });
    });

    var ordemExc = { rto: 0, rpo: 1, mttr: 2 };
    excedentes.sort(function (a, b) {
      return ((b.soma - b.limite) / (b.limite || 1)) - ((a.soma - a.limite) / (a.limite || 1)) || ordemExc[a.atributo] - ordemExc[b.atributo];
    });
    var listaSemValor = Object.keys(semValor).map(function (k) { return semValor[k]; })
      .sort(function (a, b) { return b.servicos.length - a.servicos.length || a.nome.localeCompare(b.nome, 'pt-BR'); });

    return {
      totais: { servicos: escopo.length, porStatus: porStatus, excedem: excedem },
      servicos: linhas, excedentes: excedentes, semValores: listaSemValor, ciclos: ciclos,
    };
  }

  /** Frases de destaque do documento, das mais graves para as informativas. */
  function destaques(d) {
    var t = d.totais, out = [];
    if (!t.servicos) return ['Nenhum serviço no escopo.'];
    var a = t.porStatus.alerta;
    out.push(a ? a + ' de ' + t.servicos + ' serviço(s) com dependências acima do limite (RTO ' + t.excedem.rto + ', RPO ' + t.excedem.rpo + ', MTTR ' + t.excedem.mttr + ').'
      : 'Nenhum serviço com dependências acima do limite.');
    if (d.excedentes.length) {
      var e = d.excedentes[0];
      out.push('Maior estouro: ' + e.servico + ' — ' + ROTULO_ATRIBUTO[e.atributo] + ' do caminho crítico ' + formatarDuracao(e.soma) + ' contra limite de ' + formatarDuracao(e.limite) + '.');
    }
    if (t.porStatus.incompleto) out.push(t.porStatus.incompleto + ' serviço(s) com composição incompleta (dependência sem valor, limite faltando ou ciclo).');
    if (t.porStatus['sem-parametros']) out.push(t.porStatus['sem-parametros'] + ' serviço(s) sem RTO/RPO/MTTR definidos.');
    if (d.semValores.length) out.push(d.semValores.length + ' dependência(s) sem RTO, RPO ou MTTR informados.');
    if (d.ciclos.length) out.push(d.ciclos.length + ' ciclo(s) entre componentes a corrigir.');
    return out;
  }

  // ---- Mapa de conexoes (21/10/2026): layout em camadas, JSON puro ----
  // Camadas: Processos suportados (se houver) -> Servico -> niveis de dependencia.
  // Ordem dentro da camada pelo baricentro (2 passadas: de cima para baixo e de
  // baixo para cima), para reduzir cruzamentos. Um no compartilhado aparece uma vez.

  var CARTAO = { w: 196, h: 74, gapX: 28, gapY: 64, margem: 16 };

  /**
   * avaliacao = avaliarServico(...); processos = [{id, nome}] suportados pelo servico.
   * { largura, altura, nos:[{id, nome, categoria, tipo, camada, x, y, w, h, valores,
   *   semValor, ausente, criticos:[atributos]}], arestas:[{de, para, ciclo, criticos}] }
   */
  function layoutCamadas(avaliacao, processos) {
    var g = avaliacao.grafo;
    var procs = (processos || []).filter(function (p) { return p && p.id; });
    var desloc = procs.length ? 1 : 0;

    // Atributos cujo caminho critico passa por cada no / aresta.
    var criticoNo = {}, criticoAresta = {};
    ATRIBUTOS.forEach(function (a) {
      var c = avaliacao.atributos[a].caminho;
      var anterior = g.raiz;
      c.forEach(function (id) {
        (criticoNo[id] = criticoNo[id] || []).push(a);
        var k = anterior + '>' + id;
        (criticoAresta[k] = criticoAresta[k] || []).push(a);
        anterior = id;
      });
    });

    var camadas = [];
    var nos = {};
    function por(camada, no) { (camadas[camada] = camadas[camada] || []).push(no.id); nos[no.id] = no; }
    procs.forEach(function (p) {
      por(0, { id: 'processo:' + p.id, nome: _texto(p.nome), categoria: 'Processo', tipo: 'processo', valores: {}, semValor: false, ausente: false, criticos: [] });
    });
    // Ordem inicial: a da busca no grafo (pais antes dos filhos).
    g.ordem.forEach(function (id) {
      var n = g.nos[id];
      var raiz = id === g.raiz;
      var semValor = !raiz && ATRIBUTOS.some(function (a) { return n.valores[a] === null || n.valores[a] === undefined; });
      por(desloc + n.nivel, {
        id: id, nome: n.nome, categoria: n.categoria, tipo: raiz ? 'servico' : 'dependencia',
        valores: { rto: n.valores.rto, rpo: n.valores.rpo, mttr: n.valores.mttr },
        semValor: semValor, ausente: !!n.ausente, criticos: (criticoNo[id] || []).slice(),
      });
    });

    var arestas = procs.map(function (p) { return { de: 'processo:' + p.id, para: g.raiz, ciclo: false, criticos: [] }; })
      .concat(g.arestas.map(function (e) { return { de: e.de, para: e.para, ciclo: !!e.ciclo, criticos: (criticoAresta[e.de + '>' + e.para] || []).slice() }; }));

    // Baricentro.
    var posicao = {};
    function indexar() { camadas.forEach(function (c) { (c || []).forEach(function (id, i) { posicao[id] = i - ((c.length - 1) / 2); }); }); }
    function vizinhos(id, deCima) {
      return arestas.filter(function (e) { return !e.ciclo && (deCima ? e.para === id : e.de === id); })
        .map(function (e) { return deCima ? e.de : e.para; });
    }
    function reordenar(c, deCima) {
      var bari = {};
      c.forEach(function (id) {
        var v = vizinhos(id, deCima).filter(function (x) { return posicao[x] !== undefined; });
        bari[id] = v.length ? v.reduce(function (s, x) { return s + posicao[x]; }, 0) / v.length : posicao[id];
      });
      c.sort(function (a, b) { return bari[a] - bari[b]; });
    }
    indexar();
    for (var i = 1; i < camadas.length; i++) { if (camadas[i]) { reordenar(camadas[i], true); indexar(); } }
    for (var j = camadas.length - 2; j >= 0; j--) { if (camadas[j]) { reordenar(camadas[j], false); indexar(); } }

    var maxPorCamada = camadas.reduce(function (m, c) { return Math.max(m, (c || []).length); }, 1);
    var largura = CARTAO.margem * 2 + maxPorCamada * CARTAO.w + (maxPorCamada - 1) * CARTAO.gapX;
    var altura = CARTAO.margem * 2 + camadas.length * CARTAO.h + (camadas.length - 1) * CARTAO.gapY;
    var lista = [];
    camadas.forEach(function (c, ci) {
      c = c || [];
      var larguraCamada = c.length * CARTAO.w + (c.length - 1) * CARTAO.gapX;
      var x0 = (largura - larguraCamada) / 2;
      c.forEach(function (id, k) {
        var n = nos[id];
        n.camada = ci;
        n.x = Math.round(x0 + k * (CARTAO.w + CARTAO.gapX));
        n.y = CARTAO.margem + ci * (CARTAO.h + CARTAO.gapY);
        n.w = CARTAO.w; n.h = CARTAO.h;
        lista.push(n);
      });
    });
    return { largura: largura, altura: altura, nos: lista, arestas: arestas };
  }

  /**
   * Dados do relatorio "Mapa de conexoes": um mapa por servico do escopo.
   * d = { totais:{servicos, alerta}, mapas:[{ nome, status, rotuloStatus, atributos, layout }] }.
   */
  function dadosMapa(servicos, deps, processos, filtros) {
    var nomeProc = {};
    (processos || []).forEach(function (p) { nomeProc[String(p.id)] = [p.area, p.processo].filter(Boolean).join(' · '); });
    var escopo = filtrarServicos(servicos, deps, filtros);
    var mapas = escopo.map(function (x) {
      var av = x.avaliacao;
      var procs = (x.servico.processoIds || []).map(function (p) { return { id: String(p.id), nome: nomeProc[String(p.id)] || _texto(p.nome) }; });
      var atributos = {};
      ATRIBUTOS.forEach(function (a) {
        var at = av.atributos[a];
        atributos[a] = { limite: at.limite, soma: at.soma, excede: at.excede, incompleto: at.incompleto, semLimite: at.semLimite };
      });
      return { nome: _texto(x.servico.nome), status: av.status, rotuloStatus: av.rotuloStatus, atributos: atributos, layout: layoutCamadas(av, procs) };
    });
    return {
      totais: { servicos: mapas.length, alerta: mapas.filter(function (m) { return m.status === 'alerta'; }).length },
      mapas: mapas,
    };
  }

  function destaquesMapa(d) {
    if (!d.totais.servicos) return ['Nenhum serviço no escopo.'];
    var out = [d.totais.servicos + ' mapa(s) de conexões; ' + d.totais.alerta + ' serviço(s) em alerta.'];
    d.mapas.filter(function (m) { return m.status === 'alerta'; }).slice(0, 3).forEach(function (m) {
      var exc = ATRIBUTOS.filter(function (a) { return m.atributos[a].excede; }).map(function (a) { return ROTULO_ATRIBUTO[a]; });
      out.push(m.nome + ': caminho crítico acima do limite em ' + exc.join(', ') + ' (em vermelho no mapa).');
    });
    return out;
  }

  return {
    ATRIBUTOS: ATRIBUTOS,
    ORDEM_STATUS: ORDEM_STATUS,
    CARTAO: CARTAO,
    layoutCamadas: layoutCamadas,
    dadosMapa: dadosMapa,
    destaquesMapa: destaquesMapa,
    temFiltro: temFiltro,
    filtrarServicos: filtrarServicos,
    descreverFiltros: descreverFiltros,
    dadosRelatorio: dadosRelatorio,
    destaques: destaques,
    ROTULO_ATRIBUTO: ROTULO_ATRIBUTO,
    UNIDADES: UNIDADES,
    STATUS: STATUS,
    RAIZ: RAIZ,
    parseDuracao: parseDuracao,
    formatarDuracao: formatarDuracao,
    paraUnidade: paraUnidade,
    deUnidade: deUnidade,
    valorMin: valorMin,
    montarGrafo: montarGrafo,
    nosDependencia: nosDependencia,
    caminhoCritico: caminhoCritico,
    avaliarServico: avaliarServico,
    mensagensAlerta: mensagensAlerta,
    descendentes: descendentes,
    ancestrais: ancestrais,
    acimaDe: acimaDe,
    bloqueadosComoComponente: bloqueadosComoComponente,
  };
}));
