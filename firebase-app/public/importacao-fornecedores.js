/**
 * Importacao de fornecedores por CSV (27/10/2026).
 *
 * DECISOES (Hercules):
 *   - Os fornecedores da planilha entram INATIVOS (aba Inativos da tela de
 *     Fornecedores) e ficam a disposicao ate alguem ativa-los.
 *   - Linhas do mesmo fornecedor (aditivos, informativos de reajuste) viram UM
 *     fornecedor so, agrupadas pelo NOME normalizado -- os CNPJs da planilha
 *     variam entre linhas do mesmo fornecedor, o nome e mais confiavel.
 *   - Fornecedor que ja existe na base (mesmo CNPJ valido ou mesmo nome) NAO e
 *     importado: aparece na previa como "ja existe".
 *   - Os dados de contrato da planilha (prazo em texto livre, setor, gestor,
 *     reajuste...) NAO viram contrato: ficam no fornecedor como referencia
 *     (`importacao.linhas`), so leitura.
 *
 * Puro, sem DOM e sem Firestore. Le o CSV com o parser de inventario-csv.js
 * (RFC 4180). Tambem exporta como CommonJS para o teste
 * (tests/importacao-fornecedores.test.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./inventario-csv.js'));
  } else {
    root.ImportacaoFornecedores = factory(root.InventarioCsv);
  }
}(typeof self !== 'undefined' ? self : this, function (InventarioCsv) {
  'use strict';

  var PAPEL_GESTOR = 'Gestor (anterior ao contrato)';

  // Campos reconhecidos pelo cabecalho. Sinonimos ja normalizados (minusculas,
  // sem acento, so letras e numeros). So o nome do fornecedor e obrigatorio.
  var CAMPOS = [
    { chave: 'numeracao', rotulo: 'Numeração', sinonimos: ['numeracao', 'numero', 'n', 'item', 'id', 'codigo'] },
    { chave: 'empresaContratante', rotulo: 'Empresa contratante', sinonimos: ['empresacontratante', 'contratante', 'empresa'] },
    { chave: 'fornecedor', rotulo: 'Fornecedor', obrigatorio: true, sinonimos: ['fornecedor', 'razaosocial', 'nomedofornecedor', 'contratada', 'nome'] },
    { chave: 'cnpj', rotulo: 'CNPJ', sinonimos: ['cnpjdofornecedor', 'cnpj', 'cnpjcpf', 'documento'] },
    { chave: 'dataAssinatura', rotulo: 'Data de assinatura', sinonimos: ['datadeassinatura', 'assinatura', 'dataassinatura', 'data'] },
    { chave: 'prazo', rotulo: 'Prazo / vigência', sinonimos: ['prazo', 'vigencia', 'prazodevigencia'] },
    { chave: 'descricao', rotulo: 'Descrição', sinonimos: ['descricao', 'objeto', 'servico', 'descricaodoservico'] },
    { chave: 'setor', rotulo: 'Setor responsável', sinonimos: ['setorresponsavel', 'setor', 'area', 'arearesponsavel'] },
    { chave: 'gestor', rotulo: 'Gestor', sinonimos: ['gestor', 'gestordocontrato', 'responsavel'] },
    { chave: 'indiceReajuste', rotulo: 'Índice de reajuste', sinonimos: ['indicedereajuste', 'indice', 'indexador', 'indicereajuste'] },
    { chave: 'mesReajuste', rotulo: 'Mês de reajuste', sinonimos: ['mesdereajuste', 'mesreajuste', 'mesdecorrecao'] },
    { chave: 'analiseJuridico', rotulo: 'Análise do jurídico', sinonimos: ['analisedojuridico', 'juridico', 'analisejuridica'] },
    { chave: 'validacaoSI', rotulo: 'Validação Segurança da Informação', sinonimos: ['validacaosegurancadainformacao', 'validacaosi', 'segurancadainformacao'] },
    { chave: 'assinado', rotulo: 'Assinado?', sinonimos: ['assinado'] },
    { chave: 'contratoAtivo', rotulo: 'Contrato ativo?', sinonimos: ['contratoativo', 'ativo'] },
  ];

  function _chave(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  }

  function _limpo(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  /** Nome comparavel: sem acento, maiuscula, pontuacao nem espaco sobrando ("LTDA." = "LTDA"). */
  function nomeComparavel(nome) {
    return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function digitos(v) {
    return String(v || '').replace(/\D/g, '');
  }

  /** CNPJ valido para esta importacao = 14 digitos (a planilha e sanitizada: digito verificador nao e conferido). */
  function cnpjValido(v) {
    return digitos(v).length === 14;
  }

  function formatarCnpj(v) {
    var d = digitos(v).slice(0, 14);
    if (d.length !== 14) return '';
    return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12, 14);
  }

  /** { cabecalho, linhas } do texto do CSV. */
  function lerCsv(texto) {
    var todas = InventarioCsv.parseCsv(texto);
    return { cabecalho: (todas[0] || []).map(_limpo), linhas: todas.slice(1) };
  }

  /** { campo: indice } pelo nome das colunas: primeiro o nome exato, depois "contem". Cada coluna serve a um campo. */
  function mapear(cabecalho) {
    var chaves = (cabecalho || []).map(_chave);
    var usadas = {};
    var mapa = {};
    CAMPOS.forEach(function (c) {
      var i = chaves.findIndex(function (k, idx) { return !usadas[idx] && c.sinonimos.indexOf(k) >= 0; });
      if (i >= 0) { mapa[c.chave] = i; usadas[i] = true; }
    });
    CAMPOS.forEach(function (c) {
      if (mapa[c.chave] !== undefined) return;
      var i = chaves.findIndex(function (k, idx) {
        return !usadas[idx] && k && c.sinonimos.some(function (s) { return s.length > 3 && k.indexOf(s) >= 0; });
      });
      if (i >= 0) { mapa[c.chave] = i; usadas[i] = true; }
    });
    return mapa;
  }

  /** Campos obrigatorios sem coluna. */
  function faltando(mapa) {
    return CAMPOS.filter(function (c) { return c.obrigatorio && (mapa || {})[c.chave] === undefined; });
  }

  /** Linhas do CSV como objetos { campo: texto } (so as com nome de fornecedor). */
  function registros(linhas, mapa) {
    return (linhas || []).map(function (l) {
      var r = {};
      CAMPOS.forEach(function (c) { r[c.chave] = mapa[c.chave] !== undefined ? _limpo(l[mapa[c.chave]]) : ''; });
      return r;
    }).filter(function (r) { return r.fornecedor; });
  }

  /** "199.10" vem depois de "199.9": compara parte a parte, como numero. */
  function _compararNumeracao(a, b) {
    var pa = String(a || '').split('.'), pb = String(b || '').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
      if (isNaN(x) || isNaN(y)) return String(a).localeCompare(String(b));
      if (x !== y) return x - y;
    }
    return 0;
  }

  /**
   * Previa da importacao.
   * opts: { existentes: [fornecedor da base], areas: [{nome}], pessoas: [{id, nome}] }
   * Devolve { itens: [...], contagem: { linhas, fornecedores, novos, existentes, cnpjRevisar } }.
   * Cada item: { chave, nome, situacao: 'novo'|'existe', existente, cnpj, cnpjRevisar, motivoCnpj,
   *              detalhes, linhas, areasRelacionadas, pessoasRelacionadas }.
   */
  function analisar(regs, opts) {
    var o = opts || {};
    var existentes = o.existentes || [];
    var porNome = {};
    var porCnpj = {};
    existentes.forEach(function (f) {
      [f.nome, f.nomeFantasia].forEach(function (n) { var k = nomeComparavel(n); if (k && !porNome[k]) porNome[k] = f; });
      var d = digitos(f.cnpj);
      if (d.length === 14 && !porCnpj[d]) porCnpj[d] = f;
    });
    var areas = o.areas || [];
    var pessoas = o.pessoas || [];

    var grupos = [];
    var idx = {};
    (regs || []).forEach(function (r) {
      var k = nomeComparavel(r.fornecedor);
      if (!k) return;
      if (idx[k] === undefined) { idx[k] = grupos.length; grupos.push({ chave: k, linhas: [] }); }
      grupos[idx[k]].linhas.push(r);
    });

    var itens = grupos.map(function (g) {
      var linhas = g.linhas.slice().sort(function (a, b) { return _compararNumeracao(a.numeracao, b.numeracao); });
      var principal = linhas[0];
      var validos = [];
      var invalidas = 0;
      linhas.forEach(function (l) {
        if (cnpjValido(l.cnpj)) { var d = digitos(l.cnpj); if (validos.indexOf(d) < 0) validos.push(d); } else invalidas++;
      });
      var motivo = '';
      if (!validos.length) motivo = 'CNPJ ausente ou com tamanho errado';
      else if (validos.length > 1) motivo = 'CNPJ diferente entre as linhas da planilha';
      else if (invalidas) motivo = 'uma das linhas tem CNPJ ausente ou com tamanho errado';

      var existente = porNome[g.chave] || validos.map(function (d) { return porCnpj[d]; }).filter(Boolean)[0] || null;

      var areasRel = [];
      linhas.forEach(function (l) {
        var a = areas.find(function (x) { return nomeComparavel(x.nome) === nomeComparavel(l.setor); });
        if (l.setor && a && areasRel.indexOf(a.nome) < 0) areasRel.push(a.nome);
      });
      var pessoasRel = [];
      linhas.forEach(function (l) {
        if (!l.gestor) return;
        var achadas = pessoas.filter(function (p) { return nomeComparavel(p.nome) === nomeComparavel(l.gestor); });
        if (achadas.length === 1 && !pessoasRel.some(function (p) { return String(p.id) === String(achadas[0].id); })) {
          pessoasRel.push({ id: achadas[0].id, nome: achadas[0].nome, papel: PAPEL_GESTOR });
        }
      });

      return {
        chave: g.chave,
        nome: principal.fornecedor,
        situacao: existente ? 'existe' : 'novo',
        existente: existente ? { id: existente.id, nome: existente.nome, ativo: existente.ativo !== false } : null,
        cnpj: validos.length ? formatarCnpj(validos[0]) : '',
        cnpjRevisar: !!motivo,
        motivoCnpj: motivo,
        detalhes: principal.descricao || '',
        linhas: linhas,
        areasRelacionadas: areasRel,
        pessoasRelacionadas: pessoasRel,
      };
    });

    return {
      itens: itens,
      contagem: {
        linhas: (regs || []).length,
        fornecedores: itens.length,
        novos: itens.filter(function (i) { return i.situacao === 'novo'; }).length,
        existentes: itens.filter(function (i) { return i.situacao === 'existe'; }).length,
        cnpjRevisar: itens.filter(function (i) { return i.situacao === 'novo' && i.cnpjRevisar; }).length,
      },
    };
  }

  /** O que vai para o banco de um item novo (api.js grava como inativo). */
  function paraImportar(item, origem) {
    return {
      nome: item.nome,
      cnpj: item.cnpj,
      detalhes: item.detalhes,
      areasRelacionadas: item.areasRelacionadas,
      pessoasRelacionadas: item.pessoasRelacionadas,
      importacao: {
        origem: String(origem || ''),
        cnpjRevisar: item.motivoCnpj || '',
        linhas: item.linhas.map(function (l) {
          var x = {};
          CAMPOS.forEach(function (c) { if (c.chave !== 'fornecedor') x[c.chave] = l[c.chave] || ''; });
          return x;
        }),
      },
    };
  }

  return {
    CAMPOS: CAMPOS,
    PAPEL_GESTOR: PAPEL_GESTOR,
    nomeComparavel: nomeComparavel,
    cnpjValido: cnpjValido,
    formatarCnpj: formatarCnpj,
    lerCsv: lerCsv,
    mapear: mapear,
    faltando: faltando,
    registros: registros,
    analisar: analisar,
    paraImportar: paraImportar,
  };
}));
