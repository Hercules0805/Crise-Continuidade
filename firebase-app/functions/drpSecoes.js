/**
 * Cadeado por secao do DRP (DECISAO 09/10/2026).
 *
 * O DRP e um HTML unico gerado pela IA. Cada <h2> abre uma secao (o template
 * numera "N. Titulo"); o que vem antes do primeiro <h2> e o cabecalho. Uma
 * secao que o humano ajustou fica "bloqueada": ao regenerar, ela volta byte a
 * byte igual a versao anterior -- garantido aqui, por codigo, nao por pedido
 * a IA. As outras secoes vem da geracao nova.
 *
 * Sem Firestore e sem DOM (roda na Cloud Function), para poder ser testado.
 * A saida do Gemini e plana (h2 no nivel de cima), entao regex basta.
 */

function _textoSemTags(html) {
  return String(html || '')
    .replace(/<button[\s\S]*?<\/button>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function _normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Chave estavel da secao: o numero no inicio do titulo ("6. Runbook" -> "6");
 * sem numero (template personalizado), o titulo normalizado. O texto dos
 * botoes injetados no h2 pelo popup (cadeado, exportar riscos) e ignorado.
 * Deve dar o mesmo resultado que chaveDoH2 no popup (_buildDRPPage, app.js).
 */
function chaveDaSecao(h2Html) {
  const texto = _textoSemTags(h2Html);
  const m = texto.match(/^\s*(\d+)/);
  if (m) return m[1];
  return _normalizar(texto);
}

/** { cabecalho, secoes: [{ chave, html }] } -- concatenar tudo devolve o HTML original. */
function dividirSecoes(html) {
  const s = String(html || '');
  const inicios = [];
  const re = /<h2[\s>]/gi;
  let m;
  while ((m = re.exec(s)) !== null) inicios.push(m.index);
  if (!inicios.length) return { cabecalho: s, secoes: [] };

  const secoes = inicios.map((ini, i) => {
    const trecho = s.slice(ini, i + 1 < inicios.length ? inicios[i + 1] : s.length);
    const fimH2 = trecho.search(/<\/h2>/i);
    const h2 = fimH2 === -1 ? trecho : trecho.slice(0, fimH2 + 5);
    return { chave: chaveDaSecao(h2), html: trecho };
  });
  return { cabecalho: s.slice(0, inicios[0]), secoes };
}

/**
 * Troca, no HTML novo, cada secao bloqueada pela versao dela no HTML antigo.
 * Secao bloqueada que sumiu da geracao nova (template mudou, IA pulou) e
 * reinserida logo depois da secao que a precedia no documento antigo -- nunca
 * descartada em silencio.
 *
 * Devolve { html, bloqueadas }: `bloqueadas` so com as chaves que de fato
 * existiam no antigo e foram preservadas (o cadeado segue valendo nelas).
 */
function mesclarBloqueadas(novoHtml, antigoHtml, bloqueadas) {
  const travadas = new Set((Array.isArray(bloqueadas) ? bloqueadas : []).map(String));
  if (!travadas.size) return { html: String(novoHtml || ''), bloqueadas: [] };

  const antigo = dividirSecoes(antigoHtml);
  const novo = dividirSecoes(novoHtml);

  const antigasPorChave = new Map();
  antigo.secoes.forEach((sec) => { if (!antigasPorChave.has(sec.chave)) antigasPorChave.set(sec.chave, sec.html); });

  const resultado = novo.secoes.map((sec) => (
    travadas.has(sec.chave) && antigasPorChave.has(sec.chave)
      ? { chave: sec.chave, html: antigasPorChave.get(sec.chave) }
      : sec
  ));

  const chavesNovas = new Set(resultado.map((sec) => sec.chave));
  antigo.secoes.forEach((sec, idx) => {
    if (!travadas.has(sec.chave) || chavesNovas.has(sec.chave)) return;
    let pos = 0;
    for (let j = idx - 1; j >= 0; j--) {
      const k = resultado.findIndex((r) => r.chave === antigo.secoes[j].chave);
      if (k !== -1) { pos = k + 1; break; }
    }
    resultado.splice(pos, 0, { chave: sec.chave, html: sec.html });
    chavesNovas.add(sec.chave);
  });

  const preservadas = [...travadas].filter((k) => antigasPorChave.has(k));
  return {
    html: novo.cabecalho + resultado.map((sec) => sec.html).join(''),
    bloqueadas: preservadas,
  };
}

/**
 * Secoes travadas do documento, na ordem em que aparecem, para irem no prompt
 * como contexto (a IA escreve as outras secoes coerentes com elas). Botoes
 * injetados pelo popup (ex.: "Exportar Riscos") saem -- nao sao conteudo.
 */
function secoesBloqueadas(html, bloqueadas) {
  const travadas = new Set((Array.isArray(bloqueadas) ? bloqueadas : []).map(String));
  if (!travadas.size) return [];
  const vistas = new Set();
  return dividirSecoes(html).secoes
    .filter((sec) => travadas.has(sec.chave) && !vistas.has(sec.chave) && vistas.add(sec.chave))
    .map((sec) => ({ chave: sec.chave, html: sec.html.replace(/<button[\s\S]*?<\/button>/gi, '').trim() }));
}

module.exports = { chaveDaSecao, dividirSecoes, mesclarBloqueadas, secoesBloqueadas };
