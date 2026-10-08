/**
 * Decide o que fazer com o risco automatico de uma Vulnerabilidade.
 *
 * MESMO MECANISMO de fornecedorRisco.js, mesmos dois motivos pra viver no
 * servidor e nao na tela: quem cadastra Vulnerabilidade (Seguranca da
 * Informacao) nao tem — nem deveria precisar ter — acesso de escrita a
 * /riscos (`firestore.rules`: `match /riscos/{id} { allow write: if
 * isAdmin(); }`), e nao pode existir um caminho que grave a vulnerabilidade e
 * esqueca o risco se o navegador fechar no meio do caminho.
 *
 * DIFERENCA DO FORNECEDOR: uma avaliacao de fornecedor e um documento novo e
 * imutavel a cada avaliacao; uma Vulnerabilidade e UM documento so, editado
 * no lugar ao longo do tempo (o Status da Correcao muda de "Aberto" pra
 * "Corrigida" quando o time resolve). Por isso o gatilho que chama este
 * modulo roda em CRIACAO E EDICAO (onDocumentWritten), nao so criacao.
 *
 * Este arquivo tem so a decisao, sem Firestore, para poder ser testado.
 */

/** A partir daqui a vulnerabilidade abre risco. Bandas NVD: 7.0 = piso de "Alta". */
const LIMIAR_CVSS_PADRAO = 7.0;

/** Marca do risco criado por este caminho. */
const ORIGEM = 'Vulnerabilidade';

/**
 * Categoria dentro da lista fechada do registro de riscos. "Operacional" cita
 * explicitamente "falha de sistema, indisponibilidade de infraestrutura" como
 * exemplo na propria tela -- o encaixe natural de uma vulnerabilidade tecnica.
 * Gravar fora da lista faz o campo abrir vazio na tela e o proximo salvamento
 * apaga o valor em silencio.
 */
const CATEGORIA = 'Operacional';

/**
 * Enquanto o Status da Correcao estiver numa destas, a vulnerabilidade NUNCA
 * abre risco (e fecha o que estiver aberto) -- decisao do usuario: sem isso,
 * importar o historico da planilha (maioria ja corrigida/aceita) abriria
 * riscos de itens resolvidos ha meses.
 */
const STATUS_FECHADOS_CORRECAO = ['Corrigida', 'Aceita'];

/** Status que contam como risco automatico ainda em aberto. */
const STATUS_FECHADOS_RISCO = ['Aceito', 'Encerrado'];

/** Valor representativo de cada faixa manual, SO para comparar com o limiar -- nunca gravado. */
const NOTA_REPRESENTATIVA_POR_SEVERIDADE = { 'Crítica': 9.5, 'Alta': 7.5, 'Média': 5, 'Baixa': 2 };

/** Numero, ou null quando nao ha numero. Number(null)/Number('') valem ZERO em JS -- mesma armadilha de fornecedorRisco.js. */
function _numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function _limiar(valor) {
  const n = _numero(valor);
  return n !== null && n >= 0 && n <= 10 ? n : LIMIAR_CVSS_PADRAO;
}

/**
 * "Nota" para comparar com o limiar: o CVSS quando numerico; senao um valor
 * representativo da severidade escolhida a mao (mesma logica de
 * public/vulnerabilidade-severidade.js: CVSS manda, severidade manual so e
 * fallback). null quando nao ha nem CVSS nem severidade.
 */
function _nota(vulnerabilidade) {
  const v = vulnerabilidade || {};
  const cvss = _numero(v.cvss);
  if (cvss !== null) return cvss;
  return NOTA_REPRESENTATIVA_POR_SEVERIDADE[v.severidadeManual] || null;
}

function acimaDoLimiar(nota, limiar) {
  const n = _numero(nota);
  if (n === null) return false;
  return n >= _limiar(limiar);
}

/** Riscos automaticos desta vulnerabilidade que ainda estao em aberto. */
function riscosAbertosDaVulnerabilidade(riscos, vulnerabilidadeId) {
  const vid = String(vulnerabilidadeId || '');
  if (!vid) return [];
  return (riscos || []).filter((r) => r
    && String(r.vulnerabilidadeId || '') === vid
    && r.origem === ORIGEM
    && STATUS_FECHADOS_RISCO.indexOf(String(r.status || '')) === -1);
}

/**
 * Monta os campos do risco a partir de uma vulnerabilidade -- usada tanto
 * pela abertura AUTOMATICA (`decidir()`, abaixo, gatilho por limiar) quanto
 * pela importacao MANUAL (acao `importarVulnerabilidadeParaRisco`,
 * appLogic.js, disparada por um botao na tela, sem checar limiar nem status
 * da correcao -- e uma decisao explicita de quem esta olhando o cadastro).
 * `opts.manual` so muda o texto da descricao (o resto dos campos e
 * identico), pra deixar claro na tela do Risco como ele nasceu.
 */
function construirRisco(vulnerabilidade, opts) {
  const o = opts || {};
  const v = vulnerabilidade || {};
  const id = String(v.id || '');
  const data = String(o.hoje || new Date().toISOString()).slice(0, 10);
  const nome = String(v.nome || v.codigo || id);
  const cvssOuSeveridade = _numero(v.cvss) !== null ? v.cvss : (v.severidadeManual || 'não informado');
  const motivo = o.manual
    ? 'Risco criado manualmente a partir do cadastro da vulnerabilidade.'
    : `Severidade no ou acima do limiar de ${_limiar(o.limiar)} configurado para abertura automática.`;
  return {
    // Vulnerabilidade tecnica nao pertence a uma area de negocio: entra como
    // risco corporativo (mesmo tratamento do risco de Fornecedor).
    area: '',
    titulo: `Vulnerabilidade "${nome}" em ${v.produto || 'produto não informado'} (CVSS ${cvssOuSeveridade})`,
    descricao: `A vulnerabilidade "${nome}"${v.cwe ? ` (${v.cwe})` : ''}${v.cve ? ` (${v.cve})` : ''} foi registrada com severidade ${cvssOuSeveridade}. ${motivo} ${v.descricao || ''}`.trim(),
    categoria: CATEGORIA,
    responsavel: '',
    dataIdentificacao: data,
    status: 'Identificado',
    origem: ORIGEM,
    vulnerabilidadeId: id,
    vulnerabilidadeCodigo: v.codigo || '',
    // A probabilidade vem da disponibilidade de exploit publico; o IMPACTO
    // fica vazio de proposito -- mesma filosofia do risco de Fornecedor: o
    // quanto doi e decisao de gente, nao e inferido so pela severidade.
    probabilidade: String(v.exploitDisponivel || '') === 'Sim' ? 'Alta' : 'Média',
    planoAcao: [],
    kris: [],
  };
}

/**
 * O que fazer depois de uma vulnerabilidade ser criada/editada.
 *
 * Devolve { acao: 'abrir' | 'encerrar' | 'nada', ... }.
 *
 * 'nada' cobre: vulnerabilidade sem id, sem CVSS/severidade, ja corrigida/
 * aceita sem risco aberto, severidade abaixo do limiar, ou severidade acima
 * do limiar mas risco JA aberto (nao duplica a cada edicao).
 */
function decidir({ vulnerabilidade, riscos, limiar, hoje }) {
  const v = vulnerabilidade || {};
  const id = String(v.id || '');
  if (!id) return { acao: 'nada', motivo: 'vulnerabilidade sem id' };

  const abertos = riscosAbertosDaVulnerabilidade(riscos, id);
  const data = String(hoje || new Date().toISOString()).slice(0, 10);
  const statusCorrecao = String(v.statusCorrecao || '');
  const nome = String(v.nome || v.codigo || id);

  // Corrigida/Aceita: nunca abre; encerra o que estiver aberto.
  if (STATUS_FECHADOS_CORRECAO.indexOf(statusCorrecao) !== -1) {
    if (!abertos.length) return { acao: 'nada', motivo: 'corrigida/aceita e sem risco aberto' };
    return {
      acao: 'encerrar',
      ids: abertos.map((r) => r.id),
      patch: {
        status: 'Encerrado',
        dataEncerramento: data,
        justificativaEncerramento: `Encerrado automaticamente: a vulnerabilidade "${nome}" foi marcada como "${statusCorrecao}".`,
      },
    };
  }

  const nota = _nota(v);
  if (nota === null) return { acao: 'nada', motivo: 'sem CVSS nem severidade informados' };

  const lim = _limiar(limiar);
  if (!acimaDoLimiar(nota, lim)) {
    return { acao: 'nada', motivo: 'severidade abaixo do limiar' };
  }

  if (abertos.length) return { acao: 'nada', motivo: 'já existe risco aberto para esta vulnerabilidade' };

  return {
    acao: 'abrir',
    risco: construirRisco(v, { hoje: data, limiar: lim }),
  };
}

module.exports = {
  LIMIAR_CVSS_PADRAO,
  ORIGEM,
  CATEGORIA,
  STATUS_FECHADOS_CORRECAO,
  STATUS_FECHADOS_RISCO,
  acimaDoLimiar,
  riscosAbertosDaVulnerabilidade,
  construirRisco,
  decidir,
};
