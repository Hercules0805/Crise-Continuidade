// ============================================================
// GOOGLE APPS SCRIPT - REST API
// Retorna JSON para o frontend no Firebase Hosting
// ============================================================

const ABA_PERGUNTAS      = 'Perguntas';
const ABA_AREAS          = 'Áreas';
const ABA_PROCESSOS      = 'Processos';
const ABA_RESPOSTAS      = 'Respostas BIA';
const ABA_CONFIG         = 'Config Gestores';
const ABA_TOKENS         = 'Tokens';
const ABA_CONFIG_RESPOSTAS = 'Config Respostas';

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
      case 'validarToken':
        result = validarToken(e.parameter.token);
        break;
      case 'validarTokenArea':
        result = validarTokenArea(e.parameter.token);
        break;
      case 'getConfigRespostas':
        result = getConfigRespostas();
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
          const resp = [];
          for (let c = areaCol + 2; c < scoreCol; c++) {
            resp.push(Number(r[c]) || 0);
          }
          respostas[key] = resp;
        }
      });
    }

    return data.slice(1).filter(r => r[0]).map((r, i) => {
      const key = r[0] + '||' + r[1];
      return {
        id: i + 2, area: r[0], processo: r[1], descricao: r[2],
        dependencia: r[3], rto: r[4], rpo: r[5], mtpd: r[6], biaHomologada: r[7], tier: r[8] || '', bcpStatus: r[9] || '',
        score: scores[key] || 0,
        respostas: respostas[key] || []
      };
    });
  } catch(err) { Logger.log('getProcessos ERROR: %s', err.message); return []; }
}

function salvarProcesso(p) {
  const sheet = _getSS().getSheetByName(ABA_PROCESSOS);
  if (p.id) {
    sheet.getRange(p.id, 1, 1, 10).setValues([[p.area, p.processo, p.descricao, p.dependencia, p.rto, p.rpo, p.mtpd, p.biaHomologada, '', p.bcpStatus || '']]);
    return { success: true, id: Number(p.id) };
  } else {
    sheet.appendRow([p.area, p.processo, p.descricao, p.dependencia, p.rto, p.rpo, p.mtpd, p.biaHomologada, '', p.bcpStatus || '']);
    return { success: true, id: sheet.getLastRow() };
  }
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
    // Ordenar por timestamp decrescente para pegar a mais recente
    rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
    
    rows.forEach(r => {
      const key = r[2] + '||' + r[3];
      // Só armazena se ainda não tiver (primeira = mais recente)
      if (!ultimasResp[key]) {
        ultimasResp[key] = {
          timestamp: r[0],
          email: r[1],
          scores: {},
          scoreTotal: r[r.length - 2],
          tier: r[r.length - 1]
        };
        // Mapear respostas individuais
        perguntas.forEach((perg, i) => {
          ultimasResp[key].scores[perg.pergunta] = Number(r[4 + i]) || 0;
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
          email: resp.email,
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
    sheetResp.appendRow(['Timestamp', 'Email', 'Área', 'Processo', ...perguntas.map(p => p.pergunta), 'Score', 'Tier']);
    sheetResp.setFrozenRows(1);
  }

  const respostas = data.respostas || [data];
  
  respostas.forEach(resp => {
    const valores = perguntas.map(p => resp.scores[p.pergunta] || 0);
    const score = valores.reduce((a, b) => a + b, 0);
    const tier = _calcularTier(score);
    const rto = _calcularRTO(tier);
    sheetResp.appendRow([timestamp, email, resp.area, resp.processo, ...valores, score, tier]);
    
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
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">' + (p.rto || '-') + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">' + (p.biaHomologada || '-') + '</td>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">' + (p.bcpStatus || '-') + '</td>' +
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
      '<th style="padding:12px;text-align:left;color:white;font-size:12px;">RTO</th>' +
      '<th style="padding:12px;text-align:left;color:white;font-size:12px;">BIA STATUS</th>' +
      '<th style="padding:12px;text-align:left;color:white;font-size:12px;">BCP STATUS</th>' +
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
      ['_default', '3', 'Alto (3)', '#c62828', '#ffebee'],
      ['_default', '2', 'Médio (2)', '#f57c00', '#fff3e0'],
      ['_default', '1', 'Baixo (1)', '#2e7d32', '#e8f5e9'],
      ['_default', '0', 'N/A (0)', '#757575', '#f5f5f5'],
      ['Geral', '3', 'Acontece o tempo todo', '#c62828', '#ffebee'],
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
