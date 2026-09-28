const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Perfis = require('../public/perfis.js');

const ARQUIVO_REGRAS = path.join(__dirname, '..', 'firestore.rules');
const lerRegras = () => fs.readFileSync(ARQUIVO_REGRAS, 'utf8');

// ============================================================
// O PRINCIPIO: NENHUM CAMINHO PROMOVE NINGUEM POR ACIDENTE
// ============================================================

test('perfil desconhecido cai no MENOR acesso, nunca em admin', () => {
  ['', null, undefined, 'ADM', 'administrador', 'root', 'superuser', 'fornecedor'].forEach((v) => {
    assert.strictEqual(Perfis.ehAdmin(v), false, `"${v}" nao pode virar admin`);
  });
  assert.strictEqual(Perfis.normalizar('qualquer coisa'), Perfis.PERFIL.GESTOR);
  assert.strictEqual(Perfis.PERFIL_PADRAO, Perfis.PERFIL.GESTOR);
});

test('maiuscula e espaco sobrando sao toleraveis — mas so isso', () => {
  // Tolerar 'Admin ' e deliberado: e o mesmo perfil digitado com descuido.
  // Tolerar 'administrador' NAO e, porque ai qualquer palavra parecida passaria.
  assert.strictEqual(Perfis.normalizar(' ADMIN '), Perfis.PERFIL.ADMIN);
  assert.strictEqual(Perfis.normalizar('administrador'), Perfis.PERFIL.GESTOR);
});

test('erro de digitacao no console do Firebase nao promove ninguem', () => {
  assert.strictEqual(Perfis.normalizar('admln'), Perfis.PERFIL.GESTOR);
  assert.strictEqual(Perfis.normalizar('SEGURANCA '), Perfis.PERFIL.SEGURANCA, 'espaco e maiuscula sao toleraveis');
  assert.strictEqual(Perfis.normalizar('seguranca-admin'), Perfis.PERFIL.GESTOR);
});

test('o perfil de fornecedores foi extinto: nao e conhecido e vira o menor acesso', () => {
  assert.strictEqual(Perfis.conhecido('fornecedores'), false);
  assert.strictEqual(Perfis.normalizar('fornecedores'), Perfis.PERFIL.GESTOR);
  assert.strictEqual(Perfis.ehAdmin('fornecedores'), false);
});

test('so o Admin edita perfis — senao qualquer um se promoveria', () => {
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.ADMIN), true);
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.SEGURANCA), false);
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.TI), false);
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.GESTOR), false);
});

// ============================================================
// RBAC CUMULATIVO: O PODER E A UNIAO DOS PERFIS
// ============================================================

test('array de perfis: pode se QUALQUER perfil conceder', () => {
  assert.strictEqual(Perfis.ehTI(['gestor', 'ti']), true, 'gestor+ti tem TI');
  assert.strictEqual(Perfis.ehSeguranca(['gestor', 'seguranca']), true);
  assert.strictEqual(Perfis.ehAdmin(['gestor', 'ti']), false, 'sem admin no array = nao e admin');
});

test('normalizarLista limpa desconhecidos e duplicatas, mantendo os validos', () => {
  assert.deepStrictEqual(Perfis.normalizarLista(['ti', 'ti', 'lixo', 'gestor']), ['ti', 'gestor']);
  assert.deepStrictEqual(Perfis.normalizarLista([]), [Perfis.PERFIL_PADRAO]);
  assert.deepStrictEqual(Perfis.normalizarLista('seguranca'), ['seguranca']);
});

test('exige area se QUALQUER perfil for gestor', () => {
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.GESTOR), true);
  assert.strictEqual(Perfis.exigeArea(['ti', 'gestor']), true);
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.ADMIN), false);
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.SEGURANCA), false);
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.TI), false);
});

test('gestor NAO gerencia fornecedores; admin e seguranca sim; TI nao', () => {
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.GESTOR), false);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.TI), false);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.ADMIN), true);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.SEGURANCA), true);
});

// ============================================================
// FRONTEIRA DA SEGURANCA DA INFORMACAO
// SI opera todos os modulos, MENOS o proprio do Admin.
// ============================================================

test('SI faz o que e de modulo: PCN, DRP, riscos, indicadores, fornecedores, area, dependencia', () => {
  const si = Perfis.PERFIL.SEGURANCA;
  assert.strictEqual(Perfis.podeGerarPCN(si), true);
  assert.strictEqual(Perfis.podeGerarDRP(si), true);
  assert.strictEqual(Perfis.podeOperarDRP(si), true);
  assert.strictEqual(Perfis.podeEditarRiscos(si), true);
  assert.strictEqual(Perfis.podeEditarIndicadores(si), true);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(si), true);
  assert.strictEqual(Perfis.podeMexerNaArea(si), true);
  assert.strictEqual(Perfis.podeMexerNaDependencia(si), true);
});

test('SI NAO faz o que e proprio do Admin: perfis, perguntas, regua', () => {
  const si = Perfis.PERFIL.SEGURANCA;
  assert.strictEqual(Perfis.podeGerenciarPerfis(si), false);
  assert.strictEqual(Perfis.podeEditarPerguntas(si), false);
  assert.strictEqual(Perfis.podeEditarRegua(si), false);
});

// ============================================================
// FRONTEIRA DA TI
// TI opera o DRP (parametros/dependencias) mas NAO gera PCN nem DRP.
// ============================================================

test('TI opera o DRP e mexe em dependencias, mas NAO gera PCN nem DRP', () => {
  const ti = Perfis.PERFIL.TI;
  assert.strictEqual(Perfis.podeOperarDRP(ti), true, 'TI opera o DRP');
  assert.strictEqual(Perfis.podeMexerNaDependencia(ti), true, 'TI edita parametros DRP nas dependencias');
  assert.strictEqual(Perfis.podeGerarPCN(ti), false, 'TI nao gera PCN');
  assert.strictEqual(Perfis.podeGerarDRP(ti), false, 'TI nao gera DRP');
});

test('TI NAO faz modulos alheios: riscos, indicadores, fornecedores, area, perfis', () => {
  const ti = Perfis.PERFIL.TI;
  assert.strictEqual(Perfis.podeEditarRiscos(ti), false);
  assert.strictEqual(Perfis.podeEditarIndicadores(ti), false);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(ti), false);
  assert.strictEqual(Perfis.podeMexerNaArea(ti), false);
  assert.strictEqual(Perfis.podeGerenciarPerfis(ti), false);
  assert.strictEqual(Perfis.podeEditarPerguntas(ti), false);
});

test('TI + Gestor soma poderes: opera DRP (TI) e cai na propria area (gestor)', () => {
  const tg = ['ti', 'gestor'];
  assert.strictEqual(Perfis.podeOperarDRP(tg), true);
  assert.strictEqual(Perfis.exigeArea(tg), true);
  assert.strictEqual(Perfis.podeGerarPCN(tg), false, 'nem TI nem gestor geram PCN');
  assert.strictEqual(Perfis.podeGerenciarPerfis(tg), false);
});

// ============================================================
// CATALOGO
// ============================================================

test('sao exatamente quatro perfis, e o catalogo descreve todos', () => {
  assert.strictEqual(Perfis.CATALOGO.length, 4);
  Object.values(Perfis.PERFIL).forEach((v) => {
    assert.ok(Perfis.CATALOGO.some((p) => p.valor === v), `${v} falta no catalogo`);
  });
  Perfis.CATALOGO.forEach((p) => {
    assert.ok(p.rotulo && p.rotulo.length > 1, `${p.valor} sem rotulo`);
    assert.ok(p.descricao && p.descricao.length > 20, `${p.valor} sem descricao util`);
  });
});

test('nao existe mais perfil de fornecedores no catalogo', () => {
  assert.ok(!Perfis.CATALOGO.some((p) => p.valor === 'fornecedores'),
    'o perfil fornecedores foi extinto');
  assert.strictEqual(Perfis.PERFIL.FORNECEDORES, undefined);
});

test('conhecido separa perfil real de texto qualquer', () => {
  assert.strictEqual(Perfis.conhecido('admin'), true);
  assert.strictEqual(Perfis.conhecido('seguranca'), true);
  assert.strictEqual(Perfis.conhecido('ti'), true);
  assert.strictEqual(Perfis.conhecido('gestor'), true);
  assert.strictEqual(Perfis.conhecido('fornecedores'), false);
  assert.strictEqual(Perfis.conhecido('auditor'), false);
  assert.strictEqual(Perfis.conhecido(''), false);
});

test('rotulo devolve nome legivel, nunca o valor cru', () => {
  assert.strictEqual(Perfis.rotulo('admin'), 'Administrador');
  assert.strictEqual(Perfis.rotulo('seguranca'), 'Segurança da Informação');
  assert.strictEqual(Perfis.rotulo('ti'), 'TI');
  assert.strictEqual(Perfis.rotulo('gestor'), 'Gestor de área');
});

// ============================================================
// AS REGRAS DO BANCO ESPELHAM ESTA LISTA
//
// firestore.rules nao importa JavaScript: os nomes dos perfis vivem nos dois
// lugares. Este teste existe para que renomear um perfil aqui e esquecer o
// banco nao passe em silencio — o que abriria ou fecharia acesso sem ninguem
// perceber. As regras verificam perfil por temPerfil('x') e/ou perfil == 'x'.
// ============================================================

test('os perfis que as regras testam por nome existem nesta lista', () => {
  const regras = lerRegras();
  // 'gestor' NAO aparece por nome nas regras de proposito: la o gestor e
  // identificado por TER uma area, nao pelo texto do perfil.
  [Perfis.PERFIL.ADMIN, Perfis.PERFIL.SEGURANCA, Perfis.PERFIL.TI].forEach((v) => {
    assert.ok(regras.includes(`temPerfil('${v}')`),
      `o perfil '${v}' nao aparece em firestore.rules via temPerfil()`);
  });
});

test('as regras nao conhecem perfil que esta lista nao tem', () => {
  const regras = lerRegras();
  const usados = [
    ...[...regras.matchAll(/temPerfil\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...regras.matchAll(/perfil\s*==\s*'([^']+)'/g)].map((m) => m[1]),
  ];
  assert.ok(usados.length > 0, 'nenhuma comparacao de perfil encontrada nas regras');
  usados.forEach((v) => {
    assert.ok(Perfis.conhecido(v), `firestore.rules usa o perfil '${v}', que nao existe em perfis.js`);
  });
});

test('as regras nao tratam area VAZIA como area — senao qualquer perfil viraria gestor dos riscos corporativos', () => {
  const regras = lerRegras();
  const fn = regras.slice(regras.indexOf('function gestorArea()'));
  const corpo = fn.slice(0, fn.indexOf('}'));
  assert.ok(/!=\s*''/.test(corpo) || /!=\s*""/.test(corpo),
    'gestorArea() tem que recusar area vazia: os riscos corporativos nascem com area vazia');
});

test('nem SI nem TI podem escrever em config_perfis — so admin', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /config_perfis/'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(!corpo.includes('isSeguranca()'),
    'se SI escrevesse perfis, ela se promoveria a admin');
  assert.ok(!corpo.includes('isTI()'),
    'se TI escrevesse perfis, ela se promoveria a admin');
  assert.ok(corpo.includes('isAdmin()'), 'admin tem que poder gerenciar perfis');
  // Auto-edicao (gestor gravando a propria area) nao pode tocar perfis nem perfil.
  assert.ok(corpo.includes("'perfil'") && corpo.includes("'perfis'"),
    'a auto-edicao tem que barrar mudar perfil e perfis');
});

test('as colecoes de fornecedor usam a permissao (Admin ou SI), nao o perfil admin direto', () => {
  const regras = lerRegras();
  ['criterios_fornecedor', 'avaliacoes_fornecedor', 'categorias_fornecedor'].forEach((col) => {
    const bloco = regras.slice(regras.indexOf(`match /${col}/`));
    const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
    assert.ok(corpo.includes('podeGerenciarFornecedores()'), `${col} deveria usar podeGerenciarFornecedores()`);
  });
});

test('dependencias no banco liberam escrita para Admin, SI e TI (sem guarda de categoria)', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /dependencias/'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(corpo.includes('podeMexerNaDependencia()'),
    'dependencias deveria usar podeMexerNaDependencia() (Admin/SI/TI)');
});

// ============================================================
// QUEM VE QUAL TELA
//
// Cada perfil DECLARA o que ve (allowlist). Tela nova nasce invisivel ate
// alguem decidir de quem ela e — que e o lado certo para errar.
// ============================================================

const TODAS_AS_TELAS = [
  'processos', 'pcns', 'drp', 'areas', 'pessoas', 'riscos',
  'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
  'dependencias', 'componentes', 'perguntas',
  'admin', 'perfis',
  'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios',
];

test('admin ve todas as telas', () => {
  TODAS_AS_TELAS.forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.ADMIN, t), true, t);
  });
});

test('SI ve quase tudo, menos as tres telas proprias do Admin', () => {
  ['processos', 'pcns', 'drp', 'riscos', 'areas', 'pessoas', 'dependencias',
    'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios',
    'indicadores-dashboard', 'admin'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.SEGURANCA, t), true, `SI deveria ver ${t}`);
  });
  ['perfis', 'perguntas', 'componentes'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.SEGURANCA, t), false, `SI nao deveria ver ${t}`);
  });
});

test('TI ve o DRP e o catalogo de dependencias, e nada mais', () => {
  const vistas = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.TI, t));
  assert.deepStrictEqual(vistas.sort(), ['dependencias', 'drp']);
});

test('TI NAO ve processos, PCNs, riscos, fornecedores nem admin', () => {
  ['processos', 'pcns', 'riscos', 'fornecedores', 'admin', 'perfis', 'perguntas',
    'indicadores-dashboard', 'areas', 'pessoas'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.TI, t), false, `TI nao deveria ver ${t}`);
  });
});

test('TI + Gestor ve a uniao: DRP e dependencias (TI) mais o que o gestor ve', () => {
  assert.strictEqual(Perfis.podeVerTela(['ti', 'gestor'], 'drp'), true);
  assert.strictEqual(Perfis.podeVerTela(['ti', 'gestor'], 'dependencias'), true);
  assert.strictEqual(Perfis.podeVerTela(['ti', 'gestor'], 'processos'), true, 'do gestor');
  assert.strictEqual(Perfis.podeVerTela(['ti', 'gestor'], 'riscos'), true, 'do gestor');
  assert.strictEqual(Perfis.podeVerTela(['ti', 'gestor'], 'perfis'), false);
});

test('gestor NAO ve telas de cadastro nem as de fornecedor', () => {
  ['areas', 'pessoas', 'perguntas', 'dependencias', 'componentes', 'perfis',
    'fornecedores', 'fornecedores-criterios'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, t), false, `nao deveria ver ${t}`);
  });
});

test('gestor continua vendo o que sempre viu', () => {
  ['processos', 'pcns', 'drp', 'riscos', 'indicadores-dashboard', 'indicadores-matriz', 'admin'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, t), true, t);
  });
});

test('tela desconhecida nao abre para ninguem, menos admin', () => {
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, 'tela-que-nao-existe'), false);
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.TI, 'tela-que-nao-existe'), false);
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, ''), false);
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, null), false);
});

test('perfil desconhecido ve o que o menor acesso ve, e nada mais', () => {
  const doDesconhecido = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela('auditor-inventado', t));
  const doGestor = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.GESTOR, t));
  assert.deepStrictEqual(doDesconhecido, doGestor);
});

test('cada perfil tem pelo menos uma tela, senao a pessoa entra e nao ve nada', () => {
  Perfis.CATALOGO.forEach((p) => {
    const telas = Perfis.telasDoPerfil(p.valor);
    assert.ok(telas === '*' || telas.length > 0, `${p.valor} nao tem tela nenhuma`);
  });
});

// ============================================================
// DEPENDENCIAS: ADMIN, SI E TI MEXEM; GESTOR NAO
// (a guarda de categoria caiu com o fim do perfil de fornecedores)
// ============================================================

test('Admin, SI e TI mexem no catalogo de dependencias', () => {
  [Perfis.PERFIL.ADMIN, Perfis.PERFIL.SEGURANCA, Perfis.PERFIL.TI].forEach((p) => {
    assert.strictEqual(Perfis.podeMexerNaDependencia(p), true, p);
  });
});

test('gestor nao mexe no catalogo de dependencias', () => {
  assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.GESTOR), false);
});

test('categoriaDeFornecedor aceita as duas grafias em uso e recusa o resto', () => {
  assert.strictEqual(Perfis.categoriaDeFornecedor('Fornecedores'), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor('Fornecedor'), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor(' Fornecedores '), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor('fornecedores'), false, 'minuscula nao e a grafia gravada no catalogo');
  assert.strictEqual(Perfis.categoriaDeFornecedor('Sistemas'), false);
});
