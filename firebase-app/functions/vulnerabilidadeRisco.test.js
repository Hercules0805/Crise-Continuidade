const { test } = require('node:test');
const assert = require('node:assert');
const VR = require('./vulnerabilidadeRisco');

const HOJE = '2026-10-06T12:00:00.000Z';
const vuln = (extra) => Object.assign({ id: 'v1', codigo: '2026-099', nome: 'Falha X', produto: 'Sistema Y', cvss: 9.8, statusCorrecao: 'Aberto' }, extra);
const riscoAberto = (extra) => Object.assign({ id: 'r1', vulnerabilidadeId: 'v1', origem: 'Vulnerabilidade', status: 'Identificado' }, extra);

const decidir = (o) => VR.decidir(Object.assign({ riscos: [], limiar: 7, hoje: HOJE }, o));

// ============================================================
// ABRIR
// ============================================================

test('CVSS no limiar ou acima abre risco', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: 9.8 }) });
  assert.strictEqual(d.acao, 'abrir');
  assert.strictEqual(d.risco.origem, 'Vulnerabilidade');
  assert.strictEqual(d.risco.vulnerabilidadeId, 'v1');
  assert.match(d.risco.titulo, /Falha X/);
  assert.match(d.risco.titulo, /9\.8/);
});

test('o risco nasce na categoria Operacional da lista fechada', () => {
  const d = decidir({ vulnerabilidade: vuln() });
  assert.strictEqual(d.risco.categoria, 'Operacional');
});

test('o risco nasce SEM impacto — quem decide o quanto dói é gente', () => {
  const d = decidir({ vulnerabilidade: vuln() });
  assert.strictEqual(d.risco.impacto, undefined);
  assert.ok(d.risco.probabilidade, 'a probabilidade vem do exploit disponível');
});

test('exploit disponível sugere probabilidade Alta; sem exploit, Média', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: 'Sim' }) }).risco.probabilidade, 'Alta');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: 'Não' }) }).risco.probabilidade, 'Média');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: '' }) }).risco.probabilidade, 'Média');
});

test('CVSS zero abre risco só se cruzar o limiar — zero é nota real, não ausência', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: 0 }) });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /abaixo do limiar/);
});

test('a vulnerabilidade entra como corporativa, sem área', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln() }).risco.area, '');
});

test('sem CVSS, cai para a severidade manual (planilha "CVSS não se aplica")', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: null, severidadeManual: 'Alta' }) });
  assert.strictEqual(d.acao, 'abrir');
  assert.match(d.risco.titulo, /Alta/);
});

test('severidade manual Baixa fica abaixo do limiar e não abre', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: null, severidadeManual: 'Baixa' }) });
  assert.strictEqual(d.acao, 'nada');
});

// ============================================================
// NAO DUPLICAR
// ============================================================

test('editar a mesma vulnerabilidade de novo NAO abre segundo risco', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /já existe risco aberto/);
});

test('risco aberto de OUTRA vulnerabilidade não impede abrir o desta', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ id: 'r9', vulnerabilidadeId: 'v2' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco criado à mão (origem diferente) não impede o automático', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ origem: 'Manual' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco automático já Encerrado ou Aceito não conta como aberto', () => {
  ['Encerrado', 'Aceito'].forEach((status) => {
    const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ status })] });
    assert.strictEqual(d.acao, 'abrir', `status ${status} nao deveria bloquear`);
  });
});

// ============================================================
// ENCERRAR (Status da Correção vira Corrigida/Aceita)
// ============================================================

test('status Corrigida encerra o risco automático aberto', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Corrigida' }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'encerrar');
  assert.deepStrictEqual(d.ids, ['r1']);
  assert.strictEqual(d.patch.status, 'Encerrado');
  assert.strictEqual(d.patch.dataEncerramento, '2026-10-06');
  assert.match(d.patch.justificativaEncerramento, /Corrigida/);
});

test('status Aceita também encerra o risco automático aberto', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Aceita' }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'encerrar');
});

test('encerra TODOS os automáticos abertos, se houver mais de um', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Corrigida' }), riscos: [riscoAberto(), riscoAberto({ id: 'r2' })] });
  assert.deepStrictEqual(d.ids, ['r1', 'r2']);
});

test('Corrigida sem risco aberto não faz nada', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Corrigida' }) });
  assert.strictEqual(d.acao, 'nada');
});

test('o risco criado à mão NÃO é encerrado pelo servidor', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Corrigida' }), riscos: [riscoAberto({ origem: 'Manual' })] });
  assert.strictEqual(d.acao, 'nada');
});

// ============================================================
// IMPORTACAO DE HISTORICO -- a decisao mais importante deste modulo
// ============================================================

test('vulnerabilidade histórica importada já Corrigida NUNCA abre risco, mesmo com CVSS crítico', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: 9.8, statusCorrecao: 'Corrigida' }) });
  assert.strictEqual(d.acao, 'nada');
});

test('vulnerabilidade histórica importada já Aceita NUNCA abre risco, mesmo com CVSS crítico', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: 9.8, statusCorrecao: 'Aceita' }) });
  assert.strictEqual(d.acao, 'nada');
});

test('vulnerabilidade histórica ainda Aberta segue a regra normal do limiar', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 9.8, statusCorrecao: 'Aberto' }) }).acao, 'abrir');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 2, statusCorrecao: 'Aberto' }) }).acao, 'nada');
});

// ============================================================
// LIMIAR
// ============================================================

test('exatamente no limiar já abre (>=, não >)', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 7 }) }).acao, 'abrir');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 6.9 }) }).acao, 'nada');
});

test('limiar configurado é respeitado', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 8 }), limiar: 9 }).acao, 'nada');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 3 }), limiar: 2 }).acao, 'abrir');
});

test('limiar ausente ou fora de 0 a 10 cai no padrão 7.0', () => {
  assert.strictEqual(VR.LIMIAR_CVSS_PADRAO, 7.0);
  [undefined, null, '', 'muito', -5, 20].forEach((lim) => {
    assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 7.5 }), limiar: lim }).acao, 'abrir', `limiar ${lim}`);
    assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 6 }), limiar: lim }).acao, 'nada', `limiar ${lim}`);
  });
});

// ============================================================
// AUSENCIA DE CVSS E SEVERIDADE
// ============================================================

test('sem CVSS e sem severidade manual não abre nem encerra nada', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: null, severidadeManual: '' }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /sem CVSS nem severidade/);
});

test('vulnerabilidade sem id não faz nada', () => {
  const d = decidir({ vulnerabilidade: vuln({ id: '' }) });
  assert.strictEqual(d.acao, 'nada');
  assert.match(d.motivo, /sem id/);
});

test('acimaDoLimiar nunca trata ausência como zero', () => {
  assert.strictEqual(VR.acimaDoLimiar(null, 7), false);
  assert.strictEqual(VR.acimaDoLimiar('', 7), false);
  assert.strictEqual(VR.acimaDoLimiar(undefined, 7), false);
  assert.strictEqual(VR.acimaDoLimiar(0, 7), false);
  assert.strictEqual(VR.acimaDoLimiar(7, 7), true);
});

test('listas nulas não quebram', () => {
  assert.deepStrictEqual(VR.riscosAbertosDaVulnerabilidade(null, 'v1'), []);
  assert.deepStrictEqual(VR.riscosAbertosDaVulnerabilidade([riscoAberto()], ''), []);
});

// ============================================================
// construirRisco -- molde reaproveitado pela importação MANUAL
// (importarVulnerabilidadeParaRisco, appLogic.js), sem checar limiar/status.
// ============================================================

test('construirRisco monta os mesmos campos que decidir() abre automaticamente', () => {
  const r = construirRiscoDoDecidir();
  const manual = VR.construirRisco(vuln(), { hoje: HOJE, limiar: 7 });
  // Mesmos campos, exceto a descrição (o texto do motivo muda entre automático/manual).
  const { descricao: descAuto, ...restoAuto } = r;
  const { descricao: descManual, ...restoManual } = manual;
  assert.deepStrictEqual(restoAuto, restoManual);
});

function construirRiscoDoDecidir() {
  return decidir({ vulnerabilidade: vuln(), riscos: [], limiar: 7, hoje: HOJE }).risco;
}

test('construirRisco(manual:true) deixa claro no texto que foi importação manual', () => {
  const r = VR.construirRisco(vuln(), { hoje: HOJE, manual: true });
  assert.match(r.descricao, /manualmente/);
  assert.doesNotMatch(r.descricao, /limiar/);
});

test('construirRisco sem manual (automático) cita o limiar configurado', () => {
  const r = VR.construirRisco(vuln(), { hoje: HOJE, limiar: 7 });
  assert.match(r.descricao, /limiar de 7/);
});

test('construirRisco funciona mesmo para vulnerabilidade já Corrigida/Aceita (import manual ignora status)', () => {
  const r = VR.construirRisco(vuln({ statusCorrecao: 'Corrigida' }), { hoje: HOJE, manual: true });
  assert.strictEqual(r.origem, 'Vulnerabilidade');
  assert.strictEqual(r.vulnerabilidadeId, 'v1');
});

test('construirRisco funciona mesmo com severidade abaixo do limiar (import manual ignora limiar)', () => {
  const r = VR.construirRisco(vuln({ cvss: 1 }), { hoje: HOJE, manual: true });
  assert.match(r.titulo, /CVSS 1/);
});
