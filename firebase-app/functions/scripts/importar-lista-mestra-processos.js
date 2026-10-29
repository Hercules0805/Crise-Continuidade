/**
 * Carga da Lista Mestra (29/10/2026): reports/LISTA MESTRA GERAL - GERAL.csv
 * e a lista mestra de DOCUMENTOS (manual MN, procedimento PO/POP, fluxo
 * FL/FLU, norma NR) por setor. Cada processo do Cadastro de Processos nasce
 * do agrupamento dos documentos de mesmo nome na mesma area, como
 * Departamental e fora de Continuidade, com os codigos no nome.
 *
 * Decisoes (com o usuario): setor -> area pelo mapa SETOR_PARA_AREA; Criador e
 * Aprovador so quando a Pessoa ja existe (nome completo igual, ou so o primeiro
 * nome e ele e unico; nunca adivinha); processo que ja existe na area e so
 * completado (Criador/Aprovador vazios), sem mexer em categoria/Continuidade.
 *
 * RODA NA MAO:
 *   cd firebase-app/functions
 *   node scripts/importar-lista-mestra-processos.js "<csv>"           (so mostra o que faria)
 *   node scripts/importar-lista-mestra-processos.js "<csv>" --gravar  (grava de verdade)
 * Credenciais: `gcloud auth application-default login` + GCLOUD_PROJECT=bia-forte-2025.
 *
 * E IDEMPOTENTE: o processo criado passa a ser "ja existe" (pelo codigo no nome).
 */

'use strict';

const { processoKey } = require('../tokenLogic');

const SETOR_PARA_AREA = {
  NUVEM: 'Suporte Tecnologia',
  'IMPLANTAÇÃO': 'Implantação',
  CS: 'Relacionamento',
  ATENDIMENTO: 'Suporte N1',
  COMERCIAL: 'Comercial Corporativo',
  'ADM.COMERCIAL': 'Comercial Corporativo',
  CRE: 'Financeiro',
  CAP: 'Financeiro',
  TI: 'TI',
  'C&S': 'Jornada do Colaborador',
  'T&D': 'Jornada do Colaborador',
  DP: 'Departamento Pessoal',
};
const CATEGORIA = 'departamental';
const AUTOR = 'importacao-lista-mestra';

const SIGLAS = new Set(['AC', 'AG', 'RH', 'BD', 'MSSQL', 'BI', 'NF', 'POD', 'SQL', 'SST', 'ASO', 'RPA', 'INSS', 'ADM', 'POP', 'TI', 'CS', 'RR']);
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'por', 'ao', 'aos', 'x', 'com', 'a', 'o', 'no', 'na']);

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** CSV simples com aspas (campo com virgula vem entre aspas; "" e uma aspa). */
function lerCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  const t = String(texto || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

/** Linhas do CSV -> [{ setor, codigo, nome, criador, aprovador }] (setor vazio herda o de cima). */
function documentosDoCsv(texto) {
  const [, ...dados] = lerCsv(texto);
  let setor = '';
  return dados.map((l) => {
    if ((l[0] || '').trim()) setor = l[0].trim();
    return { setor, codigo: (l[1] || '').trim().replace(/\s+/g, ' '), nome: l[2] || '', criador: (l[3] || '').trim(), aprovador: (l[4] || '').trim() };
  }).filter((d) => d.nome.trim());
}

/** "FLU.COM.002 - MACROFLUXO COMERCIAL." -> "Macrofluxo Comercial". */
function limparNome(nome) {
  let n = String(nome || '').trim().replace(/\s+/g, ' ');
  n = n.replace(/^[A-Z&]{2,4}\.[A-Z&]{2,4}\.?\s?\d+\s*-\s*/i, '').replace(/^MANUAL\s*-\s*/i, '');
  n = n.replace(/[.\s]+$/, '').trim();
  if (/[a-zà-ÿ]/.test(n)) return n; // ja tem minusculas: o autor escolheu a grafia
  let primeira = true;
  return n.replace(/[A-Za-zÀ-ÿ]+/g, (w) => {
    const eraPrimeira = primeira;
    primeira = false;
    if (SIGLAS.has(semAcento(w).toUpperCase())) return w.toUpperCase();
    const min = w.toLowerCase();
    if (!eraPrimeira && MINUSCULAS.has(min)) return min;
    return min.charAt(0).toUpperCase() + min.slice(1);
  });
}

/** Pessoa da celula ("A/B" tenta cada um): nome completo igual, ou so o primeiro nome se for unico. */
function acharPessoa(celula, pessoas) {
  for (const parte of String(celula || '').split('/').map((x) => x.trim()).filter(Boolean)) {
    const k = chave(parte);
    const igual = pessoas.find((p) => chave(p.nome) === k);
    if (igual) return igual;
    if (!k.includes(' ')) {
      const mesmos = pessoas.filter((p) => chave(p.nome).split(' ')[0] === k);
      if (mesmos.length === 1) return mesmos[0];
    }
  }
  return null;
}

/** Processo ja cadastrado na area: algum codigo do grupo no nome, ou o mesmo nome (sem o "(codigo)"). */
function acharExistente(area, nome, codigos, processos) {
  const k = chave(nome);
  return processos.find((p) => p.area === area && (
    codigos.some((c) => chave(p.processo).includes(chave(c)))
    || chave(String(p.processo || '').replace(/\([^)]*\)\s*$/, '')) === k));
}

/**
 * Puro. Devolve { criar: [{ id, dados }], completar: [{ id, processo, dados }],
 * existentes: [nome], semPessoa: { nome: vezes }, erros: [texto] }.
 */
function planejar(texto, { areas, pessoas, processos }, agoraISO) {
  const erros = [];
  const nomesAreas = new Set((areas || []).map((a) => a.nome));
  const docs = documentosDoCsv(texto);
  const grupos = new Map();
  docs.forEach((d) => {
    const area = SETOR_PARA_AREA[d.setor.toUpperCase()];
    if (!area) { erros.push(`Setor sem área no mapeamento: ${d.setor}`); return; }
    if (!nomesAreas.has(area)) { erros.push(`Área "${area}" (setor ${d.setor}) não existe no cadastro.`); return; }
    const nome = limparNome(d.nome);
    const k = area + '|' + chave(nome);
    if (!grupos.has(k)) grupos.set(k, { area, nome, docs: [] });
    grupos.get(k).docs.push(d);
  });

  const semPessoa = {};
  const pessoaDoGrupo = (docsGrupo, campo) => {
    for (const d of docsGrupo) {
      const p = acharPessoa(d[campo], pessoas || []);
      if (p) return p;
    }
    docsGrupo.forEach((d) => { if (d[campo]) semPessoa[d[campo]] = (semPessoa[d[campo]] || 0) + 1; });
    return null;
  };

  const criar = [], completar = [], existentes = [];
  for (const g of grupos.values()) {
    const codigos = g.docs.map((d) => d.codigo).filter(Boolean);
    const criador = pessoaDoGrupo(g.docs, 'criador');
    const aprovador = pessoaDoGrupo(g.docs, 'aprovador');
    const ja = acharExistente(g.area, g.nome, codigos, processos || []);
    if (ja) {
      existentes.push(`${g.area} · ${ja.processo}`);
      const dados = {};
      if (!ja.criadorId && criador) dados.criadorId = String(criador.id);
      if (!ja.aprovadorId && aprovador) dados.aprovadorId = String(aprovador.id);
      if (Object.keys(dados).length) completar.push({ id: String(ja.id), processo: `${g.area} · ${ja.processo}`, dados: { ...dados, atualizadoEm: agoraISO, atualizadoPor: AUTOR } });
      continue;
    }
    const processo = codigos.length ? `${g.nome} (${codigos.join(', ')})` : g.nome;
    criar.push({
      id: processoKey(g.area, processo),
      dados: {
        area: g.area, processo, categoriaId: CATEGORIA, continuidade: false,
        criadorId: criador ? String(criador.id) : '', aprovadorId: aprovador ? String(aprovador.id) : '', links: [],
        criadoEm: agoraISO, criadoPor: AUTOR, atualizadoEm: agoraISO, atualizadoPor: AUTOR,
      },
    });
  }
  return { criar, completar, existentes, semPessoa, erros: [...new Set(erros)] };
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho || caminho.startsWith('--')) throw new Error('Informe o caminho do CSV.');
  const gravar = process.argv.includes('--gravar');
  const texto = require('fs').readFileSync(caminho, 'utf8');
  const admin = require('firebase-admin');
  admin.initializeApp();
  const db = admin.firestore();
  const ler = async (q) => (await q.get()).docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const [areas, pessoas, processos] = await Promise.all([
    ler(db.collection('areas')), ler(db.collection('dependencias').where('categoria', '==', 'Pessoas')), ler(db.collection('processos')),
  ]);
  const plano = planejar(texto, { areas, pessoas, processos }, new Date().toISOString());
  if (plano.erros.length) {
    plano.erros.forEach((e) => console.error('ERRO: ' + e));
    throw new Error('Nada gravado: corrija os erros acima.');
  }
  const nomePessoa = (id) => (pessoas.find((p) => p.id === id) || {}).nome || '–';
  const porArea = {};
  plano.criar.forEach((c) => { (porArea[c.dados.area] = porArea[c.dados.area] || []).push(c); });
  console.log(`Processos a criar: ${plano.criar.length}`);
  Object.keys(porArea).sort().forEach((a) => {
    console.log(`\n${a} (${porArea[a].length})`);
    porArea[a].forEach((c) => console.log(`  + ${c.dados.processo}  [criador: ${nomePessoa(c.dados.criadorId)} · aprovador: ${nomePessoa(c.dados.aprovadorId)}]`));
  });
  console.log(`\nJá existem (não cria): ${plano.existentes.length}`);
  plano.existentes.forEach((e) => console.log('  = ' + e));
  console.log(`\nA completar (Criador/Aprovador vazios): ${plano.completar.length}`);
  plano.completar.forEach((c) => console.log(`  ~ ${c.processo}: ${JSON.stringify({ criador: c.dados.criadorId && nomePessoa(c.dados.criadorId), aprovador: c.dados.aprovadorId && nomePessoa(c.dados.aprovadorId) })}`));
  const sem = Object.entries(plano.semPessoa).sort((a, b) => b[1] - a[1]);
  console.log(`\nNomes sem Pessoa no cadastro (${sem.length}): ${sem.map(([n, q]) => `${n} (${q})`).join(', ')}`);

  if (gravar) {
    const ops = [
      ...plano.criar.map((c) => (b) => b.set(db.collection('processos').doc(c.id), c.dados)),
      ...plano.completar.map((c) => (b) => b.set(db.collection('processos').doc(c.id), c.dados, { merge: true })),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  }
  console.log(gravar ? '\nGravado.' : '\nNada gravado (use --gravar).');
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}

module.exports = { planejar, lerCsv, documentosDoCsv, limparNome, acharPessoa, SETOR_PARA_AREA };
