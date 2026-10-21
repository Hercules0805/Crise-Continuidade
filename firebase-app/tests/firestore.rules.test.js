/**
 * Testes das Security Rules do Firestore.
 *
 * Rodar com o emulador:
 *   cd firebase-app/tests && npm install
 *   cd firebase-app && firebase emulators:exec --only firestore \
 *     "node --experimental-vm-modules tests/node_modules/.bin/jest --runInBand --config tests/jest.config.js"
 *
 * Ou usar o script "npm test" dentro de firebase-app/tests (ajuste de path incluso).
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'bia-forte-2025';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

let testEnv;

const ADMIN = { email: 'admin@fortestecnologia.com.br' };
const GESTOR = { email: 'gestor@fortestecnologia.com.br' };
const FORA = { email: 'alguem@gmail.com' };

// Semear config_perfis e uma área com bypass das regras.
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('config_perfis/admin@fortestecnologia.com.br').set({
      email: 'admin@fortestecnologia.com.br',
      perfil: 'admin',
    });
    await db.doc('config_perfis/gestor@fortestecnologia.com.br').set({
      email: 'gestor@fortestecnologia.com.br',
      perfil: 'gestor',
      area: 'TI',
    });
    await db.doc('perguntas/p1').set({ categoria: 'C', pergunta: 'Q?', ativa: true });
    await db.doc('processos/ti__proc').set({ area: 'TI', processo: 'Proc' });
    await db.doc('processos/rh__proc').set({ area: 'RH', processo: 'Proc' });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

function db(user) {
  return testEnv.authenticatedContext(user.email, { email: user.email }).firestore();
}

describe('Security Rules — leitura', () => {
  test('usuário do domínio lê perguntas', async () => {
    await assertSucceeds(db(GESTOR).doc('perguntas/p1').get());
  });

  test('usuário fora do domínio NÃO lê perguntas', async () => {
    await assertFails(db(FORA).doc('perguntas/p1').get());
  });

  test('não autenticado NÃO lê perguntas', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('perguntas/p1').get());
  });
});

describe('Security Rules — catálogos (escrita só admin)', () => {
  test('admin escreve catálogo (dependencias)', async () => {
    await assertSucceeds(db(ADMIN).doc('dependencias/d1').set({ categoria: 'X', nome: 'Item' }));
  });

  test('gestor NÃO escreve catálogo', async () => {
    await assertFails(db(GESTOR).doc('dependencias/d2').set({ categoria: 'X', nome: 'Item' }));
  });

  test('admin edita config_respostas', async () => {
    await assertSucceeds(db(ADMIN).doc('config_respostas/c1').set({ categoria: 'Geral', valor: '4' }));
  });

  test('gestor NÃO altera config_perfis', async () => {
    await assertFails(db(GESTOR).doc('config_perfis/novo@fortestecnologia.com.br').set({ perfil: 'admin' }));
  });

  test('admin escreve risco', async () => {
    await assertSucceeds(db(ADMIN).doc('riscos/r1').set({ area: 'TI', titulo: 'Risco X', status: 'Identificado' }));
  });

  test('gestor NÃO escreve risco', async () => {
    await assertFails(db(GESTOR).doc('riscos/r2').set({ area: 'TI', titulo: 'Risco X', status: 'Identificado' }));
  });

  test('usuário do domínio lê riscos', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r3').set({ area: 'TI', titulo: 'Risco X' });
    });
    await assertSucceeds(db(GESTOR).doc('riscos/r3').get());
  });

  test('usuário fora do domínio NÃO lê riscos', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r4').set({ area: 'TI', titulo: 'Risco X' });
    });
    await assertFails(db(FORA).doc('riscos/r4').get());
  });

  test('admin escreve indicador de segurança', async () => {
    await assertSucceeds(db(ADMIN).doc('indicadores_seguranca/i1').set({ nome: 'Patches no prazo', meta: 95 }));
  });

  test('gestor NÃO escreve indicador de segurança', async () => {
    await assertFails(db(GESTOR).doc('indicadores_seguranca/i2').set({ nome: 'Patches no prazo', meta: 95 }));
  });

  test('usuário do domínio lê indicadores de segurança', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('indicadores_seguranca/i3').set({ nome: 'Patches no prazo' });
    });
    await assertSucceeds(db(GESTOR).doc('indicadores_seguranca/i3').get());
  });
});

describe('Security Rules — processos e respostas', () => {
  test('admin escreve processo de qualquer área', async () => {
    await assertSucceeds(db(ADMIN).doc('processos/rh__proc').set({ area: 'RH', processo: 'Proc' }, { merge: true }));
  });

  test('gestor escreve processo da própria área (TI)', async () => {
    await assertSucceeds(db(GESTOR).doc('processos/ti__proc').set({ area: 'TI', processo: 'Proc' }, { merge: true }));
  });

  test('gestor NÃO escreve processo de outra área (RH)', async () => {
    await assertFails(db(GESTOR).doc('processos/rh__proc').set({ area: 'RH', processo: 'Proc' }, { merge: true }));
  });

  test('gestor cria resposta da própria área', async () => {
    await assertSucceeds(db(GESTOR).collection('respostas_bia').add({ area: 'TI', processo: 'Proc', score: 8 }));
  });

  test('gestor NÃO cria resposta de outra área', async () => {
    await assertFails(db(GESTOR).collection('respostas_bia').add({ area: 'RH', processo: 'Proc', score: 8 }));
  });
});

// --- Regressao: a colecao de tokens ficava legivel para todo o dominio ---
// Combinado com a falha ja corrigida do token de area (tokenLogic.js), isso
// deixava um funcionario comum baixar os links de avaliacao nao usados e
// reescrever o tier de qualquer processo da empresa.
describe('Security Rules — tokens fechados', () => {
  test('gestor NÃO lê tokens', async () => {
    await assertFails(db(GESTOR).doc('tokens/tk1').get());
  });

  test('admin também NÃO lê tokens — só as Cloud Functions acessam', async () => {
    await assertFails(db(ADMIN).doc('tokens/tk1').get());
  });

  test('admin NÃO escreve tokens', async () => {
    await assertFails(db(ADMIN).doc('tokens/tk2').set({ area: 'TI', usado: false }));
  });

  test('não autenticado NÃO lê tokens', async () => {
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('tokens/tk1').get());
  });
});

// --- Riscos por area (decisao de 19/09/2026) ---
// Antes qualquer conta do dominio lia o registro inteiro, com impacto
// financeiro, plano de acao e KRIs. GESTOR aqui e da area 'TI'.
describe('Security Rules — riscos recortados por area', () => {
  test('gestor lê risco da própria área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-ti').set({ area: 'TI', titulo: 'Queda de link' });
    });
    await assertSucceeds(db(GESTOR).doc('riscos/r-ti').get());
  });

  test('gestor NÃO lê risco de outra área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-rh').set({ area: 'RH', titulo: 'Folha atrasada' });
    });
    await assertFails(db(GESTOR).doc('riscos/r-rh').get());
  });

  // DECISAO 15/10/2026: SI opera o Registro de Riscos (antes so Admin).
  test('Segurança da Informação lê e grava risco de qualquer área, inclusive sem filtro', async () => {
    const SI_R = { email: 'si-riscos@fortestecnologia.com.br' };
    await seedPerfil(SI_R.email, { perfis: ['seguranca'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-si').set({ area: 'RH', titulo: 'X' });
    });
    await assertSucceeds(db(SI_R).doc('riscos/r-si').get());
    await assertSucceeds(db(SI_R).collection('riscos').get());
    await assertSucceeds(db(SI_R).doc('riscos/r-si').set({ titulo: 'Y' }, { merge: true }));
    await assertSucceeds(db(SI_R).doc('riscos/r-si2').set({ area: '', titulo: 'Corporativo' }));
  });

  test('TI continua sem ler nem gravar riscos', async () => {
    const TI_R = { email: 'ti-riscos@fortestecnologia.com.br' };
    await seedPerfil(TI_R.email, { perfis: ['ti'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-ti2').set({ area: 'RH', titulo: 'X' });
    });
    await assertFails(db(TI_R).doc('riscos/r-ti2').get());
    await assertFails(db(TI_R).doc('riscos/r-ti3').set({ area: 'RH', titulo: 'X' }));
  });

  test('admin lê risco de qualquer área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-rh2').set({ area: 'RH', titulo: 'X' });
    });
    await assertSucceeds(db(ADMIN).doc('riscos/r-rh2').get());
  });

  // O ponto que quebra a tela se o cliente nao acompanhar: com regra por
  // documento, a consulta sem filtro falha INTEIRA — nao devolve menos.
  test('consulta do gestor SEM filtro de área falha inteira', async () => {
    await assertFails(db(GESTOR).collection('riscos').get());
  });

  test('consulta do gestor COM filtro da própria área passa', async () => {
    await assertSucceeds(db(GESTOR).collection('riscos').where('area', '==', 'TI').get());
  });

  test('consulta do gestor filtrando OUTRA área falha', async () => {
    await assertFails(db(GESTOR).collection('riscos').where('area', '==', 'RH').get());
  });
});

// --- Livro de medicoes (Fase 2) ---
// E a base do monitor. Um ponto forjado pelo navegador destruiria a
// credibilidade da curva inteira, entao ninguem escreve daqui.
describe('Security Rules — livro de medições', () => {
  test('gestor lê medição da própria área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('medicoes/m-ti').set({ area: 'TI', valor: 14, fonte: 'bia' });
    });
    await assertSucceeds(db(GESTOR).doc('medicoes/m-ti').get());
  });

  test('gestor NÃO lê medição de outra área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('medicoes/m-rh').set({ area: 'RH', valor: 9, fonte: 'bia' });
    });
    await assertFails(db(GESTOR).doc('medicoes/m-rh').get());
  });

  test('admin lê medição de qualquer área', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('medicoes/m-rh2').set({ area: 'RH', valor: 9, fonte: 'bia' });
    });
    await assertSucceeds(db(ADMIN).doc('medicoes/m-rh2').get());
  });

  test('NEM admin escreve medição — só o servidor grava', async () => {
    await assertFails(db(ADMIN).doc('medicoes/m-forjada').set({ area: 'TI', valor: 1, fonte: 'bia' }));
  });

  test('gestor NÃO escreve medição', async () => {
    await assertFails(db(GESTOR).doc('medicoes/m-forjada2').set({ area: 'TI', valor: 1, fonte: 'bia' }));
  });

  test('ninguém apaga medição — o livro não perde linha', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('medicoes/m-apagar').set({ area: 'TI', valor: 1, fonte: 'bia' });
    });
    await assertFails(db(ADMIN).doc('medicoes/m-apagar').delete());
  });
});

// --- Retrato diario do risco consolidado (Fase 5 -- O monitor) ---
// So admin le, por enquanto (um documento por dia carrega TODAS as areas
// juntas -- nao ha como filtrar por area dentro de um documento so). Escrita
// so pelo servidor, mesma razao do livro de medicoes.
describe('Security Rules — retrato diário do risco', () => {
  test('admin lê o retrato do dia', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('historico_risco/2026-09-22').set({ dia: '2026-09-22', empresa: { carga: 42 }, areas: [] });
    });
    await assertSucceeds(db(ADMIN).doc('historico_risco/2026-09-22').get());
  });

  test('gestor NÃO lê o retrato do dia — o documento mistura todas as áreas', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('historico_risco/2026-09-23').set({ dia: '2026-09-23', empresa: { carga: 10 }, areas: [] });
    });
    await assertFails(db(GESTOR).doc('historico_risco/2026-09-23').get());
  });

  // DECISAO 20/10/2026: Seguranca le o retrato (Risco no Tempo, Relatorio Executivo de Riscos).
  test('segurança lê o retrato do dia, mas não grava', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('historico_risco/2026-10-19').set({ dia: '2026-10-19', empresa: { carga: 7 }, areas: [] });
      await ctx.firestore().doc('config_perfis/si-hist@fortestecnologia.com.br').set({ perfis: ['seguranca'] });
    });
    const SI_HIST = { email: 'si-hist@fortestecnologia.com.br' };
    await assertSucceeds(db(SI_HIST).doc('historico_risco/2026-10-19').get());
    await assertSucceeds(db(SI_HIST).collection('historico_risco').where('dia', '>=', '2026-01-01').get());
    await assertFails(db(SI_HIST).doc('historico_risco/2026-10-20').set({ dia: '2026-10-20' }));
  });

  test('NEM admin escreve o retrato — só o servidor grava', async () => {
    await assertFails(db(ADMIN).doc('historico_risco/2026-09-24').set({ dia: '2026-09-24', empresa: { carga: 1 }, areas: [] }));
  });

  test('ninguém apaga um retrato já gravado', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('historico_risco/2026-09-25').set({ dia: '2026-09-25', empresa: { carga: 5 }, areas: [] });
    });
    await assertFails(db(ADMIN).doc('historico_risco/2026-09-25').delete());
  });
});

// Foto mensal do backlog de vulnerabilidades (19/10/2026): so contagens
// agregadas, leitura de toda a empresa (o Gestor ve o Painel); escrita so do
// servidor (varreduraDiariaVulnerabilidades).
describe('Security Rules — foto mensal do Painel de Vulnerabilidades', () => {
  test('gestor e admin leem; fora do dominio, nao', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('painel_vulnerabilidades/2026-09').set({ mes: '2026-09', abertas: 7 });
    });
    await assertSucceeds(db(GESTOR).doc('painel_vulnerabilidades/2026-09').get());
    await assertSucceeds(db(ADMIN).collection('painel_vulnerabilidades').get());
    await assertFails(db(FORA).doc('painel_vulnerabilidades/2026-09').get());
  });

  test('NEM admin grava ou apaga a foto — só o servidor', async () => {
    await assertFails(db(ADMIN).doc('painel_vulnerabilidades/2026-10').set({ mes: '2026-10', abertas: 0 }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('painel_vulnerabilidades/2026-08').set({ mes: '2026-08', abertas: 3 });
    });
    await assertFails(db(ADMIN).doc('painel_vulnerabilidades/2026-08').delete());
  });
});

// Perfis do RBAC cumulativo (28/09/2026). Semeados com o array `perfis`.
const SI = { email: 'si@fortestecnologia.com.br' };
const TI_USER = { email: 'ti@fortestecnologia.com.br' };
const TIGESTOR = { email: 'tigestor@fortestecnologia.com.br' };

async function seedPerfil(email, dados) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`config_perfis/${email}`).set(Object.assign({ email }, dados));
  });
}

describe('Security Rules — fornecedores, perfis e dependências', () => {
  // ---- Fornecedores (Admin ou Segurança da Informação) ----

  test('gestor lê os critérios de fornecedor, mas não escreve', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('criterios_fornecedor/c1').set({ nome: 'ISO 27001', peso: 3, ativo: true });
    });
    await assertSucceeds(db(GESTOR).doc('criterios_fornecedor/c1').get());
    await assertFails(db(GESTOR).doc('criterios_fornecedor/c1').set({ peso: 1 }));
  });

  // ---- Produtos de Software (catálogo-base: Admin ou Segurança escrevem, domínio lê) ----

  test('produtos de software: domínio lê; admin e Segurança escrevem; gestor e TI não', async () => {
    await seedPerfil(SI.email, { perfis: ['seguranca'] });
    await seedPerfil(TI_USER.email, { perfis: ['ti'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('produtos_software/ps1').set({ nome: 'Fortes Ponto', ativo: true });
    });
    await assertSucceeds(db(GESTOR).doc('produtos_software/ps1').get());
    await assertFails(db(FORA).doc('produtos_software/ps1').get());
    await assertSucceeds(db(ADMIN).doc('produtos_software/ps2').set({ nome: 'Fortes RH', ativo: true }));
    await assertSucceeds(db(SI).doc('produtos_software/ps3').set({ nome: 'Colabore', ativo: true }));
    await assertFails(db(GESTOR).doc('produtos_software/ps4').set({ nome: 'X' }));
    await assertFails(db(TI_USER).doc('produtos_software/ps5').set({ nome: 'X' }));
  });

  test('admin cadastra e altera critério de fornecedor', async () => {
    await assertSucceeds(db(ADMIN).doc('criterios_fornecedor/c2').set({ nome: 'DPO', peso: 2, ativo: true }));
    await assertSucceeds(db(ADMIN).doc('criterios_fornecedor/c2').set({ peso: 3 }, { merge: true }));
  });

  test('admin grava avaliação de fornecedor; gestor não', async () => {
    await assertSucceeds(db(ADMIN).doc('avaliacoes_fornecedor/a1').set({ fornecedorId: 'f1', nota: 80 }));
    await assertFails(db(GESTOR).doc('avaliacoes_fornecedor/a2').set({ fornecedorId: 'f1', nota: 80 }));
  });

  test('avaliação de fornecedor é append-only: NEM admin altera a que já existe', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('avaliacoes_fornecedor/a3').set({ fornecedorId: 'f1', nota: 40 });
    });
    await assertFails(db(ADMIN).doc('avaliacoes_fornecedor/a3').set({ nota: 95 }, { merge: true }));
  });

  test('ninguém apaga avaliação de fornecedor — a nota antiga é o histórico dele', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('avaliacoes_fornecedor/a4').set({ fornecedorId: 'f1', nota: 40 });
    });
    await assertFails(db(ADMIN).doc('avaliacoes_fornecedor/a4').delete());
    await assertFails(db(GESTOR).doc('avaliacoes_fornecedor/a4').delete());
  });

  test('qualquer usuário do domínio lê a avaliação do fornecedor', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('avaliacoes_fornecedor/a5').set({ fornecedorId: 'f1', nota: 72 });
    });
    await assertSucceeds(db(GESTOR).doc('avaliacoes_fornecedor/a5').get());
  });

  // ---- Segurança da Informação: opera todos os módulos, menos o do Admin ----

  test('SI (perfis:[seguranca]) com area VAZIA não vira gestor dos riscos corporativos', async () => {
    await seedPerfil(SI.email, { perfis: ['seguranca'], area: '' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Risco corporativo: os automáticos (indicador, fornecedor) nascem assim.
      await ctx.firestore().doc('riscos/r-corp').set({ area: '', titulo: 'Desvio', origem: 'Indicador de Segurança' });
    });
    // SI lê e escreve risco por PERMISSAO (não por área): a guarda de área vazia
    // é sobre o GESTOR não herdar risco corporativo, não sobre a SI.
    await assertSucceeds(db(SI).doc('riscos/r-corp').get());
    await assertSucceeds(db(SI).doc('riscos/r-corp').set({ titulo: 'alterado' }, { merge: true }));
  });

  test('ter uma área SEM ser gestor não dá poder de gestor daquela área', async () => {
    // A Área agora aparece na tela e é gravada para qualquer perfil (ex.: para
    // mostrar a área do pessoal de SI). Isso NÃO pode transformar um SI puro em
    // gestor da área: só quem TEM o perfil 'gestor' vira gestor da área.
    const SIAREA = { email: 'si-com-area@fortestecnologia.com.br' };
    await seedPerfil(SIAREA.email, { perfis: ['seguranca'], area: 'RH' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Uma instância só: chamar ctx.firestore() de novo reconfigura uma já iniciada e falha.
      const f = ctx.firestore();
      await f.doc('riscos/r-rh-priv').set({ area: 'RH', titulo: 'Folha' });
      await f.doc('processos/rh__x').set({ area: 'RH', processo: 'X' });
    });
    // SI já lê qualquer risco por permissão própria — isso continua valendo.
    await assertSucceeds(db(SIAREA).doc('riscos/r-rh-priv').get());
    // Mas NÃO ganha a escrita de processo pela rota de gestor da área RH
    // (SI não escreve processos; só admin ou o gestor DAQUELA área).
    await assertFails(db(SIAREA).doc('processos/rh__x').set({ area: 'RH', processo: 'X2' }, { merge: true }));
    // E a consulta de riscos filtrando a "sua" área NÃO passa como gestor. Com
    // SI isso não dá para ver (SI já lê todo risco, ver acima); com um TI que tem
    // área -- TI não lê riscos -- a consulta só passaria se a área desse poder de gestor.
    const TIAREA = { email: 'ti-com-area@fortestecnologia.com.br' };
    await seedPerfil(TIAREA.email, { perfis: ['ti'], area: 'RH' });
    await assertFails(db(TIAREA).collection('riscos').where('area', '==', 'RH').get());
  });

  test('gestor com área continua sendo gestor da própria área (não quebrou)', async () => {
    // GESTOR (semeado no beforeEach) é da área TI.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('riscos/r-ti-g').set({ area: 'TI', titulo: 'Queda' });
    });
    await assertSucceeds(db(GESTOR).doc('riscos/r-ti-g').get());
    await assertSucceeds(db(GESTOR).collection('riscos').where('area', '==', 'TI').get());
    await assertSucceeds(db(GESTOR).doc('processos/ti__proc').set({ area: 'TI', processo: 'Proc' }, { merge: true }));
  });

  test('SI gerencia critérios, grava avaliação e escreve risco', async () => {
    await seedPerfil(SI.email, { perfis: ['seguranca'] });
    await assertSucceeds(db(SI).doc('criterios_fornecedor/c-sec').set({ nome: 'ISO', peso: 3, ativo: true }));
    await assertSucceeds(db(SI).doc('avaliacoes_fornecedor/a-sec').set({ fornecedorId: 'f1', nota: 55 }));
    await assertSucceeds(db(SI).doc('riscos/r-sec').set({ area: 'RH', titulo: 'Risco', status: 'Identificado' }));
  });

  test('SI mexe em Áreas e no catálogo de dependências (opera todos os módulos)', async () => {
    await seedPerfil(SI.email, { perfis: ['seguranca'] });
    await assertSucceeds(db(SI).doc('areas/a-si').set({ nome: 'Compras' }));
    await assertSucceeds(db(SI).doc('dependencias/d-si').set({ categoria: 'Sistemas', nome: 'ERP' }));
  });

  test('SI NÃO faz o que é próprio do Admin: perguntas, régua e perfis', async () => {
    await seedPerfil(SI.email, { perfis: ['seguranca'] });
    await assertFails(db(SI).doc('perguntas/p-si').set({ pergunta: 'x' }));
    await assertFails(db(SI).doc('config_respostas/cr-si').set({ valor: 9 }));
    await assertFails(db(SI).doc('config_regua/rg-si').set({ versao: 2 }));
    // Não se promove: não pode escrever config_perfis de ninguém.
    await assertFails(db(SI).doc('config_perfis/outro@fortestecnologia.com.br').set({ perfis: ['admin'] }));
    await assertFails(db(SI).doc(`config_perfis/${SI.email}`).set({ perfis: ['admin'] }, { merge: true }));
  });

  // ---- TI: opera o DRP (dependências), mas não os outros módulos ----

  test('TI (perfis:[ti]) escreve no catálogo de dependências — é onde edita o DRP', async () => {
    await seedPerfil(TI_USER.email, { perfis: ['ti'] });
    await assertSucceeds(db(TI_USER).doc('dependencias/d-ti').set({ categoria: 'Sistemas', nome: 'ERP', drpSalvo: true }));
    await assertSucceeds(db(TI_USER).doc('dependencias/d-ti').set({ drpTemplate: '...' }, { merge: true }));
  });

  test('TI NÃO mexe em Áreas, fornecedores, riscos nem perguntas', async () => {
    await seedPerfil(TI_USER.email, { perfis: ['ti'] });
    await assertFails(db(TI_USER).doc('areas/a-ti').set({ nome: 'X' }));
    await assertFails(db(TI_USER).doc('criterios_fornecedor/c-ti').set({ nome: 'ISO', peso: 1 }));
    await assertFails(db(TI_USER).doc('avaliacoes_fornecedor/a-ti').set({ fornecedorId: 'f1', nota: 10 }));
    await assertFails(db(TI_USER).doc('riscos/r-ti-w').set({ area: 'TI', titulo: 'x' }));
    await assertFails(db(TI_USER).doc('perguntas/p-ti').set({ pergunta: 'x' }));
  });

  test('TI NÃO se promove a admin', async () => {
    await seedPerfil(TI_USER.email, { perfis: ['ti'] });
    await assertFails(db(TI_USER).doc(`config_perfis/${TI_USER.email}`).set({ perfis: ['admin'] }, { merge: true }));
    await assertFails(db(TI_USER).doc('config_perfis/outro@fortestecnologia.com.br').set({ perfis: ['admin'] }));
  });

  // ---- Cumulatividade: TI + Gestor soma os dois poderes ----

  test('TI + Gestor (perfis:[ti,gestor]) escreve dependências (TI) e processos da própria área (gestor)', async () => {
    await seedPerfil(TIGESTOR.email, { perfis: ['ti', 'gestor'], area: 'TI' });
    // Poder de TI: catálogo de dependências.
    await assertSucceeds(db(TIGESTOR).doc('dependencias/d-tg').set({ categoria: 'Sistemas', nome: 'ERP' }));
    // Poder de gestor: processo da própria área.
    await assertSucceeds(db(TIGESTOR).doc('processos/ti__proc').set({ area: 'TI', processo: 'Proc' }, { merge: true }));
    // Mas continua sem o do gestor de outra área.
    await assertFails(db(TIGESTOR).doc('processos/rh__proc').set({ area: 'RH', processo: 'Proc' }, { merge: true }));
    // E não vira admin.
    await assertFails(db(TIGESTOR).doc(`config_perfis/${TIGESTOR.email}`).set({ perfis: ['admin'] }, { merge: true }));
  });

  // ---- Perfis de acesso: só admin escreve ----

  test('gestor pode gravar a PRÓPRIA área, mas não o próprio perfil nem perfis', async () => {
    await assertSucceeds(db(GESTOR).doc(`config_perfis/${GESTOR.email}`).set({ email: GESTOR.email, area: 'TI' }, { merge: true }));
    await assertFails(db(GESTOR).doc(`config_perfis/${GESTOR.email}`).set({ perfil: 'admin' }, { merge: true }));
    await assertFails(db(GESTOR).doc(`config_perfis/${GESTOR.email}`).set({ perfis: ['admin'] }, { merge: true }));
  });

  test('ninguém mexe no perfil de outra pessoa, só admin', async () => {
    await assertFails(db(GESTOR).doc('config_perfis/alguem@fortestecnologia.com.br').set({ perfis: ['gestor'], area: 'RH' }));
    await assertSucceeds(db(ADMIN).doc('config_perfis/alguem@fortestecnologia.com.br').set({ perfis: ['gestor'], area: 'RH' }));
  });

  test('admin cadastra, edita e apaga qualquer dependência', async () => {
    await assertSucceeds(db(ADMIN).doc('dependencias/d-forn').set({ categoria: 'Fornecedores', nome: 'Alfa' }));
    await assertSucceeds(db(ADMIN).doc('dependencias/d-forn').set({ nome: 'Alfa S.A.' }, { merge: true }));
    await assertSucceeds(db(ADMIN).doc('dependencias/d-forn').delete());
  });

  // ---- Operador Administrativo: so fornecedor em /dependencias ----

  test('operador gerencia fornecedor em /dependencias, mas nao outras categorias nem reclassifica', async () => {
    const OP = { email: 'operador@fortestecnologia.com.br' };
    await seedPerfil(OP.email, { perfis: ['operador'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Uma instância só: chamar ctx.firestore() de novo reconfigura uma já iniciada e falha.
      const f = ctx.firestore();
      await f.doc('dependencias/d-pessoa').set({ categoria: 'Pessoas', nome: 'Ana' });
      await f.doc('dependencias/d-forn2').set({ categoria: 'Fornecedores', nome: 'Beta' });
    });
    await assertSucceeds(db(OP).doc('dependencias/d-novo').set({ categoria: 'Fornecedores', nome: 'Alfa' }));
    await assertSucceeds(db(OP).doc('dependencias/d-forn2').set({ nome: 'Beta S.A.' }, { merge: true }));
    await assertFails(db(OP).doc('dependencias/d-forn2').set({ categoria: 'Sistemas' }, { merge: true }));
    await assertFails(db(OP).doc('dependencias/d-pessoa').set({ categoria: 'Fornecedores' }, { merge: true }));
    await assertFails(db(OP).doc('dependencias/d-pessoa').set({ nome: 'Outra' }, { merge: true }));
    await assertFails(db(OP).doc('dependencias/d-x').set({ categoria: 'Sistemas', nome: 'ERP' }));
    await assertFails(db(OP).doc('dependencias/d-pessoa').delete());
    await assertSucceeds(db(OP).doc('dependencias/d-forn2').delete());
  });

  test('operador escreve criterios/categorias/avaliacoes de fornecedor; nao mexe em processos, areas, riscos nem perfis', async () => {
    const OP = { email: 'operador@fortestecnologia.com.br' };
    await seedPerfil(OP.email, { perfis: ['operador'] });
    await assertSucceeds(db(OP).doc('criterios_fornecedor/c1').set({ nome: 'Preco' }));
    await assertSucceeds(db(OP).doc('categorias_fornecedor/cat1').set({ nome: 'Nuvem' }));
    await assertSucceeds(db(OP).doc('avaliacoes_fornecedor/a1').set({ fornecedorId: 'd-forn', nota: 80 }));
    await assertSucceeds(db(OP).doc('processos/ti__proc').get());
    await assertSucceeds(db(OP).doc('areas/a1').get());
    await assertFails(db(OP).doc('processos/ti__proc').set({ area: 'TI', processo: 'Alterado' }));
    await assertFails(db(OP).doc('areas/a1').set({ nome: 'X' }));
    await assertFails(db(OP).doc('riscos/r1').set({ titulo: 'X' }));
    await assertFails(db(OP).doc('config_perfis/operador@fortestecnologia.com.br').set({ perfis: ['admin'] }));
  });

  test('gestor não mexe no catálogo de dependências', async () => {
    await assertFails(db(GESTOR).doc('dependencias/d-g').set({ categoria: 'Fornecedores', nome: 'X' }));
  });

  // ---- Compat: documento antigo com `perfil` string (sem `perfis`) ----

  test('perfil legado string "admin" (sem array perfis) ainda é reconhecido como admin', async () => {
    const LEGACY = { email: 'legadoadmin@fortestecnologia.com.br' };
    await seedPerfil(LEGACY.email, { perfil: 'admin' });
    await assertSucceeds(db(LEGACY).doc('perguntas/p-legacy').set({ pergunta: 'x' }));
  });
});

describe('Security Rules — contratos', () => {
  const OP = { email: 'operador@fortestecnologia.com.br' };
  const TI = { email: 'ti@fortestecnologia.com.br' };

  async function seedContratos() {
    await seedPerfil(OP.email, { perfis: ['operador'] });
    await seedPerfil(TI.email, { perfis: ['ti'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await d.doc('contratos/c-ti').set({ area: 'TI', objeto: 'Link', valorMensal: 1000 });
      await d.doc('contratos/c-rh').set({ area: 'RH', objeto: 'Folha', valorMensal: 2000 });
      await d.doc('eventos_contrato/e-ti').set({ contratoId: 'c-ti', area: 'TI', tipo: 'Assinatura' });
      await d.doc('eventos_contrato/e-rh').set({ contratoId: 'c-rh', area: 'RH', tipo: 'Assinatura' });
      await d.doc('tipos_contrato/t1').set({ nome: 'SaaS' });
    });
  }

  test('admin e operador cadastram contrato e evento', async () => {
    await seedContratos();
    await assertSucceeds(db(ADMIN).doc('contratos/c-novo').set({ area: 'TI', objeto: 'X' }));
    await assertSucceeds(db(OP).doc('contratos/c-ti').set({ valorMensal: 1100 }, { merge: true }));
    await assertSucceeds(db(OP).doc('eventos_contrato/e-novo').set({ contratoId: 'c-ti', area: 'TI', tipo: 'Reajuste aplicado' }));
    await assertSucceeds(db(OP).doc('contratos/c-rh').delete());
  });

  test('gestor le so os contratos e eventos da propria area, e nao escreve', async () => {
    await seedContratos();
    await assertSucceeds(db(GESTOR).doc('contratos/c-ti').get());
    await assertFails(db(GESTOR).doc('contratos/c-rh').get());
    await assertSucceeds(db(GESTOR).collection('contratos').where('area', '==', 'TI').get());
    await assertFails(db(GESTOR).collection('contratos').get());
    await assertSucceeds(db(GESTOR).collection('eventos_contrato').where('contratoId', '==', 'c-ti').where('area', '==', 'TI').get());
    await assertFails(db(GESTOR).doc('eventos_contrato/e-rh').get());
    await assertFails(db(GESTOR).doc('contratos/c-ti').set({ valorMensal: 1 }, { merge: true }));
    await assertFails(db(GESTOR).doc('eventos_contrato/e-x').set({ contratoId: 'c-ti', area: 'TI' }));
  });

  test('TI e quem e de fora nao leem contrato', async () => {
    await seedContratos();
    await assertFails(db(TI).doc('contratos/c-ti').get());
    await assertFails(db(FORA).doc('contratos/c-ti').get());
  });

  test('listas configuraveis: dominio le, so quem gerencia escreve', async () => {
    await seedContratos();
    await assertSucceeds(db(GESTOR).doc('tipos_contrato/t1').get());
    await assertFails(db(FORA).doc('tipos_contrato/t1').get());
    for (const col of ['tipos_contrato', 'indexadores_reajuste', 'status_contrato']) {
      await assertSucceeds(db(OP).doc(`${col}/novo`).set({ nome: 'X' }));
      await assertFails(db(GESTOR).doc(`${col}/novo2`).set({ nome: 'X' }));
      await assertFails(db(TI).doc(`${col}/novo3`).set({ nome: 'X' }));
    }
  });
});

describe('Security Rules — alertas por e-mail', () => {
  const OP = { email: 'operador@fortestecnologia.com.br' };

  test('so o admin le e grava a configuracao de e-mail', async () => {
    await seedPerfil(OP.email, { perfis: ['operador'] });
    await assertSucceeds(db(ADMIN).doc('config_notificacoes/contratos').set({ modo: 'simulacao' }));
    await assertSucceeds(db(ADMIN).doc('config_notificacoes/contratos').get());
    await assertFails(db(OP).doc('config_notificacoes/contratos').get());
    await assertFails(db(OP).doc('config_notificacoes/contratos').set({ modo: 'ativo' }));
    await assertFails(db(GESTOR).doc('config_notificacoes/contratos').get());
  });

  test('a fila de e-mails: admin le, ninguem grava pelo cliente', async () => {
    await seedPerfil(OP.email, { perfis: ['operador'] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('notificacoes_email/n1').set({ para: 'x@fortestecnologia.com.br', status: 'simulado' });
    });
    await assertSucceeds(db(ADMIN).doc('notificacoes_email/n1').get());
    await assertFails(db(OP).doc('notificacoes_email/n1').get());
    await assertFails(db(ADMIN).doc('notificacoes_email/n2').set({ para: 'x', status: 'pendente' }));
    await assertFails(db(ADMIN).doc('notificacoes_email/n1').set({ status: 'pendente' }, { merge: true }));
  });
});

// Relatorios Executivos salvos (20/10/2026): Admin e Seguranca criam e leem; edicao imutavel;
// so o Admin exclui; quem grava tem de ser quem gerou.
describe('Security Rules — relatórios executivos salvos', () => {
  const SI_REL = { email: 'si-rel@fortestecnologia.com.br' };
  const meta = (por) => ({ tipo: 'riscos', titulo: 'Relatório Executivo de Riscos', geradoPor: por, geradoEm: '2026-10-20T09:00:00Z' });
  const cont = (por, extra) => Object.assign({ tipo: 'riscos', geradoPor: por, versao: 1, conteudo: '{"versao":1}' }, extra);
  async function seedSi() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('config_perfis/si-rel@fortestecnologia.com.br').set({ perfis: ['seguranca'] });
    });
  }

  test('segurança cria e lê a própria edição', async () => {
    await seedSi();
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos/e1').set(meta(SI_REL.email)));
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos_conteudo/e1').set(cont(SI_REL.email)));
    await assertSucceeds(db(SI_REL).collection('relatorios_executivos').get());
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos_conteudo/e1').get());
  });

  test('segurança salva a edição do Relatório de Composição de Serviços (21/10/2026)', async () => {
    await seedSi();
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos/s1').set(Object.assign(meta(SI_REL.email), { tipo: 'servicos' })));
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos_conteudo/s1').set(cont(SI_REL.email, { tipo: 'servicos' })));
    await assertSucceeds(db(SI_REL).doc('relatorios_executivos/s2').set(Object.assign(meta(SI_REL.email), { tipo: 'servicos-mapa' })));
  });

  test('não grava em nome de outra pessoa, nem tipo fora da lista, nem conteúdo grande', async () => {
    await seedSi();
    await assertFails(db(SI_REL).doc('relatorios_executivos/e2').set(meta(ADMIN.email)));
    await assertFails(db(SI_REL).doc('relatorios_executivos/e3').set(Object.assign(meta(SI_REL.email), { tipo: 'outro' })));
    await assertFails(db(SI_REL).doc('relatorios_executivos_conteudo/e4').set(cont(SI_REL.email, { conteudo: 'x'.repeat(900001) })));
  });

  test('gestor não lê; ninguém altera; só o admin exclui', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('relatorios_executivos/e9').set(meta(ADMIN.email));
      await ctx.firestore().doc('config_perfis/si-rel@fortestecnologia.com.br').set({ perfis: ['seguranca'] });
    });
    await assertFails(db(GESTOR).doc('relatorios_executivos/e9').get());
    await assertFails(db(ADMIN).doc('relatorios_executivos/e9').update({ titulo: 'x' }));
    await assertFails(db(SI_REL).doc('relatorios_executivos/e9').delete());
    await assertSucceeds(db(ADMIN).doc('relatorios_executivos/e9').delete());
  });
});

// Relatorios compartilhados com gestores (20/10/2026): destinatario le o seu (nao revogado) e so
// marca abertoEm; Admin/Seguranca criam e revogam; Gestor nao cria.
describe('Security Rules — relatórios compartilhados', () => {
  const SI_C = { email: 'si-comp@fortestecnologia.com.br' };
  const G2 = { email: 'gestor2@fortestecnologia.com.br' };
  const doc = (para, extra) => Object.assign({ tipo: 'riscos', para, area: 'TI', compartilhadoPor: SI_C.email, revogado: false, conteudo: '{"versao":2}' }, extra);
  async function seedC() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('config_perfis/si-comp@fortestecnologia.com.br').set({ perfis: ['seguranca'] });
      await ctx.firestore().doc('relatorios_compartilhados/c1').set(doc(GESTOR.email));
      await ctx.firestore().doc('relatorios_compartilhados/c2').set(doc(G2.email));
      await ctx.firestore().doc('relatorios_compartilhados/c3').set(doc(GESTOR.email, { revogado: true }));
    });
  }

  test('destinatário lê o seu, não o dos outros nem o revogado; a consulta filtrada passa', async () => {
    await seedC();
    await assertSucceeds(db(GESTOR).doc('relatorios_compartilhados/c1').get());
    await assertFails(db(GESTOR).doc('relatorios_compartilhados/c2').get());
    await assertFails(db(GESTOR).doc('relatorios_compartilhados/c3').get());
    await assertSucceeds(db(GESTOR).collection('relatorios_compartilhados').where('para', '==', GESTOR.email).where('revogado', '==', false).get());
    await assertFails(db(GESTOR).collection('relatorios_compartilhados').get());
  });

  test('destinatário só marca abertoEm; segurança cria e revoga; gestor não cria', async () => {
    await seedC();
    await assertSucceeds(db(GESTOR).doc('relatorios_compartilhados/c1').update({ abertoEm: '2026-10-20T10:00:00Z' }));
    await assertFails(db(GESTOR).doc('relatorios_compartilhados/c1').update({ area: 'RH' }));
    await assertFails(db(GESTOR).doc('relatorios_compartilhados/c9').set(doc(GESTOR.email, { compartilhadoPor: GESTOR.email })));
    await assertSucceeds(db(SI_C).doc('relatorios_compartilhados/c8').set(doc(G2.email)));
    await assertFails(db(SI_C).doc('relatorios_compartilhados/c7').set(doc(G2.email, { compartilhadoPor: ADMIN.email })));
    await assertSucceeds(db(SI_C).doc('relatorios_compartilhados/c1').update({ revogado: true, revogadoEm: 'x', revogadoPor: SI_C.email }));
    await assertFails(db(SI_C).doc('relatorios_compartilhados/c2').update({ conteudo: '{}' }));
  });
});
