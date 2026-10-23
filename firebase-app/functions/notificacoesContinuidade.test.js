// Resumo semanal de conformidade de BIA/PCN/DRP (23/10/2026).
const { test } = require('node:test');
const assert = require('node:assert');
const NC = require('./notificacoesContinuidade');
const N = require('./notificacoes');

const HOJE = '2026-10-23';

function dados() {
  return {
    hoje: HOJE,
    processos: [
      { id: 'fin__fat', area: 'Financeiro', processo: 'Faturamento', dependenciaItens: [{ id: 'd1', nome: 'ERP', categoria: 'Sistemas' }] },
      { id: 'rh__folha', area: 'RH', processo: 'Folha Nova', nomesAnteriores: ['RH||Folha'] },
      { id: 'ti__wiki', area: 'TI', processo: 'Wiki' },
    ],
    respostas: [
      { area: 'Financeiro', processo: 'Faturamento', score: 14, timestamp: '2026-05-01T10:00:00Z' },
      { area: 'Financeiro', processo: 'Faturamento', score: 3, timestamp: '2025-01-01T10:00:00Z' },
      { area: 'RH', processo: 'Folha', score: 8, timestamp: '2025-02-01T10:00:00Z' },
    ],
    dependencias: [{ id: 'd1', nome: 'ERP', categoria: 'Sistemas', drpSalvo: '' }],
    servicos: [],
  };
}

test('enriquecerProcessos usa a resposta MAIS NOVA, inclusive pelo nome antigo', () => {
  const [fat, folha, wiki] = NC.enriquecerProcessos(dados().processos, dados().respostas);
  assert.strictEqual(fat.score, 14);
  assert.strictEqual(fat.biaUltimaEm, '2026-05-01T10:00:00Z');
  assert.strictEqual(folha.score, 8, 'achou pelo nome de antes de renomear');
  assert.strictEqual(wiki.avaliado, false);
});

test('tierDoProcesso: score, depois tier manual, depois Pendente', () => {
  assert.strictEqual(NC.tierDoProcesso({ avaliado: true, score: 14 }), 'Tier 1 (Crítico)');
  assert.strictEqual(NC.tierDoProcesso({ tierManual: 'Tier 2 (Essencial)' }), 'Tier 2 (Essencial)');
  assert.strictEqual(NC.tierDoProcesso({}), 'Pendente');
});

test('avaliarConformidade: mesma conta da tela, com a cadeia de dependencias do servidor', () => {
  const r = NC.avaliarConformidade(dados());
  const chaves = r.pendencias.map((p) => `${p.tipo}:${p.situacao}:${p.id}`).sort();
  assert.deepStrictEqual(chaves, [
    'bia:faltando:ti__wiki',
    'bia:vencido:rh__folha',
    'drp:faltando:d1',
    'pcn:faltando:fin__fat',
    'pcn:faltando:rh__folha',
  ]);
});

const perfis = [
  { id: 'op@fortestecnologia.com.br', perfis: ['operador_processos'] },
  { id: 'gestor.rh@fortestecnologia.com.br', perfis: ['gestor'], area: 'RH' },
  { id: 'gestor.ti@fortestecnologia.com.br', perfis: ['gestor'], area: 'Compras' },
  { id: 'admin@fortestecnologia.com.br', perfis: ['admin'] },
  { id: 'fora@gmail.com', perfis: ['operador_processos'] },
  { id: 'adm@fortestecnologia.com.br', perfis: ['operador'] },
];

test('destinatarios: operador de processos recebe tudo; gestor desligado por padrao', () => {
  const pend = NC.avaliarConformidade(dados()).pendencias;
  const por = NC.resolverDestinatariosContinuidade(pend, { perfis, config: {} });
  assert.deepStrictEqual([...por.keys()], ['op@fortestecnologia.com.br'], 'so dominio; Operador Administrativo nao entra');
  assert.strictEqual(por.get('op@fortestecnologia.com.br').pendencias.length, pend.length);
});

test('destinatarios: gestor ligado recebe so os processos da propria area; sem pendencia nao recebe', () => {
  const pend = NC.avaliarConformidade(dados()).pendencias;
  const config = { continuidade: { destinatarios: { operadoresProcessos: false, gestores: true } } };
  const por = NC.resolverDestinatariosContinuidade(pend, { perfis, config });
  assert.deepStrictEqual([...por.keys()], ['gestor.rh@fortestecnologia.com.br']);
  const x = por.get('gestor.rh@fortestecnologia.com.br');
  assert.ok(x.pendencias.every((p) => p.area === 'RH'));
  assert.deepStrictEqual(x.motivos, ['gestor']);
});

test('montarResumoContinuidade: assunto com o total, itens por tipo, link para a tela e escape de HTML', () => {
  const pend = NC.avaliarConformidade(dados()).pendencias;
  pend[0].nome = '<script>x</script>';
  const m = NC.montarResumoContinuidade(pend, { dia: HOJE, motivos: ['operadorProcessos'] });
  assert.match(m.assunto, /^\[Continuidade\] Conformidade de BIA\/PCN\/DRP — 23\/10\/2026: 5 pendência\(s\)$/);
  assert.match(m.html, /#conformidade/);
  assert.ok(!m.html.includes('<script>x'), 'nome escapado');
  assert.match(m.texto, /Você recebe este resumo como Operador de Processos\./);
  assert.match(m.texto, /PCN/);
});

test('montarResumoContinuidade corta a lista longa e avisa quantas faltam', () => {
  const pend = Array.from({ length: NC.MAX_ITENS_EMAIL + 5 }, (_, i) => ({ tipo: 'bia', situacao: 'faltando', nome: 'P' + i, mensagem: 'Processo sem BIA', area: 'X', tier: 'Pendente' }));
  const m = NC.montarResumoContinuidade(pend, { dia: HOJE });
  assert.match(m.texto, /E mais 5 pendência\(s\)/);
});

test('semanaDe devolve a segunda-feira da semana', () => {
  assert.strictEqual(NC.semanaDe('2026-10-23'), '2026-10-19');
  assert.strictEqual(NC.semanaDe('2026-10-19'), '2026-10-19');
  assert.strictEqual(NC.semanaDe('2026-10-25'), '2026-10-19');
});

test('config: resumo semanal ligado e gestores desligados por padrao', () => {
  assert.deepStrictEqual(N.normalizarConfig({}).continuidade, {
    resumoSemanal: true, destinatarios: { operadoresProcessos: true, gestores: false },
  });
  assert.strictEqual(N.normalizarConfig({ continuidade: { resumoSemanal: false } }).continuidade.resumoSemanal, false);
});
