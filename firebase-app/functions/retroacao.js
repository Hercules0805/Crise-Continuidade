/**
 * Retroacao do Risco no Tempo (DECISAO 21/10/2026): o livro de medicoes so
 * tinha o primeiro ponto de cada risco no dia em que ele entrou no sistema,
 * e a curva comecava em 15/09. A decisao do usuario: o risco conta desde a
 * DATA DE IDENTIFICACAO (no risco de vulnerabilidade, a data de deteccao da
 * vulnerabilidade, se mais antiga), com a avaliacao mais antiga conhecida --
 * a de antes nao existe registrada.
 *
 * Esta e a conta, sem Firestore (testada em retroacao.test.js). Quem le e
 * grava e scripts/retroagir-medicoes-risco.js.
 */
'use strict';

const { FONTE, VALIDADE_DIAS, idDaMedicao, inicioPelaIdentificacao } = require('./medicoes');

const STATUS_SEM_RETROACAO = ['Encerrado', 'Excluído'];
const REGISTRADO_POR = 'script:retroagir-medicoes-risco';

function _dia(v) {
  const d = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

/**
 * Para cada risco: o dia de inicio (identificacao, ou a deteccao da
 * vulnerabilidade de origem se mais antiga) e, quando ele e anterior a
 * primeira medicao, a medicao retroativa a gravar (copia da primeira, status
 * Identificado, `retroativa: true`). Risco de vulnerabilidade com Data de
 * identificacao posterior a deteccao tambem ganha a correcao do campo.
 *
 * @param riscos               [{ id, ...documento }]
 * @param vulnerabilidadesPorId { id: { dataDeteccao } }
 * @param medicoesPorRisco      { riscoId: [medicao, ...] } (fonte risco)
 * @returns { medicoes: [{ id, dados }], correcoesRisco: [{ id, dataIdentificacao, antes }], resumo }
 */
function planoRetroativo(riscos, vulnerabilidadesPorId, medicoesPorRisco) {
  const medicoes = [];
  const correcoesRisco = [];
  let semMedicao = 0, encerradoNaPrimeira = 0, jaNoInicio = 0;
  (riscos || []).forEach((r) => {
    if (!r || !r.id) return;
    const ident = _dia(r.dataIdentificacao);
    const v = r.origem === 'Vulnerabilidade' && r.vulnerabilidadeId ? (vulnerabilidadesPorId || {})[String(r.vulnerabilidadeId)] : null;
    const deteccao = _dia(v && v.dataDeteccao);
    const candidatos = [ident, deteccao].filter(Boolean).sort();
    const inicioDia = candidatos[0] || '';
    if (deteccao && (!ident || deteccao < ident)) {
      correcoesRisco.push({ id: r.id, dataIdentificacao: deteccao, antes: ident });
    }
    const lista = ((medicoesPorRisco || {})[String(r.id)] || []).slice()
      .sort((a, b) => String(a.coletadoEm).localeCompare(String(b.coletadoEm)));
    if (!lista.length) { semMedicao += 1; return; }
    const primeira = lista[0];
    if (STATUS_SEM_RETROACAO.indexOf(String(primeira.classificacao || '')) !== -1) { encerradoNaPrimeira += 1; return; }
    const inicioISO = inicioPelaIdentificacao(inicioDia);
    if (!inicioISO || new Date(inicioISO).getTime() >= new Date(primeira.coletadoEm).getTime()) { jaNoInicio += 1; return; }
    const dados = Object.assign({}, primeira, {
      classificacao: 'Identificado',
      coletadoEm: inicioISO,
      registradoEm: new Date().toISOString(),
      registradoPor: REGISTRADO_POR,
      retroativa: true,
      retroativaDe: String(primeira.coletadoEm),
    });
    dados.validoAte = new Date(new Date(inicioISO).getTime() + VALIDADE_DIAS[FONTE.RISCO] * 86400000).toISOString();
    medicoes.push({ id: idDaMedicao(FONTE.RISCO, `${r.id}__${inicioISO}`), riscoId: r.id, titulo: r.titulo || '', dados });
  });
  return {
    medicoes,
    correcoesRisco,
    resumo: { riscos: (riscos || []).length, retroativas: medicoes.length, semMedicao, encerradoNaPrimeira, jaNoInicio, correcoesDeData: correcoesRisco.length },
  };
}

module.exports = { planoRetroativo, REGISTRADO_POR };
