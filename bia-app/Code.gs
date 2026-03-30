// ============================================================
// GOOGLE APPS SCRIPT - REST API
// Retorna JSON para o frontend no Firebase Hosting
// ============================================================

const ABA_PERGUNTAS  = 'Perguntas';
const ABA_AREAS      = 'Áreas';
const ABA_PROCESSOS  = 'Processos';
const ABA_RESPOSTAS  = 'Respostas BIA';
const ABA_CONFIG     = 'Config Gestores';

const PERGUNTAS_DEFAULT = [
  ['Impacto na Operação e Missão', 'Em caso de interrupção do processo, qual o impacto no produto final?',    'O processo é essencial para a entrega do produto final?'],
  ['Impacto na Operação e Missão', 'Qual o nível de impacto nas outras áreas?',                               'Caso haja interrupção, haverá efeito cascata nas áreas.'],
  ['Impacto Financeiro',           'Poderá haver aplicação de multa?',                                        'Existem multas contratuais por indisponibilidade (SLAs)?'],
  ['Impacto Financeiro',           'Com a interrupção, há perda direta de receita?',                          'Interrupção de vendas ou faturamento?'],
  ['Impacto Jurídico e Regulatório','Oferece risco de impacto em relação a LGPD?',                            'A interrupção do processo viola leis da LGPD, normas trabalhistas, eSocial, etc.'],
  ['Impacto Jurídico e Regulatório','Oferece risco em relação a dados sensíveis?',                            'O processo lida com dados sensíveis?'],
  ['Impacto Reputacional',         'Qual o nível de impacto na percepção nos clientes?',                      'A falha no processo será percebida pelo mercado ou clientes?'],
  ['Impacto Reputacional',         'Qual o nível de impacto de Churn?',                                       'Isso causará perda de confiança ou rescisões de contrato?'],
];

// ============================================================
// API REST - doGet retorna JSON
// ============================================================
function doGet(e) {
  try {
    const ss = _getSS();
    if (!ss.getSheetByName(ABA_PERGUNTAS)) setupInicial();

    const action = e.parameter.action;
    const area = e.parameter.area;

    let result = {};
    switch(action) {
      case 'getUsuarioLogado':
        result = getUsuarioLogado();
        break;
      case 'getPerguntas':
        result = getPerguntas();
        break;
      case 'getAreas':
        result = getAreas();
        break;
      case 'getProcessos':
        result = getProcessos();
        break;
      case 'getProcessosPorArea':
        result = getProcessosPorArea(area);
        break;
      case 'getResumoRespostas':
        result = getResumoRespostas();
        break;
      default:
        result = { error: 'Action não especificada' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doGet ERROR: %s', err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message, stack: err.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// API REST - doPost recebe JSON ou form-urlencoded
// ============================================================
function doPost(e) {
  try {
    // Log completo do que chegou
    Logger.log('doPost chamado');
    Logger.log('e.parameter: ' + JSON.stringify(e.parameter));
    Logger.log('e.postData: ' + JSON.stringify(e.postData));
    
    let action, data;
    
    // Tentar pegar action do parameter (form-urlencoded)
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
      data = e.parameter;
      Logger.log('Action encontrada em e.parameter: ' + action);
    } 
    // Tentar pegar do postData.contents (JSON)
    else if (e.postData && e.postData.contents) {
      try {
        const parsed = JSON.parse(e.postData.contents);
        action = parsed.action;
        data = parsed;
        Logger.log('Action encontrada em postData: ' + action);
      } catch (parseErr) {
        Logger.log('Erro ao fazer parse do JSON: ' + parseErr.message);
      }
    }
    
    if (!action) {
      const debugInfo = {
        error: 'Action não especificada',
        hasParameter: !!e.parameter,
        parameterKeys: e.parameter ? Object.keys(e.parameter) : [],
        hasPostData: !!e.postData,
        postDataType: e.postData ? e.postData.type : null,
        postDataLength: e.postData && e.postData.contents ? e.postData.contents.length : 0
      };
      Logger.log('Debug info: ' + JSON.stringify(debugInfo));
      return ContentService
        .createTextOutput(JSON.stringify(debugInfo))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let result = {};
    switch(action) {
      case 'salvarPergunta':
        result = salvarPergunta(data);
        break;
      case 'excluirPergunta':
        result = excluirPergunta(data.id);
        break;
      case 'salvarArea':
        result = salvarArea(data);
        break;
      case 'excluirArea':
        result = excluirArea(data.id);
        break;
      case 'salvarProcesso':
        result = salvarProcesso(data);
        break;
      case 'excluirProcesso':
        result = excluirProcesso(data.id);
        break;
      case 'salvarRespostas':
        result = salvarRespostas(data.respostas);
        break;
      default:
        result = { error: 'Action não reconhecida: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost ERROR: %s', err.message);
    Logger.log('Stack: %s', err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message, stack: err.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// PERGUNTAS
// ============================================================
function getPerguntas() {
  try {
    const sheet = _getSS().getSheetByName(ABA_PERGUNTAS);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).filter(r => r[1]).map((r, i) => ({
      id: i + 2, categoria: r[0], pergunta: r[1], descricao: r[2], ativa: r[3] !== false
    }));
  } catch(err) { Logger.log('getPerguntas ERROR: %s', err.message); return []; }
}

function salvarPergunta(p) {
  const sheet = _getSS().getSheetByName(ABA_PERGUNTAS);
  if (p.id) {
    sheet.getRange(p.id, 1, 1, 4).setValues([[p.categoria, p.pergunta, p.descricao, p.ativa]]);
  } else {
    sheet.appendRow([p.categoria, p.pergunta, p.descricao, true]);
  }
  return { success: true };
}

function excluirPergunta(rowIndex) {
  _getSS().getSheetByName(ABA_PERGUNTAS).deleteRow(rowIndex);
  return { success: true };
}

// ============================================================
// ÁREAS
// ============================================================
function getAreas() {
  try {
    const sheet = _getSS().getSheetByName(ABA_AREAS);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).filter(r => r[0]).map((r, i) => ({
      id: i + 2, nome: r[0], responsavel: r[1], email: r[2], solucao: r[3]
    }));
  } catch(err) { Logger.log('getAreas ERROR: %s', err.message); return []; }
}

function salvarArea(a) {
  const sheet = _getSS().getSheetByName(ABA_AREAS);
  if (a.id) {
    sheet.getRange(a.id, 1, 1, 4).setValues([[a.nome, a.responsavel, a.email, a.solucao]]);
  } else {
    sheet.appendRow([a.nome, a.responsavel, a.email, a.solucao]);
  }
  return { success: true };
}

function excluirArea(rowIndex) {
  _getSS().getSheetByName(ABA_AREAS).deleteRow(rowIndex);
  return { success: true };
}

// ============================================================
// PROCESSOS
// ============================================================
function getProcessos() {
  try {
    const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).filter(r => r[0]).map((r, i) => ({
      id: i + 2, area: r[0], processo: r[1], responsavel: r[2], descricao: r[3], dependencia: r[4], rto: r[5], rpo: r[6], mtpd: r[7], biaHomologada: r[8]
    }));
  } catch(err) { Logger.log('getProcessos ERROR: %s', err.message); return []; }
}

function salvarProcesso(p) {
  const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
  if (p.id) {
    sheet.getRange(p.id, 1, 1, 9).setValues([[p.area, p.processo, p.responsavel, p.descricao, p.dependencia, p.rto, p.rpo, p.mtpd, p.biaHomologada]]);
  } else {
    sheet.appendRow([p.area, p.processo, p.responsavel, p.descricao, p.dependencia, p.rto, p.rpo, p.mtpd, p.biaHomologada]);
  }
  return { success: true };
}

function excluirProcesso(rowIndex) {
  _getSS().getSheetByName(ABA_PROCESSOS).deleteRow(rowIndex);
  return { success: true };
}

// ============================================================
// QUESTIONÁRIO
// ============================================================
function getUsuarioLogado() {
  const email = Session.getActiveUser().getEmail();
  const config = _getConfigGestores();
  const gestor = config.find(c => c.email.toLowerCase() === email.toLowerCase());
  return {
    email,
    nome:    gestor ? gestor.nome  : email.split('@')[0],
    area:    gestor ? gestor.area  : null,
    isAdmin: gestor ? gestor.admin : false
  };
}

function getProcessosPorArea(area) {
  const perguntas = getPerguntas().filter(p => p.ativa);
  const processos = getProcessos();
  const ss = _getSS();
  const sheetResp = ss.getSheetByName(ABA_RESPOSTAS);

  const ultimasResp = {};
  if (sheetResp) {
    const rows = sheetResp.getDataRange().getValues().slice(1);
    rows.forEach(r => {
      const key = r[2] + '||' + r[3];
      ultimasResp[key] = r;
    });
  }

  return processos
    .filter(p => !area || p.area === area)
    .map(p => {
      const key = p.area + '||' + p.processo;
      const resp = ultimasResp[key];
      const scoresAtuais = {};
      perguntas.forEach((perg, i) => {
        scoresAtuais[perg.pergunta] = resp ? (Number(resp[4 + i]) || null) : null;
      });
      return { linha: p.id, area: p.area, processo: p.processo, scoresAtuais };
    });
}

function salvarRespostas(respostas) {
  const ss = _getSS();
  const email = Session.getActiveUser().getEmail();
  const timestamp = new Date();
  const perguntas = getPerguntas().filter(p => p.ativa);

  let sheetResp = ss.getSheetByName(ABA_RESPOSTAS);
  if (!sheetResp) {
    sheetResp = ss.insertSheet(ABA_RESPOSTAS);
    sheetResp.appendRow(['Timestamp', 'Email', 'Área', 'Processo', ...perguntas.map(p => p.pergunta), 'Score', 'Tier']);
    sheetResp.setFrozenRows(1);
  }

  respostas.forEach(resp => {
    const valores = perguntas.map(p => resp.scores[p.pergunta] || 0);
    const score = valores.reduce((a, b) => a + b, 0);
    sheetResp.appendRow([timestamp, email, resp.area, resp.processo, ...valores, score, _calcularTier(score)]);
  });

  return { success: true, total: respostas.length };
}

function getResumoRespostas() {
  const sheet = _getSS().getSheetByName(ABA_RESPOSTAS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues().slice(1);
  const resumo = {};
  data.forEach(r => {
    const email = r[1], area = r[2], ts = r[0];
    if (!resumo[email]) resumo[email] = { email, area, totalProcessos: 0, ultimaResposta: ts };
    resumo[email].totalProcessos++;
    if (ts > resumo[email].ultimaResposta) resumo[email].ultimaResposta = ts;
  });
  return Object.values(resumo);
}

// ============================================================
// AUXILIARES
// ============================================================
function _getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function _calcularTier(score) {
  if (score >= 17) return 'Crítico';
  if (score >= 12) return 'Alto';
  if (score >= 7)  return 'Médio';
  return 'Baixo';
}

function _getConfigGestores() {
  const sheet = _getSS().getSheetByName(ABA_CONFIG);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1).map(r => ({
    email: String(r[0]).trim(), nome: String(r[1]).trim(),
    area:  String(r[2]).trim(), admin: String(r[3]).trim().toUpperCase() === 'SIM'
  }));
}

// ============================================================
// SETUP INICIAL
// ============================================================
function setupInicial() {
  const ss = _getSS();
  _criarAbaPerguntas(ss);
  _criarAbaAreas(ss);
  _criarAbaProcessos(ss);
  _criarAbaConfig(ss);
  _criarAbaRespostas(ss);
  const s = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (s && ss.getSheets().length > 1) {
    const d = s.getDataRange().getValues();
    if (d.length <= 1 && !String(d[0][0]).trim()) ss.deleteSheet(s);
  }
}

function _criarAbaPerguntas(ss) {
  if (ss.getSheetByName(ABA_PERGUNTAS)) return;
  const sheet = ss.insertSheet(ABA_PERGUNTAS);
  sheet.appendRow(['Categoria', 'Pergunta', 'Descrição', 'Ativa']);
  PERGUNTAS_DEFAULT.forEach(p => sheet.appendRow([...p, true]));
  sheet.getRange(1, 1, 1, 4).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidths(1, 4, 250);
  sheet.setFrozenRows(1);
}

function _criarAbaAreas(ss) {
  if (ss.getSheetByName(ABA_AREAS)) return;
  const sheet = ss.insertSheet(ABA_AREAS);
  sheet.appendRow(['Área', 'Responsável', 'Email', 'Solução']);
  [
    ['Segurança da Informação', 'Gabriel Fortes', 'gestor.si@empresa.com', 'Gestão Contábil'],
    ['TI / Infraestrutura',     'Paulo Teixeira', 'gestor.ti@empresa.com', 'Gestão Contábil'],
    ['Financeiro',              'Ana Paula', 'gestor.fin@empresa.com', 'Gestão Financeira'],
    ['RH',                      'Marília Paiva', 'gestor.rh@empresa.com', 'Gestão de Pessoal'],
  ].forEach(r => sheet.appendRow(r));
  sheet.getRange(1, 1, 1, 4).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidths(1, 4, 220);
  sheet.setFrozenRows(1);
}

function _criarAbaProcessos(ss) {
  if (ss.getSheetByName(ABA_PROCESSOS)) return;
  const sheet = ss.insertSheet(ABA_PROCESSOS);
  sheet.appendRow(['Área', 'Processo de Negócio', 'Responsável', 'Descrição do Impacto', 'Dependência Crítica', 'RTO', 'RPO', 'MTPD', 'BIA Homologada']);
  [
    ['Segurança da Informação', 'Gestão de Identidades e Acessos (IAM)', 'gestor.si@empresa.com', 'Interrupção total de trabalho', 'Servidores de Diretório', '< 1 hora', '< 30 minutos', 'Não', 'Não'],
    ['Segurança da Informação', 'Gestão de Vulnerabilidades (AppSec)', 'gestor.si@empresa.com', 'Falhas de segurança', 'Scanners de vulnerabilidade', '24 a 48 horas', '24 horas', 'Não', 'Não'],
    ['Segurança da Informação', 'Gestão de Backups e Recuperação de Desastres (DRP)', 'gestor.si@empresa.com', 'Perda de dados', 'Solução de Backup', '4 a 8 horas', 'Variável', 'Não', 'Em homologação'],
    ['Segurança da Informação', 'Monitoramento e Detecção de Incidentes (SOC/SIEM)', 'gestor.si@empresa.com', 'Detecção tardia de incidentes', 'SIEM', '2 a 4 horas', 'Próximo de zero', 'Não', 'Sim'],
    ['TI / Infraestrutura', 'Gestão de Servidores e Cloud', 'gestor.ti@empresa.com', 'Indisponibilidade de sistemas', 'Infraestrutura Cloud', '2 a 4 horas', '1 hora', 'Não', 'Não'],
    ['TI / Infraestrutura', 'Gestão de Rede e Conectividade', 'gestor.ti@empresa.com', 'Perda de conectividade', 'Links de Internet', '1 a 2 horas', 'Imediato', 'Não', 'Não'],
    ['Financeiro', 'Faturamento e Cobrança', 'gestor.fin@empresa.com', 'Perda de receita', 'Sistema ERP', '4 horas', '24 horas', 'Não', 'Não'],
    ['Financeiro', 'Contas a Pagar', 'gestor.fin@empresa.com', 'Atraso em pagamentos', 'Sistema Financeiro', '8 horas', '24 horas', 'Não', 'Não'],
    ['RH', 'Folha de Pagamento', 'gestor.rh@empresa.com', 'Atraso no pagamento de salários', 'Sistema de RH', '24 horas', '48 horas', 'Não', 'Não'],
    ['RH', 'Admissão e Demissão', 'gestor.rh@empresa.com', 'Atraso em processos de RH', 'Sistema de RH', '48 horas', '72 horas', 'Não', 'Não'],
  ].forEach(r => sheet.appendRow(r));
  sheet.getRange(1, 1, 1, 9).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidths(6, 3, 100);
  sheet.setColumnWidth(9, 120);
  sheet.setFrozenRows(1);
}

function _criarAbaConfig(ss) {
  if (ss.getSheetByName(ABA_CONFIG)) return;
  const sheet = ss.insertSheet(ABA_CONFIG);
  sheet.appendRow(['Email', 'Nome', 'Área', 'Admin']);
  [
    ['gestor.si@empresa.com',  'Gestor Seg. Info',  'Segurança da Informação', 'Não'],
    ['gestor.ti@empresa.com',  'Gestor TI',          'TI / Infraestrutura',    'Não'],
    ['gestor.fin@empresa.com', 'Gestor Financeiro',  'Financeiro',             'Não'],
    ['gestor.rh@empresa.com',  'Gestor RH',          'RH',                     'Não'],
    ['admin@empresa.com',      'Administrador',      '',                       'Sim'],
  ].forEach(r => sheet.appendRow(r));
  sheet.getRange(1, 1, 1, 4).setBackground('#b71c1c').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidths(1, 4, 200);
  sheet.setFrozenRows(1);
}

function _criarAbaRespostas(ss) {
  if (ss.getSheetByName(ABA_RESPOSTAS)) return;
  const sheet = ss.insertSheet(ABA_RESPOSTAS);
  const perguntas = PERGUNTAS_DEFAULT.map(p => p[1]);
  sheet.appendRow(['Timestamp', 'Email', 'Área', 'Processo', ...perguntas, 'Score', 'Tier']);
  sheet.getRange(1, 1, 1, 4 + perguntas.length + 2).setBackground('#2e7d32').setFontColor('white').setFontWeight('bold');
  sheet.setFrozenRows(1);
}
