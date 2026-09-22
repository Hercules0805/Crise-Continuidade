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
  assert.strictEqual(Perfis.normalizar('Fornecedores '), Perfis.PERFIL.FORNECEDORES, 'espaco e maiuscula sao toleraveis');
  assert.strictEqual(Perfis.normalizar('fornecedores-admin'), Perfis.PERFIL.GESTOR);
});

test('o perfil de fornecedores NAO e admin', () => {
  assert.strictEqual(Perfis.ehAdmin(Perfis.PERFIL.FORNECEDORES), false);
});

test('o perfil de fornecedores NAO edita perfis — senao se promoveria', () => {
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.FORNECEDORES), false);
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.GESTOR), false);
  assert.strictEqual(Perfis.podeGerenciarPerfis(Perfis.PERFIL.ADMIN), true);
});

test('gestor NAO gerencia fornecedores', () => {
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.GESTOR), false);
});

test('admin e o perfil de fornecedores gerenciam fornecedores', () => {
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.ADMIN), true);
  assert.strictEqual(Perfis.podeGerenciarFornecedores(Perfis.PERFIL.FORNECEDORES), true);
});

// ============================================================
// CATALOGO
// ============================================================

test('sao exatamente tres perfis, e o catalogo descreve todos', () => {
  assert.strictEqual(Perfis.CATALOGO.length, 3);
  Object.values(Perfis.PERFIL).forEach((v) => {
    assert.ok(Perfis.CATALOGO.some((p) => p.valor === v), `${v} falta no catalogo`);
  });
  Perfis.CATALOGO.forEach((p) => {
    assert.ok(p.rotulo && p.rotulo.length > 2, `${p.valor} sem rotulo`);
    assert.ok(p.descricao && p.descricao.length > 20, `${p.valor} sem descricao util`);
  });
});

test('so o gestor esta amarrado a uma area', () => {
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.GESTOR), true);
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.ADMIN), false);
  assert.strictEqual(Perfis.exigeArea(Perfis.PERFIL.FORNECEDORES), false);
});

test('conhecido separa perfil real de texto qualquer', () => {
  assert.strictEqual(Perfis.conhecido('admin'), true);
  assert.strictEqual(Perfis.conhecido('fornecedores'), true);
  assert.strictEqual(Perfis.conhecido('auditor'), false);
  assert.strictEqual(Perfis.conhecido(''), false);
});

test('rotulo devolve nome legivel, nunca o valor cru', () => {
  assert.strictEqual(Perfis.rotulo('admin'), 'Administrador');
  assert.strictEqual(Perfis.rotulo('fornecedores'), 'Fornecedores');
  assert.strictEqual(Perfis.rotulo('gestor'), 'Gestor de área');
});

// ============================================================
// AS REGRAS DO BANCO ESPELHAM ESTA LISTA
//
// firestore.rules nao importa JavaScript: os nomes dos perfis vivem nos dois
// lugares. Este teste existe para que renomear um perfil aqui e esquecer o
// banco nao passe em silencio — o que abriria ou fecharia acesso sem ninguem
// perceber.
// ============================================================

test('os perfis que as regras testam por nome existem nesta lista', () => {
  const regras = lerRegras();
  // 'gestor' NAO aparece por nome nas regras de proposito: la o gestor e
  // identificado por TER uma area, nao pelo texto do perfil.
  [Perfis.PERFIL.ADMIN, Perfis.PERFIL.FORNECEDORES].forEach((v) => {
    assert.ok(regras.includes(`perfil == '${v}'`), `o perfil '${v}' nao aparece em firestore.rules`);
  });
});

test('as regras nao tratam area VAZIA como area — senao qualquer perfil viraria gestor dos riscos corporativos', () => {
  const regras = lerRegras();
  const fn = regras.slice(regras.indexOf('function gestorArea()'));
  const corpo = fn.slice(0, fn.indexOf('}'));
  assert.ok(/!=\s*''/.test(corpo) || /!=\s*""/.test(corpo),
    'gestorArea() tem que recusar area vazia: os riscos corporativos nascem com area vazia');
});

test('o perfil de fornecedores nao pode escrever em config_perfis', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /config_perfis/'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(!corpo.includes('podeGerenciarFornecedores'),
    'se o perfil de fornecedores escrevesse perfis, ele se promoveria a admin');
  assert.ok(corpo.includes('isAdmin()'), 'admin tem que poder gerenciar perfis');
});

test('as colecoes de fornecedor usam a permissao, nao o perfil admin direto', () => {
  const regras = lerRegras();
  ['criterios_fornecedor', 'avaliacoes_fornecedor', 'categorias_fornecedor'].forEach((col) => {
    const bloco = regras.slice(regras.indexOf(`match /${col}/`));
    const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
    assert.ok(corpo.includes('podeGerenciarFornecedores()'), `${col} deveria usar podeGerenciarFornecedores()`);
  });
});

test('as regras nao conhecem perfil que esta lista nao tem', () => {
  const regras = lerRegras();
  const usados = [...regras.matchAll(/perfil\s*==\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(usados.length > 0, 'nenhuma comparacao de perfil encontrada nas regras');
  usados.forEach((v) => {
    assert.ok(Perfis.conhecido(v), `firestore.rules compara com o perfil '${v}', que nao existe em perfis.js`);
  });
});

// ============================================================
// QUEM VE QUAL TELA
//
// Antes era uma lista do que ESCONDER, e ela deixou passar Processos, PCNs,
// Riscos e Indicadores para o perfil de fornecedores. Lista de exclusao erra
// por omissao. Agora cada perfil declara o que ve, e estes testes garantem que
// tela nova nao nasce visivel para quem nao deveria.
// ============================================================

const TODAS_AS_TELAS = [
  'processos', 'pcns', 'areas', 'pessoas', 'riscos',
  'indicadores-dashboard', 'indicadores-cadastro', 'indicadores-lancamento', 'indicadores-matriz',
  'dependencias', 'componentes', 'perguntas',
  'admin', 'perfis',
  'fornecedores', 'fornecedores-cadastro', 'fornecedores-criterios',
];

test('admin ve todas as telas', () => {
  TODAS_AS_TELAS.forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.ADMIN, t), true, t);
  });
});

test('o perfil de fornecedores ve as telas de fornecedor mais Areas e Pessoas', () => {
  // Areas e Pessoas entraram porque Gestor do Contrato (Pessoa) e Setor
  // responsavel (Area) sao escolhidos no proprio cadastro de fornecedor.
  const vistas = TODAS_AS_TELAS.filter((t) => Perfis.podeVerTela(Perfis.PERFIL.FORNECEDORES, t));
  assert.deepStrictEqual(vistas.sort(), ['areas', 'fornecedores', 'fornecedores-cadastro', 'fornecedores-criterios', 'pessoas']);
});

test('o perfil de fornecedores NAO ve processos, PCNs, riscos nem indicadores', () => {
  ['processos', 'pcns', 'riscos', 'indicadores-dashboard', 'indicadores-cadastro',
    'indicadores-lancamento', 'indicadores-matriz', 'admin', 'perfis',
    'perguntas', 'dependencias', 'componentes'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.FORNECEDORES, t), false, `nao deveria ver ${t}`);
  });
});

test('gestor NAO ve as telas de cadastro nem as de fornecedor', () => {
  ['areas', 'pessoas', 'perguntas', 'dependencias', 'componentes', 'perfis',
    'fornecedores', 'fornecedores-cadastro', 'fornecedores-criterios'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, t), false, `nao deveria ver ${t}`);
  });
});

test('gestor continua vendo o que sempre viu', () => {
  ['processos', 'pcns', 'riscos', 'indicadores-dashboard', 'indicadores-matriz', 'admin'].forEach((t) => {
    assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, t), true, t);
  });
});

test('tela desconhecida nao abre para ninguem, menos admin', () => {
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.GESTOR, 'tela-que-nao-existe'), false);
  assert.strictEqual(Perfis.podeVerTela(Perfis.PERFIL.FORNECEDORES, 'tela-que-nao-existe'), false);
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
// PERMISSAO TOTAL NO MODULO, E SO NELE
// ============================================================

test('o perfil de fornecedores cadastra, edita e apaga fornecedor', () => {
  assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.FORNECEDORES, 'Fornecedores'), true);
  assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.FORNECEDORES, 'Fornecedor'), true);
});

test('o perfil de fornecedores tambem mexe em Pessoas -- e de onde vem o Gestor do Contrato', () => {
  assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.FORNECEDORES, 'Pessoas'), true);
});

test('o perfil de fornecedores NAO mexe nas categorias do BIA que nao sao Fornecedor nem Pessoas', () => {
  ['Infraestrutura', 'Sistemas', 'Processos Internos', '', null].forEach((cat) => {
    assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.FORNECEDORES, cat), false, `categoria ${cat}`);
  });
});

test('admin mexe em qualquer categoria do catalogo', () => {
  ['Fornecedores', 'Infraestrutura', 'Pessoas', 'Sistemas', 'Processos Internos'].forEach((cat) => {
    assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.ADMIN, cat), true, cat);
  });
});

test('gestor nao mexe no catalogo de dependencias', () => {
  assert.strictEqual(Perfis.podeMexerNaDependencia(Perfis.PERFIL.GESTOR, 'Fornecedores'), false);
});

test('categoriaDeFornecedor aceita as duas grafias em uso e recusa o resto', () => {
  assert.strictEqual(Perfis.categoriaDeFornecedor('Fornecedores'), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor('Fornecedor'), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor(' Fornecedores '), true);
  assert.strictEqual(Perfis.categoriaDeFornecedor('fornecedores'), false, 'minuscula nao e a grafia gravada no catalogo');
  assert.strictEqual(Perfis.categoriaDeFornecedor('Sistemas'), false);
});

test('as regras do banco tambem guardam a categoria em /dependencias', () => {
  const regras = lerRegras();
  const bloco = regras.slice(regras.indexOf('match /dependencias/'));
  const corpo = bloco.slice(0, bloco.indexOf('\n    }'));
  assert.ok(corpo.includes('categoriaGerenciavelPorFornecedores'),
    'sem a guarda de categoria, quem avalia fornecedor apagaria as dependencias do BIA');
  // As duas pontas: como esta e como vai ficar.
  assert.ok(corpo.includes('resource.data.categoria') && corpo.includes('request.resource.data.categoria'),
    'checar so uma ponta deixaria mover dependencia de Sistemas para Fornecedores');
});
