// ============================================================
// GOOGLE APPS SCRIPT - REST API
// Retorna JSON para o frontend no Firebase Hosting
// ============================================================

const ABA_PERGUNTAS      = 'Perguntas';
const ABA_AREAS          = 'Áreas';
const ABA_PROCESSOS      = 'Processos';
const ABA_RESPOSTAS      = 'Respostas BIA';
const ABA_TOKENS         = 'Tokens';
const ABA_CONFIG_RESPOSTAS = 'Config Respostas';
const ABA_CONFIG_PERFIS  = 'Config Perfis';
const ABA_DEPENDENCIAS   = 'Dependências';
const ABA_COMPONENTES    = 'Componentes';
const NOTIFICACAO_EMAIL  = 'herculesoliveira@fortestecnologia.com.br';

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
      case 'validarToken':
        result = validarToken(e.parameter.token);
        break;
      case 'validarTokenArea':
        result = validarTokenArea(e.parameter.token);
        break;
      case 'getConfigRespostas':
        result = getConfigRespostas();
        break;
      case 'getPerfil':
        result = getPerfil(e.parameter.email);
        break;
      case 'getDependencias':
        result = getDependencias();
        break;
      case 'getComponentes':
        result = getComponentes();
        break;
      case 'validarTokenBIA':
        result = validarTokenBIA(e.parameter.token);
        break;
      case 'validarTokenDRP':
        result = validarTokenDRP(e.parameter.token);
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
        if (data.scores && typeof data.scores === 'string') data.scores = JSON.parse(data.scores);
        result = salvarRespostas(data);
        break;
      case 'salvarRespostasToken':
        if (data.scores && typeof data.scores === 'string') data.scores = JSON.parse(data.scores);
        result = salvarRespostasToken(data);
        break;
      case 'salvarRespostasArea':
        if (data.respostas && typeof data.respostas === 'string') data.respostas = JSON.parse(data.respostas);
        result = salvarRespostasArea(data);
        break;
      case 'gerarToken':
        result = gerarTokenAvaliacao(data);
        break;
      case 'gerarTokenArea':
        result = gerarTokenArea(data);
        break;
      case 'gerarRelatorioArea':
        result = gerarRelatorioArea(data);
        break;
      case 'salvarConfigResposta':
        result = salvarConfigResposta(data);
        break;
      case 'excluirConfigResposta':
        result = excluirConfigResposta(data);
        break;
      case 'salvarDependencia':
        result = salvarDependencia(data);
        break;
      case 'excluirDependencia':
        result = excluirDependencia(data.id);
        break;
      case 'salvarComponente':
        result = salvarComponente(data);
        break;
      case 'excluirComponente':
        result = excluirComponente(data.id);
        break;
      case 'gerarPCN':
        result = gerarPCN(data);
        break;
      case 'salvarPCN':
        result = salvarPCNProcesso(data);
        break;
      case 'excluirPCN':
        result = excluirPCNProcesso(data);
        break;
      case 'gerarTokenBIA':
        result = gerarTokenBIA(data);
        break;
      case 'salvarDependenciasBIA':
        result = salvarDependenciasBIA(data);
        break;
      case 'enviarLinkBIA':
        result = enviarLinkBIA(data);
        break;
      case 'gerarTokenDRP':
        result = gerarTokenDRP(data);
        break;
      case 'salvarComponentesDRP':
        result = salvarComponentesDRP(data);
        break;
      case 'listarModelos':
        result = listarModelosGemini();
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
    const ss = _getSS();
    const sheet = ss.getSheetByName(ABA_PROCESSOS);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();

    // Carregar scores e respostas mais recentes da aba de respostas
    const scores = {};
    const avaliados = {};
    const respostas = {};
    const sheetResp = ss.getSheetByName(ABA_RESPOSTAS);
    if (sheetResp) {
      const allRows = sheetResp.getDataRange().getValues();
      const headers = allRows[0];
      const areaCol = headers.indexOf('Área');
      const procCol = headers.indexOf('Processo');
      const scoreCol = headers.lastIndexOf('Score');
      const rows = allRows.slice(1);
      rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
      rows.forEach(r => {
        const key = r[areaCol] + '||' + r[procCol];
        if (!scores[key]) {
          scores[key] = Number(r[scoreCol]) || 0;
          avaliados[key] = true;
          // Mapear respostas por nome da pergunta
          const respMap = {};
          for (let c = areaCol + 2; c < scoreCol; c++) {
            if (headers[c]) respMap[headers[c]] = Number(r[c]) || 0;
          }
          respostas[key] = respMap;
        }
      });
    }

    return data.slice(1).filter(r => r[0]).map((r, i) => {
      const key = r[0] + '||' + r[1];
      return {
        id: i + 2, area: r[0], processo: r[1], descricao: r[2],
        dependencia: r[3], rto: r[4], rpo: r[5], mtpd: r[6], biaHomologada: r[7], tier: r[8] || '', bcpStatus: r[9] || '', descricaoFuncional: r[10] || '',
        impactoIndisponibilidade: r[11] ? JSON.parse(r[11]) : null,
        bcpObjetivo: r[12] || '', bcpEscopo: r[13] || '',
        bcpContatos: r[14] ? JSON.parse(r[14]) : [],
        bcpRiscos: r[15] ? JSON.parse(r[15]) : [],
        bcpPreventivas: r[16] ? JSON.parse(r[16]) : [],
        drpStatus: r[17] || '', drpObjetivo: r[18] || '', drpEscopo: r[19] || '', drpProcedimentos: r[20] || '', drpCriterios: r[21] || '',
        drpComponentes: r[22] ? JSON.parse(r[22]) : [],
        mtd: r[23] || '', workaround: r[24] || '',
        impactoJanela: r[25] ? (typeof r[25] === 'string' ? r[25] : JSON.stringify(r[25])) : '',
        bcpPlanoBProvedores: r[26] || '', bcpSlas: r[27] || '', bcpGatilhos: r[28] || '', bcpReconstituicao: r[29] || '',
        bcpPapeisCrise: r[30] || '',
        pcnSalvo: (() => {
          const raw = r[31] || '';
          if (!raw) return '';
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return raw;
            return raw;
          } catch(e) { return raw; }
        })(),
        tierManual: r[32] || '',
        score: scores[key] || 0,
        avaliado: avaliados[key] || false,
        respostas: respostas[key] || []
      };
    });
  } catch(err) { Logger.log('getProcessos ERROR: %s', err.message); return []; }
}

function salvarProcesso(p) {
  const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
  let impacto = '';
  if (p.impactoIndisponibilidade) {
    impacto = typeof p.impactoIndisponibilidade === 'string' ? p.impactoIndisponibilidade : JSON.stringify(p.impactoIndisponibilidade);
  }
  let bcpContatos = '';
  if (p.bcpContatos) {
    bcpContatos = typeof p.bcpContatos === 'string' ? p.bcpContatos : JSON.stringify(p.bcpContatos);
  }
  let bcpRiscos = '';
  if (p.bcpRiscos) {
    bcpRiscos = typeof p.bcpRiscos === 'string' ? p.bcpRiscos : JSON.stringify(p.bcpRiscos);
  }
  let bcpPreventivas = '';
  if (p.bcpPreventivas) {
    bcpPreventivas = typeof p.bcpPreventivas === 'string' ? p.bcpPreventivas : JSON.stringify(p.bcpPreventivas);
  }
  let drpComponentes = '';
  if (p.drpComponentes) {
    drpComponentes = typeof p.drpComponentes === 'string' ? p.drpComponentes : JSON.stringify(p.drpComponentes);
  }
  let impactoJanela = '';
  if (p.impactoJanela) {
    impactoJanela = typeof p.impactoJanela === 'string' ? p.impactoJanela : JSON.stringify(p.impactoJanela);
  }
  const row = [
    p.area, p.processo, p.descricao, p.dependencia, p.rto || '', p.rpo || '', p.mtpd || '', p.biaHomologada || '', '',
    p.bcpStatus || '', p.descricaoFuncional || '', impacto, p.bcpObjetivo || '', p.bcpEscopo || '', bcpContatos, bcpRiscos, bcpPreventivas,
    p.drpStatus || '', p.drpObjetivo || '', p.drpEscopo || '', p.drpProcedimentos || '', p.drpCriterios || '', drpComponentes,
    p.mtd || '', p.workaround || '', impactoJanela, p.bcpPlanoBProvedores || '', p.bcpSlas || '', p.bcpGatilhos || '', p.bcpReconstituicao || '', p.bcpPapeisCrise || '', p.pcnSalvo || '', p.tierManual || ''
  ];
  if (p.id) {
    sheet.getRange(p.id, 1, 1, 33).setValues([row]);
    return { success: true, id: Number(p.id) };
  } else {
    sheet.appendRow(row);
    return { success: true, id: sheet.getLastRow() };
  }
}

function excluirProcesso(rowIndex) {
  _getSS().getSheetByName(ABA_PROCESSOS).deleteRow(rowIndex);
  return { success: true };
}

function getProcessosPorArea(area) {
  const perguntas = getPerguntas().filter(p => p.ativa);
  const processos = getProcessos();
  const ss = _getSS();
  const sheetResp = ss.getSheetByName(ABA_RESPOSTAS);

  const ultimasResp = {};
  if (sheetResp) {
    const allRows = sheetResp.getDataRange().getValues();
    const headers = allRows[0];
    const areaCol = headers.indexOf('Área');
    const procCol = headers.indexOf('Processo');
    const rows = allRows.slice(1);
    rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
    
    rows.forEach(r => {
      const key = r[areaCol] + '||' + r[procCol];
      if (!ultimasResp[key]) {
        ultimasResp[key] = {
          timestamp: r[0],
          respondente: r[1],
          scores: {},
          scoreTotal: r[r.length - 2],
          tier: r[r.length - 1]
        };
        perguntas.forEach((perg, i) => {
          ultimasResp[key].scores[perg.pergunta] = Number(r[areaCol + 2 + i]) || 0;
        });
      }
    });
  }

  return processos
    .filter(p => !area || p.area === area)
    .map(p => {
      const key = p.area + '||' + p.processo;
      const resp = ultimasResp[key];
      
      return {
        linha: p.id,
        area: p.area,
        processo: p.processo,
        descricao: p.descricao,
        ultimaAvaliacao: resp ? {
          timestamp: resp.timestamp,
          respondente: resp.respondente,
          scores: resp.scores,
          scoreTotal: resp.scoreTotal,
          tier: resp.tier
        } : null
      };
    });
}

function salvarRespostas(data) {
  const ss = _getSS();
  const email = Session.getActiveUser().getEmail();
  const timestamp = new Date();
  const perguntas = getPerguntas().filter(p => p.ativa);

  let sheetResp = ss.getSheetByName(ABA_RESPOSTAS);
  if (!sheetResp) {
    sheetResp = ss.insertSheet(ABA_RESPOSTAS);
    sheetResp.appendRow(['Timestamp', 'Respondente', 'Cargo', 'Área', 'Processo', ...perguntas.map(p => p.pergunta), 'Score', 'Tier']);
    sheetResp.setFrozenRows(1);
  }

  const respostas = data.respostas || [data];
  
  respostas.forEach(resp => {
    const valores = perguntas.map(p => resp.scores[p.pergunta] || 0);
    const score = valores.reduce((a, b) => a + b, 0);
    const tier = _calcularTier(score);
    const rto = _calcularRTO(tier);
    sheetResp.appendRow([timestamp, email, '', resp.area, resp.processo, ...valores, score, tier]);
    _enviarNotificacaoAvaliacao(resp.area, resp.processo, email, score, tier);
    
    // Atualizar Tier e RTO na aba Processos
    const sheetProc = ss.getSheetByName(ABA_PROCESSOS);
    if (sheetProc) {
      const rows = sheetProc.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === String(resp.area).trim().toLowerCase() &&
            String(rows[i][1]).trim().toLowerCase() === String(resp.processo).trim().toLowerCase()) {
          sheetProc.getRange(i + 1, 5).setValue(rto);
          sheetProc.getRange(i + 1, 9).setValue(tier);
          break;
        }
      }
    }
  });

  return { success: true, total: respostas.length };
}

function salvarRespostasArea(data) {
  const ss = _getSS();
  const sheetTokens = ss.getSheetByName(ABA_TOKENS);
  if (!sheetTokens) return { error: 'Token inválido.' };
  const rows = sheetTokens.getDataRange().getValues();
  let tokenRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.token && rows[i][2] === '_AREA_') {
      if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
      tokenRow = i + 1;
      break;
    }
  }
  if (tokenRow === -1) return { error: 'Token inválido.' };

  const timestamp = new Date();
  const perguntas = getPerguntas().filter(p => p.ativa);
  let sheetResp = ss.getSheetByName(ABA_RESPOSTAS);
  if (!sheetResp) {
    sheetResp = ss.insertSheet(ABA_RESPOSTAS);
    sheetResp.appendRow(['Timestamp', 'Respondente', 'Cargo', 'Área', 'Processo', ...perguntas.map(p => p.pergunta), 'Score', 'Tier']);
    sheetResp.setFrozenRows(1);
  }

  data.respostas.forEach(resp => {
    const valores = perguntas.map(p => resp.scores[p.pergunta] || 0);
    const score = valores.reduce((a, b) => a + b, 0);
    const tier = _calcularTier(score);
    const rto = _calcularRTO(tier);
    sheetResp.appendRow([timestamp, data.nome || '', data.cargo || '', resp.area, resp.processo, ...valores, score, tier]);
    _enviarNotificacaoAvaliacao(resp.area, resp.processo, data.nome || '', score, tier);
    const sheetProc = ss.getSheetByName(ABA_PROCESSOS);
    if (sheetProc) {
      const procRows = sheetProc.getDataRange().getValues();
      for (let i = 1; i < procRows.length; i++) {
        if (String(procRows[i][0]).trim().toLowerCase() === String(resp.area).trim().toLowerCase() &&
            String(procRows[i][1]).trim().toLowerCase() === String(resp.processo).trim().toLowerCase()) {
          sheetProc.getRange(i + 1, 5).setValue(rto);
          sheetProc.getRange(i + 1, 9).setValue(tier);
          break;
        }
      }
    }
  });

  sheetTokens.getRange(tokenRow, 7).setValue(true);
  return { success: true, total: data.respostas.length };
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

function autorizarGmail() {
  GmailApp.getInboxThreads(0, 1);
  return 'Gmail autorizado!';
}

function autorizarDrive() {
  DriveApp.getRootFolder().getName();
  return 'Drive autorizado!';
}

// ============================================================
// RELATÓRIO DE ÁREA
// ============================================================
function gerarRelatorioArea(data) {
  try {
    const area = data.area;
    const email = data.email;
    if (!area || !email) return { error: 'Área e e-mail são obrigatórios.' };

    const processos = getProcessos().filter(p => p.area === area);
    if (processos.length === 0) return { error: 'Nenhum processo encontrado para esta área.' };

    const agora = new Date();
    const dataFormatada = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

    const avaliados = processos.filter(p => p.score > 0).length;
    const tier1 = processos.filter(p => p.score >= 12).length;
    const tier2 = processos.filter(p => p.score >= 6 && p.score < 12).length;
    const tier3 = processos.filter(p => p.score > 0 && p.score < 6).length;
    const pendentes = processos.length - avaliados;

    const corTier = (score) => score >= 12 ? '#c62828' : score >= 6 ? '#f57c00' : score > 0 ? '#1565c0' : '#999';
    const labelTier = (p) => p.tier || (p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Pendente');

    const linhasTabela = processos.map(p =>
      '<tr>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">' + p.processo + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:' + corTier(p.score) + ';font-size:14px;">' + (p.score > 0 ? p.score : '-') + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;"><span style="background:' + corTier(p.score) + ';color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + labelTier(p) + '</span></td>' +
      '</tr>'
    ).join('');

    const htmlBody =
      '<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">' +
      '<div style="background:#1a237e;padding:28px 32px;border-radius:8px 8px 0 0;">' +
      '<h1 style="color:white;margin:0;font-size:22px;">Relatório BIA</h1>' +
      '<p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">Área: ' + area + ' &middot; Gerado em ' + dataFormatada + '</p>' +
      '</div>' +
      '<div style="background:#f5f6fa;padding:24px 32px;">' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">' +
      '<tr>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #1a237e;"><div style="font-size:28px;font-weight:700;color:#1a237e;">' + processos.length + '</div><div style="font-size:12px;color:#666;">Total</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #2e7d32;"><div style="font-size:28px;font-weight:700;color:#2e7d32;">' + avaliados + '</div><div style="font-size:12px;color:#666;">Avaliados</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #c62828;"><div style="font-size:28px;font-weight:700;color:#c62828;">' + tier1 + '</div><div style="font-size:12px;color:#666;">Tier 1</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #f57c00;"><div style="font-size:28px;font-weight:700;color:#f57c00;">' + tier2 + '</div><div style="font-size:12px;color:#666;">Tier 2</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #1565c0;"><div style="font-size:28px;font-weight:700;color:#1565c0;">' + tier3 + '</div><div style="font-size:12px;color:#666;">Tier 3</div></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="background:white;border-radius:8px;padding:16px;text-align:center;border-top:4px solid #999;"><div style="font-size:28px;font-weight:700;color:#999;">' + pendentes + '</div><div style="font-size:12px;color:#666;">Pendentes</div></td>' +
      '</tr></table>' +
      '<div style="background:white;border-radius:8px;overflow:hidden;">' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="background:#1a237e;">' +
      '<th style="padding:12px;text-align:left;color:white;font-size:12px;">PROCESSO</th>' +
      '<th style="padding:12px;text-align:center;color:white;font-size:12px;">SCORE</th>' +
      '<th style="padding:12px;text-align:center;color:white;font-size:12px;">TIER</th>' +
      '</tr></thead>' +
      '<tbody>' + linhasTabela + '</tbody>' +
      '</table></div></div>' +
      '<div style="background:#e8eaf6;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center;">' +
      '<p style="color:#666;font-size:12px;margin:0;">Relatório gerado automaticamente pelo Sistema BIA &middot; Fortes Tecnologia</p>' +
      '</div></div>';

    GmailApp.sendEmail(email, 'BIA - Relatorio de Processos: ' + area, 'Relatorio em anexo.', { htmlBody: htmlBody });
    return { success: true };
  } catch(err) {
    Logger.log('gerarRelatorioArea ERROR: ' + err.message);
    return { error: err.message };
  }
}

// ============================================================
// TOKENS DE AVALIAÇÃO
// ============================================================
function gerarTokenArea(data) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_TOKENS);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_TOKENS);
    sheet.appendRow(['Token', 'Área', 'Processo', 'Email', 'Criado em', 'Expira em', 'Usado']);
    sheet.getRange(1,1,1,7).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const token = Utilities.getUuid();
  const agora = new Date();
  const expira = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
  // Gravar token com processo vazio para indicar que é de área inteira
  sheet.appendRow([token, data.area, '_AREA_', data.email, agora, expira, false]);

  const link = 'https://bia-forte-2025.web.app/avaliar-area.html?token=' + token;
  const assunto = 'BIA — Avaliação de Processos: ' + data.area;
  const corpo = `Olá, ${data.nomeResponsavel || ''},

Você foi convidado(a) para avaliar os processos de negócio da área abaixo no sistema BIA:

Área: ${data.area}

Clique no link abaixo para responder o questionário de todos os processos:
${link}

Este link é válido por 7 dias e pode ser usado apenas uma vez.

Atenciosamente,
Equipe SI - Fortes Tecnologia`;

  try {
    GmailApp.sendEmail(data.email, assunto, corpo);
  } catch(emailErr) {
    Logger.log('gerarTokenArea EMAIL ERROR: ' + emailErr.message);
    return { error: 'Token gerado, mas falha ao enviar e-mail: ' + emailErr.message };
  }
  return { success: true, token, link };
}

function validarTokenArea(token) {
  if (!token) return { error: 'Token não informado.' };
  const sheet = _getSS().getSheetByName(ABA_TOKENS);
  if (!sheet) return { error: 'Token inválido.' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token && rows[i][2] === '_AREA_') {
      if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
      if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
      const area = rows[i][1];
      const processos = getProcessos().filter(p => p.area === area);
      const perguntas = getPerguntas().filter(p => p.ativa);
      return { area, processos, perguntas };
    }
  }
  return { error: 'Link inválido ou expirado.' };
}

function gerarTokenAvaliacao(data) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_TOKENS);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_TOKENS);
    sheet.appendRow(['Token', 'Área', 'Processo', 'Email', 'Criado em', 'Expira em', 'Usado']);
    sheet.getRange(1,1,1,7).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const token = Utilities.getUuid();
  const agora = new Date();
  const expira = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
  sheet.appendRow([token, data.area, data.processo, data.email, agora, expira, false]);

  const link = 'https://bia-forte-2025.web.app/avaliar.html?token=' + token;
  const assunto = 'BIA — Avaliação de Processo: ' + data.processo;
  const corpo = `Olá,

Você foi convidado(a) para avaliar o processo de negócio abaixo no sistema BIA:

Área: ${data.area}
Processo: ${data.processo}

Clique no link abaixo para responder o questionário:
${link}

Este link é válido por 7 dias e pode ser usado apenas uma vez.

Atenciosamente,
Equipe SI - Fortes Tecnologia`;

  try {
    GmailApp.sendEmail(data.email, assunto, corpo);
  } catch(emailErr) {
    Logger.log('gerarTokenAvaliacao EMAIL ERROR: ' + emailErr.message);
    return { error: 'Token gerado, mas falha ao enviar e-mail: ' + emailErr.message };
  }
  return { success: true, token, link };
}

function salvarRespostasToken(data) {
  const ss = _getSS();
  // Validar token
  const sheetTokens = ss.getSheetByName(ABA_TOKENS);
  if (!sheetTokens) return { error: 'Token inválido.' };
  const rows = sheetTokens.getDataRange().getValues();
  let tokenRow = -1;
  let area = '', processo = '';
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.token) {
      if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
      if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
      tokenRow = i + 1;
      area = rows[i][1];
      processo = rows[i][2];
      break;
    }
  }
  if (tokenRow === -1) return { error: 'Token inválido.' };

  // Salvar resposta
  const timestamp = new Date();
  const perguntas = getPerguntas().filter(p => p.ativa);
  let sheetResp = ss.getSheetByName(ABA_RESPOSTAS);
  if (!sheetResp) {
    sheetResp = ss.insertSheet(ABA_RESPOSTAS);
    sheetResp.appendRow(['Timestamp', 'Respondente', 'Cargo', 'Área', 'Processo', ...perguntas.map(p => p.pergunta), 'Score', 'Tier']);
    sheetResp.setFrozenRows(1);
  }
  const valores = perguntas.map(p => data.scores[p.pergunta] || 0);
  const score = valores.reduce((a, b) => a + b, 0);
  const tier = _calcularTier(score);
  const rto = _calcularRTO(tier);
  sheetResp.appendRow([timestamp, data.nome || '', data.cargo || '', area, processo, ...valores, score, tier]);
  _enviarNotificacaoAvaliacao(area, processo, data.nome || data.token, score, tier);

  // Atualizar Tier e RTO na aba Processos
  const sheetProc = ss.getSheetByName(ABA_PROCESSOS);
  if (sheetProc) {
    const procRows = sheetProc.getDataRange().getValues();
    for (let i = 1; i < procRows.length; i++) {
      if (String(procRows[i][0]).trim().toLowerCase() === String(area).trim().toLowerCase() &&
          String(procRows[i][1]).trim().toLowerCase() === String(processo).trim().toLowerCase()) {
        sheetProc.getRange(i + 1, 5).setValue(rto);
        sheetProc.getRange(i + 1, 9).setValue(tier);
        break;
      }
    }
  }

  // Marcar token como usado
  sheetTokens.getRange(tokenRow, 7).setValue(true);
  return { success: true };
}

// ============================================================
// NOTIFICAÇÃO DE AVALIAÇÃO
// ============================================================
function _enviarNotificacaoAvaliacao(area, processo, respondente, score, tier) {
  try {
    const corTier = tier === 'Tier 1 (Crítico)' ? '#c62828' : tier === 'Tier 2 (Essencial)' ? '#f57c00' : '#1565c0';
    const htmlBody =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#1a237e;padding:24px 32px;border-radius:8px 8px 0 0;">' +
      '<h1 style="color:white;margin:0;font-size:18px;">BIA — Processo Avaliado</h1>' +
      '</div>' +
      '<div style="background:#f5f6fa;padding:24px 32px;border-radius:0 0 8px 8px;">' +
      '<table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">' +
      '<tr><td style="padding:12px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Respondente</td><td style="padding:12px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;">' + respondente + '</td></tr>' +
      '<tr><td style="padding:12px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Área</td><td style="padding:12px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;">' + area + '</td></tr>' +
      '<tr><td style="padding:12px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Processo</td><td style="padding:12px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;">' + processo + '</td></tr>' +
      '<tr><td style="padding:12px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Score</td><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1a237e;border-bottom:1px solid #f0f0f0;">' + score + '</td></tr>' +
      '<tr><td style="padding:12px 16px;font-size:13px;color:#666;">Tier</td><td style="padding:12px 16px;"><span style="background:' + corTier + ';color:white;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;">' + tier + '</span></td></tr>' +
      '</table>' +
      '<div style="text-align:center;margin:24px 0 8px;">' +
      '<a href="https://bia-forte-2025.web.app" style="background:#1a237e;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Ver no Sistema BIA</a>' +
      '</div>' +
      '<p style="color:#999;font-size:11px;text-align:center;margin-top:16px;">Notificação automática do Sistema BIA · Fortes Tecnologia</p>' +
      '</div></div>';
    GmailApp.sendEmail(NOTIFICACAO_EMAIL, 'BIA — Avaliação: ' + processo + ' (' + tier + ')', '', { htmlBody: htmlBody });
  } catch(err) {
    Logger.log('_enviarNotificacaoAvaliacao ERROR: ' + err.message);
  }
}

// ============================================================
// LEMBRETES DIÁRIOS
// ============================================================
function enviarLembretes() {
  const ss = _getSS();
  const areas = getAreas();
  const processos = getProcessos();
  const perguntas = getPerguntas().filter(p => p.ativa);
  const totalPerguntas = perguntas.length;
  const link = 'https://bia-forte-2025.web.app';

  areas.forEach(area => {
    if (!area.email) return;
    const procs = processos.filter(p => p.area === area.nome);
    const pendentes = procs.filter(p => {
      if (!p.avaliado) return true; // nunca avaliado
      // avaliacao parcial: nem todas as perguntas respondidas
      const respondidas = p.respostas ? Object.keys(p.respostas).length : 0;
      return respondidas < totalPerguntas;
    });
    if (pendentes.length === 0) return;

    const assunto = 'BIA — Lembrete: você tem processos com avaliação pendente';
    const corpo =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<div style="background:#1a237e;padding:24px 32px;border-radius:8px 8px 0 0;">' +
      '<h1 style="color:white;margin:0;font-size:20px;">BIA — Avaliação Pendente</h1>' +
      '</div>' +
      '<div style="background:#f5f6fa;padding:24px 32px;border-radius:0 0 8px 8px;">' +
      '<p style="color:#333;font-size:14px;">Olá, <strong>' + (area.responsavel || '') + '</strong>!</p>' +
      '<p style="color:#555;font-size:14px;line-height:1.6;">Você possui <strong>' + pendentes.length + ' processo(s)</strong> da área <strong>' + area.nome + '</strong> com avaliação BIA pendente ou incompleta.</p>' +
      '<p style="color:#555;font-size:14px;line-height:1.6;">Acesse o sistema para completar as avaliações:</p>' +
      '<div style="text-align:center;margin:28px 0;">' +
      '<a href="' + link + '" style="background:#1a237e;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Acessar o Sistema BIA</a>' +
      '</div>' +
      '<p style="color:#999;font-size:12px;text-align:center;">Este é um lembrete automático do Sistema BIA · Fortes Tecnologia</p>' +
      '</div></div>';

    try {
      GmailApp.sendEmail(area.email, assunto, '', { htmlBody: corpo });
      Logger.log('Lembrete enviado para: ' + area.email + ' (' + pendentes.length + ' pendentes)');
    } catch(err) {
      Logger.log('Erro ao enviar lembrete para ' + area.email + ': ' + err.message);
    }
  });
}

// ============================================================
// PERFIS DE ACESSO
// ============================================================
function getPerfil(email) {
  if (!email) return { perfil: 'gestor', area: null };
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_CONFIG_PERFIS);
  if (!sheet) sheet = _criarAbaConfigPerfis(ss);
  const rows = sheet.getDataRange().getValues().slice(1);
  const row = rows.find(r => String(r[0]).trim().toLowerCase() === email.trim().toLowerCase());
  const perfil = row ? String(row[1]).trim().toLowerCase() : 'gestor';

  // Se gestor, buscar a area vinculada ao email na aba Areas
  let area = null;
  if (perfil === 'gestor') {
    const sheetAreas = ss.getSheetByName(ABA_AREAS);
    if (sheetAreas) {
      const areas = sheetAreas.getDataRange().getValues().slice(1);
      const areaRow = areas.find(r => String(r[2]).trim().toLowerCase() === email.trim().toLowerCase());
      if (areaRow) area = String(areaRow[0]).trim();
    }
  }
  return { perfil, area };
}

function _criarAbaConfigPerfis(ss) {
  const sheet = ss.insertSheet(ABA_CONFIG_PERFIS);
  sheet.appendRow(['Email', 'Perfil']);
  sheet.getRange(1,1,1,2).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidths(1, 2, 250);
  sheet.setFrozenRows(1);
  // Adicionar nota de ajuda
  sheet.getRange(2,1).setValue('exemplo@fortestecnologia.com.br');
  sheet.getRange(2,2).setValue('admin');
  return sheet;
}

// ============================================================
// CONFIG RESPOSTAS POR CATEGORIA
// ============================================================
function getConfigRespostas() {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_CONFIG_RESPOSTAS);
  if (!sheet) {
    // Criar aba com defaults
    sheet = ss.insertSheet(ABA_CONFIG_RESPOSTAS);
    sheet.appendRow(['Categoria', 'Valor', 'Label', 'Cor', 'Background']);
    sheet.getRange(1,1,1,5).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
    const defaults = [
      ['_default', '4', 'Alto (4)', '#c62828', '#ffebee'],
      ['_default', '2', 'Médio (2)', '#f57c00', '#fff3e0'],
      ['_default', '1', 'Baixo (1)', '#2e7d32', '#e8f5e9'],
      ['_default', '0', 'N/A (0)', '#757575', '#f5f5f5'],
      ['Geral', '4', 'Acontece o tempo todo', '#c62828', '#ffebee'],
      ['Geral', '2', 'Acontece com alguma frequência', '#f57c00', '#fff3e0'],
      ['Geral', '1', 'Acontece raramente', '#2e7d32', '#e8f5e9'],
      ['Geral', '0', 'Nunca aconteceu', '#757575', '#f5f5f5'],
    ];
    defaults.forEach(r => sheet.appendRow(r));
    sheet.setColumnWidths(1, 5, 180);
  }
  const rows = sheet.getDataRange().getValues().slice(1);
  const config = {};
  rows.forEach(r => {
    const cat = r[0];
    if (!config[cat]) config[cat] = [];
    config[cat].push({ valor: String(r[1]), label: r[2], cor: r[3], background: r[4] });
  });
  return config;
}

function salvarConfigResposta(data) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_CONFIG_RESPOSTAS);
  if (!sheet) { getConfigRespostas(); sheet = ss.getSheetByName(ABA_CONFIG_RESPOSTAS); }
  if (data.rowIndex) {
    sheet.getRange(Number(data.rowIndex), 1, 1, 5).setValues([[data.categoria, data.valor, data.label, data.cor, data.background]]);
  } else {
    sheet.appendRow([data.categoria, data.valor, data.label, data.cor, data.background]);
  }
  return { success: true };
}

function excluirConfigResposta(data) {
  const ss = _getSS();
  const sheet = ss.getSheetByName(ABA_CONFIG_RESPOSTAS);
  if (!sheet) return { error: 'Aba não encontrada.' };
  sheet.deleteRow(Number(data.rowIndex));
  return { success: true };
}

// ============================================================
// AUXILIARES
// ============================================================
function _getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function _calcularTier(score) {
  if (score >= 12) return 'Tier 1 (Crítico)';
  if (score >= 6)  return 'Tier 2 (Essencial)';
  return 'Tier 3 (Suporte)';
}

function _calcularRTO(tier) {
  if (tier === 'Tier 1 (Crítico)')  return '< 4 horas';
  if (tier === 'Tier 2 (Essencial)') return '4h a 24 horas';
  return '> 24 horas';
}

// ============================================================
// SETUP INICIAL
// ============================================================
function setupInicial() {
  const ss = _getSS();
  _criarAbaPerguntas(ss);
  _criarAbaAreas(ss);
  _criarAbaProcessos(ss);
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
  sheet.appendRow(['Área', 'Processo de Negócio', 'Descrição do Impacto', 'Dependência Crítica', 'RTO', 'RPO', 'MTPD', 'BIA Homologada']);
  [
    ['Segurança da Informação', 'Gestão de Identidades e Acessos (IAM)', 'Interrupção total de trabalho', 'Servidores de Diretório', '< 1 hora', '< 30 minutos', 'Não', 'Não'],
    ['Segurança da Informação', 'Gestão de Vulnerabilidades (AppSec)', 'Falhas de segurança', 'Scanners de vulnerabilidade', '24 a 48 horas', '24 horas', 'Não', 'Não'],
    ['Segurança da Informação', 'Gestão de Backups e Recuperação de Desastres (DRP)', 'Perda de dados', 'Solução de Backup', '4 a 8 horas', 'Variável', 'Não', 'Em homologação'],
    ['Segurança da Informação', 'Monitoramento e Detecção de Incidentes (SOC/SIEM)', 'Detecção tardia de incidentes', 'SIEM', '2 a 4 horas', 'Próximo de zero', 'Não', 'Sim'],
    ['TI / Infraestrutura', 'Gestão de Servidores e Cloud', 'Indisponibilidade de sistemas', 'Infraestrutura Cloud', '2 a 4 horas', '1 hora', 'Não', 'Não'],
    ['TI / Infraestrutura', 'Gestão de Rede e Conectividade', 'Perda de conectividade', 'Links de Internet', '1 a 2 horas', 'Imediato', 'Não', 'Não'],
    ['Financeiro', 'Faturamento e Cobrança', 'Perda de receita', 'Sistema ERP', '4 horas', '24 horas', 'Não', 'Não'],
    ['Financeiro', 'Contas a Pagar', 'Atraso em pagamentos', 'Sistema Financeiro', '8 horas', '24 horas', 'Não', 'Não'],
    ['RH', 'Folha de Pagamento', 'Atraso no pagamento de salários', 'Sistema de RH', '24 horas', '48 horas', 'Não', 'Não'],
    ['RH', 'Admissão e Demissão', 'Atraso em processos de RH', 'Sistema de RH', '48 horas', '72 horas', 'Não', 'Não'],
  ].forEach(r => sheet.appendRow(r));
  sheet.getRange(1, 1, 1, 8).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 250);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidths(5, 3, 100);
  sheet.setColumnWidth(8, 120);
  sheet.setFrozenRows(1);
}

function _criarAbaRespostas(ss) {
  if (ss.getSheetByName(ABA_RESPOSTAS)) return;
  const sheet = ss.insertSheet(ABA_RESPOSTAS);
  const perguntas = PERGUNTAS_DEFAULT.map(p => p[1]);
  sheet.appendRow(['Timestamp', 'Respondente', 'Cargo', 'Área', 'Processo', ...perguntas, 'Score', 'Tier']);
  sheet.getRange(1, 1, 1, 5 + perguntas.length + 2).setBackground('#2e7d32').setFontColor('white').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// ============================================================
// DEPENDÊNCIAS (Catálogo)
// ============================================================
function getDependencias() {
  try {
    const sheet = _getSS().getSheetByName(ABA_DEPENDENCIAS);
    if (!sheet) return _criarAbaDependencias();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map((r, i) => ({
      id: i + 2,
      categoria: r[0],
      nome: r[1],
      detalhes: r[2] || '',
      setor: r[3] || '',
      empresa: r[4] || '',
      telefone: r[5] || '',
      email: r[6] || '',
      endereco: r[7] || ''
    }));
  } catch(err) { Logger.log('getDependencias ERROR: %s', err.message); return []; }
}

function salvarDependencia(d) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_DEPENDENCIAS);
  if (!sheet) { _criarAbaDependencias(); sheet = ss.getSheetByName(ABA_DEPENDENCIAS); }
  const row = [d.categoria, d.nome, d.detalhes || '', d.setor || '', d.empresa || '', d.telefone || '', d.email || '', d.endereco || ''];
  if (d.id) {
    sheet.getRange(Number(d.id), 1, 1, 8).setValues([row]);
    return { success: true, id: Number(d.id) };
  } else {
    sheet.appendRow(row);
    return { success: true, id: sheet.getLastRow() };
  }
}

function excluirDependencia(rowIndex) {
  _getSS().getSheetByName(ABA_DEPENDENCIAS).deleteRow(Number(rowIndex));
  return { success: true };
}

function _criarAbaDependencias() {
  const ss = _getSS();
  if (ss.getSheetByName(ABA_DEPENDENCIAS)) return getDependencias();
  const sheet = ss.insertSheet(ABA_DEPENDENCIAS);
  sheet.appendRow(['Categoria', 'Nome', 'Papel', 'Setor', 'Empresa', 'Telefone', 'Email', 'Endereço']);
  const dados = [
    ['Pessoas', 'Equipe de infraestrutura', '', '', '', '', '', ''],
    ['Sistemas', 'Sistemas de monitoramento', '', '', '', '', '', ''],
    ['Sistemas', 'Sistemas de gerenciamento de rede', '', '', '', '', '', ''],
    ['Infraestrutura', 'Energia elétrica (rede pública + UPS + gerador)', '', '', '', '', '', ''],
    ['Infraestrutura', 'Switches e roteadores', '', '', '', '', '', ''],
    ['Infraestrutura', 'Links de internet', '', '', '', '', '', ''],
    ['Infraestrutura', 'Sistemas de climatização', '', '', '', '', '', ''],
    ['Infraestrutura', 'Sistema de combate a incêndio', '', '', '', '', '', ''],
    ['Fornecedores', 'Provedor de energia', '', '', '', '', '', ''],
    ['Fornecedores', 'Operadoras de telecom', '', '', '', '', '', ''],
    ['Fornecedores', 'Manutenção de climatização', '', '', '', '', '', ''],
    ['Fornecedores', 'Manutenção de equipamentos críticos', '', '', '', '', '', ''],
  ];
  dados.forEach(r => sheet.appendRow(r));
  sheet.getRange(1, 1, 1, 8).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 180);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 200);
  sheet.setColumnWidth(8, 200);
  sheet.setFrozenRows(1);
  return dados.map((r, i) => ({ id: i + 2, categoria: r[0], nome: r[1], detalhes: '', setor: '', empresa: '', telefone: '', email: '', endereco: '' }));
}

// ============================================================
// COMPONENTES DE SERVIÇO (Catálogo)
// ============================================================
function getComponentes() {
  try {
    const sheet = _getSS().getSheetByName(ABA_COMPONENTES);
    if (!sheet) return _criarAbaComponentes();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).map((r, i) => ({
      id: i + 2,
      tipo: r[0],
      nome: r[1],
      descricao: r[2] || '',
      rto: r[3] || '',
      rpo: r[4] || '',
      estrategia: r[5] || '',
      responsavel: r[6] || ''
    }));
  } catch(err) { Logger.log('getComponentes ERROR: %s', err.message); return []; }
}

function salvarComponente(d) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_COMPONENTES);
  if (!sheet) { _criarAbaComponentes(); sheet = ss.getSheetByName(ABA_COMPONENTES); }
  const row = [d.tipo, d.nome, d.descricao || '', d.rto || '', d.rpo || '', d.estrategia || '', d.responsavel || ''];
  if (d.id) {
    sheet.getRange(Number(d.id), 1, 1, 7).setValues([row]);
    return { success: true, id: Number(d.id) };
  } else {
    sheet.appendRow(row);
    return { success: true, id: sheet.getLastRow() };
  }
}

function excluirComponente(rowIndex) {
  _getSS().getSheetByName(ABA_COMPONENTES).deleteRow(Number(rowIndex));
  return { success: true };
}

function _criarAbaComponentes() {
  const ss = _getSS();
  if (ss.getSheetByName(ABA_COMPONENTES)) return getComponentes();
  const sheet = ss.insertSheet(ABA_COMPONENTES);
  sheet.appendRow(['Tipo', 'Nome', 'Descrição', 'RTO', 'RPO', 'Estratégia de Backup', 'Responsável']);
  sheet.getRange(1, 1, 1, 7).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 200);
  sheet.setColumnWidth(7, 200);
  sheet.setFrozenRows(1);
  return [];
}


// ============================================================
// GERAÇÃO DE PCN VIA GEMINI AI
// ============================================================
function gerarPCN(data) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { error: 'API Key do Gemini não configurada. Configure em Propriedades do Script.' };
  
  const processoId = Number(data.id);
  if (!processoId) return { error: 'ID do processo não informado.' };
  
  // Buscar dados completos do processo
  const processos = getProcessos();
  const p = processos.find(proc => proc.id === processoId);
  if (!p) return { error: 'Processo não encontrado.' };
  
  // Buscar dependências e componentes
  const dependencias = getDependencias();
  const componentes = getComponentes();
  
  // Montar contexto das dependências do processo
  const depsNomes = (p.dependencia || '').split(',').map(s => s.trim()).filter(Boolean);
  const depsDetalhadas = depsNomes.map(nome => {
    const dep = dependencias.find(d => d.nome === nome);
    return dep ? { nome: dep.nome, categoria: dep.categoria, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes } : { nome };
  });
  
  // Montar contexto dos componentes do processo
  const compsIds = p.drpComponentes || [];
  const compsDetalhados = compsIds.map(id => {
    const comp = componentes.find(c => c.id === id);
    return comp || null;
  }).filter(Boolean);
  
  // Montar contexto dos contatos BCP
  const contatosIds = p.bcpContatos || [];
  const contatosDetalhados = contatosIds.map(id => {
    const dep = dependencias.find(d => d.id === id);
    return dep ? { nome: dep.nome, setor: dep.setor, empresa: dep.empresa, telefone: dep.telefone, email: dep.email, papel: dep.detalhes } : null;
  }).filter(Boolean);
  
  // Parsear dados adicionais
  let planoBData = {};
  try { planoBData = p.bcpPlanoBProvedores ? JSON.parse(p.bcpPlanoBProvedores) : {}; } catch(e) {}
  let slasData = {};
  try { slasData = p.bcpSlas ? JSON.parse(p.bcpSlas) : {}; } catch(e) {}
  let papeisCrise = {};
  try { papeisCrise = p.bcpPapeisCrise ? JSON.parse(p.bcpPapeisCrise) : {}; } catch(e) {}
  
  const tier = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Não avaliado';
  
  // Montar prompt
  const prompt = `Você é o "Fortes Resiliente", um arquiteto sênior de Continuidade de Negócios e Resiliência Organizacional, com profundo conhecimento das normas ISO 22301, ISO 27031 e NIST SP 800-34.

Com base nos dados coletados abaixo, gere um Plano de Continuidade de Negócios (PCN) COMPLETO, técnico e executável, seguindo EXATAMENTE a estrutura do template abaixo.

REGRA CRÍTICA: NÃO anonimize, mascare ou oculte NENHUM dado fornecido. Telefones, e-mails, nomes de pessoas, empresas e qualquer informação pessoal devem ser reproduzidos EXATAMENTE como fornecidos. Este é um documento interno corporativo e todos os dados são autorizados para uso. Nunca substitua dados reais por "[REDACTED]", "XXX", asteriscos ou qualquer forma de mascaramento.

Onde houver dados disponíveis, preencha com informações reais. Onde não houver dados suficientes, faça inferências técnicas inteligentes baseadas no contexto do processo e preencha com recomendações profissionais (nunca deixe campos com "[Inserir...]" — sempre preencha com conteúdo real ou recomendado).

---
## DADOS COLETADOS DO PROCESSO

**Processo:** ${p.processo}
**Área:** ${p.area}
**Descrição Funcional:** ${p.descricaoFuncional || 'Não informada'}
**Score de Criticidade:** ${p.score} (${tier})
**RTO Esperado:** ${p.rto || 'Não definido'}
**RPO Esperado:** ${p.rpo || 'Não definido'}
**MTD (Máximo Downtime Tolerável):** ${p.mtd || 'Não definido'}
**Descrição do Impacto:** ${p.descricao || 'Não informada'}

### Dependências Críticas
${depsDetalhadas.length ? depsDetalhadas.map(d => `- **${d.categoria || 'Outros'}:** ${d.nome}${d.empresa ? ' (' + d.empresa + ')' : ''}${d.papel ? ' — ' + d.papel : ''}`).join('\n') : 'Nenhuma dependência mapeada.'}

### Equipe de Crise (Contatos)
${contatosDetalhados.length ? contatosDetalhados.map(d => {
    const papel = papeisCrise[d.nome] || papeisCrise[String(contatosIds[contatosDetalhados.indexOf(d)])] || d.papel || '';
    return `- **${d.nome}** | Papel: ${papel || 'Não definido'} | Setor: ${d.setor || '-'} | Empresa: ${d.empresa || '-'} | Tel: ${d.telefone || '-'} | Email: ${d.email || '-'}`;
  }).join('\n') : 'Nenhum contato definido.'}

### Plano B de Provedores (Contingência)
${Object.keys(planoBData).length ? Object.entries(planoBData).map(([dep, cont]) => `- **${dep}:** ${cont}`).join('\n') : 'Não definido.'}

### SLAs de Fornecedores
${Object.keys(slasData).length ? Object.entries(slasData).map(([dep, sla]) => `- **${dep}:** ${sla}`).join('\n') : 'Não definido.'}

### Componentes de Serviço (DRP)
${compsDetalhados.length ? compsDetalhados.map(c => `- **${c.tipo}:** ${c.nome} | Estratégia: ${c.estrategia || 'Não definida'} | RTO: ${c.rto || '-'} | RPO: ${c.rpo || '-'} | Responsável: ${c.responsavel || '-'}`).join('\n') : 'Nenhum componente mapeado.'}

---
## TEMPLATE OBRIGATÓRIO DO PCN (siga esta estrutura exata)

# PROCESSO: [Nome do Processo]

## PARTE 1: ANÁLISE DE IMPACTO DE NEGÓCIOS (BIA)
1. Identificação do Processo (Nome, Área, Dono, Descrição Funcional)
2. Classificação de Criticidade (marcar o Tier correto com [x])
3. Matriz de Impacto da Indisponibilidade (tabela: Dimensão × Janelas 1h/4h/24h para Operacional, Reputacional, Financeiro, Legal)
4. Mapeamento de Dependências Críticas (tabela: Tipo × Recursos — Pessoas, Sistemas, Fornecedores, Infraestrutura)
5. Objetivos de Recuperação RTO e RPO (tabela: Recurso × RTO × RPO)

## PARTE 2: PLANO DE CONTINUIDADE DE NEGÓCIOS (BCP)
1. Escopo e Objetivo
2. Informações de Contato e Matriz de Responsabilidade (tabela: Nome, Papel na Crise, Setor, Telefone, E-mail)
3. Avaliação de Riscos (tabela: Evento, Probabilidade, Impacto, Estratégia de Mitigação)
4. Medidas Preventivas / Controles Existentes (tabela: Controle × Descrição)
5. Estratégia Operacional em Contingência (tabela: Atividade Afetada × Alternativa Operacional)
6. Estrutura de Governança da Crise (tabela: Papel × Responsabilidade)
7. Critérios de Ativação do BCP (lista de condições)
8. Fluxo Prioritário de Recuperação (tabela: Ordem × Recurso × RTO × RPO)
9. Plano de Comunicação da Crise (Interna, Externa, Canais, Frequência)
10. Cronograma de Testes, Exercícios e Manutenção (tabela: Atividade × Escopo × Frequência)

## PARTE 3: PLANO DE RECUPERAÇÃO DE DESASTRES (DRP)
1. Objetivo e Escopo Técnico
2. Estratégia Técnica de Recuperação (tabela: Atributo × Definição — Ambiente, Failover, Provisionamento)
3. Checklists de Verificação e Diagnóstico (Health Check — lista com checkboxes)
4. Fase Executiva de Recuperação / Runbook de Restore (8 passos sequenciais detalhados)
5. Critérios de Retorno à Normalidade e Reconstituição (lista com checkboxes)
6. Limitações Conhecidas da Estratégia

## PARTE 4: ANEXOS
- Modelo de Teste de Integração/API (tabela: Tipo de Teste × O que valida × Frequência)

---
## INSTRUÇÕES DE FORMATAÇÃO

- Gere o PCN em formato HTML bem estruturado e formatado para impressão.
- Use tabelas HTML com bordas para todas as matrizes.
- Use headings (h1, h2, h3) para as seções.
- Use listas (ul/ol) para itens sequenciais.
- Use checkboxes (☐ ou ☑) para checklists.
- NÃO inclua tags <html>, <head> ou <body> — retorne apenas o conteúdo interno.
- NÃO inclua texto introdutório, explicações ou comentários fora do HTML. Comece DIRETAMENTE com a primeira tag HTML (<h1> ou <div>).
- NÃO use code fences. Retorne HTML puro sem marcação markdown.
- Linguagem: Português do Brasil, técnica e direta.
- Preencha TODAS as seções com conteúdo real ou recomendações técnicas baseadas no contexto.

## REGRAS ESPECÍFICAS

- MATRIZ DE RESPONSABILIDADE: Nos campos "Papel na Crise" e "Setor", preencha com sugestões baseadas no contexto. Porém os campos "Nome", "Telefone" e "E-mail" devem ficar EM BRANCO (célula vazia) — NÃO invente nomes, telefones ou e-mails fictícios. Use apenas os dados reais fornecidos na seção "Equipe de Crise (Contatos)" acima.
- MATRIZ DE RISCOS: Na coluna "Probabilidade", use cores de fundo: Alta=#ffcdd2 (vermelho claro), Média=#fff3e0 (laranja claro), Baixa=#e8f5e9 (verde claro). Na coluna "Impacto", use as mesmas cores: Crítico=#ffcdd2, Alto=#fff3e0, Moderado=#e8f5e9, Baixo=#f5f5f5. Aplique style="background:COR" diretamente nas células <td>.`;

  // Chamar API do Gemini
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768
    }
  };
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const status = response.getResponseCode();
    const body = JSON.parse(response.getContentText());
    
    if (status !== 200) {
      Logger.log('Gemini API Error: ' + JSON.stringify(body));
      return { error: 'Erro na API do Gemini: ' + (body.error ? body.error.message : 'Status ' + status) };
    }
    
    const content = body.candidates && body.candidates[0] && body.candidates[0].content;
    if (!content || !content.parts || !content.parts[0]) {
      return { error: 'Resposta vazia do Gemini.' };
    }
    
    const pcnHtml = content.parts[0].text;
    return { success: true, pcn: pcnHtml, processo: p.processo, area: p.area, tier: tier, score: p.score };
  } catch(err) {
    Logger.log('gerarPCN ERROR: ' + err.message);
    return { error: 'Erro ao gerar PCN: ' + err.message };
  }
}


// ============================================================
// DIAGNÓSTICO - Listar modelos disponíveis
// ============================================================
function listarModelosGemini() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { error: 'API Key não configurada.' };
  
  try {
    const response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, { muteHttpExceptions: true });
    const body = JSON.parse(response.getContentText());
    if (body.error) return { error: body.error.message };
    const modelos = (body.models || []).filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')).map(m => m.name);
    return { modelos };
  } catch(err) {
    return { error: err.message };
  }
}


// ============================================================
// SALVAR PCN EDITADO (com versionamento)
// ============================================================
function salvarPCNProcesso(data) {
  try {
    let pcnHtml = data.pcnHtml || '';
    const area = data.area || '';
    const processo = data.processo || '';
    const idFallback = Number(data.id);
    
    if (!area && !processo && !idFallback) return { error: 'Dados do processo não informados.' };
    
    // Limitar tamanho do HTML
    if (pcnHtml.length > 45000) {
      pcnHtml = pcnHtml.substring(0, 45000) + '<!-- truncado -->';
    }
    
    const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
    if (!sheet) return { error: 'Aba de processos não encontrada.' };
    
    // Buscar processo pela chave área+nome (mais seguro que por ID de linha)
    let procRow = -1;
    if (area && processo) {
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === area && String(rows[i][1]).trim() === processo) {
          procRow = i + 1;
          break;
        }
      }
    }
    // Fallback para ID se não encontrou por chave
    if (procRow === -1 && idFallback) {
      procRow = idFallback;
    }
    if (procRow === -1) return { error: 'Processo não encontrado.' };
    
    // Ler versões existentes da coluna 32
    const celula = sheet.getRange(procRow, 32).getValue();
    let versoes = [];
    try {
      const parsed = celula ? JSON.parse(celula) : null;
      if (Array.isArray(parsed)) {
        versoes = parsed;
      } else if (parsed && parsed.html) {
        versoes = [parsed];
      } else if (typeof celula === 'string' && celula.trim().startsWith('<')) {
        versoes = [{ versao: 1, data: new Date().toISOString(), autor: Session.getActiveUser().getEmail() || 'sistema', html: celula }];
      }
    } catch(e) {
      if (celula && typeof celula === 'string' && celula.trim().length > 0) {
        versoes = [{ versao: 1, data: new Date().toISOString(), autor: 'sistema', html: celula }];
      }
    }
    
    // Adicionar nova versão
    const novaVersao = {
      versao: versoes.length + 1,
      data: new Date().toISOString(),
      autor: Session.getActiveUser().getEmail() || 'sistema',
      html: pcnHtml
    };
    versoes.push(novaVersao);
    
    // Manter no máximo 3 versões
    if (versoes.length > 3) versoes = versoes.slice(versoes.length - 3);
    
    // Verificar tamanho total
    const jsonStr = JSON.stringify(versoes);
    if (jsonStr.length > 50000) {
      versoes = [novaVersao];
    }
    
    sheet.getRange(procRow, 32).setValue(JSON.stringify(versoes));
    return { success: true, versao: novaVersao.versao, totalVersoes: versoes.length };
  } catch(err) {
    Logger.log('salvarPCNProcesso ERROR: ' + err.message);
    return { error: 'Erro ao salvar PCN: ' + err.message };
  }
}

// ============================================================
// EXCLUIR PCN
// ============================================================
function excluirPCNProcesso(data) {
  try {
    const area = data.area || '';
    const processo = data.processo || '';
    const idFallback = Number(data.id);
    
    const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
    if (!sheet) return { error: 'Aba de processos não encontrada.' };
    
    // Buscar processo pela chave área+nome
    let procRow = -1;
    if (area && processo) {
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === area && String(rows[i][1]).trim() === processo) {
          procRow = i + 1;
          break;
        }
      }
    }
    if (procRow === -1 && idFallback) procRow = idFallback;
    if (procRow === -1) return { error: 'Processo não encontrado.' };
    
    // Limpar coluna 32 (pcnSalvo)
    sheet.getRange(procRow, 32).setValue('');
    return { success: true };
  } catch(err) {
    Logger.log('excluirPCNProcesso ERROR: ' + err.message);
    return { error: 'Erro ao excluir PCN: ' + err.message };
  }
}

// ============================================================
// TOKEN BIA - Mapeamento de Dependências via e-mail
// ============================================================
function gerarTokenBIA(data) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_TOKENS);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_TOKENS);
    sheet.appendRow(['Token', 'Área', 'Processo', 'Email', 'Criado em', 'Expira em', 'Usado']);
    sheet.getRange(1,1,1,7).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const token = Utilities.getUuid();
  const agora = new Date();
  const expira = new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 dias
  sheet.appendRow([token, data.area, '_BIA_' + data.processo, data.email, agora, expira, false]);

  const link = 'https://bia-forte-2025.web.app/bia-dependencias.html?token=' + token;

  // Se email é _link_only_, apenas gerar o link sem enviar email
  if (data.email === '_link_only_') {
    return { success: true, token, link };
  }

  const assunto = 'BIA — Mapeamento de Dependências: ' + data.processo;
  const corpo = `Olá,

Precisamos da sua ajuda para mapear as dependências críticas do processo de negócio abaixo:

Área: ${data.area}
Processo: ${data.processo}

Clique no link abaixo para preencher o formulário (leva cerca de 5 minutos):
${link}

O formulário pergunta sobre:
• Fornecedores e parceiros essenciais
• Infraestrutura necessária (internet, energia, etc.)
• Pessoas-chave para o processo
• Sistemas e aplicações utilizados

Este link é válido por 14 dias e pode ser usado apenas uma vez.

Atenciosamente,
Equipe SI - Fortes Tecnologia`;

  try {
    GmailApp.sendEmail(data.email, assunto, corpo);
  } catch(emailErr) {
    Logger.log('gerarTokenBIA EMAIL ERROR: ' + emailErr.message);
    return { error: 'Token gerado, mas falha ao enviar e-mail: ' + emailErr.message };
  }
  return { success: true, token, link };
}

function validarTokenBIA(token) {
  if (!token) return { error: 'Token não informado.' };
  const sheet = _getSS().getSheetByName(ABA_TOKENS);
  if (!sheet) return { error: 'Token inválido.' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token && String(rows[i][2]).startsWith('_BIA_')) {
      if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
      if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
      const area = rows[i][1];
      const processo = String(rows[i][2]).replace('_BIA_', '');
      // Buscar dados atuais do processo
      const processos = getProcessos();
      const p = processos.find(proc => proc.area === area && proc.processo === processo);
      if (!p) return { error: 'Processo não encontrado.' };
      // Buscar catálogo completo de dependências
      const catalogo = getDependencias();
      const depCategorias = {};
      if (p.dependencia) {
        p.dependencia.split(',').map(s => s.trim()).filter(Boolean).forEach(nome => {
          const dep = catalogo.find(d => d.nome === nome);
          if (dep) depCategorias[nome] = dep.categoria;
        });
      }
      // Agrupar catálogo por categoria para o frontend
      const catalogoPorCategoria = {};
      catalogo.forEach(d => {
        const cat = (d.categoria || 'Outros').toLowerCase().replace(/[^a-záéíóúãõç]/g, '');
        const key = cat === 'fornecedor' ? 'fornecedores' : cat === 'pessoa' ? 'pessoas' : cat === 'sistema' ? 'sistemas' : cat;
        if (!catalogoPorCategoria[key]) catalogoPorCategoria[key] = [];
        catalogoPorCategoria[key].push(d.nome);
      });
      return { area, processo, dependencias: p.dependencia || '', depCategorias, catalogo: catalogoPorCategoria, descricao: p.descricao || '', rto: p.rto || '', rpo: p.rpo || '', mtd: p.mtd || '' };
    }
  }
  return { error: 'Link inválido ou expirado.' };
}

function salvarDependenciasBIA(data) {
  try {
    // Validar token
    const sheet = _getSS().getSheetByName(ABA_TOKENS);
    if (!sheet) return { error: 'Token inválido.' };
    const rows = sheet.getDataRange().getValues();
    let tokenRow = -1;
    let area = '', processo = '';
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.token && String(rows[i][2]).startsWith('_BIA_')) {
        if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
        if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
        tokenRow = i + 1;
        area = rows[i][1];
        processo = String(rows[i][2]).replace('_BIA_', '');
        break;
      }
    }
    if (tokenRow === -1) return { error: 'Token inválido.' };

    // Buscar processo na planilha
    const sheetProc = _getSS().getSheetByName(ABA_PROCESSOS);
    const procRows = sheetProc.getDataRange().getValues();
    let procRow = -1;
    for (let i = 1; i < procRows.length; i++) {
      if (String(procRows[i][0]).trim() === area && String(procRows[i][1]).trim() === processo) {
        procRow = i + 1;
        break;
      }
    }
    if (procRow === -1) return { error: 'Processo não encontrado na planilha.' };

    // Montar lista de dependências (unir todas as categorias)
    const fornecedores = data.fornecedores ? JSON.parse(data.fornecedores) : [];
    const infraestrutura = data.infraestrutura ? JSON.parse(data.infraestrutura) : [];
    const pessoas = data.pessoas ? JSON.parse(data.pessoas) : [];
    const sistemas = data.sistemas ? JSON.parse(data.sistemas) : [];
    const todasDeps = [...new Set([...fornecedores, ...infraestrutura, ...pessoas, ...sistemas])];

    // Salvar dependências no catálogo (se não existirem)
    const catalogoSheet = _getSS().getSheetByName(ABA_DEPENDENCIAS);
    const catalogoData = catalogoSheet ? catalogoSheet.getDataRange().getValues().slice(1) : [];
    const existentes = catalogoData.map(r => String(r[1]).toLowerCase());

    const novos = [];
    fornecedores.forEach(nome => { if (!existentes.includes(nome.toLowerCase())) novos.push(['Fornecedores', nome, '', '', '', '', '']); });
    infraestrutura.forEach(nome => { if (!existentes.includes(nome.toLowerCase())) novos.push(['Infraestrutura', nome, '', '', '', '', '']); });
    pessoas.forEach(nome => { if (!existentes.includes(nome.toLowerCase())) novos.push(['Pessoas', nome, '', '', '', '', '']); });
    sistemas.forEach(nome => { if (!existentes.includes(nome.toLowerCase())) novos.push(['Sistemas', nome, '', '', '', '', '']); });

    if (novos.length && catalogoSheet) {
      novos.forEach(row => catalogoSheet.appendRow(row));
    }

    // Atualizar processo: dependências (col 4), descrição do impacto (col 3), RTO (col 5), RPO (col 6), MTD (col 24)
    if (todasDeps.length) sheetProc.getRange(procRow, 4).setValue(todasDeps.join(', '));
    if (data.impacto) sheetProc.getRange(procRow, 3).setValue(data.impacto);
    if (data.rto) sheetProc.getRange(procRow, 5).setValue(data.rto);
    if (data.rpo) sheetProc.getRange(procRow, 6).setValue(data.rpo);
    if (data.mtd) sheetProc.getRange(procRow, 24).setValue(data.mtd);

    // Marcar token como usado
    sheet.getRange(tokenRow, 7).setValue(true);

    // Notificar admin
    try {
      GmailApp.sendEmail(NOTIFICACAO_EMAIL, 'BIA — Dependências mapeadas: ' + processo,
        'O dono do processo "' + processo + '" (Área: ' + area + ') preencheu o mapeamento de dependências.\n\n' +
        'Fornecedores: ' + fornecedores.join(', ') + '\n' +
        'Infraestrutura: ' + infraestrutura.join(', ') + '\n' +
        'Pessoas: ' + pessoas.join(', ') + '\n' +
        'Sistemas: ' + sistemas.join(', ') + '\n\n' +
        (data.observacoes ? 'Observações: ' + data.observacoes : '')
      );
    } catch(e) {}

    return { success: true };
  } catch(err) {
    Logger.log('salvarDependenciasBIA ERROR: ' + err.message);
    return { error: 'Erro ao salvar: ' + err.message };
  }
}


// ============================================================
// ENVIAR DEEP LINK BIA POR E-MAIL
// ============================================================
function enviarLinkBIA(data) {
  try {
    const email = data.email;
    const processo = data.processo;
    const area = data.area;
    const link = data.link;
    if (!email || !processo || !link) return { error: 'Dados incompletos.' };

    const assunto = 'BIA — Preencha as dependências do processo: ' + processo;
    const corpo = `Olá,

Precisamos da sua ajuda para mapear as dependências críticas do processo abaixo:

Área: ${area}
Processo: ${processo}

Clique no link abaixo para acessar o sistema e preencher as informações:
${link}

O que você precisa informar:
• Qual o impacto se o processo ficar parado
• Fornecedores e parceiros essenciais
• Infraestrutura necessária (internet, energia, etc.)
• Pessoas-chave para o processo
• Sistemas e aplicações utilizados

Dica: Pense "Se esse recurso falhar, meu processo para?" — se sim, ele é uma dependência crítica.

Leva cerca de 5 minutos. Obrigado!

Atenciosamente,
Equipe SI - Fortes Tecnologia`;

    GmailApp.sendEmail(email, assunto, corpo);
    return { success: true };
  } catch(err) {
    Logger.log('enviarLinkBIA ERROR: ' + err.message);
    return { error: 'Erro ao enviar e-mail: ' + err.message };
  }
}


// ============================================================
// TOKEN DRP - Mapeamento de Componentes via e-mail
// ============================================================
function gerarTokenDRP(data) {
  const ss = _getSS();
  let sheet = ss.getSheetByName(ABA_TOKENS);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_TOKENS);
    sheet.appendRow(['Token', 'Área', 'Processo', 'Email', 'Criado em', 'Expira em', 'Usado']);
    sheet.getRange(1,1,1,7).setBackground('#1a237e').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const token = Utilities.getUuid();
  const agora = new Date();
  const expira = new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000);
  sheet.appendRow([token, data.area, '_DRP_' + data.processo, data.email, agora, expira, false]);

  const link = 'https://bia-forte-2025.web.app/drp-componentes.html?token=' + token;

  // Se email é _link_only_, apenas gerar o link sem enviar email
  if (data.email === '_link_only_') {
    return { success: true, token, link };
  }

  const assunto = 'DRP — Mapeamento de Componentes: ' + data.processo;
  const corpo = `Olá,

Precisamos da sua ajuda para identificar os componentes técnicos que sustentam o processo abaixo:

Área: ${data.area}
Processo: ${data.processo}

Clique no link abaixo para preencher o formulário (leva cerca de 5 minutos):
${link}

O formulário pergunta sobre:
• Servidores e máquinas virtuais
• Bancos de dados
• Aplicações e APIs
• Infraestrutura de rede e storage
• Componentes de segurança

Dica: Pense "Se esse componente falhar, o processo é impactado?" — se sim, selecione-o.

Este link é válido por 14 dias e pode ser usado apenas uma vez.

Atenciosamente,
Equipe SI - Fortes Tecnologia`;

  try {
    GmailApp.sendEmail(data.email, assunto, corpo);
  } catch(emailErr) {
    Logger.log('gerarTokenDRP EMAIL ERROR: ' + emailErr.message);
    return { error: 'Token gerado, mas falha ao enviar e-mail: ' + emailErr.message };
  }
  return { success: true, token, link };
}

function validarTokenDRP(token) {
  if (!token) return { error: 'Token não informado.' };
  const sheet = _getSS().getSheetByName(ABA_TOKENS);
  if (!sheet) return { error: 'Token inválido.' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token && String(rows[i][2]).startsWith('_DRP_')) {
      if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
      if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
      const area = rows[i][1];
      const processo = String(rows[i][2]).replace('_DRP_', '');
      // Buscar dados do processo
      const processos = getProcessos();
      const p = processos.find(proc => proc.area === area && proc.processo === processo);
      if (!p) return { error: 'Processo não encontrado.' };
      // Buscar catálogo de componentes agrupado por tipo
      const componentes = getComponentes();
      const catalogoPorTipo = {};
      componentes.forEach(c => {
        const tipo = c.tipo || 'Outros';
        if (!catalogoPorTipo[tipo]) catalogoPorTipo[tipo] = [];
        catalogoPorTipo[tipo].push(c.nome);
      });
      // Componentes já selecionados
      const compIds = p.drpComponentes || [];
      const componentesSelecionados = compIds.map(id => {
        const comp = componentes.find(c => c.id === id);
        return comp ? comp.nome : null;
      }).filter(Boolean);
      const compTipos = {};
      compIds.forEach(id => {
        const comp = componentes.find(c => c.id === id);
        if (comp) compTipos[comp.nome] = comp.tipo;
      });
      return { area, processo, catalogo: catalogoPorTipo, componentesSelecionados, compTipos };
    }
  }
  return { error: 'Link inválido ou expirado.' };
}

function salvarComponentesDRP(data) {
  try {
    const sheet = _getSS().getSheetByName(ABA_TOKENS);
    if (!sheet) return { error: 'Token inválido.' };
    const rows = sheet.getDataRange().getValues();
    let tokenRow = -1;
    let area = '', processo = '';
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.token && String(rows[i][2]).startsWith('_DRP_')) {
        if (rows[i][6] === true) return { error: 'Este link já foi utilizado.' };
        if (new Date() > new Date(rows[i][5])) return { error: 'Este link expirou.' };
        tokenRow = i + 1;
        area = rows[i][1];
        processo = String(rows[i][2]).replace('_DRP_', '');
        break;
      }
    }
    if (tokenRow === -1) return { error: 'Token inválido.' };

    // Parsear componentes enviados (formato: { "tipo": ["nome1", "nome2"], ... })
    const compsPorTipo = data.componentes ? JSON.parse(data.componentes) : {};
    
    // Buscar catálogo de componentes existente
    const catalogoSheet = _getSS().getSheetByName(ABA_COMPONENTES);
    const componentes = getComponentes();
    
    // Para cada componente enviado, verificar se existe no catálogo ou criar
    const idsFinais = [];
    Object.entries(compsPorTipo).forEach(([tipo, nomes]) => {
      nomes.forEach(nome => {
        let comp = componentes.find(c => c.nome.toLowerCase() === nome.toLowerCase() && c.tipo === tipo);
        if (!comp) {
          // Criar no catálogo
          if (catalogoSheet) {
            catalogoSheet.appendRow([tipo, nome, '', '', '', '', '']);
            const novoId = catalogoSheet.getLastRow();
            comp = { id: novoId, tipo, nome };
            componentes.push(comp);
          }
        }
        if (comp && !idsFinais.includes(comp.id)) {
          idsFinais.push(comp.id);
        }
      });
    });

    // Atualizar processo com os IDs dos componentes (coluna 23)
    const sheetProc = _getSS().getSheetByName(ABA_PROCESSOS);
    const procRows = sheetProc.getDataRange().getValues();
    for (let i = 1; i < procRows.length; i++) {
      if (String(procRows[i][0]).trim() === area && String(procRows[i][1]).trim() === processo) {
        sheetProc.getRange(i + 1, 23).setValue(JSON.stringify(idsFinais));
        break;
      }
    }

    // Marcar token como usado
    sheet.getRange(tokenRow, 7).setValue(true);

    // Notificar admin
    try {
      const allNomes = Object.entries(compsPorTipo).map(([t, ns]) => t + ': ' + ns.join(', ')).join('\n');
      GmailApp.sendEmail(NOTIFICACAO_EMAIL, 'DRP — Componentes mapeados: ' + processo,
        'O dono do processo "' + processo + '" (Área: ' + area + ') preencheu o mapeamento de componentes.\n\n' + allNomes +
        (data.observacoes ? '\n\nObservações: ' + data.observacoes : '')
      );
    } catch(e) {}

    return { success: true, totalComponentes: idsFinais.length };
  } catch(err) {
    Logger.log('salvarComponentesDRP ERROR: ' + err.message);
    return { error: 'Erro ao salvar: ' + err.message };
  }
}
