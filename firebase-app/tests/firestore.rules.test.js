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
      await ctx.firestore().doc('riscos/r-rh-priv').set({ area: 'RH', titulo: 'Folha' });
      await ctx.firestore().doc('processos/rh__x').set({ area: 'RH', processo: 'X' });
    });
    // SI já lê qualquer risco por permissão própria — isso continua valendo.
    await assertSucceeds(db(SIAREA).doc('riscos/r-rh-priv').get());
    // Mas NÃO ganha a escrita de processo pela rota de gestor da área RH
    // (SI não escreve processos; só admin ou o gestor DAQUELA área).
    await assertFails(db(SIAREA).doc('processos/rh__x').set({ area: 'RH', processo: 'X2' }, { merge: true }));
    // E a consulta de riscos filtrando a "sua" área NÃO passa como gestor:
    // ele não é gestor, então não vale a regra por documento de gestor.
    await assertFails(db(SIAREA).collection('riscos').where('area', '==', 'RH').get());
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
