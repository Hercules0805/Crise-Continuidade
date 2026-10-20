const { test } = require('node:test');
const assert = require('node:assert');
const VR = require('./vulnerabilidadeRisco');

const HOJE = '2026-10-06T12:00:00.000Z';
const vuln = (extra) => Object.assign({ id: 'v1', codigo: '2026-099', nome: 'Falha X', produto: 'Sistema Y', cvss: 9.8, statusCorrecao: 'Pendente' }, extra);
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

// DECISAO 15/10/2026: o risco nasce completo (antes nascia sem impacto e ficava
// fora do Risco no Tempo ate alguem preencher).
test('sem processo afetado, o impacto vem da severidade (CVSS 9.8 = Crítica -> Muito alto)', () => {
  const d = decidir({ vulnerabilidade: vuln() });
  assert.strictEqual(d.risco.impacto, 'Muito alto');
  assert.ok(d.risco.probabilidade, 'a probabilidade vem do exploit disponível');
  assert.strictEqual(d.risco.area, '');
});

test('exploit disponível sugere probabilidade Alta; sem exploit, Moderada (escala NIST 5x5)', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: 'Sim' }) }).risco.probabilidade, 'Alta');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: 'Não' }) }).risco.probabilidade, 'Moderada');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ exploitDisponivel: '' }) }).risco.probabilidade, 'Moderada');
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

test('editar a mesma vulnerabilidade de novo NAO abre segundo risco (sincroniza o que existe)', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto()] });
  assert.notStrictEqual(d.acao, 'abrir');
  assert.strictEqual(d.acao, 'atualizar');
  assert.deepStrictEqual(d.atualizacoes.map((a) => a.id), ['r1']);
});

test('risco aberto de OUTRA vulnerabilidade não impede abrir o desta', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ id: 'r9', vulnerabilidadeId: 'v2' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco criado à mão (origem diferente) não impede o automático', () => {
  const d = decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ origem: 'Manual' })] });
  assert.strictEqual(d.acao, 'abrir');
});

test('risco Encerrado não conta como ativo; Aceito CONTA (aceitar é resposta ao risco, não fim)', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ status: 'Encerrado' })] }).acao, 'abrir');
  assert.notStrictEqual(decidir({ vulnerabilidade: vuln(), riscos: [riscoAberto({ status: 'Aceito' })] }).acao, 'abrir');
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

test('status Aceita leva o risco ativo a Aceito (estratégia Aceitar, justificativa e reavaliação) — não encerra', () => {
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Aceita', observacoes: 'Sistema será descontinuado' }), riscos: [riscoAberto()] });
  assert.strictEqual(d.acao, 'atualizar');
  const p = d.atualizacoes[0].patch;
  assert.strictEqual(p.status, 'Aceito');
  assert.strictEqual(p.estrategiaTratamento, 'Aceitar');
  assert.match(p.justificativaAceite, /2026-099.*Aceita.*Sistema será descontinuado/);
  // P Média(2) x I Crítico(4) = 8 = nível Alto -> reavaliar em 90 dias.
  assert.strictEqual(p.proximaReavaliacao, '2027-01-04');
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
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 9.8, statusCorrecao: 'Pendente' }) }).acao, 'abrir');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ cvss: 2, statusCorrecao: 'Pendente' }) }).acao, 'nada');
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

test('sem CVSS e sem severidade: não abre; com risco ativo não encerra, só deixa alerta para revisão', () => {
  const sem = decidir({ vulnerabilidade: vuln({ cvss: null, severidadeManual: '' }) });
  assert.strictEqual(sem.acao, 'nada');
  assert.match(sem.motivo, /sem CVSS nem severidade/);
  const com = decidir({ vulnerabilidade: vuln({ cvss: null, severidadeManual: '' }), riscos: [riscoAberto({ importadoManualmente: false })] });
  assert.strictEqual(com.acao, 'atualizar');
  assert.notStrictEqual(com.atualizacoes[0].patch.status, 'Encerrado');
  assert.match(com.atualizacoes[0].patch.alertaAutomacao, /abaixo do limiar/);
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

// ============================================================
// TITULO COM PRODUTO DE SOFTWARE VINCULADO
// ============================================================

test('titulo: sem vinculo e sem texto continua "produto não informado" (como antes)', () => {
  const r = VR.construirRisco(vuln({ produto: '' }), { hoje: HOJE });
  assert.match(r.titulo, / em produto não informado \(CVSS /);
});

test('titulo: so o Ativo afetado (texto) fica igual ao de antes do vinculo', () => {
  const r = VR.construirRisco(vuln({ produto: 'Sistema Y' }), { hoje: HOJE });
  assert.match(r.titulo, /em Sistema Y \(CVSS /);
});

test('titulo: so o Produto de Software vinculado (sem texto) nao diz "produto não informado"', () => {
  const r = VR.construirRisco(vuln({ produto: '' }), { hoje: HOJE, produtoNome: 'Fortes RH' });
  assert.match(r.titulo, /em Fortes RH \(CVSS /);
  assert.ok(!/não informado/.test(r.titulo));
});

test('titulo: produto vinculado + ativo afetado aparecem juntos, separados por " / "', () => {
  const r = VR.construirRisco(vuln({ produto: 'Área Restrita' }), { hoje: HOJE, produtoNome: 'Fortes RH' });
  assert.match(r.titulo, /em Fortes RH \/ Área Restrita \(CVSS /);
});

test('titulo: nome igual nos dois (sem acento/maiuscula) nao se repete', () => {
  const r = VR.construirRisco(vuln({ produto: 'fortes rh' }), { hoje: HOJE, produtoNome: 'Fortes RH' });
  assert.match(r.titulo, /em Fortes RH \(CVSS /);
  assert.ok(!/ \/ /.test(r.titulo.split(' em ')[1].split(' (CVSS')[0]));
});

test('decidir repassa o nome do produto para o titulo do risco que abre', () => {
  const d = decidir({ vulnerabilidade: vuln({ produto: '', cvss: 9.8 }), produtoNome: 'Colabore' });
  assert.strictEqual(d.acao, 'abrir');
  assert.match(d.risco.titulo, /em Colabore \(CVSS 9.8\)/);
});

// DECISAO 15/10/2026: a categoria do risco segue o Tipo da vulnerabilidade.
test('Nao Conformidade abre risco Regulatorio/Legal; outros tipos e sem tipo continuam Operacional', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ tipo: 'Não Conformidade' }) }).risco.categoria, 'Regulatório/Legal');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ tipo: 'Má Configuração' }) }).risco.categoria, 'Operacional');
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ tipo: 'Falha de Software (CVE / Bug)' }) }).risco.categoria, 'Operacional');
  assert.strictEqual(decidir({ vulnerabilidade: vuln() }).risco.categoria, 'Operacional');
});

test('importacao manual tambem segue o Tipo (mesma construirRisco)', () => {
  const r = VR.construirRisco(vuln({ tipo: 'Não Conformidade', subtipo: 'Licenciamento' }), { manual: true });
  assert.strictEqual(r.categoria, 'Regulatório/Legal');
  assert.match(r.descricao, /Tipo: Não Conformidade \/ Licenciamento\./);
});

test('sem tipo, a descricao do risco nao cita tipo', () => {
  assert.doesNotMatch(VR.construirRisco(vuln(), {}).descricao, /Tipo:/);
});

test('a categoria de Nao Conformidade existe na lista fechada de categorias de risco da tela', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(app.includes("valor: 'Regulatório/Legal'"), 'RISCO_CATEGORIAS precisa ter Regulatório/Legal');
  assert.ok(app.includes("tipo: 'Não Conformidade'"), 'VULNERABILIDADE_TIPOS precisa ter o texto que o servidor compara');
});

// DECISAO 15/10/2026: "Dependencias afetadas" substituem o texto livre "Ativo afetado".
test('titulo do risco cita as dependencias afetadas; sem dependencia cai no texto antigo', () => {
  const comDeps = VR.construirRisco(vuln({ produto: '.NET', dependenciasAfetadas: [{ id: 'i1', categoria: 'Infraestrutura', nome: 'Firewall' }, { id: 'b1', categoria: 'Banco de Dados', nome: 'SQL Server' }] }), { produtoNome: 'Fortes RH' });
  assert.match(comDeps.titulo, /em Fortes RH \/ Firewall \/ SQL Server \(/);
  assert.doesNotMatch(comDeps.titulo, /\.NET/, 'com dependencia, o legado nao entra no titulo');
  const legado = VR.construirRisco(vuln({ produto: '.NET' }), {});
  assert.match(legado.titulo, /em \.NET \(/);
});

// ============================================================
// SINCRONIZACAO (15/10/2026) -- NIST: o risco acompanha a vulnerabilidade
// ============================================================

const historicoRisco = require('./historicoRisco');
// Processos com score de BIA ja unido (como resolverProcessosComBia entrega).
const PROCS = {
  p1: { id: 'p1', processo: 'Folha', area: 'RH', score: 99, avaliado: true, dependenciaItens: [{ id: 'd1', categoria: 'Sistemas', nome: 'Fortes RH' }] },
  p2: { id: 'p2', processo: 'Ponto', area: 'Operações', score: 1, avaliado: true, dependenciaItens: [{ id: 'd1' }, { id: 'd2' }] },
  p3: { id: 'p3', processo: 'Sem vínculo', area: 'TI', score: 99, avaliado: true, dependenciaItens: [{ id: 'd9' }] },
};
const comDeps = (extra) => vuln(Object.assign({ dependenciasAfetadas: [{ id: 'd1', categoria: 'Sistemas', nome: 'Fortes RH' }] }, extra));

test('cadeia de impacto: processos que dependem da dependência afetada, maior Tier primeiro', () => {
  const afetados = VR.processosAfetados(comDeps(), PROCS);
  assert.deepStrictEqual(afetados.map((p) => p.id), ['p1', 'p2']);
  assert.strictEqual(afetados[0].tier, historicoRisco.tierDoProcesso(PROCS.p1));
  assert.deepStrictEqual(VR.processosAfetados(vuln(), PROCS), [], 'sem dependência afetada, sem processo');
});

test('impacto pelo processo mais crítico afetado; área e processo do risco = os dele', () => {
  const afetados = VR.processosAfetados(comDeps(), PROCS);
  const d = decidir({ vulnerabilidade: comDeps({ cvss: 7.5 }), processosAfetados: afetados });
  assert.strictEqual(d.risco.impacto, 'Muito alto', 'Tier 1 -> Muito alto, mesmo com severidade só Alta');
  assert.strictEqual(d.risco.area, 'RH');
  assert.strictEqual(d.risco.processoId, 'p1');
  assert.match(d.risco.descricao, /Processos afetados: Folha \(RH, Tier 1.*Ponto \(Operações/);
});

test('o risco nasce completo: responsável, categorias, item de correção no plano de ação e sincronizado', () => {
  const d = decidir({ vulnerabilidade: vuln({ responsavel: 'Ana', dataPrevistaCorrecao: '2026-12-01', ticketCorrecao: 'T-9' }) });
  assert.strictEqual(d.risco.responsavel, 'Ana');
  assert.deepStrictEqual(d.risco.categorias, ['Operacional']);
  assert.strictEqual(d.risco.funcaoCsf, 'Identificar');
  assert.strictEqual(d.risco.planoAcao.length, 1);
  const it = d.risco.planoAcao[0];
  assert.match(it.acao, /Corrigir a vulnerabilidade 2026-099/);
  assert.strictEqual(it.responsavel, 'Ana');
  assert.strictEqual(it.quando, '2026-12-01');
  assert.strictEqual(it.como, 'Ticket T-9');
  assert.strictEqual(it.status, 'Pendente');
  assert.strictEqual(d.risco.sincronizado.responsavel, 'Ana');
  assert.strictEqual(d.risco.sincronizado.acaoCorrecao, true);
});

test('vulnerabilidade muda -> risco ativo acompanha (exploit, responsável, Em Correção -> Em Tratamento/Mitigar)', () => {
  const inicial = decidir({ vulnerabilidade: vuln() }).risco;
  const risco = Object.assign({ id: 'r1' }, inicial);
  const d = decidir({ vulnerabilidade: vuln({ exploitDisponivel: 'Sim', responsavel: 'Bruno', statusCorrecao: 'Em Correção' }), riscos: [risco] });
  assert.strictEqual(d.acao, 'atualizar');
  const p = d.atualizacoes[0].patch;
  assert.strictEqual(p.probabilidade, 'Alta');
  assert.strictEqual(p.responsavel, 'Bruno');
  assert.strictEqual(p.status, 'Em Tratamento');
  assert.strictEqual(p.estrategiaTratamento, 'Mitigar');
  assert.strictEqual(p.planoAcao[0].status, 'Em andamento');
  assert.strictEqual(p.planoAcao[0].responsavel, 'Bruno');
});

test('EDIÇÃO HUMANA VENCE: campo mudado na tela deixa de ser sincronizado', () => {
  const inicial = decidir({ vulnerabilidade: vuln() }).risco;
  const risco = Object.assign({ id: 'r1' }, inicial, { impacto: 'Baixo', status: 'Em Monitoramento' });
  const d = decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Em Correção', responsavel: 'Bruno' }), riscos: [risco] });
  const p = d.atualizacoes[0].patch;
  assert.ok(!('impacto' in p), 'impacto da pessoa preservado');
  assert.ok(!('status' in p), 'status da pessoa preservado');
  assert.strictEqual(p.responsavel, 'Bruno', 'o resto continua sincronizado');
});

test('item de correção editado na tela vira da pessoa: não é sobrescrito nem duplicado', () => {
  const inicial = decidir({ vulnerabilidade: vuln() }).risco;
  const editado = Object.assign({}, inicial.planoAcao[0], { acao: 'Plano próprio' });
  delete editado.origemAutomacao;
  const risco = Object.assign({ id: 'r1' }, inicial, { planoAcao: [editado] });
  const d = decidir({ vulnerabilidade: vuln({ responsavel: 'Bruno' }), riscos: [risco] });
  assert.ok(!('planoAcao' in d.atualizacoes[0].patch));
});

test('sem mudança na vulnerabilidade -> nada (não regrava o risco a cada edição)', () => {
  const v = vuln({ responsavel: 'Ana' });
  const risco = Object.assign({ id: 'r1' }, decidir({ vulnerabilidade: v }).risco);
  assert.strictEqual(decidir({ vulnerabilidade: v, riscos: [risco] }).acao, 'nada');
});

test('data prevista vencida marca o item de correção como Atrasado; aceita não fica atrasada', () => {
  const d = decidir({ vulnerabilidade: vuln({ dataPrevistaCorrecao: '2026-10-01' }) }); // HOJE = 2026-10-06
  assert.strictEqual(d.risco.planoAcao[0].status, 'Atrasado');
  const aceita = VR.itemDeCorrecao(vuln({ dataPrevistaCorrecao: '2026-10-01', statusCorrecao: 'Aceita' }), 'X', HOJE);
  assert.strictEqual(aceita.status, 'Pendente');
});

test('severidade cai abaixo do limiar: não encerra; alerta + linha no histórico; volta acima -> alerta some', () => {
  const risco = Object.assign({ id: 'r1' }, decidir({ vulnerabilidade: vuln() }).risco);
  const p = decidir({ vulnerabilidade: vuln({ cvss: 4.0 }), riscos: [risco] }).atualizacoes[0].patch;
  assert.match(p.alertaAutomacao, /Média \(abaixo do limiar 7\)/);
  assert.match(p.historicoReavaliacao, /^2026-10-06 — \[automático\] Severidade caiu/);
  assert.notStrictEqual(p.status, 'Encerrado');
  const volta = decidir({ vulnerabilidade: vuln({ cvss: 9.8 }), riscos: [Object.assign({}, risco, p)] });
  assert.strictEqual(volta.atualizacoes[0].patch.alertaAutomacao, '');
});

test('exclusão da vulnerabilidade encerra o risco ativo (não deixa órfão), inclusive Aceito', () => {
  const d = decidir({ vulnerabilidade: vuln(), excluida: true, riscos: [riscoAberto(), riscoAberto({ id: 'r2', status: 'Aceito' })] });
  assert.strictEqual(d.acao, 'encerrar');
  assert.deepStrictEqual(d.ids, ['r1', 'r2']);
  assert.match(d.patch.justificativaEncerramento, /excluída do cadastro/);
  assert.strictEqual(decidir({ vulnerabilidade: vuln(), excluida: true }).acao, 'nada');
});

test('Corrigida encerra também o risco Aceito', () => {
  assert.strictEqual(decidir({ vulnerabilidade: vuln({ statusCorrecao: 'Corrigida' }), riscos: [riscoAberto({ status: 'Aceito' })] }).acao, 'encerrar');
});

test('risco legado (sem `sincronizado`): só preenche o vazio e o que a automação escreveu', () => {
  const legado = riscoAberto({ titulo: 'Título antigo', probabilidade: 'Média', impacto: 'Alto', responsavel: 'Carla' });
  const p = decidir({ vulnerabilidade: vuln({ responsavel: 'Bruno', exploitDisponivel: 'Sim' }), riscos: [legado] }).atualizacoes[0].patch;
  assert.strictEqual(p.probabilidade, 'Alta', 'probabilidade foi a automação que escreveu');
  assert.ok(!('impacto' in p), 'impacto preenchido por gente fica');
  assert.ok(!('responsavel' in p), 'responsável preenchido por gente fica');
  assert.strictEqual(p.planoAcao.length, 1, 'ganha o item de correção');
});

test('nível do risco (matriz NIST) e próxima reavaliação seguem a régua (Muito alto 30, Alto 90, Moderado 180, Baixo 365)', () => {
  assert.strictEqual(VR.nivelDoRisco('Alta', 'Crítico'), 'Muito alto', 'rótulo antigo normalizado');
  assert.strictEqual(VR.nivelDoRisco('Alta', 'Alto'), 'Alto');
  assert.strictEqual(VR.proximaReavaliacaoSugerida('Alta', 'Crítico', '2026-10-06'), '2026-11-05');
  assert.strictEqual(VR.proximaReavaliacaoSugerida('Baixa', 'Baixo', '2026-10-06'), '2027-10-06');
  assert.strictEqual(VR.proximaReavaliacaoSugerida('', 'Baixo', '2026-10-06'), null);
});

test('risco importado à mão abaixo do limiar NÃO recebe o alerta de severidade (decisão foi humana)', () => {
  const manual = Object.assign({ id: 'r1' }, VR.construirRisco(vuln({ cvss: 5.3 }), { manual: true, hoje: HOJE }));
  assert.strictEqual(manual.importadoManualmente, true);
  const d = decidir({ vulnerabilidade: vuln({ cvss: 5.3, responsavel: 'Bruno' }), riscos: [manual] });
  assert.ok(!d.atualizacoes[0].patch.alertaAutomacao);
  // risco antigo importado: reconhecido pelo texto da descrição
  const legado = riscoAberto({ descricao: 'A vulnerabilidade X ... Risco criado manualmente a partir do cadastro da vulnerabilidade.' });
  const d2 = decidir({ vulnerabilidade: vuln({ cvss: 5.3 }), riscos: [legado] });
  assert.ok(!d2.atualizacoes[0].patch.alertaAutomacao);
});

test('campo vazio que nunca existiu no risco antigo não vira "mudança" (sem regravar texto vazio)', () => {
  const legado = riscoAberto({ titulo: VR.camposSincronizados(vuln(), {}).titulo, probabilidade: 'Média', impacto: 'Crítico', categorias: ['Operacional'], responsavel: '' });
  const d = decidir({ vulnerabilidade: vuln(), riscos: [legado] });
  const p = d.atualizacoes[0].patch;
  assert.ok(!('processo' in p) && !('estrategiaTratamento' in p) && !('area' in p));
});

test('risco antigo sem marca e sem o texto da abertura automática: na dúvida, não alerta', () => {
  const d = decidir({ vulnerabilidade: vuln({ cvss: 5 }), riscos: [riscoAberto({ descricao: 'Texto reescrito por alguém.' })] });
  assert.ok(!d.atualizacoes[0].patch.alertaAutomacao);
  const auto = decidir({ vulnerabilidade: vuln({ cvss: 5 }), riscos: [riscoAberto({ descricao: '... Severidade no ou acima do limiar de 7 configurado ...' })] });
  assert.match(auto.atualizacoes[0].patch.alertaAutomacao, /abaixo do limiar/);
});

test('o risco de vulnerabilidade nasce com a declaração estruturada do NIST SP 800-30', () => {
  const afetados = VR.processosAfetados(comDeps(), PROCS);
  const r = decidir({ vulnerabilidade: comDeps({ cwe: 'CWE-79' }), processosAfetados: afetados }).risco;
  assert.strictEqual(r.fonteAmeaca, 'Estrutural / falha técnica');
  assert.match(r.eventoAmeaca, /exploração da vulnerabilidade "Falha X"/);
  assert.match(r.condicaoPredisponente, /2026-099 \(CWE-79\) em/);
  assert.strictEqual(r.consequencia, 'comprometimento de Folha, Ponto');
});

// ============================================================
// PRODUTO DE SOFTWARE herdado (20/10/2026)
// ============================================================

test('produto: o risco nasce com o Produto de Software da vulnerabilidade', () => {
  const d = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps1' }) });
  assert.strictEqual(d.risco.produtoSoftwareId, 'ps1');
  assert.strictEqual(d.risco.sincronizado.produtoSoftwareId, 'ps1');
});

test('produto: trocar na vulnerabilidade propaga; risco antigo vazio e preenchido', () => {
  const base = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps1' }) }).risco;
  const troca = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps2' }), riscos: [Object.assign({ id: 'r1' }, base)] });
  assert.strictEqual(troca.acao, 'atualizar');
  assert.strictEqual(troca.atualizacoes[0].patch.produtoSoftwareId, 'ps2');
  const antigo = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps1' }), riscos: [riscoAberto({ sincronizado: { titulo: 'x' } })] });
  assert.strictEqual(antigo.atualizacoes[0].patch.produtoSoftwareId, 'ps1', 'campo vazio e sem baseline: a automacao preenche');
});

test('produto: trocado a mao no risco, a automacao nao sobrescreve', () => {
  const base = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps1' }) }).risco;
  const editado = Object.assign({ id: 'r1' }, base, { produtoSoftwareId: 'ps9' });
  const d = decidir({ vulnerabilidade: vuln({ produtoSoftwareId: 'ps2' }), riscos: [editado] });
  const patch = d.acao === 'atualizar' ? d.atualizacoes[0].patch : {};
  assert.ok(!('produtoSoftwareId' in patch), 'escolha humana prevalece');
});
