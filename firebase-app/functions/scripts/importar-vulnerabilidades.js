/**
 * Importa o histórico do "Catálogo de Vulnerabilidades Reportadas" (planilha/
 * PDF trazido pelo usuário em 06/10/2026) pra coleção `vulnerabilidades`.
 *
 * RODA UMA VEZ, NA MAO, DEPOIS DO DEPLOY do código da tela Vulnerabilidades
 * (senão os itens migrados não têm tela nenhuma pra aparecer ainda):
 *   cd firebase-app/functions
 *   node scripts/importar-vulnerabilidades.js
 *
 * Mesma autenticação dos outros scripts desta pasta (gcloud auth
 * application-default login, ou GOOGLE_APPLICATION_CREDENTIALS apontando pra
 * uma service account com acesso ao projeto).
 *
 * E IDEMPOTENTE: se já existir uma vulnerabilidade com o mesmo `codigo` (por
 * já ter rodado antes), pula a linha em vez de duplicar.
 *
 * SOBRE OS DADOS: extraídos de um PDF (texto + imagem da tabela original);
 * algumas células ambíguas na extração (ex.: Exploit_Disponível de algumas
 * linhas, Versão) ficaram em branco de propósito em vez de adivinhadas --
 * confira/complete na tela depois de importar, se precisar. As datas da
 * planilha são DD/MM/AA; convertidas aqui pra AAAA-MM-DD.
 *
 * NAO DEVE ABRIR RISCO NENHUM ao rodar: quase todas as linhas já estão
 * Corrigida/Aceita (decisão do usuário: histórico já resolvido não abre
 * risco -- ver vulnerabilidadeRisco.js, STATUS_FECHADOS_CORRECAO). A única
 * exceção é 2026-002 (Fortes AC), ainda "Aberto" -- essa sim deve abrir risco
 * automaticamente pelo gatilho `riscoDeVulnerabilidade`, se a severidade
 * (Alta, sem CVSS) cruzar o limiar.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

/** 'DD/MM/AA' -> 'AAAA-MM-DD'. */
function data(dmy) {
  if (!dmy) return '';
  const [d, m, y] = dmy.split('/');
  return `20${y}-${m}-${d}`;
}

const LINHAS = [
  {
    codigo: '2025-0001', ticketReport: '65716', produto: 'Fortes RH', nome: 'Acesso não autorizado à nome e o salário',
    cwe: 'CWE-284 — Improper Access Control', severidadeManual: 'Alta',
    descricao: 'Quando um usuário tem acesso ao "Histórico de Colaborador", mesmo as configurações de permissão de acesso limitando à quais colaboradores o usuário terá acesso, é possível o usuário facilmente acessar informações pessoais de colaboradores para os quais ele não tem essa permissão. Essa brecha de segurança pode ser explorada através da alteração do ID ao final da URL.',
    dataDeteccao: data('23/10/25'), origemDeteccao: 'NOGUEIRA, Thiago', responsavel: 'Patricia Pereira',
    ticketCorrecao: 'DEV202510240927', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('06/11/25'), dataCorrecao: data('06/11/25'),
  },
  {
    codigo: '2025-0002', ticketReport: '65969', produto: '.NET', nome: '.NET SDK/Runtime nas versões 8.0 e 9.0',
    cve: 'CVE-2025-55247 e 48', cvss: 9.8,
    descricao: 'Duas falhas de segurança de alta severidade que afetam o ecossistema .NET, com potencial para comprometer a integridade dos processos de build e vazar dados confidenciais. A ação imediata é mandatório.',
    dataDeteccao: data('31/10/25'), responsavel: 'Gean Ribeiro da Silva Junior',
    statusCorrecao: 'Corrigida', dataPrevistaCorrecao: data('04/11/25'), dataCorrecao: data('04/11/25'),
  },
  {
    codigo: '2026-001', ticketReport: '68924', produto: 'Fortes RH', nome: 'Anonimização do Banco', severidadeManual: 'Alta',
    descricao: 'Identificamos que, ao utilizar a funcionalidade de anonimização de banco de dados, o Fortes RH não está anonimizando informações sensíveis presentes na auditoria.',
    dataDeteccao: data('09/02/26'), origemDeteccao: 'NOGUEIRA, Thiago', equipeResponsavel: 'Desenv. GP',
    ticketCorrecao: 'CH202602101058', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('12/02/26'), dataCorrecao: data('12/02/26'),
    evidenciaCorrecao: 'Print no ticket 68924',
  },
  {
    codigo: '2026-002', ticketReport: '68072', produto: 'Fortes AC', nome: 'Information Disclosure / Sensitive Data Exposure',
    cwe: 'CWE-284 — Improper Access Control; CWE-522 — Insufficiently Protected Credentials; CWE-200 — Exposure of Sensitive Information',
    severidadeManual: 'Alta',
    descricao: 'A versão atual do sistema permite a visualização em claro da senha do banco de dados por meio da interface de configuração através do mecanismo Password Visibility Toggle (olho), possibilitando que usuários com acesso à funcionalidade revelem credenciais sensíveis. O comportamento caracteriza exposição de informação crítica, pois envolve credencial de infraestrutura que pode permitir acesso direto ao banco de dados, impactando confidencialidade e integridade das informações. Risco potencial: comprometimento total dos dados em caso de uso indevido da credencial.',
    dataDeteccao: data('10/02/26'), origemDeteccao: 'Cliente, SI', equipeResponsavel: 'Produto',
    statusCorrecao: 'Aberto',
  },
  {
    codigo: '2026-003', ticketReport: '70586', produto: 'Área Restrita', nome: 'E-mail de recuperação de senha',
    descricao: 'Processo de recuperação de senha envia senha existente para e-mails cadastrados, em texto plano.',
    dataDeteccao: data('24/03/26'), origemDeteccao: 'Unidade Fortes Quixadá', equipeResponsavel: 'Desenv. P&D',
    responsavel: 'Edivando Severo', ticketCorrecao: '2490', statusCorrecao: 'Aceita',
    dataPrevistaCorrecao: data('30/09/26'),
  },
  {
    codigo: '2026-004', ticketReport: '69790', produto: 'Google Groups', nome: 'Visibilidade de Grupos', severidadeManual: 'Alta',
    descricao: 'Permissão padrão durante a criação de grupos permite que qualquer colaborador da empresa tenha acesso a mensagens trocadas em grupos.',
    dataDeteccao: data('04/03/26'), origemDeteccao: 'Reporte feito por colaborador', equipeResponsavel: 'SI',
    ticketCorrecao: '71985', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('27/04/26'), dataCorrecao: data('27/04/26'),
  },
  {
    codigo: '2026-005', ticketReport: '69879', produto: 'Normativa NR.SI.007 (Desenvolvimento Seguro de Sistemas)',
    nome: 'CPF do Sabino exposto', severidadeManual: 'Baixa',
    descricao: 'Normativa assinada com certificado digital, expondo assim o CPF.',
    dataDeteccao: data('05/03/26'), origemDeteccao: 'Gabriel Fortes', equipeResponsavel: 'SI',
    statusCorrecao: 'Aceita', dataPrevistaCorrecao: data('30/08/26'),
  },
  {
    codigo: '2026-006', ticketReport: '71752', produto: 'AC Contábil',
    nome: 'Balancete contábil: usuário sem acesso à empresa consegue gerar balancete', severidadeManual: 'Média',
    descricao: 'Na base teste temos o usuário THAYNÁ e ADMIN. O usuário THAYNÁ só tem acesso à empresa BMQ, mas ao abrir o relatório balancete contábil consegue visualizar os dados da empresa DEMONSTRAÇÃO, que somente o usuário ADMIN tem acesso.',
    dataDeteccao: data('24/04/26'), origemDeteccao: 'Suporte ContWeb', responsavel: 'Igor Paz Limeira',
    ticketCorrecao: '727662448', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('28/04/26'), dataCorrecao: data('28/04/26'),
    observacoes: 'Corrigido na versão 8.23.1.1.',
  },
  {
    codigo: '2026-007', ticketReport: '72599', produto: 'Colabore', nome: 'E-mail de cadastro', severidadeManual: 'Média',
    descricao: 'Aplicação não possui controles que mitiguem ataques de força bruta (por exemplo) para os e-mails de cadastro na plataforma.',
    dataDeteccao: data('15/05/26'), origemDeteccao: 'Pré-vendas', equipeResponsavel: 'Dev GP',
    responsavel: 'Gean Ribeiro da Silva Junior', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('15/05/26'), dataCorrecao: data('15/05/26'),
  },
  {
    codigo: '2026-008', ticketReport: '72703', produto: 'Fortes Pessoal', nome: 'Painel da DCTFWeb', severidadeManual: 'Média',
    descricao: 'Ao acessar o módulo Fortes Pessoal, especificamente no Painel da DCTFWeb, foi identificado que mesmo após a remoção da permissão de acesso da empresa para o usuário, a funcionalidade continua permitindo a utilização e visualização da empresa.',
    dataDeteccao: data('18/05/26'), origemDeteccao: 'Produto', equipeResponsavel: 'Dev Pessoal',
    responsavel: 'Marília Paiva', ticketCorrecao: 'FPCON-2010', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('27/05/26'), dataCorrecao: data('28/05/26'),
    observacoes: 'Corrigido na versão 8.24.2.1.',
  },
  {
    codigo: '2026-009', ticketReport: '72832', produto: 'Fortes RH', nome: 'Anonimização', severidadeManual: 'Alta',
    descricao: 'No Fortes RH, os dados pessoais (nome completo e CPF) não estão sendo anonimizados.',
    dataDeteccao: data('22/05/26'), origemDeteccao: 'Dev RH', equipeResponsavel: 'Dev RH',
    responsavel: 'NOGUEIRA, Thiago', ticketCorrecao: '737163176', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('29/05/26'), dataCorrecao: data('26/05/26'),
  },
  {
    codigo: '2026-010', ticketReport: '73155', produto: 'Fortes Ponto', nome: 'Cifra de César', severidadeManual: 'Média',
    descricao: 'Os campos de texto (nome, e-mail) são embaralhados com uma cifra de César — um deslocamento simples de letras no alfabeto. Por ser reversível, foi possível recuperar os nomes reais dos colaboradores a partir do backup já anonimizado, apenas revertendo o deslocamento.',
    dataDeteccao: data('01/06/26'), origemDeteccao: 'Dev Ponto', equipeResponsavel: 'Desenv. P&D',
    ticketCorrecao: '2518', statusCorrecao: 'Aceita',
  },
  {
    codigo: '2026-011', ticketReport: '74056', produto: 'Fortes Pessoal', nome: 'Relatórios Multiempresa', severidadeManual: 'Média',
    descricao: 'Usuário que acessa essa ferramenta consegue visualizar todos os relatórios das empresas selecionadas, independente do que está definido em seu perfil de usuário.',
    dataDeteccao: data('25/06/26'), origemDeteccao: 'Cliente da UN JP', equipeResponsavel: 'Dev Pessoal',
    responsavel: 'Layanna Quaresma', ticketCorrecao: '748024690', statusCorrecao: 'Corrigida',
    dataPrevistaCorrecao: data('30/06/26'), dataCorrecao: data('30/06/26'),
  },
];

async function importar() {
  const col = db.collection('vulnerabilidades');
  let criadas = 0;
  let puladas = 0;

  for (const linha of LINHAS) {
    const existente = await col.where('codigo', '==', linha.codigo).limit(1).get();
    if (!existente.empty) {
      console.log(`[pula] ${linha.codigo} já existe (id ${existente.docs[0].id})`);
      puladas++;
      continue;
    }
    const agora = new Date().toISOString();
    await col.add(Object.assign({
      ticketReport: '', versao: '', cwe: '', cve: '', cvss: null, severidadeManual: '',
      descricao: '', dataDeteccao: '', origemDeteccao: '', exploitDisponivel: '',
      equipeResponsavel: '', responsavel: '', ticketCorrecao: '', statusCorrecao: 'Aberto',
      dataPrevistaCorrecao: '', dataCorrecao: '', evidenciaCorrecao: '', observacoes: '',
    }, linha, {
      criadoEm: agora, atualizadoEm: agora, criadoPor: 'import-script',
    }));
    console.log(`[ok] ${linha.codigo} importada`);
    criadas++;
  }

  console.log(`\nConcluído: ${criadas} importada(s), ${puladas} pulada(s) (já existiam).`);
}

importar().catch((err) => {
  console.error('Falha na importação:', err);
  process.exit(1);
});
