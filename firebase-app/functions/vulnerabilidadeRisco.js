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
 * no lugar ao longo do tempo (o Status da Correcao muda de "Pendente" pra
 * "Corrigida" quando o time resolve). Por isso o gatilho que chama este
 * modulo roda em CRIACAO E EDICAO (onDocumentWritten), nao so criacao.
 *
 * Este arquivo tem so a decisao, sem Firestore, para poder ser testado.
 *
 * DECISAO 15/10/2026 (NIST SP 800-30/800-37/800-40, CSF 2.0): o risco deixa de
 * ser so "abre e fecha". Enquanto existir, ele ACOMPANHA a vulnerabilidade:
 *   - impacto/area/processo vem da cadeia Vulnerabilidade -> Dependencia afetada
 *     -> Processo de Negocio -> Tier do BIA (impacto no negocio, SP 800-30);
 *     sem processo afetado, pela severidade;
 *   - probabilidade (exploit), responsavel e o item de correcao do plano de acao
 *     (5W2H) seguem a vulnerabilidade;
 *   - status: Pendente -> Identificado, Em Correcao -> Em Tratamento (Mitigar),
 *     Aceita -> Aceito (Aceitar; continua contando, NIST trata aceitar como
 *     resposta ao risco), Corrigida -> Encerrado;
 *   - EDICAO HUMANA VENCE: o risco guarda em `sincronizado` o ultimo valor que a
 *     automacao escreveu em cada campo; campo que alguem mudou na tela deixa de
 *     ser sincronizado.
 */

const historicoRisco = require('./historicoRisco');
const escalaRisco = require('./escalaRisco');

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
 * DECISAO 15/10/2026: a categoria segue o Tipo da vulnerabilidade. Nao
 * Conformidade (licenca, LGPD, politica interna, PCI-DSS) e risco de
 * descumprimento de norma -- "Regulatório/Legal" na mesma lista fechada de
 * RISCO_CATEGORIAS (app.js). Qualquer outro tipo, ou sem tipo, continua
 * Operacional. O texto do tipo espelha VULNERABILIDADE_TIPOS em app.js.
 */
const TIPO_NAO_CONFORMIDADE = 'Não Conformidade';
const CATEGORIA_NAO_CONFORMIDADE = 'Regulatório/Legal';

function categoriaDoRisco(vulnerabilidade) {
  const tipo = String((vulnerabilidade && vulnerabilidade.tipo) || '');
  return tipo === TIPO_NAO_CONFORMIDADE ? CATEGORIA_NAO_CONFORMIDADE : CATEGORIA;
}

/**
 * Enquanto o Status da Correcao estiver numa destas, a vulnerabilidade NUNCA
 * abre risco (e fecha o que estiver aberto) -- decisao do usuario: sem isso,
 * importar o historico da planilha (maioria ja corrigida/aceita) abriria
 * riscos de itens resolvidos ha meses.
 */
const STATUS_FECHADOS_CORRECAO = ['Corrigida', 'Aceita'];

/**
 * Status em que o risco da vulnerabilidade ja nao esta ativo. So Encerrado:
 * desde 15/10/2026 um risco Aceito continua ativo (conta na carga, e reavaliado
 * e e atualizado quando a vulnerabilidade muda) -- aceitar e uma resposta ao
 * risco, nao o fim dele.
 */
const STATUS_FECHADOS_RISCO = ['Encerrado'];

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

/** Riscos desta vulnerabilidade ainda ativos (qualquer status menos Encerrado). */
function riscosAbertosDaVulnerabilidade(riscos, vulnerabilidadeId) {
  const vid = String(vulnerabilidadeId || '');
  if (!vid) return [];
  return (riscos || []).filter((r) => r
    && String(r.vulnerabilidadeId || '') === vid
    && r.origem === ORIGEM
    && STATUS_FECHADOS_RISCO.indexOf(String(r.status || '')) === -1);
}

/** Texto comparavel: sem acento, sem maiuscula, sem espaco sobrando. */
function _comparavel(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * "Onde" a vulnerabilidade esta, para o titulo do risco: o Produto de Software
 * vinculado (nome vindo do catalogo) e o Ativo afetado (texto livre `produto`),
 * sem repetir quando sao o mesmo nome. Nenhum dos dois -> 'produto não informado'.
 */
function _localDaVulnerabilidade(v, produtoNome) {
  const partes = [];
  // Dependencias afetadas (15/10/2026) substituem o texto livre `produto`; sem
  // nenhuma, cai no texto antigo (legado).
  const deps = (Array.isArray(v && v.dependenciasAfetadas) ? v.dependenciasAfetadas : []).map((d) => d && d.nome).filter(Boolean);
  [produtoNome, ...(deps.length ? deps : [v && v.produto])].forEach((t) => {
    const txt = String(t || '').trim();
    if (txt && !partes.some((p) => _comparavel(p) === _comparavel(txt))) partes.push(txt);
  });
  return partes.length ? partes.join(' / ') : 'produto não informado';
}

// ------------------------------------------------------------------
// Cadeia de impacto: Vulnerabilidade -> Dependencia afetada -> Processo -> Tier
// ------------------------------------------------------------------

const ORDEM_TIER = {};
ORDEM_TIER[historicoRisco.TIER.T1] = 3;
ORDEM_TIER[historicoRisco.TIER.T2] = 2;
ORDEM_TIER[historicoRisco.TIER.T3] = 1;

/** Mesma sugestao que a tela de Riscos ja usa (Tier do processo -> Impacto). */
const IMPACTO_POR_TIER = {};
// Escala NIST 5x5 (15/10/2026): Tier 1 = impacto Muito alto.
IMPACTO_POR_TIER[historicoRisco.TIER.T1] = 'Muito alto';
IMPACTO_POR_TIER[historicoRisco.TIER.T2] = 'Alto';
IMPACTO_POR_TIER[historicoRisco.TIER.T3] = 'Moderado';

const IMPACTO_POR_SEVERIDADE = { 'Crítica': 'Muito alto', 'Alta': 'Alto', 'Média': 'Moderado', 'Baixa': 'Baixo' };

/** Faixa de severidade (bandas NVD; sem CVSS, a severidade manual). null = nao informada. */
function severidadeDaVulnerabilidade(v) {
  const cvss = _numero(v && v.cvss);
  if (cvss !== null) {
    if (cvss >= 9) return 'Crítica';
    if (cvss >= 7) return 'Alta';
    if (cvss >= 4) return 'Média';
    return 'Baixa';
  }
  const m = v && v.severidadeManual;
  return IMPACTO_POR_SEVERIDADE[m] ? m : null;
}

/**
 * Processos de negocio afetados: os que dependem (dependenciaItens[].id) de
 * alguma dependencia afetada pela vulnerabilidade. `processosPorId` ja vem com
 * score/avaliado unidos do BIA (historicoRisco.resolverProcessosComBia).
 * Ordem: maior Tier primeiro, depois nome.
 */
function processosAfetados(v, processosPorId) {
  const ids = new Set((Array.isArray(v && v.dependenciasAfetadas) ? v.dependenciasAfetadas : [])
    .map((d) => d && d.id).filter(Boolean).map(String));
  if (!ids.size) return [];
  return Object.values(processosPorId || {})
    .filter((p) => p && Array.isArray(p.dependenciaItens) && p.dependenciaItens.some((d) => d && d.id && ids.has(String(d.id))))
    .map((p) => ({ id: p.id, processo: p.processo || '', area: p.area || '', tier: historicoRisco.tierDoProcesso(p) }))
    .sort((a, b) => ((ORDEM_TIER[b.tier] || 0) - (ORDEM_TIER[a.tier] || 0)) || a.processo.localeCompare(b.processo, 'pt-BR'));
}

/** Impacto no negocio: pelo processo mais critico afetado; sem processo avaliado, pela severidade. */
function impactoDaVulnerabilidade(v, afetados) {
  const comTier = (afetados || []).find((p) => IMPACTO_POR_TIER[p.tier]);
  if (comTier) return IMPACTO_POR_TIER[comTier.tier];
  return IMPACTO_POR_SEVERIDADE[severidadeDaVulnerabilidade(v)] || '';
}

// --- Reavaliacao periodica pelo nivel do risco (matriz NIST, escalaRisco.js) ---
function nivelDoRisco(probabilidade, impacto) {
  return escalaRisco.nivelPorMatriz(probabilidade, impacto);
}

function _somarDias(dataISO, dias) {
  const d = new Date(String(dataISO).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Proxima reavaliacao sugerida pelo nivel (Muito alto 30, Alto 90, Moderado 180, Baixo/Muito baixo 365 dias). */
function proximaReavaliacaoSugerida(probabilidade, impacto, hojeISO) {
  const nivel = nivelDoRisco(probabilidade, impacto);
  return nivel ? _somarDias(hojeISO, escalaRisco.DIAS_REAVALIACAO[nivel]) : null;
}

// ------------------------------------------------------------------
// Campos que a automacao mantem no risco
// ------------------------------------------------------------------

const STATUS_RISCO_POR_CORRECAO = { 'Pendente': 'Identificado', 'Em Correção': 'Em Tratamento', 'Aceita': 'Aceito' };
const ESTRATEGIA_POR_CORRECAO = { 'Em Correção': 'Mitigar', 'Aceita': 'Aceitar' };
const MARCA_ACAO = 'vulnerabilidade';

/** Item do plano de acao (5W2H) que representa a correcao da vulnerabilidade. */
function itemDeCorrecao(v, local, hojeISO) {
  const sc = String(v.statusCorrecao || '');
  const quando = String(v.dataPrevistaCorrecao || '');
  let status = 'Pendente';
  if (sc === 'Corrigida') status = 'Concluído';
  else if (sc === 'Em Correção') status = 'Em andamento';
  if (sc !== 'Corrigida' && sc !== 'Aceita' && quando && quando < String(hojeISO).slice(0, 10)) status = 'Atrasado';
  return {
    acao: `Corrigir a vulnerabilidade ${v.codigo || ''} — ${v.nome || ''}`.trim(),
    porque: 'Eliminar a exposição que originou este risco.',
    responsavel: v.responsavel || '',
    onde: local,
    quando,
    como: v.ticketCorrecao ? `Ticket ${v.ticketCorrecao}` : '',
    quantoCusta: null,
    status,
    origemAutomacao: MARCA_ACAO,
  };
}

function _titulo(v, produtoNome) {
  const nome = String(v.nome || v.codigo || v.id || '');
  const cvssOuSeveridade = _numero(v.cvss) !== null ? v.cvss : (v.severidadeManual || 'não informado');
  return `Vulnerabilidade "${nome}" em ${_localDaVulnerabilidade(v, produtoNome)} (CVSS ${cvssOuSeveridade})`;
}

/** Valores-alvo que a automacao quer no risco agora (exceto plano de acao e encerramento). */
function camposSincronizados(v, o) {
  const opts = o || {};
  const afetados = opts.processosAfetados || [];
  const principal = afetados[0] || null;
  const sc = String(v.statusCorrecao || '');
  return {
    titulo: _titulo(v, opts.produtoNome),
    categorias: [categoriaDoRisco(v)],
    probabilidade: String(v.exploitDisponivel || '') === 'Sim' ? 'Alta' : 'Moderada',
    impacto: impactoDaVulnerabilidade(v, afetados),
    area: principal ? principal.area : '',
    processoId: principal ? principal.id : null,
    processo: principal ? principal.processo : '',
    responsavel: v.responsavel || '',
    // Produto de Software (20/10/2026): herdado da vulnerabilidade e mantido
    // pela sincronizacao; trocado a mao no risco, a escolha humana prevalece.
    produtoSoftwareId: v.produtoSoftwareId || '',
    status: STATUS_RISCO_POR_CORRECAO[sc] || 'Identificado',
    estrategiaTratamento: ESTRATEGIA_POR_CORRECAO[sc] || '',
    // Declaracao de risco estruturada (NIST SP 800-30): o texto espelha
    // RISCO_FONTES_AMEACA em app.js ('Estrutural / falha técnica').
    fonteAmeaca: 'Estrutural / falha técnica',
    eventoAmeaca: `exploração da vulnerabilidade "${v.nome || v.codigo || ''}"`,
    condicaoPredisponente: `${v.codigo || 'vulnerabilidade'}${v.cwe ? ` (${v.cwe})` : ''} em ${_localDaVulnerabilidade(v, opts.produtoNome)}`,
    consequencia: afetados.length
      ? `comprometimento de ${afetados.map((p) => p.processo).join(', ')}`
      : 'comprometimento dos sistemas e dados afetados',
  };
}

function _igual(a, b) {
  // Vazio e vazio: undefined, null e '' nao sao "mudanca" (evita regravar campo
  // inexistente com '' so por ele nao ter existido no risco antigo).
  const n = (x) => (x === undefined || x === '' ? null : x);
  return JSON.stringify(n(a)) === JSON.stringify(n(b));
}

function _vazio(x) {
  return x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length);
}

/**
 * Risco criado antes da sincronizacao (sem `sincronizado`): o que a automacao
 * escreveu na criacao e ainda esta igual conta como dela -- titulo,
 * probabilidade e o status inicial. O resto so e preenchido se estiver vazio.
 */
function _baselineLegado(risco) {
  const b = { titulo: risco.titulo, probabilidade: risco.probabilidade };
  if (risco.status === 'Identificado') b.status = 'Identificado';
  return b;
}

/**
 * Aplica os valores-alvo respeitando a edicao humana. Devolve o patch (so o que
 * muda, com o novo `sincronizado`) ou null quando nada muda.
 */
function aplicarSincronizacao(risco, alvo, item, alerta, hojeISO) {
  const r = risco || {};
  const sync = Object.assign({}, r.sincronizado || _baselineLegado(r));
  const patch = {};
  Object.keys(alvo).filter((campo) => campo.indexOf('__') !== 0).forEach((campo) => {
    const atual = r[campo];
    const dono = Object.prototype.hasOwnProperty.call(sync, campo) ? _igual(atual, sync[campo]) : _vazio(atual);
    if (!dono) return;
    if (!_igual(atual, alvo[campo])) patch[campo] = alvo[campo];
    sync[campo] = alvo[campo];
  });

  // Aceito: justificativa e proxima reavaliacao (exigencias do aceite, NIST).
  const statusFinal = Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status : r.status;
  if (statusFinal === 'Aceito') {
    if (_vazio(r.justificativaAceite)) patch.justificativaAceite = alvo.__justificativaAceite || '';
    if (_vazio(r.proximaReavaliacao)) {
      const prox = proximaReavaliacaoSugerida(patch.probabilidade || r.probabilidade, patch.impacto || r.impacto, hojeISO);
      if (prox) patch.proximaReavaliacao = prox;
    }
  }

  // Plano de acao: a automacao so mexe no item dela (marcado). Se alguem
  // editou o item na tela (a marca some), ele passa a ser da pessoa.
  if (item) {
    const itens = Array.isArray(r.planoAcao) ? r.planoAcao.slice() : [];
    const idx = itens.findIndex((i) => i && i.origemAutomacao === MARCA_ACAO);
    if (idx >= 0) {
      if (!_igual(itens[idx], item)) { itens[idx] = item; patch.planoAcao = itens; }
    } else if (!sync.acaoCorrecao) {
      itens.push(item);
      patch.planoAcao = itens;
    }
    sync.acaoCorrecao = true;
  }

  // Aviso para revisao humana (so a automacao escreve este campo).
  const alertaAtual = r.alertaAutomacao || '';
  if (alertaAtual !== (alerta || '')) {
    patch.alertaAutomacao = alerta || '';
    if (alerta) {
      const linha = `${String(hojeISO).slice(0, 10)} — [automático] ${alerta}`;
      patch.historicoReavaliacao = r.historicoReavaliacao ? `${r.historicoReavaliacao}\n${linha}` : linha;
    }
  }

  if (!Object.keys(patch).length && _igual(r.sincronizado, sync)) return null;
  patch.sincronizado = sync;
  return patch;
}

/**
 * Monta os campos do risco a partir de uma vulnerabilidade -- usada tanto
 * pela abertura AUTOMATICA (`decidir()`, abaixo, gatilho por limiar) quanto
 * pela importacao MANUAL (acao `importarVulnerabilidadeParaRisco`,
 * appLogic.js, disparada por um botao na tela, sem checar limiar nem status
 * da correcao -- e uma decisao explicita de quem esta olhando o cadastro).
 * `opts.manual` so muda o texto da descricao (o resto dos campos e
 * identico), pra deixar claro na tela do Risco como ele nasceu.
 * `opts.produtoNome` e o nome do Produto de Software vinculado (quem chama le
 * do catalogo; ausente = so o texto do Ativo afetado, como antes do vinculo).
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
  const afetados = o.processosAfetados || [];
  const procTxt = afetados.length
    ? ` Processos afetados: ${afetados.map((p) => `${p.processo} (${p.area || 'sem área'}, ${p.tier})`).join('; ')}.`
    : '';
  // Desde 15/10/2026 o risco ja nasce completo (impacto, area/processo pela
  // cadeia do BIA, responsavel, item de correcao): com P e I ele ja tem score,
  // gera medicao e entra no Risco no Tempo sem esperar alguem preencher.
  const alvo = camposSincronizados(v, o);
  const risco = Object.assign({}, alvo, {
    descricao: `A vulnerabilidade "${nome}"${v.cwe ? ` (${v.cwe})` : ''}${v.cve ? ` (${v.cve})` : ''} foi registrada com severidade ${cvssOuSeveridade}.${v.tipo ? ` Tipo: ${v.tipo}${v.subtipo ? ` / ${v.subtipo}` : ''}.` : ''}${procTxt} ${motivo} ${v.descricao || ''}`.trim(),
    // `categoria` (singular) mantido por compatibilidade; a tela le `categorias`.
    categoria: categoriaDoRisco(v),
    dataIdentificacao: data,
    origem: ORIGEM,
    vulnerabilidadeId: id,
    vulnerabilidadeCodigo: v.codigo || '',
    funcaoCsf: 'Identificar',
    // Importado a mao (botao "Importar para Riscos") e decisao explicita de
    // quem olhou o cadastro, mesmo abaixo do limiar: nao gera o alerta de
    // "severidade abaixo do limiar".
    importadoManualmente: !!o.manual,
    planoAcao: [itemDeCorrecao(v, _localDaVulnerabilidade(v, o.produtoNome), data)],
    kris: [],
    alertaAutomacao: '',
  });
  const sync = Object.assign({}, alvo, { acaoCorrecao: true });
  if (risco.status === 'Aceito') {
    risco.justificativaAceite = _justificativaAceite(v);
    const prox = proximaReavaliacaoSugerida(risco.probabilidade, risco.impacto, data);
    if (prox) risco.proximaReavaliacao = prox;
  }
  risco.sincronizado = sync;
  return risco;
}

function _justificativaAceite(v) {
  const obs = String(v.observacoes || '').trim();
  return `Vulnerabilidade ${v.codigo || ''} marcada como "Aceita" no cadastro de Vulnerabilidades.${obs ? ` Observações: ${obs}` : ''}`;
}

/**
 * O que fazer depois de uma vulnerabilidade ser criada, editada ou excluida.
 *
 * Devolve { acao: 'abrir' | 'atualizar' | 'encerrar' | 'nada', ... }.
 *   - excluida, ou Corrigida: encerra os riscos ativos;
 *   - sem risco ativo: abre se a severidade estiver no/acima do limiar (inclusive
 *     ja como Aceito, se a vulnerabilidade foi aceita);
 *   - com risco ativo: sincroniza (`atualizacoes: [{ id, patch }]`); severidade
 *     abaixo do limiar NAO fecha -- deixa `alertaAutomacao` para decisao humana.
 */
function decidir({ vulnerabilidade, excluida, riscos, limiar, hoje, produtoNome, processosAfetados: afetados }) {
  const v = vulnerabilidade || {};
  const id = String(v.id || '');
  if (!id) return { acao: 'nada', motivo: 'vulnerabilidade sem id' };

  const ativos = riscosAbertosDaVulnerabilidade(riscos, id);
  const data = String(hoje || new Date().toISOString()).slice(0, 10);
  const statusCorrecao = String(v.statusCorrecao || '');
  const nome = String(v.nome || v.codigo || id);

  if (excluida || statusCorrecao === 'Corrigida') {
    if (!ativos.length) return { acao: 'nada', motivo: excluida ? 'excluida sem risco ativo' : 'corrigida e sem risco ativo' };
    const motivoTxt = excluida
      ? `Encerrado automaticamente: a vulnerabilidade "${nome}" foi excluída do cadastro.`
      : `Encerrado automaticamente: a vulnerabilidade "${nome}" foi marcada como "Corrigida".`;
    return {
      acao: 'encerrar',
      ids: ativos.map((r) => r.id),
      patch: { status: 'Encerrado', dataEncerramento: data, justificativaEncerramento: motivoTxt, alertaAutomacao: '' },
    };
  }

  const lim = _limiar(limiar);
  const nota = _nota(v);
  const acima = nota !== null && acimaDoLimiar(nota, lim);
  const ctx = { hoje: data, limiar: lim, produtoNome, processosAfetados: afetados || [] };

  if (!ativos.length) {
    // Ja aceita sem risco (ex.: historico importado da planilha) nao abre risco
    // novo -- decisao antiga, mantida. Aceitar so vira risco "Aceito" quando ja
    // havia risco ativo.
    if (statusCorrecao === 'Aceita') return { acao: 'nada', motivo: 'aceita e sem risco ativo' };
    if (nota === null) return { acao: 'nada', motivo: 'sem CVSS nem severidade informados' };
    if (!acima) return { acao: 'nada', motivo: 'severidade abaixo do limiar' };
    return { acao: 'abrir', risco: construirRisco(v, ctx) };
  }

  const alvo = camposSincronizados(v, ctx);
  alvo.__justificativaAceite = _justificativaAceite(v);
  const item = itemDeCorrecao(v, _localDaVulnerabilidade(v, produtoNome), data);
  const alerta = acima
    ? ''
    : `Severidade caiu para ${severidadeDaVulnerabilidade(v) || 'não informada'} (abaixo do limiar ${lim}). Avaliar se o risco ainda se justifica.`;
  // O alerta de "abaixo do limiar" so vale para risco ABERTO PELO LIMIAR: o
  // importado a mao foi decisao humana, mesmo abaixo dele. Risco antigo sem a
  // marca: so conta como automatico se a descricao traz o texto que a abertura
  // automatica sempre escreveu (na duvida, nao alerta).
  const automatico = (r) => (r.importadoManualmente === undefined
    ? /acima do limiar/.test(String(r.descricao || ''))
    : r.importadoManualmente === false);
  const atualizacoes = ativos
    .map((r) => ({ id: r.id, patch: aplicarSincronizacao(r, alvo, item, automatico(r) ? alerta : '', data) }))
    .filter((a) => a.patch);
  if (!atualizacoes.length) return { acao: 'nada', motivo: 'risco ativo já está sincronizado' };
  return { acao: 'atualizar', atualizacoes };
}

module.exports = {
  LIMIAR_CVSS_PADRAO,
  ORIGEM,
  CATEGORIA,
  STATUS_FECHADOS_CORRECAO,
  STATUS_FECHADOS_RISCO,
  acimaDoLimiar,
  riscosAbertosDaVulnerabilidade,
  categoriaDoRisco,
  construirRisco,
  decidir,
  severidadeDaVulnerabilidade,
  processosAfetados,
  impactoDaVulnerabilidade,
  nivelDoRisco,
  proximaReavaliacaoSugerida,
  camposSincronizados,
  aplicarSincronizacao,
  itemDeCorrecao,
};
