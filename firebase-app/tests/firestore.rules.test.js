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
  // ---- Fornecedores ----

  test('gestor lê os critérios de fornecedor, mas não escreve', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('criterios_fornecedor/c1').set({ nome: 'ISO 27001', peso: 3, ativo: true });
    });
    await assertSucceeds(db(GESTOR).doc('criterios_fornecedor/c1').get());
    await assertFails(db(GESTOR).doc('criterios_fornecedor/c1').set({ peso: 1 }));
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
  // ---- Perfis de acesso ----

  test('perfil com area VAZIA não vira gestor dos riscos corporativos', async () => {
    const FORNEC = { email: 'seguranca@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${FORNEC.email}`).set({ email: FORNEC.email, perfil: 'fornecedores', area: '' });
      // Risco corporativo: os automáticos (indicador, fornecedor) nascem assim.
      await ctx.firestore().doc('riscos/r-corp').set({ area: '', titulo: 'Desvio', origem: 'Indicador de Segurança' });
    });
    await assertFails(db(FORNEC).doc('riscos/r-corp').get());
    await assertFails(db(FORNEC).doc('riscos/r-corp').set({ titulo: 'alterado' }, { merge: true }));
  });

  test('perfil de fornecedores gerencia critérios e grava avaliação', async () => {
    const FORNEC = { email: 'seguranca2@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${FORNEC.email}`).set({ email: FORNEC.email, perfil: 'fornecedores' });
    });
    await assertSucceeds(db(FORNEC).doc('criterios_fornecedor/c-sec').set({ nome: 'ISO', peso: 3, ativo: true }));
    await assertSucceeds(db(FORNEC).doc('avaliacoes_fornecedor/a-sec').set({ fornecedorId: 'f1', nota: 55 }));
  });

  test('perfil de fornecedores NÃO escreve em riscos — o servidor abre o risco', async () => {
    const FORNEC = { email: 'seguranca3@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${FORNEC.email}`).set({ email: FORNEC.email, perfil: 'fornecedores' });
    });
    await assertFails(db(FORNEC).doc('riscos/r-novo').set({ area: '', titulo: 'inventado' }));
  });

  test('perfil de fornecedores NÃO se promove a admin', async () => {
    const FORNEC = { email: 'seguranca4@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${FORNEC.email}`).set({ email: FORNEC.email, perfil: 'fornecedores' });
    });
    await assertFails(db(FORNEC).doc(`config_perfis/${FORNEC.email}`).set({ perfil: 'admin' }, { merge: true }));
    await assertFails(db(FORNEC).doc('config_perfis/outro@fortestecnologia.com.br').set({ perfil: 'admin' }));
  });

  test('perfil de fornecedores NÃO mexe no catálogo do BIA nem em processos', async () => {
    const FORNEC = { email: 'seguranca5@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${FORNEC.email}`).set({ email: FORNEC.email, perfil: 'fornecedores' });
    });
    await assertFails(db(FORNEC).doc('perguntas/p-nova').set({ pergunta: 'x' }));
    await assertFails(db(FORNEC).doc('config_respostas/cr-nova').set({ valor: 9 }));
    await assertFails(db(FORNEC).doc('processos/pr-novo').set({ area: 'TI', processo: 'x' }));
  });

  test('gestor pode gravar a PRÓPRIA área, mas não o próprio perfil', async () => {
    await assertSucceeds(db(GESTOR).doc(`config_perfis/${GESTOR.email}`).set({ email: GESTOR.email, area: 'TI' }, { merge: true }));
    await assertFails(db(GESTOR).doc(`config_perfis/${GESTOR.email}`).set({ perfil: 'admin' }, { merge: true }));
  });

  test('ninguém mexe no perfil de outra pessoa, só admin', async () => {
    await assertFails(db(GESTOR).doc('config_perfis/alguem@fortestecnologia.com.br').set({ perfil: 'gestor', area: 'RH' }));
    await assertSucceeds(db(ADMIN).doc('config_perfis/alguem@fortestecnologia.com.br').set({ perfil: 'gestor', area: 'RH' }));
  });
  test('perfil de fornecedores cadastra, edita e apaga fornecedor', async () => {
    const F = { email: 'seguranca6@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${F.email}`).set({ email: F.email, perfil: 'fornecedores' });
    });
    await assertSucceeds(db(F).doc('dependencias/d-forn').set({ categoria: 'Fornecedores', nome: 'Alfa' }));
    await assertSucceeds(db(F).doc('dependencias/d-forn').set({ nome: 'Alfa S.A.' }, { merge: true }));
    await assertSucceeds(db(F).doc('dependencias/d-forn').delete());
  });

  test('perfil de fornecedores NÃO mexe nas outras categorias do catálogo do BIA', async () => {
    const F = { email: 'seguranca7@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${F.email}`).set({ email: F.email, perfil: 'fornecedores' });
      await ctx.firestore().doc('dependencias/d-sis').set({ categoria: 'Sistemas', nome: 'ERP' });
    });
    await assertFails(db(F).doc('dependencias/d-sis').set({ nome: 'ERP novo' }, { merge: true }));
    await assertFails(db(F).doc('dependencias/d-sis').delete());
    await assertFails(db(F).doc('dependencias/d-infra').set({ categoria: 'Infraestrutura', nome: 'Link' }));
  });

  test('perfil de fornecedores NÃO move dependência de Sistemas para Fornecedores', async () => {
    const F = { email: 'seguranca8@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${F.email}`).set({ email: F.email, perfil: 'fornecedores' });
      await ctx.firestore().doc('dependencias/d-sis2').set({ categoria: 'Sistemas', nome: 'ERP' });
    });
    // Sem a checagem das duas pontas, isto passaria e daria acesso à linha.
    await assertFails(db(F).doc('dependencias/d-sis2').set({ categoria: 'Fornecedores' }, { merge: true }));
  });

  test('perfil de fornecedores NÃO tira um fornecedor da categoria para escapar da guarda', async () => {
    const F = { email: 'seguranca9@fortestecnologia.com.br' };
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`config_perfis/${F.email}`).set({ email: F.email, perfil: 'fornecedores' });
      await ctx.firestore().doc('dependencias/d-forn2').set({ categoria: 'Fornecedores', nome: 'Beta' });
    });
    await assertFails(db(F).doc('dependencias/d-forn2').set({ categoria: 'Sistemas' }, { merge: true }));
  });

  test('gestor não mexe no catálogo de dependências', async () => {
    await assertFails(db(GESTOR).doc('dependencias/d-g').set({ categoria: 'Fornecedores', nome: 'X' }));
  });
});
