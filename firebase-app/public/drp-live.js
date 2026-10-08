// ============================================================
// DRP LIVE - Exportação de riscos por registro, pro Registro de Riscos.
//
// Bem mais simples que pcn-live.js: o DRP não tem os outros editores vivos
// do PCN (contatos/dependências/fornecedores/estratégia técnica), só esta
// feature. Mesmo padrão de botão-por-registro + painel lateral que
// pcn-live.js já usa pra "Estratégia Técnica de Recuperação"/"Avaliação de
// Riscos" -- fetch cru contra a mesma Cloud Function (appApi), já que esta
// página não carrega o SDK do Firestore (é um documento separado,
// window.open + document.write).
//
// Diferente do PCN, o DRP não tem uma tabela de Evento/Probabilidade/
// Impacto pronta -- a fonte é a lista de "Limitações da Estratégia"
// (mesmo heading que _extrairLimitacoesDoDRP, em app.js, usa pro picker em
// lote). Por isso cada linha do painel tem 2 selects vazios: quem exporta
// escolhe Probabilidade/Impacto na hora, igual já acontece no picker em
// lote de "Importar Risco -> DRP".
// ============================================================

function injectDrpRiscoButton() {
  var content = document.getElementById('drp-editavel');
  if (!content) return;
  var headings = content.querySelectorAll('h1, h2, h3');
  var heading = null;
  headings.forEach(function(h) {
    var t = h.textContent.toLowerCase();
    if (!heading && t.includes('limita')) heading = h;
  });
  if (!heading || heading.querySelector('.drp-live-btn')) return;

  var btn = document.createElement('button');
  btn.innerHTML = '📤 Exportar Riscos';
  btn.style.cssText = 'margin-left:12px;padding:4px 12px;font-size:8.5pt;background:#fce8ea;color:#d60014;border:1.5px solid #d60014;border-radius:5px;cursor:pointer;font-weight:600;vertical-align:middle;';
  btn.className = 'drp-live-btn no-print';
  btn.setAttribute('contenteditable', 'false');
  btn.onclick = function(e) { e.preventDefault(); e.stopPropagation(); openDrpRiscoEditor(heading); };
  heading.appendChild(btn);
}

// Mesmo criterio de travessia de _extrairLimitacoesDoDRP (app.js): a partir
// do heading, coleta texto de <li> (ou <p>, se o Gemini gerar paragrafos em
// vez de lista) ate o proximo heading.
function _limitacoesDoDrp(heading) {
  var itens = [];
  var next = heading.nextElementSibling;
  while (next && !/^H[1-3]$/.test(next.tagName)) {
    if (next.tagName === 'UL' || next.tagName === 'OL') {
      next.querySelectorAll('li').forEach(function(li) {
        var t = (li.textContent || '').trim();
        if (t) itens.push(t);
      });
    } else if (next.tagName === 'P') {
      var t = (next.textContent || '').trim();
      if (t) itens.push(t);
    }
    next = next.nextElementSibling;
  }
  return itens;
}

function openDrpRiscoEditor(heading) {
  var existing = document.getElementById('drp-live-editor');
  if (existing) existing.remove();

  var itens = _limitacoesDoDrp(heading);
  window._drpRiscoRows = itens.map(function(texto) { return { texto: texto, probabilidade: '', impacto: '' }; });

  var panel = document.createElement('div');
  panel.id = 'drp-live-editor';
  panel.style.cssText = 'position:fixed;top:0;right:0;width:500px;height:100vh;background:white;box-shadow:-4px 0 20px rgba(0,0,0,0.2);z-index:1000;overflow-y:auto;padding:24px;font-family:Segoe UI,Arial,sans-serif;';

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:2px solid #fce8ea;padding-bottom:12px;"><h3 style="color:#d60014;margin:0;">📤 Limitações da Estratégia</h3><button onclick="closeDrpRiscoEditor()" style="background:none;border:none;font-size:1.5em;cursor:pointer;color:#666;">×</button></div>';

  if (!window._drpRiscoRows.length) {
    html += '<p style="font-size:0.85em;color:#999;">Nenhuma limitação encontrada nesta versão do DRP.</p>';
  } else {
    html += '<p style="font-size:0.85em;color:#666;margin-bottom:12px;">O DRP não tem uma classificação de Probabilidade/Impacto pronta -- escolha antes de exportar cada item para o Registro de Riscos.</p>';
    html += '<div style="margin-bottom:12px;"><button onclick="exportarTudoRiscosDRP()" style="padding:8px 16px;background:#d60014;color:white;border:none;border-radius:6px;font-size:0.85em;font-weight:600;cursor:pointer;">⭳ Exportar tudo</button></div>';
    window._drpRiscoRows.forEach(function(r, idx) {
      html += '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;margin-bottom:8px;" id="drp-risco-row-' + idx + '">';
      html += '<div style="font-weight:600;color:#333;margin-bottom:8px;">' + r.texto + '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
      html += '<select onchange="window._drpRiscoRows[' + idx + '].probabilidade=this.value" style="padding:5px 6px;border:1px solid #ddd;border-radius:4px;font-size:0.82em;"><option value="">Probabilidade...</option><option value="Baixa">Baixa</option><option value="Média">Média</option><option value="Alta">Alta</option></select>';
      html += '<select onchange="window._drpRiscoRows[' + idx + '].impacto=this.value" style="padding:5px 6px;border:1px solid #ddd;border-radius:4px;font-size:0.82em;"><option value="">Impacto...</option><option value="Baixo">Baixo</option><option value="Moderado">Moderado</option><option value="Alto">Alto</option><option value="Crítico">Crítico</option></select>';
      html += '</div>';
      html += '<button onclick="exportLiveRiscoDRP(' + idx + ')" style="padding:5px 12px;background:#2e7d32;color:white;border:none;border-radius:5px;font-size:0.8em;cursor:pointer;">📤 Exportar</button>';
      html += '</div>';
    });
  }

  panel.innerHTML = html;
  document.body.appendChild(panel);
}

function closeDrpRiscoEditor() {
  var el = document.getElementById('drp-live-editor');
  if (el) el.remove();
}

async function exportLiveRiscoDRP(idx) {
  var r = (window._drpRiscoRows || [])[idx];
  if (!r) return;
  var row = document.getElementById('drp-risco-row-' + idx);
  var btn = row ? row.querySelector('button') : null;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportando...'; }
  try {
    var payload = {
      action: 'exportarRiscoDocumento',
      origem: 'Importado de DRP',
      titulo: r.texto,
      descricao: 'Risco residual identificado no DRP de "' + DRP_DEP_NOME + '": ' + r.texto,
      probabilidade: r.probabilidade || '',
      impacto: r.impacto || '',
    };
    var res = await fetch(DRP_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Authorization': 'Bearer ' + DRP_TOKEN }, body: JSON.stringify(payload) });
    if (res.status === 401) throw new Error('A sessão desta aba expirou. Feche, volte ao sistema e abra o DRP de novo.');
    var data = JSON.parse(await res.text());
    if (data.error) throw new Error(data.error);
    if (btn) { btn.textContent = '✅ Exportado'; }
    alert('✅ Risco exportado para o Registro de Riscos: ' + r.texto);
  } catch(e) {
    alert('Erro ao exportar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '📤 Exportar'; }
  }
}

// Em sequencia (nao Promise.all), mesmo motivo de exportarTudoEstrategiaTecnica
// (pcn-live.js): evita que varios erros/alertas se sobreponham de uma vez.
async function exportarTudoRiscosDRP() {
  var rows = window._drpRiscoRows || [];
  if (!rows.length) return alert('Nenhum risco pra exportar.');
  for (var i = 0; i < rows.length; i++) { await exportLiveRiscoDRP(i); }
}

setTimeout(injectDrpRiscoButton, 300);
setTimeout(injectDrpRiscoButton, 1000);
setTimeout(injectDrpRiscoButton, 2000);
