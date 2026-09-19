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
