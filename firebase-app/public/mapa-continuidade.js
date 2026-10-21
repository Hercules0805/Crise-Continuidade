/**
 * Mapa de Continuidade (21/10/2026): tudo o que se conecta no nucleo BIA/PCN/DRP
 * -- Processos, Areas, Pessoas, Servicos, Dependencias tecnicas, Fornecedores,
 * Contratos e Backups -- num indice de nos e arestas, sem DOM. A tela (app.js,
 * mapaContinuidade) so desenha o mapa mental centrado num item.
 *
 * Nenhum vinculo novo: tudo vem de campos que ja existem (ver a tabela no plano
 * e em ui-referencias.md). Ids tipados: processo:<id>, area:<nome>, pessoa:<id>,
 * servico:<id>, dependencia:<id>, fornecedor:<id>, contrato:<id>, backup:<id>.
 *
 * Regras de outros modulos entram por `opcoes` (Tier, composicao do servico,
 * situacao do contrato, valor em minutos), para este arquivo ficar puro.
 * Tambem exporta como modulo CommonJS para poder ser testado com node --test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MapaContinuidade = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ordem dos grupos em volta do centro e rotulos.
  var TIPOS = ['processo', 'servico', 'dependencia', 'fornecedor', 'contrato', 'backup', 'pessoa', 'area'];
  var ROTULO_TIPO = {
    processo: 'Processos', servico: 'Serviços', dependencia: 'Dependências', fornecedor: 'Fornecedores',
    contrato: 'Contratos', backup: 'Backups', pessoa: 'Pessoas', area: 'Áreas',
  };
  var ROTULO_TIPO_SINGULAR = {
    processo: 'Processo', servico: 'Serviço', dependencia: 'Dependência', fornecedor: 'Fornecedor',
    contrato: 'Contrato', backup: 'Backup', pessoa: 'Pessoa', area: 'Área',
  };
  var CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];
  var CATEGORIAS_PESSOA = ['Pessoas', 'Pessoa'];
  var CATEGORIAS_PROCESSO = ['Processos Internos', 'Processo Interno'];

  function _texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function normalizar(t) {
    return _texto(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function _lista(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      try { var x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; }
    }
    return [];
  }

  function _temConteudo(v) {
    if (!v) return false;
    if (typeof v !== 'string') return true;
    try { var x = JSON.parse(v); return Array.isArray(x) ? x.length > 0 : !!x; } catch (e) { return v.trim().length > 0; }
  }

  function tipoDoId(id) {
    return String(id).split(':')[0];
  }

  /**
   * dados = { processos, areas, dependencias (todas as categorias), servicos, contratos|null, backups }
   * opcoes = { tierDe(p), avaliarServico(s) -> {status, rotuloStatus}, situacaoContrato(c), valorMin(dep, atributo) }
   * Devolve { nos:{id: no}, adj:{id: [{para, rel}]}, semContratos }.
   */
  function montarIndice(dados, opcoes) {
    var op = opcoes || {};
    var d = dados || {};
    var nos = {}, adj = {};
    var deps = d.dependencias || [];

    function no(id, tipo, nome, extra) {
      if (!nos[id]) {
        nos[id] = Object.assign({ id: id, tipo: tipo, nome: _texto(nome) || '(sem nome)', sub: '', selos: {}, lacunas: [] }, extra || {});
        adj[id] = [];
      }
      return nos[id];
    }
    function ligar(de, para, rel, relInv) {
      if (!de || !para || de === para || !nos[de] || !nos[para]) return;
      if (adj[de].some(function (x) { return x.para === para && x.rel === rel; })) return;
      adj[de].push({ para: para, rel: rel });
      adj[para].push({ para: de, rel: relInv });
    }

    // ---- Areas (por nome; uma area citada mas nao cadastrada vira no "ausente") ----
    var areaPorNome = {};
    function areaId(nome) {
      var n = normalizar(nome);
      if (!n) return null;
      if (!areaPorNome[n]) {
        var id = 'area:' + n;
        no(id, 'area', nome, { ausente: true, sub: 'não cadastrada' });
        areaPorNome[n] = id;
      }
      return areaPorNome[n];
    }
    (d.areas || []).forEach(function (a) {
      var n = normalizar(a.nome);
      if (!n) return;
      var id = 'area:' + n;
      no(id, 'area', a.nome, { ref: a.id, ausente: false });
      areaPorNome[n] = id;
    });

    // ---- Dependencias por categoria ----
    var depPorId = {}, depPorNome = {}, pessoaPorNome = {};
    deps.forEach(function (x) {
      if (!x || !x.id) return;
      var tipo = CATEGORIAS_PESSOA.indexOf(x.categoria) >= 0 ? 'pessoa'
        : CATEGORIAS_FORNECEDOR.indexOf(x.categoria) >= 0 ? 'fornecedor'
        : CATEGORIAS_PROCESSO.indexOf(x.categoria) >= 0 ? null
        : 'dependencia';
      if (!tipo) return;
      var id = tipo + ':' + x.id;
      depPorId[String(x.id)] = id;
      depPorNome[normalizar(x.nome) + '|' + x.categoria] = id;
      if (!depPorNome[normalizar(x.nome)]) depPorNome[normalizar(x.nome)] = id;
      if (tipo === 'pessoa') {
        if (!pessoaPorNome[normalizar(x.nome)]) pessoaPorNome[normalizar(x.nome)] = id;
        no(id, 'pessoa', x.nome, { ref: x.id, sub: (x.areas && x.areas.length ? x.areas : [x.setor]).filter(Boolean).join(', ') });
      } else if (tipo === 'fornecedor') {
        no(id, 'fornecedor', x.nomeFantasia || x.nome, { ref: x.id, sub: x.categoriaFornecedor || 'Fornecedor' });
      } else {
        var valores = {};
        ['rto', 'rpo', 'mttr'].forEach(function (a) { valores[a] = op.valorMin ? op.valorMin(x, a) : null; });
        var temDRP = _temConteudo(x.drpSalvo);
        no(id, 'dependencia', x.nome, { ref: x.id, sub: x.categoria, selos: { drp: temDRP, valores: valores } });
      }
    });
    function resolverDep(ref) {
      if (!ref) return null;
      if (ref.id !== undefined && ref.id !== null && ref.id !== '' && depPorId[String(ref.id)]) return depPorId[String(ref.id)];
      if (ref.id !== undefined && ref.id !== null && ref.id !== '') return null; // id que nao existe mais
      return depPorNome[normalizar(ref.nome) + '|' + ref.categoria] || depPorNome[normalizar(ref.nome)] || null;
    }
    function pessoaPor(idOuNome) {
      if (idOuNome === null || idOuNome === undefined || idOuNome === '') return null;
      var porId = depPorId[String(idOuNome)];
      if (porId && tipoDoId(porId) === 'pessoa') return porId;
      return pessoaPorNome[normalizar(idOuNome)] || null;
    }

    // ---- Processos ----
    var procPorId = {};
    (d.processos || []).forEach(function (p) {
      if (!p || p.id === undefined || p.id === null) return;
      var id = 'processo:' + p.id;
      procPorId[String(p.id)] = id;
      var tier = op.tierDe ? op.tierDe(p) : '';
      var temPCN = _temConteudo(p.pcnSalvo);
      var n = no(id, 'processo', p.processo, { ref: p.id, sub: p.area, selos: { tier: tier, pcn: temPCN, rto: _texto(p.rto) } });
      if (/^Tier [12]\b/.test(tier) && !temPCN) n.lacunas.push(tier.replace(/ \(.*\)$/, '') + ' sem PCN');
    });

    // ---- Servicos ----
    (d.servicos || []).forEach(function (s) {
      if (!s || !s.id) return;
      var av = op.avaliarServico ? op.avaliarServico(s) : null;
      var n = no('servico:' + s.id, 'servico', s.nome, { ref: s.id, sub: _texto(s.descricao).slice(0, 60), selos: { composicao: av ? av.status : '', rotuloComposicao: av ? av.rotuloStatus : '' } });
      if (av && av.status === 'alerta') n.lacunas.push('Composição em alerta');
    });

    // ---- Contratos (null = perfil sem acesso) ----
    var semContratos = d.contratos === null || d.contratos === undefined;
    (d.contratos || []).forEach(function (c) {
      if (!c || !c.id) return;
      var situacao = op.situacaoContrato ? op.situacaoContrato(c) : '';
      no('contrato:' + c.id, 'contrato', [c.codigo, c.objeto].filter(Boolean).join(' — ') || c.id, { ref: c.id, sub: c.fornecedorNome || '', selos: { situacao: situacao } });
    });

    // ---- Backups ----
    (d.backups || []).forEach(function (b) {
      if (!b || !b.id) return;
      no('backup:' + b.id, 'backup', b.nome || 'Backup', { ref: b.id, sub: b.modo || '', servicoIds: (b.servicoIds || []).map(String) });
    });

    // ================= Arestas =================
    (d.processos || []).forEach(function (p) {
      var id = procPorId[String(p.id)];
      if (!id) return;
      ligar(id, areaId(p.area), 'pertence à área', 'processo da área');
      _lista(p.dependenciaItens).forEach(function (it) {
        if (!it) return;
        if (CATEGORIAS_PROCESSO.indexOf(it.categoria) >= 0) {
          ligar(id, procPorId[String(it.id)], 'depende do processo', 'processo dependente');
          return;
        }
        ligar(id, resolverDep(it), 'depende de', 'processo dependente');
      });
      _lista(p.bcpContatos).forEach(function (pid) { ligar(id, pessoaPor(pid), 'contato de crise', 'contato de crise do processo'); });
    });

    (d.areas || []).forEach(function (a) {
      ligar(areaId(a.nome), pessoaPor(a.responsavel), 'responsável', 'responsável pela área');
    });

    deps.forEach(function (x) {
      var id = depPorId[String(x.id)];
      if (!id) return;
      var tipo = tipoDoId(id);
      if (tipo === 'pessoa') {
        var areasP = (x.areas && x.areas.length ? x.areas : [x.setor]).filter(Boolean);
        areasP.forEach(function (a) { ligar(id, areaId(a), 'membro da área', 'membro'); });
        ligar(id, pessoaPor(x.liderImediato), 'líder imediato', 'liderado');
      } else if (tipo === 'fornecedor') {
        (x.pessoasRelacionadas || []).forEach(function (r) { ligar(id, pessoaPor(r.id) || pessoaPor(r.nome), r.papel || 'pessoa relacionada', 'relacionada ao fornecedor'); });
        (x.areasRelacionadas || []).forEach(function (a) { ligar(id, areaId(a), 'área relacionada', 'fornecedor relacionado'); });
      } else {
        (x.componentes || []).forEach(function (r) { ligar(id, resolverDep(r), 'componente abaixo', 'está abaixo de'); });
        (x.drpDependencias || []).forEach(function (r) { ligar(id, resolverDep(r), 'precisa para recuperar', 'necessário para recuperar'); });
        if (x.responsavel) ligar(id, areaId(x.responsavel), 'área responsável', 'responsável pela dependência');
      }
    });

    (d.servicos || []).forEach(function (s) {
      var id = 'servico:' + s.id;
      if (!nos[id]) return;
      (s.processoIds || []).forEach(function (p) { ligar(id, procPorId[String(p.id)], 'suporta', 'suportado pelo serviço'); });
      (s.dependenciaItens || []).forEach(function (r) { ligar(id, resolverDep(r), 'usa', 'usada pelo serviço'); });
      (s.stakeholders || []).forEach(function (p) { ligar(id, pessoaPor(p.id) || pessoaPor(p.nome), 'stakeholder', 'stakeholder do serviço'); });
    });

    (d.contratos || []).forEach(function (c) {
      var id = 'contrato:' + c.id;
      if (!nos[id]) return;
      ligar(id, depPorId[String(c.fornecedorId)], 'fornecedor', 'contrato');
      (c.dependenciasCobertas || []).forEach(function (r) { ligar(id, resolverDep(r), 'cobre', 'coberta pelo contrato'); });
      ligar(id, areaId(c.area), 'área do contrato', 'contrato da área');
      if (c.gestor) ligar(id, pessoaPor(c.gestor.id) || pessoaPor(c.gestor.nome), 'gestor', 'gestor do contrato');
    });

    (d.backups || []).forEach(function (b) {
      var id = 'backup:' + b.id;
      if (!nos[id]) return;
      (b.servicoIds || []).forEach(function (sid) { ligar(id, 'servico:' + sid, 'protege o serviço', 'backup'); });
      if (b.servidorId) ligar(id, depPorId[String(b.servidorId)], 'servidor', 'backup');
    });

    // Lacuna de DRP: dependencia tecnica usada por processo ou servico e sem DRP gerado.
    Object.keys(nos).forEach(function (id) {
      var n = nos[id];
      if (n.tipo !== 'dependencia' || n.selos.drp) return;
      var usada = adj[id].some(function (x) { var t = tipoDoId(x.para); return t === 'processo' || t === 'servico'; });
      if (usada) n.lacunas.push('Sem DRP');
    });

    return { nos: nos, adj: adj, semContratos: semContratos };
  }

  /**
   * Vizinhos de id, agrupados por tipo na ordem de TIPOS. Um mesmo vizinho com
   * mais de uma relacao aparece uma vez, com as relacoes juntas.
   * [{ tipo, rotulo, itens:[{ id, nome, sub, rels:[...], lacunas }] }]
   */
  function vizinhos(indice, id, tiposVisiveis) {
    var vis = tiposVisiveis || TIPOS;
    var porVizinho = {};
    (indice.adj[id] || []).forEach(function (x) {
      if (vis.indexOf(tipoDoId(x.para)) < 0) return;
      var v = porVizinho[x.para] = porVizinho[x.para] || { id: x.para, rels: [] };
      if (v.rels.indexOf(x.rel) < 0) v.rels.push(x.rel);
    });
    return TIPOS.filter(function (t) { return vis.indexOf(t) >= 0; }).map(function (t) {
      var itens = Object.keys(porVizinho).filter(function (k) { return tipoDoId(k) === t; }).map(function (k) {
        var n = indice.nos[k];
        return { id: k, nome: n.nome, sub: n.sub, rels: porVizinho[k].rels, lacunas: n.lacunas };
      }).sort(function (a, b) { return (b.lacunas.length - a.lacunas.length) || a.nome.localeCompare(b.nome, 'pt-BR'); });
      return { tipo: t, rotulo: ROTULO_TIPO[t], itens: itens };
    }).filter(function (g) { return g.itens.length; });
  }

  /**
   * Posicoes do mapa mental. Centro no meio; cada grupo num setor proporcional
   * ao tamanho; mais de maxPorGrupo vira "+N" (a nao ser que o grupo esteja em
   * `expandidos`). Mais de 14 itens no total: dois aneis alternados.
   * { largura, altura, centro:{x,y}, itens:[{ id, tipo, x, y, mais? }] }
   */
  function layoutRadial(grupos, opcoes) {
    var op = opcoes || {};
    var max = op.maxPorGrupo || 8;
    var expandidos = op.expandidos || {};
    var L = 1100, A = 720, cx = L / 2, cy = A / 2;
    var visiveis = grupos.map(function (g) {
      var abrir = expandidos[g.tipo] || g.itens.length <= max;
      var itens = abrir ? g.itens : g.itens.slice(0, max - 1);
      var lista = itens.map(function (i) { return { id: i.id, tipo: g.tipo }; });
      if (!abrir) lista.push({ id: 'mais:' + g.tipo, tipo: g.tipo, mais: g.itens.length - itens.length });
      return lista;
    });
    var total = visiveis.reduce(function (s, l) { return s + l.length; }, 0);
    var dois = total > 14;
    var aneis = [{ rx: 330, ry: 225 }, { rx: 460, ry: 300 }];
    var saida = [];
    var angulo = -Math.PI / 2;
    var passo = total ? (2 * Math.PI) / total : 0;
    var k = 0;
    visiveis.forEach(function (lista) {
      lista.forEach(function (item) {
        var a = angulo + passo * (k + 0.5);
        var anel = dois ? aneis[k % 2] : aneis[0];
        saida.push(Object.assign({}, item, { x: Math.round(cx + anel.rx * Math.cos(a)), y: Math.round(cy + anel.ry * Math.sin(a)) }));
        k++;
      });
    });
    return { largura: L, altura: A, centro: { x: cx, y: cy }, itens: saida };
  }

  /** Busca por nome (sem acento), ate `limite` resultados, os com lacuna primeiro. */
  function buscar(indice, termo, limite) {
    var t = normalizar(termo);
    if (!t) return [];
    return Object.keys(indice.nos).map(function (k) { return indice.nos[k]; })
      .filter(function (n) { return normalizar(n.nome).indexOf(t) >= 0 || normalizar(n.sub).indexOf(t) >= 0; })
      .sort(function (a, b) {
        var ia = normalizar(a.nome).indexOf(t) === 0 ? 0 : 1, ib = normalizar(b.nome).indexOf(t) === 0 ? 0 : 1;
        return (ia - ib) || a.nome.localeCompare(b.nome, 'pt-BR');
      })
      .slice(0, limite || 20);
  }

  /** Pontos de partida: processos Tier 1 e tudo que tem lacuna. */
  function pontosDePartida(indice) {
    var nos = Object.keys(indice.nos).map(function (k) { return indice.nos[k]; });
    return {
      tier1: nos.filter(function (n) { return n.tipo === 'processo' && /^Tier 1\b/.test(n.selos.tier || ''); })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }),
      lacunas: nos.filter(function (n) { return n.lacunas.length; })
        .sort(function (a, b) { return TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'); }),
    };
  }

  /** Contagem de vinculos por tipo de vizinho (painel lateral). */
  function contagemVinculos(indice, id) {
    var c = {};
    var vistos = {};
    (indice.adj[id] || []).forEach(function (x) {
      if (vistos[x.para]) return;
      vistos[x.para] = true;
      var t = tipoDoId(x.para);
      c[t] = (c[t] || 0) + 1;
    });
    return c;
  }

  return {
    TIPOS: TIPOS,
    ROTULO_TIPO: ROTULO_TIPO,
    ROTULO_TIPO_SINGULAR: ROTULO_TIPO_SINGULAR,
    normalizar: normalizar,
    tipoDoId: tipoDoId,
    montarIndice: montarIndice,
    vizinhos: vizinhos,
    layoutRadial: layoutRadial,
    buscar: buscar,
    pontosDePartida: pontosDePartida,
    contagemVinculos: contagemVinculos,
  };
}));
