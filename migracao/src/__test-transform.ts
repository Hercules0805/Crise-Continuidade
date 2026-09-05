/**
 * Teste rápido dos transformers (roda com ts-node, sem dependências externas).
 *   npx ts-node src/__test-transform.ts
 *
 * Verifica shapes, docIds estáveis e parse de campos JSON, garantindo que o
 * export gere exatamente o que a camada api.js espera ler do Firestore.
 */
import * as assert from 'assert';
import {
  transformPerguntas,
  transformAreas,
  transformProcessos,
  transformRespostas,
  transformDependencias,
  transformComponentes,
  transformConfigRespostas,
  transformConfigPerfis,
  transformTokens,
  processoKey,
} from './transform';

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// PERGUNTAS
ok('perguntas: shape e ativa default true', () => {
  const rows = [
    ['Categoria', 'Pergunta', 'Descricao', 'Ativa'],
    ['Impacto', 'Pergunta A?', 'desc a', ''],
    ['Impacto', 'Pergunta B?', 'desc b', false],
  ];
  const out = transformPerguntas(rows);
  assert.strictEqual(out.docs.length, 2);
  assert.strictEqual(out.docs[0].data.pergunta, 'Pergunta A?');
  assert.strictEqual(out.docs[0].data.ativa, true);
  assert.strictEqual(out.docs[1].data.ativa, false);
});

// AREAS + docId estável
ok('areas: docId slug do nome', () => {
  const rows = [
    ['Nome', 'Resp', 'Email', 'Solucao'],
    ['TI Infra', 'Fulano', 'f@x.com', 'Sol'],
  ];
  const out = transformAreas(rows);
  assert.strictEqual(out.docs[0].id, 'area-ti-infra');
  assert.strictEqual(out.docs[0].data.email, 'f@x.com');
});

// PROCESSOS: campos JSON viram nativo e docId = processoKey
ok('processos: JSON nativo + docId processoKey', () => {
  const rows: any[][] = [
    ['area', 'processo', 'descricao', 'dependencia', 'rto', 'rpo', 'mtpd', 'biaHomologada', 'tier',
     'bcpStatus', 'descricaoFuncional', 'impactoIndisponibilidade', 'bcpObjetivo', 'bcpEscopo', 'bcpContatos', 'bcpRiscos', 'bcpPreventivas',
     'drpStatus', 'drpObjetivo', 'drpEscopo', 'drpProcedimentos', 'drpCriterios', 'drpComponentes',
     'mtd', 'workaround', 'impactoJanela', 'bcpPlanoBProvedores', 'bcpSlas', 'bcpGatilhos', 'bcpReconstituicao', 'bcpPapeisCrise', 'pcnSalvo', 'tierManual'],
    ['TI', 'Backup', 'desc', '', '< 4 horas', '', '', '', 'Tier 1 (Crítico)',
     '', '', '{"a":1}', '', '', '[{"nome":"João"}]', '[]', '[]',
     '', '', '', '', '', '[]',
     '', '', '', '', '', '', '', '', '', ''],
  ];
  const out = transformProcessos(rows);
  const d = out.docs[0];
  assert.strictEqual(d.id, processoKey('TI', 'Backup'));
  assert.strictEqual(d.id, 'ti__backup');
  assert.deepStrictEqual(d.data.impactoIndisponibilidade, { a: 1 });
  assert.deepStrictEqual(d.data.bcpContatos, [{ nome: 'João' }]);
  assert.strictEqual(d.data.tier, 'Tier 1 (Crítico)');
});

// RESPOSTAS: scores por pergunta + score/tier
ok('respostas: scores map + score/tier', () => {
  const rows: any[][] = [
    ['Timestamp', 'Respondente', 'Cargo', 'Área', 'Processo', 'Pergunta A?', 'Pergunta B?', 'Score', 'Tier'],
    ['2024-01-01T10:00:00Z', 'Fulano', 'Analista', 'TI', 'Backup', '4', '2', '6', 'Tier 2 (Essencial)'],
  ];
  const out = transformRespostas(rows);
  const d = out.docs[0];
  assert.strictEqual(d.data.area, 'TI');
  assert.deepStrictEqual(d.data.scores, { 'Pergunta A?': 4, 'Pergunta B?': 2 });
  assert.strictEqual(d.data.score, 6);
  assert.strictEqual(d.data.tier, 'Tier 2 (Essencial)');
});

// TOKENS: docId = token, usado boolean
ok('tokens: docId = token e usado boolean', () => {
  const rows: any[][] = [
    ['Token', 'Área', 'Processo', 'Email', 'Criado em', 'Expira em', 'Usado'],
    ['abc-123', 'TI', '_AREA_', 'e@x.com', '2024-01-01', '2024-01-08', true],
  ];
  const out = transformTokens(rows);
  assert.strictEqual(out.docs[0].id, 'abc-123');
  assert.strictEqual(out.docs[0].data.usado, true);
  assert.strictEqual(out.docs[0].data.processo, '_AREA_');
});

// CONFIG PERFIS: docId = email lowercase
ok('config_perfis: docId email lowercase', () => {
  const rows: any[][] = [
    ['Email', 'Perfil'],
    ['Admin@Fortestecnologia.com.br', 'admin'],
  ];
  const out = transformConfigPerfis(rows);
  assert.strictEqual(out.docs[0].id, 'admin@fortestecnologia.com.br');
  assert.strictEqual(out.docs[0].data.perfil, 'admin');
});

// CONFIG RESPOSTAS
ok('config_respostas: campos e ordem', () => {
  const rows: any[][] = [
    ['Categoria', 'Valor', 'Label', 'Cor', 'Background'],
    ['Geral', '4', 'Alto', '#c62828', '#ffebee'],
  ];
  const out = transformConfigRespostas(rows);
  assert.strictEqual(out.docs[0].data.categoria, 'Geral');
  assert.strictEqual(out.docs[0].data.valor, '4');
});

// DEPENDENCIAS / COMPONENTES
ok('dependencias/componentes: shape', () => {
  const dep = transformDependencias([
    ['Categoria', 'Nome', 'Papel', 'Setor', 'Empresa', 'Telefone', 'Email', 'Endereço'],
    ['Pessoas', 'Equipe X', 'papel', 's', 'emp', 't', 'e@x', 'end'],
  ]);
  assert.strictEqual(dep.docs[0].data.nome, 'Equipe X');
  assert.strictEqual(dep.docs[0].data.detalhes, 'papel');

  const comp = transformComponentes([
    ['Tipo', 'Nome', 'Descrição', 'RTO', 'RPO', 'Estratégia', 'Responsável'],
    ['Sistema', 'ERP', 'desc', '4h', '1h', 'backup', 'resp'],
  ]);
  assert.strictEqual(comp.docs[0].data.tipo, 'Sistema');
  assert.strictEqual(comp.docs[0].data.rto, '4h');
});

console.log(`\n${passed} testes de transform OK`);
