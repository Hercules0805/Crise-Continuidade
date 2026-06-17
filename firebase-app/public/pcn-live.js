// ============================================================
// PCN LIVE - Edição dinâmica de seções com dados do backend
// ============================================================
var PCN_LIVE_DATA = null;

async function initPCNLive() {
  try {
    var url = new URL(PCN_API_URL);
    url.searchParams.append('action', 'getProcessos');
    var res = await fetch(url, { redirect: 'follow' });
    var text = await res.text();
    if (text.startsWith('<')) return;
    var processos = JSON.parse(text);
    var p = processos.find(function(proc) { return proc.area === PCN_AREA && proc.processo === PCN_PROCESSO; });
    if (!p) return;

    var url2 = new URL(PCN_API_URL);
    url2.searchParams.append('action', 'getDependencias');
    var res2 = await fetch(url2, { redirect: 'follow' });
    var deps = JSON.parse(await res2.text());

    var url3 = new URL(PCN_API_URL);
    url3.searchParams.append('action', 'getComponentes');
    var res3 = await fetch(url3, { redirect: 'follow' });
    var comps = JSON.parse(await res3.text());

    PCN_LIVE_DATA = { processo: p, dependencias: deps, componentes: comps };
    injectEditButtons();
  } catch(e) { console.warn('PCN Live init error:', e); }
}

function injectEditButtons() {
  var content = document.getElementById('pcn-editavel');
  if (!content) return;
  var headings = content.querySelectorAll('h1, h2, h3');
  headings.forEach(function(h) {
    var text = h.textContent.toLowerCase();
    var sectionType = null;
    if (text.includes('contato') || text.includes('responsabilidade') || text.includes('equipe de crise')) sectionType = 'contatos';
    else if (text.includes('dependência') || text.includes('mapeamento de depend')) sectionType = 'dependencias';
    else if (text.includes('fornecedor') || text.includes('plano b') || text.includes('contingência')) sectionType = 'fornecedores';
    else if (text.includes('componente') || text.includes('estratégia técnica') || text.includes('recuperação de desastre')) sectionType = 'componentes';

    if (sectionType && !h.querySelector('.pcn-live-btn')) {
      var btn = document.createElement('button');
      btn.innerHTML = '✏️ Editar';
      btn.style.cssText = 'margin-left:12px;padding:4px 12px;font-size:8.5pt;background:#e8eaf6;color:#1a237e;border:1.5px solid #1a237e;border-radius:5px;cursor:pointer;font-weight:600;vertical-align:middle;';
      btn.className = 'pcn-live-btn no-print';
      btn.setAttribute('contenteditable', 'false');
      btn.onclick = function(e) { e.preventDefault(); e.stopPropagation(); openLiveEditor(sectionType, h); };
      h.appendChild(btn);
    }
  });
}

function openLiveEditor(type, heading) {
  var existing = document.getElementById('pcn-live-editor');
  if (existing) existing.remove();

  var data = PCN_LIVE_DATA;
  if (!data) return alert('Dados não carregados. Recarregue a página.');

  var panel = document.createElement('div');
  panel.id = 'pcn-live-editor';
  panel.style.cssText = 'position:fixed;top:0;right:0;width:500px;height:100vh;background:white;box-shadow:-4px 0 20px rgba(0,0,0,0.2);z-index:1000;overflow-y:auto;padding:24px;font-family:Segoe UI,Arial,sans-serif;';

  var titleMap = { contatos: 'Equipe de Crise', dependencias: 'Dependências Críticas', fornecedores: 'Fornecedores / Plano B', componentes: 'Componentes do Serviço' };
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:2px solid #e8eaf6;padding-bottom:12px;"><h3 style="color:#1a237e;margin:0;">✏️ ' + (titleMap[type] || 'Editar') + '</h3><button onclick="closeLiveEditor()" style="background:none;border:none;font-size:1.5em;cursor:pointer;color:#666;">×</button></div>';

  if (type === 'contatos') html += buildContatosEditor(data);
  else if (type === 'dependencias') html += buildDependenciasEditor(data);
  else if (type === 'fornecedores') html += buildFornecedoresEditor(data);
  else if (type === 'componentes') html += buildComponentesEditor(data);

  html += '<div style="margin-top:20px;text-align:right;border-top:1px solid #eee;padding-top:16px;"><button onclick="applyLiveEdit(\'' + type + '\')" style="padding:10px 24px;background:#2e7d32;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">✅ Aplicar ao PCN</button></div>';

  panel.innerHTML = html;
  document.body.appendChild(panel);
}

function closeLiveEditor() {
  var el = document.getElementById('pcn-live-editor');
  if (el) el.remove();
}

function buildContatosEditor(data) {
  var contatos = (data.processo.bcpContatos || []).map(function(id) {
    return data.dependencias.find(function(d) { return d.id === id; });
  }).filter(Boolean);
  var papeis = {};
  try { papeis = data.processo.bcpPapeisCrise ? JSON.parse(data.processo.bcpPapeisCrise) : {}; } catch(e) {}

  var html = '<p style="font-size:0.85em;color:#666;margin-bottom:12px;">Edite os contatos da equipe de crise. Alterações são salvas diretamente no processo.</p>';
  html += '<div id="live-contatos-list">';
  contatos.forEach(function(d) {
    var papel = papeis[d.nome] || papeis[String(d.id)] || d.detalhes || '';
    html += '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;position:relative;" data-id="' + d.id + '">';
    html += '<button onclick="removeLiveContato(' + d.id + ')" style="position:absolute;top:8px;right:8px;background:none;border:none;color:#c62828;cursor:pointer;font-size:1.2em;" title="Remover">×</button>';
    html += '<div style="font-weight:700;color:#1a237e;margin-bottom:8px;">' + d.nome + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">';
    html += '<div><label style="font-size:0.7em;color:#888;display:block;">Papel na Crise</label><input type="text" class="live-papel" data-id="' + d.id + '" data-nome="' + (d.nome || '').replace(/"/g, '&quot;') + '" value="' + (papel || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.88em;"></div>';
    html += '<div><label style="font-size:0.7em;color:#888;display:block;">Setor</label><input type="text" class="live-setor" data-id="' + d.id + '" value="' + (d.setor || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.88em;"></div>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    html += '<div><label style="font-size:0.7em;color:#888;display:block;">Telefone</label><input type="text" class="live-telefone" data-id="' + d.id + '" value="' + (d.telefone || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.88em;"></div>';
    html += '<div><label style="font-size:0.7em;color:#888;display:block;">E-mail</label><input type="text" class="live-email" data-id="' + d.id + '" value="' + (d.email || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.88em;"></div>';
    html += '</div></div>';
  });
  html += '</div>';
  html += '<div style="margin-top:12px;border-top:1px solid #eee;padding-top:12px;"><label style="font-size:0.78em;font-weight:600;color:#444;">Adicionar contato:</label>';
  html += '<select id="live-add-contato" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:0.88em;margin-top:4px;"><option value="">Selecione...</option>';
  var ids = data.processo.bcpContatos || [];
  data.dependencias.filter(function(d) { return !ids.includes(d.id); }).sort(function(a, b) { return a.nome.localeCompare(b.nome); }).forEach(function(d) {
    html += '<option value="' + d.id + '">' + d.nome + ' (' + d.categoria + ')' + '</option>';
  });
  html += '</select><button onclick="addLiveContato()" style="margin-top:6px;padding:6px 14px;background:#1a237e;color:white;border:none;border-radius:4px;font-size:0.82em;cursor:pointer;">+ Adicionar</button></div>';
  return html;
}

function buildDependenciasEditor(data) {
  var deps = (data.processo.dependencia || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var html = '<p style="font-size:0.85em;color:#666;margin-bottom:12px;">Dependências críticas do processo:</p><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';
  deps.forEach(function(nome) {
    var dep = data.dependencias.find(function(d) { return d.nome === nome; });
    var cat = dep ? dep.categoria : 'Outros';
    html += '<span style="background:#e8eaf6;color:#1a237e;padding:4px 10px;border-radius:12px;font-size:0.82em;font-weight:500;">' + cat + ': ' + nome + '</span>';
  });
  html += '</div><p style="font-size:0.78em;color:#999;">Para editar, use a aba BIA do processo no sistema.</p>';
  return html;
}

function buildFornecedoresEditor(data) {
  var planoBData = {}; try { planoBData = data.processo.bcpPlanoBProvedores ? JSON.parse(data.processo.bcpPlanoBProvedores) : {}; } catch(e) {}
  var slasData = {}; try { slasData = data.processo.bcpSlas ? JSON.parse(data.processo.bcpSlas) : {}; } catch(e) {}
  var html = '<p style="font-size:0.85em;color:#666;margin-bottom:12px;">Fornecedores e contingência:</p>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:0.85em;"><thead><tr style="background:#f5f6fa;"><th style="padding:8px;text-align:left;">Fornecedor</th><th style="padding:8px;text-align:left;">Plano B</th><th style="padding:8px;text-align:left;">SLA</th></tr></thead><tbody>';
  Object.keys(planoBData).forEach(function(dep) { html += '<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;font-weight:600;">' + dep + '</td><td style="padding:8px;">' + (planoBData[dep] || '-') + '</td><td style="padding:8px;">' + (slasData[dep] || '-') + '</td></tr>'; });
  html += '</tbody></table><p style="font-size:0.78em;color:#999;margin-top:8px;">Para editar, use a aba BCP do processo.</p>';
  return html;
}

function buildComponentesEditor(data) {
  var compIds = data.processo.drpComponentes || [];
  var comps = compIds.map(function(id) { return data.componentes.find(function(c) { return c.id === id; }); }).filter(Boolean);
  var html = '<p style="font-size:0.85em;color:#666;margin-bottom:12px;">Componentes do serviço:</p>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:0.85em;"><thead><tr style="background:#f5f6fa;"><th style="padding:8px;text-align:left;">Tipo</th><th style="padding:8px;text-align:left;">Nome</th><th style="padding:8px;text-align:left;">Estratégia</th></tr></thead><tbody>';
  comps.forEach(function(c) { html += '<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;">' + (c.tipo || '-') + '</td><td style="padding:8px;font-weight:600;">' + c.nome + '</td><td style="padding:8px;">' + (c.estrategia || '-') + '</td></tr>'; });
  html += '</tbody></table><p style="font-size:0.78em;color:#999;margin-top:8px;">Para editar, use a aba DRP do processo.</p>';
  return html;
}

async function removeLiveContato(id) {
  if (!PCN_LIVE_DATA) return;
  PCN_LIVE_DATA.processo.bcpContatos = (PCN_LIVE_DATA.processo.bcpContatos || []).filter(function(x) { return x !== id; });
  await saveLiveContatos();
  openLiveEditor('contatos', null);
}

function addLiveContato() {
  var sel = document.getElementById('live-add-contato');
  var id = Number(sel.value);
  if (!id || !PCN_LIVE_DATA) return;
  if (!PCN_LIVE_DATA.processo.bcpContatos) PCN_LIVE_DATA.processo.bcpContatos = [];
  if (!PCN_LIVE_DATA.processo.bcpContatos.includes(id)) {
    PCN_LIVE_DATA.processo.bcpContatos.push(id);
    saveLiveContatos().then(function() { openLiveEditor('contatos', null); });
  }
}

async function saveLiveContatos() {
  var papeis = {};
  document.querySelectorAll('.live-papel').forEach(function(input) {
    var nome = input.dataset.nome;
    if (nome && input.value.trim()) papeis[nome] = input.value.trim();
  });
  var payload = {
    action: 'salvarProcesso',
    id: String(PCN_LIVE_DATA.processo.id),
    area: PCN_LIVE_DATA.processo.area,
    processo: PCN_LIVE_DATA.processo.processo,
    bcpContatos: JSON.stringify(PCN_LIVE_DATA.processo.bcpContatos),
    bcpPapeisCrise: JSON.stringify(papeis)
  };
  try {
    var res = await fetch(PCN_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload), redirect: 'follow' });
    var text = await res.text();
    var data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    PCN_LIVE_DATA.processo.bcpPapeisCrise = JSON.stringify(papeis);
  } catch(e) { alert('Erro ao salvar: ' + e.message); }
}

function applyLiveEdit(type) {
  var data = PCN_LIVE_DATA;
  if (!data) return;
  if (type === 'contatos') saveLiveContatos();

  var content = document.getElementById('pcn-editavel');
  var headings = content.querySelectorAll('h1, h2, h3');
  var targetHeading = null;
  headings.forEach(function(h) {
    var t = h.textContent.toLowerCase().replace('✏️ editar', '').trim();
    if (type === 'contatos' && (t.includes('contato') || t.includes('responsabilidade'))) targetHeading = h;
    if (type === 'dependencias' && t.includes('dependência')) targetHeading = h;
    if (type === 'fornecedores' && (t.includes('fornecedor') || t.includes('plano b'))) targetHeading = h;
    if (type === 'componentes' && (t.includes('componente') || t.includes('estratégia técnica'))) targetHeading = h;
  });
  if (!targetHeading) return alert('Seção não encontrada no PCN.');

  var next = targetHeading.nextElementSibling;
  while (next && next.tagName !== 'TABLE' && next.tagName !== 'H2' && next.tagName !== 'H3' && next.tagName !== 'H1') next = next.nextElementSibling;
  if (!next || next.tagName !== 'TABLE') return alert('Tabela não encontrada.');

  var newTable = '';
  if (type === 'contatos') {
    var contatos = (data.processo.bcpContatos || []).map(function(id) { return data.dependencias.find(function(d) { return d.id === id; }); }).filter(Boolean);
    var papeis = {}; try { papeis = data.processo.bcpPapeisCrise ? JSON.parse(data.processo.bcpPapeisCrise) : {}; } catch(e) {}
    newTable = '<table><thead><tr><th>Nome</th><th>Papel na Crise</th><th>Setor</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>';
    contatos.forEach(function(d) { var papel = papeis[d.nome] || papeis[String(d.id)] || d.detalhes || ''; newTable += '<tr><td>' + d.nome + '</td><td>' + papel + '</td><td>' + (d.setor || '-') + '</td><td>' + (d.telefone || '-') + '</td><td>' + (d.email || '-') + '</td></tr>'; });
    newTable += '</tbody></table>';
  } else if (type === 'dependencias') {
    var depsList = (data.processo.dependencia || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var grupos = {};
    depsList.forEach(function(nome) { var dep = data.dependencias.find(function(d) { return d.nome === nome; }); var cat = dep ? dep.categoria : 'Outros'; if (!grupos[cat]) grupos[cat] = []; grupos[cat].push(nome); });
    newTable = '<table><thead><tr><th>Tipo</th><th>Recursos</th></tr></thead><tbody>';
    Object.keys(grupos).sort().forEach(function(cat) { newTable += '<tr><td><strong>' + cat + '</strong></td><td>' + grupos[cat].join(', ') + '</td></tr>'; });
    newTable += '</tbody></table>';
  } else if (type === 'componentes') {
    var compIds = data.processo.drpComponentes || [];
    var comps = compIds.map(function(id) { return data.componentes.find(function(c) { return c.id === id; }); }).filter(Boolean);
    newTable = '<table><thead><tr><th>Tipo</th><th>Nome</th><th>Estratégia</th><th>RTO</th><th>RPO</th><th>Responsável</th></tr></thead><tbody>';
    comps.forEach(function(c) { newTable += '<tr><td>' + (c.tipo || '-') + '</td><td>' + c.nome + '</td><td>' + (c.estrategia || '-') + '</td><td>' + (c.rto || '-') + '</td><td>' + (c.rpo || '-') + '</td><td>' + (c.responsavel || '-') + '</td></tr>'; });
    newTable += '</tbody></table>';
  } else if (type === 'fornecedores') {
    var planoBData = {}; try { planoBData = data.processo.bcpPlanoBProvedores ? JSON.parse(data.processo.bcpPlanoBProvedores) : {}; } catch(e) {}
    var slasData = {}; try { slasData = data.processo.bcpSlas ? JSON.parse(data.processo.bcpSlas) : {}; } catch(e) {}
    newTable = '<table><thead><tr><th>Fornecedor</th><th>Contingência / Plano B</th><th>SLA</th></tr></thead><tbody>';
    Object.keys(planoBData).forEach(function(dep) { newTable += '<tr><td><strong>' + dep + '</strong></td><td>' + (planoBData[dep] || '-') + '</td><td>' + (slasData[dep] || '-') + '</td></tr>'; });
    newTable += '</tbody></table>';
  }

  next.outerHTML = newTable;
  closeLiveEditor();
  alert('✅ Seção atualizada! Clique em "Salvar versão" para persistir.');
}

// Init
setTimeout(function() { buildNav(); }, 500);
setTimeout(function() { buildNav(); }, 1500);
setTimeout(function() { buildNav(); initPCNLive(); }, 3000);

// ============================================================
// MATRIZ DE RISCOS - Selects com cores para Probabilidade e Impacto
// ============================================================
var _riskMatrixEnhanced = false;
function enhanceRiskMatrix() {
  if (_riskMatrixEnhanced) return;
  var content = document.getElementById('pcn-editavel');
  if (!content) return;

  var colors = {
    'Alta': '#ffcdd2', 'Alto': '#fff3e0', 'Crítico': '#ffcdd2',
    'Média': '#fff3e0', 'Médio': '#fff3e0', 'Moderado': '#e8f5e9',
    'Baixa': '#e8f5e9', 'Baixo': '#f5f5f5'
  };
  var probOptions = ['Alta', 'Média', 'Baixa'];
  var impactOptions = ['Crítico', 'Alto', 'Moderado', 'Baixo'];

  // Encontrar tabela de riscos pelo heading
  var headings = content.querySelectorAll('h1, h2, h3');
  var riskHeading = null;
  headings.forEach(function(h) {
    var t = h.textContent.toLowerCase();
    if (t.includes('risco') && (t.includes('avaliação') || t.includes('análise'))) riskHeading = h;
  });
  if (!riskHeading) return;

  // Encontrar tabela após o heading
  var next = riskHeading.nextElementSibling;
  while (next && next.tagName !== 'TABLE' && next.tagName !== 'H2' && next.tagName !== 'H3') next = next.nextElementSibling;
  if (!next || next.tagName !== 'TABLE') return;

  var table = next;
  var headers = table.querySelectorAll('thead th');
  var probCol = -1, impactCol = -1;
  headers.forEach(function(th, i) {
    var t = th.textContent.toLowerCase();
    if (t.includes('probabilidade')) probCol = i;
    if (t.includes('impacto')) impactCol = i;
  });
  if (probCol === -1 && impactCol === -1) return;
  _riskMatrixEnhanced = true;

  // Transformar células em selects
  var rows = table.querySelectorAll('tbody tr');
  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (probCol >= 0 && cells[probCol]) {
      var currentVal = cells[probCol].textContent.trim();
      cells[probCol].setAttribute('contenteditable', 'false');
      cells[probCol].style.background = 'white';
      cells[probCol].innerHTML = buildRiskSelect(currentVal, probOptions, colors, 'prob');
      cells[probCol].style.padding = '4px 8px';
    }
    if (impactCol >= 0 && cells[impactCol]) {
      var currentVal = cells[impactCol].textContent.trim();
      cells[impactCol].setAttribute('contenteditable', 'false');
      cells[impactCol].style.background = 'white';
      cells[impactCol].innerHTML = buildRiskSelect(currentVal, impactOptions, colors, 'impact');
      cells[impactCol].style.padding = '4px 8px';
    }
  });
}

function buildRiskSelect(currentValue, options, colors, prefix) {
  // Normalizar o valor atual (pode vir com espaços, acentos inconsistentes)
  var normalizedCurrent = currentValue.trim();
  // Tentar match parcial se não encontrar exato
  var matchedOption = options.find(function(opt) { return normalizedCurrent.toLowerCase() === opt.toLowerCase(); });
  if (!matchedOption) {
    matchedOption = options.find(function(opt) { return normalizedCurrent.toLowerCase().includes(opt.toLowerCase()); });
  }
  var selectedValue = matchedOption || normalizedCurrent;
  var bgColor = colors[selectedValue] || '#f5f5f5';

  var html = '<select onchange="updateRiskColor(this)" style="width:100%;padding:6px 8px;border:1.5px solid #ddd;border-radius:5px;font-size:0.9em;font-weight:600;color:' + getTextColor(selectedValue) + ';background:white;cursor:pointer;" contenteditable="false">';
  options.forEach(function(opt) {
    var selected = (selectedValue === opt) ? ' selected' : '';
    var optColor = colors[opt] || '#f5f5f5';
    html += '<option value="' + opt + '" style="background:' + optColor + ';font-weight:600;"' + selected + '>' + opt + '</option>';
  });
  html += '</select>';
  return html;
}

function getTextColor(value) {
  var textColors = {
    'Alta': '#c62828', 'Alto': '#e65100', 'Crítico': '#c62828',
    'Média': '#e65100', 'Médio': '#e65100', 'Moderado': '#2e7d32',
    'Baixa': '#2e7d32', 'Baixo': '#666'
  };
  return textColors[value] || '#333';
}

function updateRiskColor(select) {
  select.style.color = getTextColor(select.value);
}

// Executar após initPCNLive
setTimeout(enhanceRiskMatrix, 3500);
setTimeout(enhanceRiskMatrix, 5000);
