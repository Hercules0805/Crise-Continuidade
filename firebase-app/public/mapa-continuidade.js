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
  // Instalacoes (21/10/2026): o "P" de Premises dos 4 Ps do BIA.
  var TIPOS = ['processo', 'servico', 'dependencia', 'fornecedor', 'contrato', 'backup', 'pessoa', 'instalacao', 'area'];
  var ROTULO_TIPO = {
    processo: 'Processos', servico: 'Serviços', dependencia: 'Dependências', fornecedor: 'Fornecedores',
    contrato: 'Contratos', backup: 'Backups', pessoa: 'Pessoas', instalacao: 'Instalações', area: 'Áreas',
  };
  var ROTULO_TIPO_SINGULAR = {
    processo: 'Processo', servico: 'Serviço', dependencia: 'Dependência', fornecedor: 'Fornecedor',
    contrato: 'Contrato', backup: 'Backup', pessoa: 'Pessoa', instalacao: 'Instalação', area: 'Área',
  };
  var CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];
  var CATEGORIAS_PESSOA = ['Pessoas', 'Pessoa'];
  var CATEGORIAS_PROCESSO = ['Processos Internos', 'Processo Interno'];
  var CATEGORIAS_INSTALACAO = ['Instalações', 'Instalação'];
  var CATEGORIAS_SERVICO = ['Serviços', 'Serviço'];

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

  /** Nomes (sem acento) que se repetem: no geral e dentro da mesma categoria. */
  function _nomesRepetidos(deps) {
    var cont = {}, contCat = {};
    (deps || []).forEach(function (x) {
      if (!x || !x.id) return;
      var n = normalizar(x.nome);
      contCat[n + '|' + x.categoria] = (contCat[n + '|' + x.categoria] || 0) + 1;
      cont[n] = (cont[n] || 0) + 1;
    });
    var porCategoria = {}, geral = {};
    Object.keys(contCat).forEach(function (k) { if (contCat[k] > 1) porCategoria[k] = true; });
    Object.keys(cont).forEach(function (k) { if (cont[k] > 1) geral[k] = true; });
    return { porCategoria: porCategoria, geral: geral };
  }

  // Relacoes, no sentido de quem parte do processo, do caminho tecnico ate o
  // que o sustenta: servico que o suporta, o que ele/o servico usa,
  // componentes abaixo e a instalacao onde estao.
  var REL_CAMINHO_TECNICO = ['depende de', 'depende de (direto, legado)', 'suportado pelo serviço', 'usa', 'componente abaixo', 'instalada em'];

  function _alcancaveis(adj, origem, rels) {
    var visto = {}, fila = [origem], saida = [];
    visto[origem] = true;
    while (fila.length) {
      var atual = fila.shift();
      (adj[atual] || []).forEach(function (x) {
        if (visto[x.para] || rels.indexOf(x.rel) < 0) return;
        visto[x.para] = true;
        saida.push(x.para);
        fila.push(x.para);
      });
    }
    return saida;
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
    var nomesRepetidos = _nomesRepetidos(deps);
    deps.forEach(function (x) {
      if (!x || !x.id) return;
      var tipo = CATEGORIAS_PESSOA.indexOf(x.categoria) >= 0 ? 'pessoa'
        : CATEGORIAS_FORNECEDOR.indexOf(x.categoria) >= 0 ? 'fornecedor'
        : CATEGORIAS_PROCESSO.indexOf(x.categoria) >= 0 ? null
        : CATEGORIAS_INSTALACAO.indexOf(x.categoria) >= 0 ? 'instalacao'
        : 'dependencia';
      if (!tipo) return;
      var id = tipo + ':' + x.id;
      depPorId[String(x.id)] = id;
      // Fallback por nome (item legado sem id) so liga quando o nome nao e
      // ambiguo: homonimos na mesma categoria, ou o nome sem categoria em mais
      // de uma, ligavam ao primeiro que aparecesse -- vinculo errado no mapa.
      var nn = normalizar(x.nome);
      if (!nomesRepetidos.porCategoria[nn + '|' + x.categoria]) depPorNome[nn + '|' + x.categoria] = id;
      if (!nomesRepetidos.geral[nn]) depPorNome[nn] = id;
      if (tipo === 'pessoa') {
        if (!pessoaPorNome[normalizar(x.nome)]) pessoaPorNome[normalizar(x.nome)] = id;
        no(id, 'pessoa', x.nome, { ref: x.id, sub: (x.areas && x.areas.length ? x.areas : [x.setor]).filter(Boolean).join(', ') });
      } else if (tipo === 'fornecedor') {
        no(id, 'fornecedor', x.nomeFantasia || x.nome, { ref: x.id, sub: x.categoriaFornecedor || 'Fornecedor' });
      } else if (tipo === 'instalacao') {
        var valoresI = {};
        ['rto', 'rpo', 'mttr'].forEach(function (a) { valoresI[a] = op.valorMin ? op.valorMin(x, a) : null; });
        no(id, 'instalacao', x.nome, { ref: x.id, sub: x.tipoInstalacao || 'Instalação', selos: {
          tipoInstalacao: _texto(x.tipoInstalacao), endereco: _texto(x.endereco), valores: valoresI,
          alternativa: x.instalacaoAlternativa && x.instalacaoAlternativa.id ? _texto(x.instalacaoAlternativa.nome) : '',
        } });
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
      if (_texto(ref.categoria)) return depPorNome[normalizar(ref.nome) + '|' + ref.categoria] || null;
      return depPorNome[normalizar(ref.nome)] || null;
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
      var tecnicasDiretas = 0;
      _lista(p.dependenciaItens).forEach(function (it) {
        if (!it) return;
        if (CATEGORIAS_PROCESSO.indexOf(it.categoria) >= 0) {
          ligar(id, procPorId[String(it.id)], 'depende do processo', 'processo dependente');
          return;
        }
        // Processo -> Servico (21/10/2026): o vinculo mora no processo; o
        // servico.processoIds antigo continua ligando la embaixo, sem repetir.
        if (CATEGORIAS_SERVICO.indexOf(it.categoria) >= 0) {
          ligar(id, it.id ? 'servico:' + it.id : null, 'suportado pelo serviço', 'suporta');
          return;
        }
        var alvo = resolverDep(it);
        // Tecnico granular direto no processo e legado: devia vir por um Servico.
        if (alvo && tipoDoId(alvo) === 'dependencia') {
          tecnicasDiretas++;
          ligar(id, alvo, 'depende de (direto, legado)', 'processo dependente (legado)');
          return;
        }
        ligar(id, alvo, 'depende de', 'processo dependente');
      });
      if (tecnicasDiretas) nos[id].lacunas.push(tecnicasDiretas + (tecnicasDiretas > 1 ? ' ligações técnicas diretas' : ' ligação técnica direta'));
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
        if (x.instalacao && x.instalacao.id) ligar(id, depPorId[String(x.instalacao.id)], 'lotada em', 'pessoa lotada');
      } else if (tipo === 'fornecedor') {
        (x.pessoasRelacionadas || []).forEach(function (r) { ligar(id, pessoaPor(r.id) || pessoaPor(r.nome), r.papel || 'pessoa relacionada', 'relacionada ao fornecedor'); });
        (x.areasRelacionadas || []).forEach(function (a) { ligar(id, areaId(a), 'área relacionada', 'fornecedor relacionado'); });
      } else {
        (x.componentes || []).forEach(function (r) {
          var alvo = resolverDep(r);
          // "instalada em" so de dependencia tecnica: Instalacao dentro de
          // Instalacao (gravado antes da restricao) fica como componente comum.
          if (alvo && tipoDoId(alvo) === 'instalacao' && tipo !== 'instalacao') ligar(id, alvo, 'instalada em', 'hospeda');
          else ligar(id, alvo, 'componente abaixo', 'está abaixo de');
        });
        if (tipo === 'instalacao' && x.instalacaoAlternativa && x.instalacaoAlternativa.id) {
          ligar(id, depPorId[String(x.instalacaoAlternativa.id)], 'contingência', 'contingência de');
        }
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

    // Lacuna de Instalacao: usada por processo Tier 1/2 e sem instalacao
    // alternativa. "Usada" inclui o caminho tecnico: processo -> servico ->
    // dependencia -> (componentes) -> instalada em, nao so o vinculo direto.
    var instalacoesCriticas = {};
    Object.keys(nos).forEach(function (id) {
      var n = nos[id];
      if (n.tipo !== 'processo' || !/^Tier [12]\b/.test(n.selos.tier || '')) return;
      _alcancaveis(adj, id, REL_CAMINHO_TECNICO).forEach(function (alvo) {
        if (tipoDoId(alvo) === 'instalacao') instalacoesCriticas[alvo] = true;
      });
    });
    Object.keys(instalacoesCriticas).forEach(function (id) {
      var temAlternativa = adj[id].some(function (x) { return x.rel === 'contingência'; });
      if (!temAlternativa) nos[id].lacunas.push('Sem instalação alternativa');
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

  // ---- Explorar (22/10/2026): mind map em arvore ----
  // A raiz a esquerda; os vinculos de cada item, agrupados por tipo, a direita.
  // E arvore, nao grafo: o mesmo item pode aparecer em ramos diferentes, e o
  // que ja esta no caminho ate ali nao reaparece como filho (sem voltar em
  // circulo). Um no e identificado pela CHAVE do caminho ate ele
  // ('processo:p1>servico:s1'); `abertos` e o Set das chaves abertas.
  var SEP_CAMINHO = '>';

  function chaveDoCaminho(caminho) { return caminho.join(SEP_CAMINHO); }
  function caminhoDaChave(chave) { return String(chave || '').split(SEP_CAMINHO).filter(Boolean); }

  /** Quantos vinculos (dos tipos visiveis) o item tem fora do caminho -- o numero do botao ▸. */
  function _contarFilhos(indice, caminho, tipos) {
    var fora = {};
    caminho.forEach(function (c) { fora[c] = true; });
    var n = 0;
    vizinhos(indice, caminho[caminho.length - 1], tipos).forEach(function (g) {
      g.itens.forEach(function (i) { if (!fora[i.id]) n++; });
    });
    return n;
  }

  /**
   * Filhos do ultimo item do caminho, agrupados por tipo (ordem de TIPOS;
   * dentro do grupo, lacunas primeiro e por nome -- a ordem de vizinhos).
   * Grupo com mais de `opcoes.limite` (8) mostra os primeiros e diz quantos
   * ficaram de fora, a menos que esteja em `opcoes.gruposAbertos`
   * ('<chave>|<tipo>').
   * [{ tipo, rotulo, total, ocultos, itens:[{ id, nome, sub, tipo, rels, lacunas, nFilhos }] }]
   */
  function filhosNaArvore(indice, caminho, tipos, opcoes) {
    var op = opcoes || {};
    var limite = op.limite || 8;
    var chave = chaveDoCaminho(caminho);
    var fora = {};
    caminho.forEach(function (c) { fora[c] = true; });
    return vizinhos(indice, caminho[caminho.length - 1], tipos).map(function (g) {
      var todos = g.itens.filter(function (i) { return !fora[i.id]; });
      var aberto = op.gruposAbertos && op.gruposAbertos.has && op.gruposAbertos.has(chave + '|' + g.tipo);
      var mostrados = aberto ? todos : todos.slice(0, limite);
      return {
        tipo: g.tipo, rotulo: g.rotulo, total: todos.length, ocultos: todos.length - mostrados.length,
        itens: mostrados.map(function (i) {
          return { id: i.id, nome: i.nome, sub: i.sub, tipo: g.tipo, rels: i.rels, lacunas: i.lacunas,
            nFilhos: _contarFilhos(indice, caminho.concat([i.id]), tipos) };
        }),
      };
    }).filter(function (g) { return g.total > 0; });
  }

  /**
   * Arvore aberta a partir da raiz. No: { id, chave, tipo, nome, sub, lacunas,
   * relComPai, nFilhos, aberto, grupos:[{ tipo, rotulo, total, ocultos, nos:[no] }] }.
   * Devolve { raiz: no, total } -- total = itens desenhados.
   */
  function montarArvore(indice, raiz, abertos, tipos, opcoes) {
    var op = opcoes || {};
    var maxProf = op.maxProfundidade || 12;
    var total = 0;
    function no(caminho, relComPai) {
      var id = caminho[caminho.length - 1];
      var n = indice.nos[id];
      var chave = chaveDoCaminho(caminho);
      total++;
      var aberto = !!(abertos && abertos.has && abertos.has(chave)) && caminho.length <= maxProf;
      var grupos = aberto ? filhosNaArvore(indice, caminho, tipos, op).map(function (g) {
        return { tipo: g.tipo, rotulo: g.rotulo, total: g.total, ocultos: g.ocultos,
          nos: g.itens.map(function (i) { return no(caminho.concat([i.id]), i.rels); }) };
      }) : [];
      return { id: id, chave: chave, tipo: n.tipo, nome: n.nome, sub: n.sub, lacunas: n.lacunas, relComPai: relComPai || [],
        nFilhos: _contarFilhos(indice, caminho, tipos), aberto: aberto, grupos: grupos };
    }
    if (!indice.nos[raiz]) return { raiz: null, total: 0 };
    var r = no([raiz], null);
    return { raiz: r, total: total };
  }

  /** Todos os nos desenhados da arvore, na ordem (pre-ordem). */
  function nosDaArvore(arvore) {
    var saida = [];
    (function v(n) {
      if (!n) return;
      saida.push(n);
      n.grupos.forEach(function (g) { g.nos.forEach(v); });
    })(arvore && arvore.raiz);
    return saida;
  }

  /**
   * Ligacoes cruzadas do no `chave`: vinculos dele com itens desenhados em
   * OUTROS ramos (fora o pai e os filhos diretos, que a arvore ja mostra).
   * [{ id, nome, tipo, rels, chave }] -- chave = 1a ocorrencia na arvore.
   */
  function ligacoesCruzadas(indice, arvore, chave) {
    var caminho = caminhoDaChave(chave);
    var id = caminho[caminho.length - 1];
    var pai = caminho.length > 1 ? caminho[caminho.length - 2] : null;
    var nos = nosDaArvore(arvore);
    var primeiro = {};
    nos.forEach(function (n) { if (!primeiro[n.id]) primeiro[n.id] = n.chave; });
    var proprio = nos.filter(function (n) { return n.chave === chave; })[0];
    var filhos = {};
    (proprio ? proprio.grupos : []).forEach(function (g) { g.nos.forEach(function (f) { filhos[f.id] = true; }); });
    var vistos = {};
    var saida = [];
    (indice.adj[id] || []).forEach(function (x) {
      if (x.para === id || x.para === pai || filhos[x.para] || !primeiro[x.para]) return;
      var item = vistos[x.para];
      if (!item) {
        var n = indice.nos[x.para];
        item = vistos[x.para] = { id: x.para, nome: n.nome, tipo: n.tipo, rels: [], chave: primeiro[x.para] };
        saida.push(item);
      }
      if (item.rels.indexOf(x.rel) < 0) item.rels.push(x.rel);
    });
    return saida.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
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

  /**
   * Visao completa (fase 2): todos os nos dos tipos visiveis e as ligacoes entre
   * eles, uma por par (as relacoes do par juntas). grau = ligacoes visiveis.
   * { nos:[{ id, tipo, nome, sub, lacuna, grau }], arestas:[{ id, de, para, rels }] }
   */
  function elementosGrafo(indice, tiposVisiveis) {
    var vis = tiposVisiveis || TIPOS;
    var visivel = function (id) { return vis.indexOf(tipoDoId(id)) >= 0; };
    var pares = {}, grau = {};
    Object.keys(indice.adj).forEach(function (de) {
      if (!visivel(de)) return;
      indice.adj[de].forEach(function (x) {
        if (!visivel(x.para)) return;
        var a = de < x.para ? de : x.para, b = de < x.para ? x.para : de;
        var k = a + '|' + b;
        var par = pares[k];
        if (!par) {
          par = pares[k] = { id: 'e:' + k, de: a, para: b, rels: [] };
          grau[a] = (grau[a] || 0) + 1;
          grau[b] = (grau[b] || 0) + 1;
        }
        // Guarda a relacao no sentido de quem a declarou (de -> para).
        if (de === a && par.rels.indexOf(x.rel) < 0) par.rels.push(x.rel);
      });
    });
    var nos = Object.keys(indice.nos).filter(visivel).map(function (id) {
      var n = indice.nos[id];
      return { id: id, tipo: n.tipo, nome: n.nome, sub: n.sub, lacuna: n.lacunas.length > 0, grau: grau[id] || 0 };
    });
    var arestas = Object.keys(pares).map(function (k) { return pares[k]; });
    return { nos: nos, arestas: arestas };
  }

  return {
    TIPOS: TIPOS,
    elementosGrafo: elementosGrafo,
    ROTULO_TIPO: ROTULO_TIPO,
    ROTULO_TIPO_SINGULAR: ROTULO_TIPO_SINGULAR,
    normalizar: normalizar,
    tipoDoId: tipoDoId,
    montarIndice: montarIndice,
    vizinhos: vizinhos,
    chaveDoCaminho: chaveDoCaminho,
    caminhoDaChave: caminhoDaChave,
    filhosNaArvore: filhosNaArvore,
    montarArvore: montarArvore,
    nosDaArvore: nosDaArvore,
    ligacoesCruzadas: ligacoesCruzadas,
    buscar: buscar,
    pontosDePartida: pontosDePartida,
    contagemVinculos: contagemVinculos,
  };
}));
