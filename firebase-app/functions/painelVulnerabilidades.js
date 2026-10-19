/**
 * Foto mensal do backlog de vulnerabilidades (19/10/2026), para a tendencia do
 * Painel de Vulnerabilidades (public/vulnerabilidade-painel.js).
 *
 * POR QUE EXISTE: a vulnerabilidade e um documento so, editado no lugar -- nao
 * ha historico de status. A tela reconstroi meses passados pelas datas
 * (deteccao, correcao, aceite), mas com a severidade de HOJE e sem pegar uma
 * Data Prevista que foi mudada depois. A foto grava o que era verdade no fim
 * de cada mes, e a tela prefere a foto quando ela existe.
 *
 * QUANDO: a varredura diaria (index.js, varreduraDiariaVulnerabilidades, 05:30)
 * grava `painel_vulnerabilidades/{AAAA-MM}` do mes de ONTEM com o estado de
 * agora. Assim, a execucao do dia 1o fecha o mes anterior com o estado da
 * virada, e as dos outros dias mantem o mes corrente atualizado.
 *
 * MESMAS REGRAS da tela (em aberto, atrasada, sem prazo, severidade NVD com
 * fallback manual, peso do indice). public/ nao e importavel daqui (cada
 * deploy leva so a sua pasta); tests/vulnerabilidade-painel.test.js compara as
 * duas implementacoes e falha se divergirem.
 */
const { severidadeDaVulnerabilidade } = require('./vulnerabilidadeRisco');

const SEVERIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
const SEM_SEVERIDADE = 'Não informado';
const PESO = { 'Crítica': 10, 'Alta': 5, 'Média': 2, 'Baixa': 1 };
const COLECAO = 'painel_vulnerabilidades';

function _data(s) {
  const t = String(s || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function emAberto(v) {
  return !!v && !['Corrigida', 'Aceita'].includes(v.statusCorrecao);
}

/** Mes ('AAAA-MM') ao qual a foto de `agoraISO` pertence: o de ontem. */
function mesDaFoto(agoraISO) {
  const d = new Date(_data(agoraISO) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 7);
}

/** Documento da foto. `hojeISO` = data da execucao ('AAAA-MM-DD'). */
function fotoDoMes(vulns, hojeISO) {
  const hoje = _data(hojeISO);
  const mes = mesDaFoto(hoje);
  const porSeveridade = {};
  SEVERIDADES.concat(SEM_SEVERIDADE).forEach((s) => { porSeveridade[s] = 0; });
  let abertas = 0, aceitas = 0, atrasadas = 0, semPrazo = 0, novas = 0, corrigidas = 0;
  (vulns || []).forEach((v) => {
    if (_data(v.dataDeteccao).slice(0, 7) === mes) novas++;
    if (v.statusCorrecao === 'Corrigida' && _data(v.dataCorrecao).slice(0, 7) === mes) corrigidas++;
    if (v.statusCorrecao === 'Aceita') aceitas++;
    if (!emAberto(v)) return;
    abertas++;
    porSeveridade[severidadeDaVulnerabilidade(v) || SEM_SEVERIDADE]++;
    const prevista = _data(v.dataPrevistaCorrecao);
    if (!prevista) semPrazo++;
    else if (prevista < hoje) atrasadas++;
  });
  return {
    mes,
    abertas,
    porSeveridade,
    indice: SEVERIDADES.reduce((s, f) => s + porSeveridade[f] * PESO[f], 0),
    aceitas,
    atrasadas,
    semPrazo,
    novas,
    corrigidas,
  };
}

/**
 * Data de aceite (19/10/2026): sem ela, a tendencia nao sabe quando uma
 * Aceita saiu do backlog. Mantida pelo gatilho riscoDeVulnerabilidade, nao
 * pela tela -- assim vale para o drawer, a edicao em lote, a importacao e o
 * aceite feito no Registro de Riscos. Devolve o patch, ou null se nada muda.
 */
function patchDataAceite(v, hojeISO) {
  if (!v) return null;
  const tem = !!_data(v.dataAceite);
  if (v.statusCorrecao === 'Aceita' && !tem) return { dataAceite: _data(hojeISO) };
  if (v.statusCorrecao !== 'Aceita' && v.dataAceite) return { dataAceite: '' };
  return null;
}

module.exports = { COLECAO, PESO, emAberto, mesDaFoto, fotoDoMes, patchDataAceite };
