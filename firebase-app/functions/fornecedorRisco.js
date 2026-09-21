/**
 * Decide o que fazer com o risco automatico do fornecedor.
 *
 * POR QUE ISTO VIVE NO SERVIDOR, E NAO NA TELA
 *
 * A primeira versao (21/09/2026) abria e encerrava o risco pelo navegador,
 * depois de gravar a avaliacao. Duas coisas estavam erradas nisso:
 *
 *   1. Exigia que quem avalia tambem pudesse escrever em /riscos. Isso obrigaria
 *      a dar acesso a todo o registro de riscos da empresa para a pessoa da
 *      Seguranca da Informacao que so precisa avaliar fornecedor. Permissao
 *      concedida por necessidade tecnica, nao por necessidade real.
 *   2. Se o navegador fechasse entre gravar a avaliacao e gravar o risco, a
 *      avaliacao ficava sem risco e ninguem saberia. O mesmo tipo de caminho
 *      escondido que ja mordeu este projeto duas vezes.
 *
 * Com a decisao no servidor, disparada pela propria gravacao da avaliacao, nao
 * existe caminho que grave avaliacao e esqueca o risco — e quem avalia nao
 * precisa de acesso nenhum a /riscos.
 *
 * Este arquivo tem so a decisao, sem Firestore, para poder ser testado.
 */

/** Abaixo disto o fornecedor abre risco. Espelha public/fornecedor-score.js. */
const LIMIAR_RISCO_PADRAO = 70;

/** Marca do risco criado por este caminho. */
const ORIGEM = 'Fornecedor';

/**
 * Categoria dentro da lista fechada do registro de riscos.
 *
 * Falha de conformidade de fornecedor (certificacao, DPO, auditoria) e
 * Regulatorio/Legal. Gravar categoria fora da lista faz o campo abrir vazio na
 * tela e o proximo salvamento apaga o valor em silencio.
 */
const CATEGORIA = 'Regulatório/Legal';

/** Status que contam como risco ainda em aberto. */
const STATUS_FECHADOS = ['Aceito', 'Encerrado'];

/**
 * Numero, ou null quando nao ha numero.
 *
 * Number(null) e Number('') valem ZERO em JavaScript. E a TERCEIRA vez que essa
 * armadilha aparece neste projeto: ja transformou mes sem dado em 0% no livro de
 * medicoes, ja daria "vencida em 1971" para fornecedor nunca avaliado, e aqui
 * faria duas coisas ao mesmo tempo — avaliacao sem nota abriria risco (nota 0),
 * e limiar em branco viraria limiar 0, que nunca abre risco nenhum.
 *
 * Toda leitura de numero neste arquivo passa por aqui.
 */
function _numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function _limiar(valor) {
  const n = _numero(valor);
  return n !== null && n >= 0 && n <= 100 ? n : LIMIAR_RISCO_PADRAO;
}

function _nota(valor) {
  return _numero(valor);
}

function abaixoDoLimiar(nota, limiar) {
  const n = _nota(nota);
  if (n === null) return false;
  return n < _limiar(limiar);
}

/** Riscos automaticos deste fornecedor que ainda estao em aberto. */
function riscosAbertosDoFornecedor(riscos, fornecedorId) {
  const fid = String(fornecedorId || '');
  if (!fid) return [];
  return (riscos || []).filter((r) => r
    && String(r.fornecedor || '') === fid
    && r.origem === ORIGEM
    && STATUS_FECHADOS.indexOf(String(r.status || '')) === -1);
}

/**
 * O que fazer depois de uma avaliacao.
 *
 * Devolve { acao: 'abrir' | 'encerrar' | 'nada', ... }.
 *
 * 'nada' cobre tres casos legitimos e diferentes: avaliacao sem nota, nota boa
 * sem risco aberto, e nota ruim com risco JA aberto (nao duplica a cada
 * reavaliacao).
 */
function decidir({ avaliacao, fornecedor, riscos, limiar, hoje }) {
  const nota = _nota(avaliacao && avaliacao.nota);
  const fornecedorId = String((avaliacao && avaliacao.fornecedorId) || '');
  if (!fornecedorId) return { acao: 'nada', motivo: 'avaliação sem fornecedor' };
  if (nota === null) return { acao: 'nada', motivo: 'avaliação sem nota' };

  const lim = _limiar(limiar);
  const abertos = riscosAbertosDoFornecedor(riscos, fornecedorId);
  const nome = String((avaliacao && avaliacao.fornecedorNome) || (fornecedor && fornecedor.nome) || fornecedorId);
  const data = String(hoje || new Date().toISOString()).slice(0, 10);

  if (abaixoDoLimiar(nota, lim)) {
    if (abertos.length) return { acao: 'nada', motivo: 'já existe risco aberto para este fornecedor' };
    const empresa = fornecedor && fornecedor.empresa ? ` (${fornecedor.empresa})` : '';
    return {
      acao: 'abrir',
      risco: {
        // Fornecedor nao pertence a uma area: entra como risco corporativo.
        area: '',
        titulo: `Fornecedor "${nome}" com nota de conformidade ${nota}`,
        descricao: `A avaliação do fornecedor "${nome}"${empresa} resultou em nota ${nota} de 100, abaixo do limiar de ${lim}. Informe o impacto para este risco entrar na carga de risco da empresa.`,
        categoria: CATEGORIA,
        responsavel: '',
        dataIdentificacao: data,
        status: 'Identificado',
        origem: ORIGEM,
        fornecedor: fornecedorId,
        fornecedorNome: nome,
        // A probabilidade vem da nota; o IMPACTO fica vazio de proposito: o
        // quanto doi se este fornecedor falhar e decisao de gente. Enquanto
        // estiver vazio, o risco aparece no registro e no aviso do painel, e
        // nao move a carga.
        probabilidade: nota < 50 ? 'Alta' : 'Média',
        planoAcao: [],
        kris: [],
      },
    };
  }

  if (!abertos.length) return { acao: 'nada', motivo: 'nota no aceitável e nenhum risco aberto' };
  return {
    acao: 'encerrar',
    ids: abertos.map((r) => r.id),
    patch: {
      status: 'Encerrado',
      dataEncerramento: data,
      justificativaEncerramento: `Encerrado automaticamente: a nota de conformidade do fornecedor "${nome}" voltou para ${nota}, no aceitável (limiar ${lim}).`,
    },
  };
}

module.exports = {
  LIMIAR_RISCO_PADRAO,
  ORIGEM,
  CATEGORIA,
  STATUS_FECHADOS,
  abaixoDoLimiar,
  riscosAbertosDoFornecedor,
  decidir,
};
