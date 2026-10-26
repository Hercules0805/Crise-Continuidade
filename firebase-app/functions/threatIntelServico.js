/**
 * Threat Intelligence -- a parte que le e grava o Firestore (26/10/2026).
 *
 * A regra fica em threatIntel.js (pura, testada sem banco). Aqui: coleta das
 * fontes, analise de uma noticia (pre-filtro + IA + gravacao das acoes),
 * importacao do inventario de software em lotes e a triagem (aprovar vira
 * Vulnerabilidade; descartar exige motivo).
 *
 * Usado por appLogic.js (acoes da tela, que conferem o perfil antes) e por
 * index.js (coleta diaria). A chamada a IA e o fetch chegam por `deps`, para
 * os testes trocarem por dubles:
 *   deps.chamarIA(prompt) -> objeto JSON da resposta (lanca em erro)
 *   deps.fetch            -> fetch da plataforma
 *   deps.Erro             -> classe de erro de negocio (AppError)
 */
'use strict';

const TI = require('./threatIntel');
const vulnerabilidadeContexto = require('./vulnerabilidadeContexto');
const vulnerabilidadeRisco = require('./vulnerabilidadeRisco');

const LOTE_GRAVACAO = 400;
const MAX_ITENS_POR_FEED = 50;
const LIMITE_FETCH_MS = 20000;
const MAX_HOSTS_SEM_VINCULO = 100;

function _erro(deps, msg) {
  const E = (deps && deps.Erro) || Error;
  return new E(msg);
}

function _hojeSP() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

async function _gravarEmLotes(db, ops) {
  for (let i = 0; i < ops.length; i += LOTE_GRAVACAO) {
    const lote = db.batch();
    ops.slice(i, i + LOTE_GRAVACAO).forEach((op) => {
      if (op.excluir) lote.delete(op.ref);
      else lote.set(op.ref, op.dados, op.merge ? { merge: true } : undefined);
    });
    await lote.commit();
  }
}

function _configRef(db, id) {
  return db.collection(TI.COLECAO.config).doc(id);
}

async function lerConfig(db) {
  const snap = await _configRef(db, 'geral').get();
  return TI.normalizarConfig(snap.exists ? snap.data() : null);
}

// ------------------------------------------------------------
// Inventario
// ------------------------------------------------------------

/** Softwares da importacao atual: [{ id, fabricante, produto, versao, termos, qtdHosts, hosts, dependencias }]. */
async function lerInventario(db) {
  const meta = await _configRef(db, 'inventario').get();
  const atual = meta.exists ? (meta.data() || {}).importacaoAtual : '';
  if (!atual) return [];
  const snap = await db.collection(TI.COLECAO.inventario).where('importacaoId', '==', atual).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function _indiceHostsAtual(db) {
  const snap = await db.collection('dependencias').get();
  return TI.indiceDeHosts(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
}

/**
 * Abre uma importacao. A anterior continua valendo ate concluirImportacao:
 * se o navegador cair no meio, nada muda para a analise.
 */
async function iniciarImportacao(db, dados, ctx) {
  const id = ctx.novoUuid();
  await _configRef(db, 'inventario').set({
    emAndamento: {
      id,
      iniciadoEm: new Date().toISOString(),
      por: ctx.email,
      arquivo: String((dados && dados.arquivo) || '').slice(0, 200),
    },
  }, { merge: true });
  return { success: true, importacaoId: id };
}

async function _exigirImportacaoEmAndamento(db, importacaoId, deps) {
  const snap = await _configRef(db, 'inventario').get();
  const em = snap.exists ? (snap.data() || {}).emAndamento : null;
  if (!em || !importacaoId || em.id !== importacaoId) throw _erro(deps, 'Importação não encontrada ou já encerrada. Comece de novo.');
  return snap.data();
}

/** Grava um lote de softwares consolidados pelo navegador (no maximo LOTE_GRAVACAO). */
async function enviarLote(db, dados, ctx, deps) {
  const importacaoId = String((dados && dados.importacaoId) || '');
  await _exigirImportacaoEmAndamento(db, importacaoId, deps);
  const itens = Array.isArray(dados && dados.itens) ? dados.itens : [];
  if (itens.length > LOTE_GRAVACAO) throw _erro(deps, `Lote grande demais (máximo ${LOTE_GRAVACAO}).`);
  const indice = await _indiceHostsAtual(db);
  const ops = [];
  let ignorados = 0;
  itens.forEach((item) => {
    const x = TI.documentoDeInventario(item, indice);
    if (!x) { ignorados++; return; }
    ops.push({
      ref: db.collection(TI.COLECAO.inventario).doc(`${importacaoId}_${x.id}`),
      dados: Object.assign(x.doc, { importacaoId }),
    });
  });
  await _gravarEmLotes(db, ops);
  return { success: true, gravados: ops.length, ignorados };
}

/** Torna a importacao a atual, apaga as anteriores e registra o resumo. */
async function concluirImportacao(db, dados, ctx, deps) {
  const importacaoId = String((dados && dados.importacaoId) || '');
  const meta = await _exigirImportacaoEmAndamento(db, importacaoId, deps);
  const todos = await db.collection(TI.COLECAO.inventario).get();
  const novos = todos.docs.filter((d) => (d.data() || {}).importacaoId === importacaoId);
  if (!novos.length) throw _erro(deps, 'Nenhum software foi gravado nesta importação.');

  // Vinculo por host (nao por software): o mesmo indice que enviarLote usou.
  const indice = await _indiceHostsAtual(db);
  const hosts = new Map();
  novos.forEach((d) => {
    ((d.data() || {}).hosts || []).forEach((h) => {
      const k = TI.normalizarHost(h);
      if (!hosts.has(k)) hosts.set(k, { nome: h, vinculado: indice.has(k) });
    });
  });
  const semVinculo = [...hosts.values()].filter((h) => !h.vinculado).map((h) => h.nome).sort();
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  await _configRef(db, 'inventario').set({
    importacaoAtual: importacaoId,
    importadoEm: new Date().toISOString(),
    importadoPor: ctx.email,
    arquivo: (meta.emAndamento && meta.emAndamento.arquivo) || '',
    linhas: n(dados.linhas),
    linhasDescartadas: n(dados.linhasDescartadas),
    hosts: n(dados.hosts) !== null ? n(dados.hosts) : hosts.size,
    softwares: novos.length,
    hostsVinculados: hosts.size - semVinculo.length,
    hostsSemVinculo: semVinculo.slice(0, MAX_HOSTS_SEM_VINCULO),
    qtdHostsSemVinculo: semVinculo.length,
    emAndamento: null,
  }, { merge: true });

  const antigos = todos.docs.filter((d) => (d.data() || {}).importacaoId !== importacaoId);
  await _gravarEmLotes(db, antigos.map((d) => ({ ref: d.ref || db.collection(TI.COLECAO.inventario).doc(d.id), excluir: true })));
  return { success: true, softwares: novos.length, removidos: antigos.length, hostsSemVinculo: semVinculo.length };
}

// ------------------------------------------------------------
// Analise
// ------------------------------------------------------------

/** Processos de negocio de cada software, pela cadeia do BIA (lido uma vez por execucao). */
async function _cadeia(db, cache) {
  if (!cache.cadeia) {
    const [processosPorId, rede] = await Promise.all([
      vulnerabilidadeContexto.lerProcessosPorId(db),
      vulnerabilidadeContexto.lerRede(db),
    ]);
    cache.cadeia = { processosPorId, rede };
  }
  return cache.cadeia;
}

function _comProcessos(candidato, cadeia) {
  const deps = Array.isArray(candidato.dependencias) ? candidato.dependencias : [];
  const processos = deps.length
    ? vulnerabilidadeRisco.processosAfetados({ dependenciasAfetadas: deps }, cadeia.processosPorId, cadeia.rede)
    : [];
  return Object.assign({}, candidato, { processos });
}

/**
 * Analisa UMA noticia ja gravada: sem software do inventario citado, marca
 * "sem correspondencia" (sem IA); com, pergunta a IA e grava as acoes.
 * Reanalisar troca so as acoes ainda Pendentes desta noticia -- as ja
 * triadas (aprovadas/descartadas) ficam.
 * Devolve { status, acoes: [ids], usouIA }.
 */
async function analisarNoticia(db, noticiaId, noticia, deps, cache) {
  const c = cache || {};
  if (!c.inventario) c.inventario = await lerInventario(db);
  const ref = db.collection(TI.COLECAO.noticias).doc(noticiaId);
  const agora = new Date().toISOString();
  const candidatos = TI.candidatosDoInventario(noticia, c.inventario).slice(0, TI.MAX_CANDIDATOS_IA);

  if (!candidatos.length) {
    await ref.set({ status: TI.STATUS_NOTICIA.SEM_CORRESPONDENCIA, analisadaEm: agora, analise: null, erro: '' }, { merge: true });
    return { status: TI.STATUS_NOTICIA.SEM_CORRESPONDENCIA, acoes: [], usouIA: false };
  }

  const cadeia = await _cadeia(db, c);
  const enriquecidos = candidatos.map((x) => _comProcessos(x, cadeia));
  let analise;
  try {
    analise = TI.sanitizarAnalise(await deps.chamarIA(TI.promptAnalise(noticia, enriquecidos)), enriquecidos.map((x) => x.id));
    if (!analise) throw _erro(deps, 'A IA respondeu fora do formato esperado.');
  } catch (err) {
    await ref.set({ status: TI.STATUS_NOTICIA.ERRO, erro: String((err && err.message) || 'erro').slice(0, 300), analisadaEm: agora }, { merge: true });
    return { status: TI.STATUS_NOTICIA.ERRO, acoes: [], usouIA: true, erro: err && err.message };
  }

  const porId = new Map(enriquecidos.map((x) => [x.id, x]));
  const revisao = (Number(noticia.revisao) || 0) + 1;
  const hoje = (deps && deps.hoje) || _hojeSP();
  const novas = TI.acoesDaAnalise(`${noticiaId}`, noticia, analise, porId, hoje)
    .map((a, i) => ({ id: TI.idAcao(`${noticiaId}|r${revisao}`, i), doc: a.doc }));

  const anteriores = await db.collection(TI.COLECAO.acoes).where('noticiaId', '==', noticiaId).get();
  const ops = anteriores.docs
    .filter((d) => (d.data() || {}).statusTriagem === TI.STATUS_TRIAGEM.PENDENTE)
    .map((d) => ({ ref: d.ref || db.collection(TI.COLECAO.acoes).doc(d.id), excluir: true }));
  novas.forEach((a) => ops.push({
    ref: db.collection(TI.COLECAO.acoes).doc(a.id),
    dados: Object.assign(a.doc, { criadoEm: agora, atualizadoEm: agora }),
  }));
  await _gravarEmLotes(db, ops);

  const afetados = analise.softwaresAfetados.map((id) => porId.get(id)).filter(Boolean);
  await ref.set({
    status: TI.STATUS_NOTICIA.ANALISADA,
    analisadaEm: agora,
    revisao,
    erro: '',
    analise: {
      relevante: analise.relevante,
      justificativa: analise.justificativa,
      softwaresAfetados: afetados.map((s) => ({ id: s.id, fabricante: s.fabricante || '', produto: s.produto || '', versao: s.versao || '', qtdHosts: Number(s.qtdHosts) || 0 })),
      candidatos: candidatos.length,
      acoes: novas.length,
    },
  }, { merge: true });
  return { status: TI.STATUS_NOTICIA.ANALISADA, acoes: novas.map((a) => a.id), usouIA: true };
}

/**
 * Grava noticias novas (create(): a mesma URL nunca entra duas vezes).
 * Devolve [{ id, noticia }] so das que entraram agora.
 */
async function registrarNoticias(db, noticias, extras) {
  const novas = [];
  const agora = new Date().toISOString();
  for (const n of noticias || []) {
    const id = TI.idNoticia(n);
    const doc = Object.assign({}, n, extras || {}, { status: TI.STATUS_NOTICIA.PENDENTE_ANALISE, coletadoEm: agora, revisao: 0 });
    try {
      await db.collection(TI.COLECAO.noticias).doc(id).create(doc);
      novas.push({ id, noticia: doc });
    } catch (err) {
      if (err && (err.code === 6 || /already exists/i.test(String(err.message)))) continue;
      throw err;
    }
  }
  return novas;
}

async function _buscar(deps, url, tipo) {
  const resp = await deps.fetch(url, {
    headers: { 'User-Agent': 'BIA-ThreatIntel/1.0 (+https://bia-forte-2025.web.app)', Accept: tipo === 'kev' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(LIMITE_FETCH_MS),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return tipo === 'kev' ? resp.json() : resp.text();
}

/**
 * Coleta das fontes + analise das pendentes (KEV primeiro), com teto de
 * chamadas a IA. Noticia sem software do inventario nao conta no teto.
 * Devolve o resumo da execucao (gravado em config_threat_intel/geral.ultimaColeta).
 */
async function executarColeta(db, deps, opts) {
  const o = opts || {};
  const hoje = (deps && deps.hoje) || _hojeSP();
  const cfg = await lerConfig(db);
  const limite = Number.isInteger(o.limite) ? o.limite : cfg.limiteAnalisesDia;
  const erros = [];
  const coletadas = [];
  let ultimoKev = cfg.ultimoKev;

  for (const feed of cfg.feeds.filter((f) => f.ativo)) {
    try {
      if (feed.tipo === 'kev') {
        const json = await _buscar(deps, feed.url, 'kev');
        coletadas.push(...TI.noticiasDoKev(json, cfg.ultimoKev, hoje));
        ultimoKev = TI.ultimaInclusaoKev(json) || ultimoKev;
      } else {
        const xml = await _buscar(deps, feed.url, 'rss');
        coletadas.push(...TI.parseRss(xml).slice(0, MAX_ITENS_POR_FEED).map((i) => TI.noticiaDeRss(i, feed.nome)));
      }
    } catch (err) {
      erros.push({ feed: feed.nome, erro: String((err && err.message) || 'erro').slice(0, 200) });
    }
  }

  const novas = await registrarNoticias(db, coletadas);
  const pendentesSnap = await db.collection(TI.COLECAO.noticias).where('status', '==', TI.STATUS_NOTICIA.PENDENTE_ANALISE).get();
  const pendentes = TI.ordenarParaAnalise(pendentesSnap.docs.map((d) => Object.assign({ _id: d.id }, d.data())));

  const cache = {};
  let chamadasIA = 0;
  let semCorrespondencia = 0;
  const acoes = [];
  for (const n of pendentes) {
    // Sem verba de IA: so separa o que nem precisa dela (sem correspondencia).
    if (chamadasIA >= limite) {
      if (!cache.inventario) cache.inventario = await lerInventario(db);
      if (TI.candidatosDoInventario(n, cache.inventario).length) continue;
    }
    const r = await analisarNoticia(db, n._id, n, deps, cache);
    if (r.usouIA) chamadasIA++;
    if (r.status === TI.STATUS_NOTICIA.SEM_CORRESPONDENCIA) semCorrespondencia++;
    acoes.push(...r.acoes);
  }

  const resumo = {
    em: new Date().toISOString(),
    coletadas: coletadas.length,
    novas: novas.length,
    analisadas: chamadasIA,
    semCorrespondencia,
    acoes: acoes.length,
    aguardandoAnalise: pendentes.length - chamadasIA - semCorrespondencia,
    erros,
  };
  await _configRef(db, 'geral').set({ ultimoKev, ultimaColeta: resumo }, { merge: true });
  return Object.assign({ acaoIds: acoes }, resumo);
}

// ------------------------------------------------------------
// Triagem
// ------------------------------------------------------------

async function _lerAcao(db, id, deps) {
  if (!id) throw _erro(deps, 'Ação não informada.');
  const ref = db.collection(TI.COLECAO.acoes).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw _erro(deps, 'Ação não encontrada.');
  return { ref, acao: snap.data() || {} };
}

/**
 * Aprova a acao: cria a Vulnerabilidade (o gatilho riscoDeVulnerabilidade
 * abre o Risco, se passar do limiar) e guarda o vinculo. Aprovar de novo a
 * mesma acao devolve a vulnerabilidade ja criada, sem duplicar.
 */
async function aprovarAcao(db, dados, ctx, deps) {
  const { ref, acao } = await _lerAcao(db, dados && dados.id, deps);
  if (acao.statusTriagem === TI.STATUS_TRIAGEM.APROVADA && acao.vulnerabilidadeId) {
    return { success: true, jaAprovada: true, vulnerabilidadeId: acao.vulnerabilidadeId, codigo: acao.vulnerabilidadeCodigo || '' };
  }
  if (acao.statusTriagem !== TI.STATUS_TRIAGEM.PENDENTE) throw _erro(deps, 'Esta ação já foi triada.');
  const ajustes = (dados && dados.ajustes) || {};
  if (!String(ajustes.responsavel || '').trim()) throw _erro(deps, 'Informe o responsável pela correção.');

  const hoje = (deps && deps.hoje) || _hojeSP();
  const codigosSnap = await db.collection('vulnerabilidades').get();
  const codigo = TI.proximoCodigoVulnerabilidade(codigosSnap.docs.map((d) => (d.data() || {}).codigo), hoje.slice(0, 4));
  const vuln = TI.vulnerabilidadeDaAcao(acao, ajustes, { codigo, hoje, acaoId: String(dados.id) });
  const agora = new Date().toISOString();
  const vulnId = ctx.novoUuid();
  await db.collection('vulnerabilidades').doc(vulnId).set(Object.assign(vuln, {
    criadoEm: agora, criadoPor: ctx.email, atualizadoEm: agora, atualizadoPor: ctx.email,
  }));
  await ref.set({
    statusTriagem: TI.STATUS_TRIAGEM.APROVADA,
    vulnerabilidadeId: vulnId,
    vulnerabilidadeCodigo: codigo,
    triadoPor: ctx.email,
    triadoEm: agora,
    atualizadoEm: agora,
  }, { merge: true });
  return { success: true, vulnerabilidadeId: vulnId, codigo };
}

async function descartarAcao(db, dados, ctx, deps) {
  const { ref, acao } = await _lerAcao(db, dados && dados.id, deps);
  if (acao.statusTriagem !== TI.STATUS_TRIAGEM.PENDENTE) throw _erro(deps, 'Esta ação já foi triada.');
  const motivo = String((dados && dados.motivo) || '').trim();
  if (motivo.length < 5) throw _erro(deps, 'Informe o motivo do descarte.');
  const agora = new Date().toISOString();
  await ref.set({
    statusTriagem: TI.STATUS_TRIAGEM.DESCARTADA,
    motivoDescarte: motivo.slice(0, 1000),
    triadoPor: ctx.email,
    triadoEm: agora,
    atualizadoEm: agora,
  }, { merge: true });
  return { success: true };
}

/** Volta uma acao descartada para Pendente (engano na triagem). Aprovada nao volta: ja existe a vulnerabilidade. */
async function reabrirAcao(db, dados, ctx, deps) {
  const { ref, acao } = await _lerAcao(db, dados && dados.id, deps);
  if (acao.statusTriagem !== TI.STATUS_TRIAGEM.DESCARTADA) throw _erro(deps, 'Só uma ação descartada pode ser reaberta.');
  await ref.set({ statusTriagem: TI.STATUS_TRIAGEM.PENDENTE, motivoDescarte: '', triadoPor: '', triadoEm: '', atualizadoEm: new Date().toISOString() }, { merge: true });
  return { success: true };
}

module.exports = {
  LOTE_GRAVACAO,
  lerConfig, lerInventario,
  iniciarImportacao, enviarLote, concluirImportacao,
  analisarNoticia, registrarNoticias, executarColeta,
  aprovarAcao, descartarAcao, reabrirAcao,
};
