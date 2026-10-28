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

test('sao exatamente seis perfis, e o catalogo descreve todos', () => {
  assert.strictEqual(Perfis.CATALOGO.length, 6);
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
  assert.strictEqual(Perfis.rotulo('operador'), 'Operador Administrativo');
  assert.strictEqual(Perfis.rotulo('operador_processos'), 'Operador de Processos');
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
  [Perfis.PERFIL.ADMIN, Perfis.PERFIL.SEGURANCA, Perfis.PERFIL.TI, Perfis.PERFIL.OPERADOR, Perfis.PERFIL.OPERADOR_PROCESSOS].forEach((v) => {
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
  'processos', 'pcns', 'drp', 'areas', 'pessoas', 'riscos', 'vulnerabilidades',
  'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
  'dependencias', 'componentes', 'perguntas', 'relatorios', 'servicos', 'catalogo-backup', 'catalogo-backup-ferramentas',
  'admin', 'perfis', 'produtos-software',
  'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios', 'fornecedores-subcategorias', 'fornecedores-criticidade',
  'contratos', 'contratos-tipos', 'contratos-indexadores', 'contratos-status', 'notificacoes-email',
  'conformidade',
];

test('admin ve todas as telas', () => {
  TODAS_AS_TELAS.forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.ADMIN, t), true, t);
  });
});

test('SI ve quase tudo, menos as tres telas proprias do Admin', () => {
  ['processos', 'pcns', 'drp', 'riscos', 'vulnerabilidades', 'areas', 'pessoas', 'dependencias', 'relatorios', 'servicos', 'catalogo-backup', 'catalogo-backup-ferramentas', 'produtos-software',
    'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios', 'fornecedores-subcategorias', 'fornecedores-criticidade',
    'contratos', 'contratos-tipos', 'contratos-indexadores', 'contratos-status',
    'indicadores-dashboard', 'admin'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.SEGURANCA, t), true, `SI deveria ver ${t}`);
  });
  ['perfis', 'perguntas', 'componentes', 'notificacoes-email'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.SEGURANCA, t), false, `SI nao deveria ver ${t}`);
  });
});

test('TI ve o DRP, o catalogo de dependencias e relatorios, e nada mais', () => {
  const vistas = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.TI, t));
  assert.deepStrictEqual(vistas.sort(), ['dependencias', 'drp', 'relatorios']);
});

test('TI NAO ve processos, PCNs, riscos, fornecedores, servicos/catalogo-backup nem admin', () => {
  ['processos', 'pcns', 'riscos', 'fornecedores', 'admin', 'perfis', 'perguntas',
    'indicadores-dashboard', 'areas', 'pessoas', 'servicos', 'catalogo-backup', 'catalogo-backup-ferramentas'].forEach((t) => {
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
  ['areas', 'pessoas', 'perguntas', 'dependencias', 'componentes', 'perfis', 'relatorios', 'servicos', 'catalogo-backup', 'catalogo-backup-ferramentas',
    'fornecedores', 'fornecedores-criterios', 'fornecedores-subcategorias', 'fornecedores-criticidade'].forEach((t) => {
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

// ============================================================
// OPERADOR ADMINISTRATIVO (14/10/2026): assistente de TI/SI, nao tecnico.
// Gerencia fornecedores; so consulta Processos, Pessoas e Areas.
// ============================================================

const TELAS_DO_OPERADOR = [
  'areas', 'contratos', 'contratos-indexadores', 'contratos-status', 'contratos-tipos', 'fornecedores', 'fornecedores-categorias', 'fornecedores-criterios',
  'fornecedores-criticidade', 'fornecedores-subcategorias', 'pessoas', 'processos', 'relatorios',
];

test('operador ve exatamente as 13 telas combinadas, e nenhuma outra', () => {
  const vistas = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.OPERADOR, t));
  assert.deepStrictEqual(vistas.sort(), TELAS_DO_OPERADOR);
});

test('operador NAO ve nada tecnico: DRP, PCN, riscos, vulnerabilidades, indicadores, perfis, perguntas, dependencias', () => {
  ['drp', 'pcns', 'riscos', 'vulnerabilidades', 'indicadores-dashboard', 'indicadores-cadastro',
    'indicadores-lancamento', 'indicadores-matriz', 'dependencias', 'componentes', 'perfis', 'perguntas',
    'servicos', 'catalogo-backup', 'catalogo-backup-ferramentas', 'produtos-software', 'admin'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.OPERADOR, t), false, `operador nao deveria ver ${t}`);
  });
});

test('a pagina inicial do operador e Processos', () => {
  assert.strictEqual(Perfis.telasDoPerfil(Perfis.PERFIL.OPERADOR)[0], 'processos');
});

test('operador gerencia fornecedores e nada alem disso', () => {
  const o = Perfis.PERFIL.OPERADOR;
  assert.strictEqual(Perfis.podeGerenciarFornecedores(o), true);
  assert.strictEqual(Perfis.ehOperador(o), true);
  assert.strictEqual(Perfis.exigeArea(o), false);
  [Perfis.podeMexerNaDependencia, Perfis.podeMexerNaArea, Perfis.podeGerenciarProdutosSoftware,
    Perfis.podeGerenciarPerfis, Perfis.podeGerarPCN, Perfis.podeGerarDRP, Perfis.podeOperarDRP,
    Perfis.podeEditarRiscos, Perfis.podeEditarIndicadores, Perfis.podeEditarPerguntas,
    Perfis.podeEditarRegua, Perfis.podeEditarProcessos, Perfis.podeEditarPessoas].forEach((fn) => {
    assert.strictEqual(fn(o), false, `${fn.name} deveria ser false para o operador`);
  });
});

// ============================================================
// CONTRATOS (15/10/2026): mesma posse de Fornecedores; Gestor so consulta.
// ============================================================

test('contratos: Admin, SI e Operador editam; Gestor e TI nao', () => {
  ['admin', 'seguranca', 'operador'].forEach((p) => assert.strictEqual(Perfis.podeEditarContratos(p), true, p));
  ['gestor', 'ti'].forEach((p) => assert.strictEqual(Perfis.podeEditarContratos(p), false, p));
});

test('gestor ve a tela de contratos, mas nao as listas de configuracao', () => {
  assert.strictEqual(Perfis.podeVerTela('gestor', 'contratos'), true);
  ['contratos-tipos', 'contratos-indexadores', 'contratos-status'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela('gestor', t), false, t);
  });
  assert.strictEqual(Perfis.podeVerTela('ti', 'contratos'), false);
});

test('quem ja editava processos e pessoas continua editando', () => {
  assert.strictEqual(Perfis.podeEditarProcessos('admin'), true);
  assert.strictEqual(Perfis.podeEditarProcessos('seguranca'), true);
  assert.strictEqual(Perfis.podeEditarProcessos('gestor'), true);
  assert.strictEqual(Perfis.podeEditarProcessos('ti'), false);
  assert.strictEqual(Perfis.podeEditarPessoas('admin'), true);
  assert.strictEqual(Perfis.podeEditarPessoas('seguranca'), true);
  assert.strictEqual(Perfis.podeEditarPessoas('ti'), true);
  assert.strictEqual(Perfis.podeEditarPessoas('gestor'), false);
});

test('operador + TI soma os poderes (uniao), sem dar fornecedor ao TI sozinho', () => {
  assert.strictEqual(Perfis.podeMexerNaDependencia(['operador', 'ti']), true);
  assert.strictEqual(Perfis.podeVerTela(['operador', 'ti'], 'drp'), true);
  assert.strictEqual(Perfis.podeGerenciarFornecedores('ti'), false);
});

test('as regras limitam o operador em /dependencias a categoria de fornecedor', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /dependencias/{id}'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(/allow update:[^;]*isOperador\(\)[^;]*categoriaFornecedor\(resource\.data\.categoria\)[^;]*categoriaFornecedor\(request\.resource\.data\.categoria\)/s.test(corpo),
    'update do operador tem que exigir fornecedor antes E depois (sem reclassificar)');
  assert.ok(/allow create:[^;]*isOperador\(\)[^;]*categoriaFornecedor\(request\.resource/s.test(corpo));
  assert.ok(/allow delete:[^;]*isOperador\(\)[^;]*categoriaFornecedor\(resource/s.test(corpo));
  assert.ok(!/podeMexerNaDependencia\(\)\s*\|\|\s*isOperador/.test(corpo), 'operador nao entra na regra ampla');
});

// ============================================================
// OPERADOR DE PROCESSOS (23/10/2026): documenta e monitora os processos de
// todas as areas. Opera Processos, BIA e PCN; DRP so em leitura.
// ============================================================

const TELAS_DO_OPERADOR_PROCESSOS = [
  'admin', 'areas', 'conformidade', 'dependencias', 'drp', 'pcns', 'pessoas', 'processos', 'relatorios',
];

test('operador de processos ve as telas de continuidade, e nenhuma outra', () => {
  const vistas = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.OPERADOR_PROCESSOS, t));
  assert.deepStrictEqual(vistas.sort(), TELAS_DO_OPERADOR_PROCESSOS);
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.OPERADOR_PROCESSOS, 'mapa'), true);
});

test('a pagina inicial do operador de processos e o Painel de Conformidade', () => {
  assert.strictEqual(Perfis.paginaInicial(Perfis.PERFIL.OPERADOR_PROCESSOS), 'conformidade');
  assert.strictEqual(Perfis.paginaInicial(['gestor', 'operador_processos']), 'conformidade',
    'tem mais alcance que o gestor');
  assert.strictEqual(Perfis.paginaInicial(['seguranca', 'operador_processos']), 'admin');
});

test('operador de processos opera processos, BIA e PCN; DRP so le', () => {
  const o = Perfis.PERFIL.OPERADOR_PROCESSOS;
  assert.strictEqual(Perfis.ehOperadorProcessos(o), true);
  assert.strictEqual(Perfis.exigeArea(o), false, 'visao corporativa, sem area');
  assert.strictEqual(Perfis.podeEditarProcessos(o), true);
  assert.strictEqual(Perfis.podeGerarPCN(o), true);
  assert.strictEqual(Perfis.podeVerConteudoDRP(o), true);
  assert.strictEqual(Perfis.podeRegistrarRevisao(o, 'bia'), true);
  assert.strictEqual(Perfis.podeRegistrarRevisao(o, 'pcn'), true);
  assert.strictEqual(Perfis.podeRegistrarRevisao(o, 'drp'), false);
  [Perfis.podeGerarDRP, Perfis.podeOperarDRP, Perfis.podeMexerNaDependencia, Perfis.podeMexerNaArea,
    Perfis.podeEditarPessoas, Perfis.podeEditarRiscos, Perfis.podeEditarIndicadores, Perfis.podeEditarPerguntas,
    Perfis.podeEditarRegua, Perfis.podeGerenciarPerfis, Perfis.podeGerenciarFornecedores,
    Perfis.podeEditarCiclos].forEach((fn) => {
    assert.strictEqual(fn(o), false, `${fn.name} deveria ser false para o operador de processos`);
  });
});

test('o Operador Administrativo (operador) NAO ganha nada do Operador de Processos', () => {
  ['podeGerarPCN', 'podeEditarProcessos', 'podeVerConteudoDRP', 'ehOperadorProcessos'].forEach((fn) => {
    assert.strictEqual(Perfis[fn]('operador'), false, fn);
  });
  assert.strictEqual(Perfis.podeVerTela('operador', 'conformidade'), false);
});

test('PCN: so gestor e TI continuam sem gerar; ver o DRP nao e dado ao gestor', () => {
  ['admin', 'seguranca', 'operador_processos'].forEach((p) => assert.strictEqual(Perfis.podeGerarPCN(p), true, p));
  ['gestor', 'ti', 'operador'].forEach((p) => assert.strictEqual(Perfis.podeGerarPCN(p), false, p));
  ['admin', 'seguranca', 'ti', 'operador_processos'].forEach((p) => assert.strictEqual(Perfis.podeVerConteudoDRP(p), true, p));
  ['gestor', 'operador'].forEach((p) => assert.strictEqual(Perfis.podeVerConteudoDRP(p), false, p));
});

test('conformidade: SI e gestor (area dele) tambem veem; TI nao', () => {
  assert.strictEqual(Perfis.podeVerTela('seguranca', 'conformidade'), true);
  assert.strictEqual(Perfis.podeVerTela('gestor', 'conformidade'), true);
  assert.strictEqual(Perfis.podeVerTela('ti', 'conformidade'), false);
});

test('as regras dao ao operador de processos escrita em processos e respostas_bia', () => {
  const regras = lerRegras();
  const proc = regras.slice(regras.indexOf('match /processos/{id}'));
  assert.ok(proc.slice(0, proc.indexOf('\n    }')).includes('podeOperarProcessos()'));
  const bia = regras.slice(regras.indexOf('match /respostas_bia/{id}'));
  assert.ok(/allow create:[^;]*podeOperarProcessos\(\)/.test(bia.slice(0, bia.indexOf('\n    }'))));
  const fn = regras.slice(regras.indexOf('function podeOperarProcessos()'));
  assert.ok(fn.slice(0, fn.indexOf('}')).includes('isOperadorProcessos()'));
});

// ============================================================
// "+ CRIAR" DA ABA DEPENDENCIAS DO PROCESSO (28/10/2026)
// ============================================================

test('podeCriarDependenciaPeloProcesso: operador de processos so cria os Ps nao tecnicos', () => {
  const op = 'operador_processos';
  ['Pessoas', 'Pessoa', 'Instalações', 'Instalação', 'Fornecedores', 'Fornecedor'].forEach((c) => {
    assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso(op, c), true, c);
  });
  ['Servidor', 'Sistemas', 'Banco de Dados', 'Serviços', 'Processos Internos', ''].forEach((c) => {
    assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso(op, c), false, c || '(vazio)');
  });
  assert.strictEqual(Perfis.podeMexerNaDependencia(op), false, 'criar nao e editar o catalogo');
});

test('podeCriarDependenciaPeloProcesso: gestor nao; operador administrativo so fornecedor; Admin/SI/TI tudo', () => {
  ['Pessoas', 'Fornecedores', 'Instalações'].forEach((c) => assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso('gestor', c), false, c));
  assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso('operador', 'Fornecedores'), true);
  assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso('operador', 'Pessoas'), false);
  ['admin', 'seguranca', 'ti'].forEach((p) => {
    ['Pessoas', 'Servidor', 'Fornecedores'].forEach((c) => assert.strictEqual(Perfis.podeCriarDependenciaPeloProcesso(p, c), true, `${p}/${c}`));
  });
});

test('a regra de /dependencias deixa o operador de processos so criar o cadastro basico', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /dependencias/{id}'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(/allow create: if isOperadorProcessos\(\)[^;]*hasOnly\(\['categoria', 'nome', 'criadoEm', 'criadoPor'\]\)/s.test(corpo));
  assert.ok(!/allow (update|delete|write)[^;]*isOperadorProcessos/.test(corpo), 'nao edita nem exclui');
  Perfis.CATEGORIAS_CRIAVEIS_PELO_PROCESSO.forEach((c) => assert.ok(corpo.includes(`'${c}'`), c));
});
