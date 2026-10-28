/**
 * Cadeia de dependencias (21/10/2026): a regra unica de "quem sustenta quem"
 * entre Processo, Servico e dependencias tecnicas.
 *
 *   Processo --> Servicos --> dependencias tecnicas --> componentes ... --> Instalacao
 *      `--> Pessoas, Instalacoes, Fornecedores, Processos Internos (os 4 Ps)
 *
 * O processo aponta o Servico (item {categoria:'Serviços', id, nome} em
 * processo.dependenciaItens) e os 4 Ps; o tecnico granular (Banco, Servidor,
 * API...) vem pela composicao do Servico (servico.dependenciaItens) e pelos
 * componentes de cada dependencia. Item tecnico direto no processo e legado:
 * continua valendo na cadeia (nada some), marcado como tal.
 *
 * servico.processoIds (onde o vinculo morava antes) ainda e LIDO, unido ao do
 * processo, ate a migracao (functions/scripts/migrar-servicos-para-processos.js).
 *
 * Produtos de Software Fortes (28/10/2026): o processo tambem aponta produtos
 * ({categoria:'Produtos de Software', id, nome}); nao tem DRP (fora da cadeia).
 * As pessoas do produto (as 4 funcoes) e as do Servico (stakeholders) sao
 * HERDADAS pelo processo: sincronizarPessoasHerdadas grava cada uma como item
 * de Pessoa com herdadoDe [{tipo, id, nome, funcoes}] -- `manual: true` quando
 * tambem foi escolhida a mao. Pessoa sem esses campos (antiga) conta como manual.
 *
 * Puro, sem DOM. functions/cadeiaDependencias.js e uma copia IDENTICA deste
 * arquivo (o teste tests/cadeia-dependencias.test.js confere).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CadeiaDependencias = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATEGORIA_SERVICO = 'Serviços';
  var CATEGORIAS_SERVICO = ['Serviços', 'Serviço'];
  var CATEGORIAS_PESSOA = ['Pessoas', 'Pessoa'];
  var CATEGORIAS_PROCESSO = ['Processos Internos', 'Processo Interno'];
  var CATEGORIAS_FORNECEDOR = ['Fornecedores', 'Fornecedor'];
  var CATEGORIAS_INSTALACAO = ['Instalações', 'Instalação'];
  var CATEGORIA_PRODUTO = 'Produtos de Software';
  var CATEGORIAS_PRODUTO = ['Produtos de Software', 'Produto de Software'];
  // O que o processo aponta direto no BIA: os 4 Ps, os Servicos e os Produtos.
  var CATEGORIAS_DIRETAS = [].concat(CATEGORIAS_SERVICO, CATEGORIAS_FORNECEDOR, CATEGORIAS_PESSOA, CATEGORIAS_INSTALACAO, CATEGORIAS_PROCESSO, CATEGORIAS_PRODUTO);
  // Funcoes da Pessoa num produto (flag + <funcao>Produtos), na ordem de exibicao.
  var FUNCOES_PRODUTO = [['techLead', 'Tech Lead'], ['teamLead', 'Team Lead'], ['productOwner', 'Product Owner'], ['liderSuporte', 'Liderança de Suporte']];

  function _texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function _norm(t) {
    return _texto(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function _lista(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      try { var x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; }
    }
    return [];
  }

  function _temId(ref) {
    return !!ref && ref.id !== undefined && ref.id !== null && _texto(ref.id) !== '';
  }

  function ehServico(item) {
    return !!item && CATEGORIAS_SERVICO.indexOf(item.categoria) >= 0;
  }

  /** Categoria que o processo pode apontar direto (4 Ps + Servicos). */
  function categoriaPermitidaNoProcesso(categoria) {
    return CATEGORIAS_DIRETAS.indexOf(categoria) >= 0;
  }

  /** Item tecnico direto no processo (legado: devia vir por um Servico). */
  function ehTecnicoDireto(item) {
    return !!item && (_temId(item) || _texto(item.nome) !== '') && !categoriaPermitidaNoProcesso(item.categoria);
  }

  /**
   * Indice do catalogo de dependencias: por id, e por nome so quando o nome e
   * unico (na categoria, ou no catalogo todo para ref sem categoria). Mesma
   * regra do Mapa: homonimo nao liga a ninguem.
   */
  function _indice(deps) {
    var porId = {}, cont = {}, contCat = {}, porNome = {};
    (deps || []).forEach(function (d) {
      if (!d || !_temId(d)) return;
      porId[String(d.id)] = d;
      var n = _norm(d.nome);
      cont[n] = (cont[n] || 0) + 1;
      contCat[n + '|' + d.categoria] = (contCat[n + '|' + d.categoria] || 0) + 1;
    });
    (deps || []).forEach(function (d) {
      if (!d || !_temId(d)) return;
      var n = _norm(d.nome);
      if (contCat[n + '|' + d.categoria] === 1) porNome[n + '|' + d.categoria] = d;
      if (cont[n] === 1) porNome[n] = d;
    });
    return {
      porId: porId,
      resolver: function (ref) {
        if (!ref) return null;
        if (_temId(ref)) return porId[String(ref.id)] || null;
        if (_texto(ref.categoria)) return porNome[_norm(ref.nome) + '|' + ref.categoria] || null;
        return porNome[_norm(ref.nome)] || null;
      },
    };
  }

  function _idsServicoDoProcesso(p) {
    return _lista(p && p.dependenciaItens).filter(function (it) { return ehServico(it) && _temId(it); })
      .map(function (it) { return String(it.id); });
  }

  /** O servico declara (legado) que suporta o processo. */
  function _servicoDeclaraProcesso(s, idProcesso) {
    return (s && Array.isArray(s.processoIds) ? s.processoIds : []).some(function (x) { return x && String(x.id) === String(idProcesso); });
  }

  /** Servicos que suportam o processo: os apontados no processo + os que ainda declaram processoIds. */
  function servicosDoProcesso(p, servicos) {
    if (!p) return [];
    var ids = _idsServicoDoProcesso(p);
    return (servicos || []).filter(function (s) {
      return s && _temId(s) && (ids.indexOf(String(s.id)) >= 0 || (_temId(p) && _servicoDeclaraProcesso(s, p.id)));
    });
  }

  /** Itens 'Serviços' do processo cujo servico nao existe mais. */
  function servicosAusentesDoProcesso(p, servicos) {
    var existentes = {};
    (servicos || []).forEach(function (s) { if (s && _temId(s)) existentes[String(s.id)] = true; });
    return _lista(p && p.dependenciaItens).filter(function (it) { return ehServico(it) && (!_temId(it) || !existentes[String(it.id)]); });
  }

  /** Processos que o servico suporta (inverso de servicosDoProcesso). */
  function processosDoServico(s, processos) {
    if (!s || !_temId(s)) return [];
    return (processos || []).filter(function (p) {
      return p && (_idsServicoDoProcesso(p).indexOf(String(s.id)) >= 0 || (_temId(p) && _servicoDeclaraProcesso(s, p.id)));
    });
  }

  function _semDrp(categoria) {
    return CATEGORIAS_PESSOA.indexOf(categoria) >= 0 || CATEGORIAS_PROCESSO.indexOf(categoria) >= 0 || CATEGORIAS_SERVICO.indexOf(categoria) >= 0
      || CATEGORIAS_PRODUTO.indexOf(categoria) >= 0;
  }

  /**
   * O que sustenta o processo: itens diretos (4 Ps com DRP -- Fornecedores e
   * Instalacoes -- e tecnicos legados), o que os Servicos do processo usam e
   * os componentes abaixo de cada item, em qualquer profundidade. Pessoas,
   * Processos Internos e o proprio Servico ficam de fora (nao tem DRP).
   *
   * dados = { processo, dependencias, servicos }
   * Devolve [{ id, nome, categoria, dep|null, ausente, direta, legado, origens:[texto] }]
   * na ordem: diretas, via servico, componentes; depois por nome.
   */
  function cadeiaDoProcesso(dados) {
    var d = dados || {};
    var p = d.processo || {};
    var idx = _indice(d.dependencias);
    var itens = {}, ordem = [];
    var PESO = { direta: 0, servico: 1, componente: 2 };

    function registrar(ref, tipoOrigem, texto) {
      var dep = idx.resolver(ref);
      var categoria = dep ? dep.categoria : _texto(ref && ref.categoria);
      if (_semDrp(categoria)) return null;
      var chave = dep ? 'id:' + dep.id : 'nome:' + _norm(ref && ref.nome) + '|' + categoria;
      if (chave === 'nome:|') return null;
      var it = itens[chave];
      if (!it) {
        it = itens[chave] = {
          id: dep ? String(dep.id) : '', nome: dep ? _texto(dep.nome) : _texto(ref.nome), categoria: categoria,
          dep: dep, ausente: !dep, direta: false, legado: false, peso: PESO[tipoOrigem], origens: [],
        };
        ordem.push(chave);
      }
      if (tipoOrigem === 'direta') {
        it.direta = true;
        if (!categoriaPermitidaNoProcesso(categoria)) it.legado = true;
      }
      it.peso = Math.min(it.peso, PESO[tipoOrigem]);
      if (it.origens.indexOf(texto) < 0) it.origens.push(texto);
      return it;
    }

    var fila = [];
    _lista(p.dependenciaItens).forEach(function (ref) {
      if (ehServico(ref)) return;
      var legado = ref && !categoriaPermitidaNoProcesso(ref.categoria);
      var it = registrar(ref, 'direta', legado ? 'Direta (legado)' : 'Direta (BIA)');
      if (it && it.dep) fila.push(it.dep);
    });
    servicosDoProcesso(p, d.servicos).forEach(function (s) {
      (s.dependenciaItens || []).forEach(function (ref) {
        var it = registrar(ref, 'servico', 'Via serviço ' + (_texto(s.nome) || '(sem nome)'));
        if (it && it.dep) fila.push(it.dep);
      });
    });
    var expandido = {};
    while (fila.length) {
      var pai = fila.shift();
      if (expandido[pai.id]) continue;
      expandido[pai.id] = true;
      (pai.componentes || []).forEach(function (ref) {
        var it = registrar(ref, 'componente', 'Componente de ' + (_texto(pai.nome) || '(sem nome)'));
        if (it && it.dep && !expandido[it.dep.id]) fila.push(it.dep);
      });
    }

    return ordem.map(function (k) { return itens[k]; })
      .sort(function (a, b) { return (a.peso - b.peso) || a.nome.localeCompare(b.nome, 'pt-BR'); })
      .map(function (it) {
        return { id: it.id, nome: it.nome, categoria: it.categoria, dep: it.dep, ausente: it.ausente, direta: it.direta, legado: it.legado, origens: it.origens };
      });
  }

  /**
   * A dependencia e tudo que esta ACIMA dela pelos componentes:
   * { id: { dep, via } } -- via = nome do item logo abaixo no caminho (vazio
   * para a propria dependencia).
   */
  function _acimaPorComponentes(depId, idx, deps) {
    var acima = {};
    var alvo = idx.porId[String(depId)];
    if (!alvo) return acima;
    acima[String(alvo.id)] = { dep: alvo, via: '' };
    var fila = [alvo];
    while (fila.length) {
      var atual = fila.shift();
      (deps || []).forEach(function (d) {
        if (!d || !_temId(d) || acima[String(d.id)]) return;
        var contem = (d.componentes || []).some(function (ref) { var r = idx.resolver(ref); return r && String(r.id) === String(atual.id); });
        if (!contem) return;
        acima[String(d.id)] = { dep: d, via: _texto(atual.nome) };
        fila.push(d);
      });
    }
    return acima;
  }

  /**
   * Processos que dependem da dependencia, por qualquer caminho: direto
   * (inclusive legado por nome), por um item acima dela nos componentes, ou
   * por um Servico que usa ela ou algo acima dela.
   *
   * dados = { processos, servicos, dependencias }
   * Devolve [{ processo, origens:[texto] }] na ordem dos processos recebidos.
   */
  function processosQueDependemDe(depId, dados) {
    var d = dados || {};
    var deps = d.dependencias || [];
    var idx = _indice(deps);
    var acima = _acimaPorComponentes(depId, idx, deps);
    var alvo = idx.porId[String(depId)];
    if (!alvo) {
      // Fora do catalogo (removida, ou catalogo nao carregado): so o vinculo
      // direto pelo id, como antes -- nao some processo por falta de cadastro.
      return (d.processos || []).filter(function (p) {
        return p && _lista(p.dependenciaItens).some(function (ref) { return _temId(ref) && String(ref.id) === String(depId); });
      }).map(function (p) { return { processo: p, origens: ['Direta'] }; });
    }

    // O alvo esta abaixo deste item nos componentes: "via SRV-01".
    function origemDoItem(dep) {
      return String(dep.id) === String(alvo.id) ? '' : 'via ' + _texto(dep.nome);
    }
    function refAcima(ref) {
      var r = idx.resolver(ref);
      if (r && acima[String(r.id)]) return r;
      // Item legado sem id: mesmo criterio de sempre (nome, com a categoria
      // como desempate quando gravada) -- so para a propria dependencia.
      if (!_temId(ref) && ref && _texto(ref.nome) === _texto(alvo.nome) && (!_texto(ref.categoria) || ref.categoria === alvo.categoria)) return alvo;
      return null;
    }

    var servicosQueUsam = (d.servicos || []).map(function (s) {
      var usado = null;
      (s.dependenciaItens || []).forEach(function (ref) { if (!usado) usado = refAcima(ref); });
      return usado ? { servico: s, item: usado } : null;
    }).filter(Boolean);

    var saida = [];
    (d.processos || []).forEach(function (p) {
      if (!p) return;
      var origens = [];
      _lista(p.dependenciaItens).forEach(function (ref) {
        if (ehServico(ref) || CATEGORIAS_PROCESSO.indexOf(ref && ref.categoria) >= 0) return;
        var r = refAcima(ref);
        if (!r) return;
        var o = origemDoItem(r);
        var texto = o ? 'Direta (' + o + ')' : 'Direta';
        if (origens.indexOf(texto) < 0) origens.push(texto);
      });
      servicosQueUsam.forEach(function (x) {
        if (processosDoServico(x.servico, [p]).length) {
          var o = origemDoItem(x.item);
          var texto = 'Via serviço ' + (_texto(x.servico.nome) || '(sem nome)') + (o ? ' (' + o + ')' : '');
          if (origens.indexOf(texto) < 0) origens.push(texto);
        }
      });
      if (origens.length) saida.push({ processo: p, origens: origens });
    });
    return saida;
  }

  /** Servicos cuja composicao contem a dependencia (direto ou por componentes) -- sugestao de troca do legado. */
  function servicosQueContem(depId, servicos, dependencias) {
    var idx = _indice(dependencias);
    var alvo = idx.porId[String(depId)];
    if (!alvo) return [];
    return (servicos || []).filter(function (s) {
      var cadeia = cadeiaDoProcesso({ processo: { id: '', dependenciaItens: [{ categoria: CATEGORIA_SERVICO, id: s.id, nome: s.nome }] }, servicos: [s], dependencias: dependencias });
      return cadeia.some(function (it) { return it.id === String(alvo.id); });
    });
  }

  function ehProduto(item) {
    return !!item && CATEGORIAS_PRODUTO.indexOf(item.categoria) >= 0;
  }

  function ehPessoa(item) {
    return !!item && CATEGORIAS_PESSOA.indexOf(item.categoria) >= 0;
  }

  /** Pessoas de um produto: [{ pessoa, funcoes: [rotulo] }], pelas 4 funcoes marcadas com o id dele. */
  function pessoasDoProduto(produtoId, pessoas) {
    var id = String(produtoId);
    var saida = [];
    (pessoas || []).forEach(function (p) {
      if (!p || !_temId(p) || CATEGORIAS_PESSOA.indexOf(p.categoria) < 0) return;
      var funcoes = FUNCOES_PRODUTO.filter(function (f) {
        return p[f[0]] && _lista(p[f[0] + 'Produtos']).map(String).indexOf(id) >= 0;
      }).map(function (f) { return f[1]; });
      if (funcoes.length) saida.push({ pessoa: p, funcoes: funcoes });
    });
    return saida;
  }

  /** Item de Pessoa so herdado (sem escolha manual)? Pessoa sem herdadoDe (antiga) e manual. */
  function soHerdada(item) {
    return ehPessoa(item) && Array.isArray(item.herdadoDe) && item.herdadoDe.length > 0 && item.manual !== true;
  }

  /**
   * Recalcula as Pessoas herdadas dos Produtos e Servicos que estao em `itens`
   * (processo.dependenciaItens). dados = { pessoas (catalogo, com as funcoes),
   * servicos (com stakeholders) }. Nao altera `itens`: devolve
   * { itens, adicionadas: [nomes], removidas: [nomes], alteradas: n }.
   */
  function sincronizarPessoasHerdadas(itens, dados) {
    var d = dados || {};
    var lista = _lista(itens);
    var pessoasPorId = {};
    (d.pessoas || []).forEach(function (p) { if (p && _temId(p)) pessoasPorId[String(p.id)] = p; });
    var servicosPorId = {};
    (d.servicos || []).forEach(function (s) { if (s && _temId(s)) servicosPorId[String(s.id)] = s; });

    // pessoaId -> { nome, origens: [...] }, na ordem das origens.
    var herdadas = {}, ordem = [];
    function herdar(pessoaId, nome, origem) {
      var k = String(pessoaId);
      if (!herdadas[k]) { herdadas[k] = { nome: nome, origens: [] }; ordem.push(k); }
      herdadas[k].origens.push(origem);
    }
    lista.forEach(function (it) {
      if (ehProduto(it) && _temId(it)) {
        pessoasDoProduto(it.id, d.pessoas).forEach(function (x) {
          herdar(x.pessoa.id, _texto(x.pessoa.nome), { tipo: 'produto', id: String(it.id), nome: _texto(it.nome), funcoes: x.funcoes });
        });
      } else if (ehServico(it) && _temId(it)) {
        var s = servicosPorId[String(it.id)];
        _lista(s && s.stakeholders).forEach(function (st) {
          if (!st || !_temId(st)) return;
          var p = pessoasPorId[String(st.id)];
          herdar(st.id, _texto(p ? p.nome : st.nome), { tipo: 'servico', id: String(it.id), nome: _texto(s.nome || it.nome), funcoes: ['Stakeholder'] });
        });
      }
    });

    var adicionadas = [], removidas = [], alteradas = 0;
    var presentes = {};
    var saida = [];
    lista.forEach(function (it) {
      if (!ehPessoa(it) || !_temId(it)) { saida.push(it); return; }
      var k = String(it.id);
      presentes[k] = true;
      var h = herdadas[k];
      var antes = JSON.stringify(it.herdadoDe || []);
      if (!h) {
        if (soHerdada(it)) { removidas.push(_texto(it.nome)); return; }
        var semHeranca = Object.assign({}, it);
        delete semHeranca.herdadoDe;
        if (antes !== '[]') alteradas++;
        saida.push(semHeranca);
        return;
      }
      var novo = Object.assign({}, it, { herdadoDe: h.origens });
      // Pessoa que ja estava sem heranca (antiga ou escolhida a mao) continua manual.
      if (!Array.isArray(it.herdadoDe) || !it.herdadoDe.length) novo.manual = true;
      if (JSON.stringify(novo.herdadoDe) !== antes || novo.manual !== it.manual) alteradas++;
      saida.push(novo);
    });
    ordem.forEach(function (k) {
      if (presentes[k]) return;
      var h = herdadas[k];
      saida.push({ categoria: 'Pessoas', id: k, nome: h.nome, herdadoDe: h.origens });
      adicionadas.push(h.nome);
    });
    return { itens: saida, adicionadas: adicionadas, removidas: removidas, alteradas: alteradas };
  }

  return {
    CATEGORIA_SERVICO: CATEGORIA_SERVICO,
    CATEGORIA_PRODUTO: CATEGORIA_PRODUTO,
    CATEGORIAS_DIRETAS: CATEGORIAS_DIRETAS,
    FUNCOES_PRODUTO: FUNCOES_PRODUTO,
    ehProduto: ehProduto,
    ehPessoa: ehPessoa,
    pessoasDoProduto: pessoasDoProduto,
    soHerdada: soHerdada,
    sincronizarPessoasHerdadas: sincronizarPessoasHerdadas,
    ehServico: ehServico,
    ehTecnicoDireto: ehTecnicoDireto,
    categoriaPermitidaNoProcesso: categoriaPermitidaNoProcesso,
    servicosDoProcesso: servicosDoProcesso,
    servicosAusentesDoProcesso: servicosAusentesDoProcesso,
    processosDoServico: processosDoServico,
    cadeiaDoProcesso: cadeiaDoProcesso,
    processosQueDependemDe: processosQueDependemDe,
    servicosQueContem: servicosQueContem,
  };
}));
