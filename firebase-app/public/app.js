// ============================================================
// SPA - ROTEAMENTO E PÁGINAS
// ============================================================

const app = document.getElementById('app');
const pages = { processos, perguntas, areas, admin, dependencias, componentes, pcns };

// Roteamento
window.addEventListener('hashchange', route);
window.addEventListener('load', route);

// Listener para salvar PCN via postMessage (não mais necessário - PCN agora abre em pcn-viewer.html com mesma origin)

function route() {
  // Esperar perfil ser carregado antes de renderizar páginas
  if (!window._perfilCarregado) {
    window._routePendente = true;
    return;
  }
  const hash = window.location.hash.slice(1) || 'processos';
  const [page, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr || '');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  const pageFunc = pages[page] || pages.processos;
  if (pageFunc) pageFunc();
  // Deep link: abrir processo na aba específica (aguarda dados carregarem)
  if (params.get('editar')) {
    const id = Number(params.get('editar'));
    const aba = params.get('aba') || 'identificacao';
    function tryOpenProcess() {
      if (window.processosData && window.processosData.length) {
        if (window.editarProcesso) {
          window.editarProcesso(id);
          setTimeout(() => { if (window.trocarAbaProcesso) window.trocarAbaProcesso(aba); }, 300);
        }
      } else {
        setTimeout(tryOpenProcess, 500);
      }
    }
    setTimeout(tryOpenProcess, 800);
  }
}

// Utilitários
function showToast(msg, bg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.background = bg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3500);
}

// ============================================================
// PÁGINA: PERGUNTAS
// ============================================================
async function perguntas() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Perguntas do Questionário</h2><p class="page-sub">Gerencie as perguntas e as opções de resposta por categoria</p></div>
      <button class="btn btn-primary" onclick="abrirModalPergunta()">+ Nova Pergunta</button>
    </div>
    <div class="loading" id="loading">⏳ Carregando...</div>
    <div id="lista"></div>
    <div id="lista-respostas" style="margin-top:32px;"></div>
    <div class="modal-overlay" id="modal"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalTitulo">Nova Pergunta</h3>
      <input type="hidden" id="fId">
      <label>Categoria</label>
      <select id="fCategoria"></select>
      <label>Pergunta</label>
      <input type="text" id="fPergunta" placeholder="Ex: Qual o impacto no produto final?">
      <label>Descrição / Ajuda</label>
      <input type="text" id="fDescricao" placeholder="Texto de apoio para o gestor">
      <label class="check-label"><input type="checkbox" id="fAtiva" checked> Pergunta ativa</label>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPergunta()">Salvar</button>
      </div>
    </div></div>`;

  try {
    console.log('Chamando API.getPerguntas()...');
    const data = await API.getPerguntas();
    console.log('Perguntas recebidas:', data);
    document.getElementById('loading').style.display = 'none';
  
  const CAT_CORES = {
    'Impacto na Operação e Missão': { bg: '#1a237e', fg: 'white' },
    'Impacto Financeiro': { bg: '#c62828', fg: 'white' },
    'Impacto Jurídico e Regulatório': { bg: '#e65100', fg: 'white' },
    'Impacto Reputacional': { bg: '#00838f', fg: 'white' },
  };
  
  const grupos = {};
  data.forEach(p => { (grupos[p.categoria] = grupos[p.categoria] || []).push(p); });
  
  document.getElementById('lista').innerHTML = Object.entries(grupos).map(([cat, items]) => {
    const cor = CAT_CORES[cat] || { bg: '#555', fg: 'white' };
    return `<div class="group-card"><div class="group-header" style="background:${cor.bg};color:${cor.fg}">${cat}</div>${items.map(p => `
      <div class="list-row ${p.ativa ? '' : 'inativa'}">
        <div class="list-row-main">
          <div class="list-row-title">${p.pergunta}</div>
          <div class="list-row-sub">${p.descricao || ''}</div>
        </div>
        <div class="list-row-actions">
          ${p.ativa ? '<span class="badge badge-green">Ativa</span>' : '<span class="badge badge-gray">Inativa</span>'}
          <button class="btn-icon" onclick="editarPergunta(${p.id})">✏️</button>
          <button class="btn-icon" onclick="excluirPergunta(${p.id})">🗑️</button>
        </div>
      </div>`).join('')}</div>`;
  }).join('');
  
  window.perguntasData = data;

  // Popular dropdown de categorias dinamicamente
  const cats = [...new Set(data.map(p => p.categoria))].sort();
  const selCat = document.getElementById('fCategoria');
  selCat.innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  window.categoriasDisponiveis = cats;

  // Carregar e renderizar config de respostas
  let configRespostas = {};
  try {
    configRespostas = await API.getConfigRespostas();
  } catch(e) {
    configRespostas = {
      '_default': [
        {valor:'4',label:'Alto (4)',cor:'#c62828',background:'#ffebee'},
        {valor:'2',label:'Médio (2)',cor:'#f57c00',background:'#fff3e0'},
        {valor:'1',label:'Baixo (1)',cor:'#2e7d32',background:'#e8f5e9'},
        {valor:'0',label:'N/A (0)',cor:'#757575',background:'#f5f5f5'}
      ],
      'Geral': [
        {valor:'4',label:'Acontece o tempo todo',cor:'#c62828',background:'#ffebee'},
        {valor:'2',label:'Acontece com alguma frequência',cor:'#f57c00',background:'#fff3e0'},
        {valor:'1',label:'Acontece raramente',cor:'#2e7d32',background:'#e8f5e9'},
        {valor:'0',label:'Nunca aconteceu',cor:'#757575',background:'#f5f5f5'}
      ]
    };
  }
  window.configRespostasData = configRespostas;
  renderizarConfigRespostas(configRespostas);

  } catch (err) {
    console.error('Erro ao carregar perguntas:', err);
    document.getElementById('loading').innerHTML = `
      <div style="color:#c62828;padding:20px;text-align:center;">
        <h3>❌ Erro ao carregar perguntas</h3>
        <p>${err.message}</p>
        <p style="font-size:0.85em;color:#666;margin-top:10px;">Verifique o console (F12) para mais detalhes</p>
      </div>`;
  }
}

window.abrirModalPergunta = (p) => {
  document.getElementById('fId').value = p ? p.id : '';
  document.getElementById('fCategoria').value = p ? p.categoria : 'Impacto na Operação e Missão';
  document.getElementById('fPergunta').value = p ? p.pergunta : '';
  document.getElementById('fDescricao').value = p ? p.descricao : '';
  document.getElementById('fAtiva').checked = p ? p.ativa : true;
  document.getElementById('modalTitulo').textContent = p ? 'Editar Pergunta' : 'Nova Pergunta';
  document.getElementById('modal').classList.add('open');
};

window.editarPergunta = (id) => abrirModalPergunta(window.perguntasData.find(p => p.id === id));
window.trocarAbaProcesso = (aba) => {
  ['identificacao','avaliacao','bia','bcp','drp'].forEach(a => {
    document.getElementById('painel-' + a).style.display = a === aba ? 'block' : 'none';
    const btn = document.getElementById('tab-' + a);
    btn.style.color = a === aba ? '#1a237e' : '#999';
    btn.style.borderBottom = a === aba ? '3px solid #1a237e' : '3px solid transparent';
  });
  // Popular contatos ao abrir aba BCP - auto-adicionar pessoas da BIA
  if (aba === 'bcp') {
    const catalogo = window.dependenciasCatalogo || [];
    const selecionadas = window._dependenciaSelecionadas || [];
    selecionadas.forEach(nome => {
      const dep = catalogo.find(d => d.nome === nome);
      if (dep && ['Pessoa', 'Pessoas'].includes(dep.categoria) && !window._bcpContatos.includes(dep.id)) {
        window._bcpContatos.push(dep.id);
      }
    });
    popularSelectContatosBcp();
    renderContatosBcp();
    renderFornecedoresBcp();
  }
  // Renderizar avaliação ao abrir aba
  if (aba === 'avaliacao') renderAvaliacaoInline();
  // Auto-adicionar sistemas/infraestrutura da BIA como componentes DRP
  if (aba === 'drp') {
    const catalogo = window.dependenciasCatalogo || [];
    const componentesCat = window.componentesCatalogo || [];
    const selecionadas = window._dependenciaSelecionadas || [];
    selecionadas.forEach(nome => {
      const dep = catalogo.find(d => d.nome === nome);
      if (dep && ['Sistemas', 'Sistema', 'Infraestrutura'].includes(dep.categoria)) {
        // Buscar componente correspondente no catálogo de componentes (por nome)
        const comp = componentesCat.find(c => c.nome === nome);
        if (comp && !window._drpComponentes.includes(comp.id)) {
          window._drpComponentes.push(comp.id);
        }
      }
    });
    renderComponentesDrp();
  }
};

// ============================================================
// Avaliação Inline (dentro do drawer de processo)
// ============================================================
window.renderAvaliacaoInline = () => {
  const container = document.getElementById('avaliacaoPerguntas');
  const resumoContainer = document.getElementById('avaliacaoScoreResumo');
  if (!container) return;
  
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  
  // Mostrar score/tier se já avaliado
  if (resumoContainer && p && p.score > 0) {
    const cor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : '#1565c0';
    const tier = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : 'Tier 3 (Suporte)';
    resumoContainer.innerHTML = `<div style="display:flex;gap:12px;margin-bottom:4px;">
      <div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};">
        <div style="font-size:0.78em;color:#666;margin-bottom:4px;">SCORE</div>
        <div style="font-size:1.8em;font-weight:700;color:${cor};" id="avaliacaoScoreValor">${p.score}</div>
      </div>
      <div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};">
        <div style="font-size:0.78em;color:#666;margin-bottom:4px;">TIER</div>
        <div style="font-size:0.95em;font-weight:700;" id="avaliacaoTierValor"><span style="background:${cor};color:white;padding:4px 12px;border-radius:12px;">${tier}</span></div>
      </div>
    </div>`;
  } else if (resumoContainer) {
    resumoContainer.innerHTML = `<div style="background:#f5f6fa;border-radius:8px;padding:12px 16px;font-size:0.85em;color:#999;margin-bottom:4px;" id="avaliacaoScoreValor">Processo ainda não avaliado. Responda as perguntas abaixo.</div>`;
  }
  
  if (!id) {
    container.innerHTML = '<p style="font-size:0.9em;color:#999;padding:16px 0;">Salve o processo primeiro para poder avaliar.</p>';
    return;
  }
  
  const OPCOES_RESPOSTA = window.configRespostas || {
    'Geral': [
      {valor:'4',label:'Acontece o tempo todo',cor:'#c62828',background:'#ffebee'},
      {valor:'2',label:'Acontece com alguma frequência',cor:'#f57c00',background:'#fff3e0'},
      {valor:'1',label:'Acontece raramente',cor:'#2e7d32',background:'#e8f5e9'},
      {valor:'0',label:'Nunca aconteceu',cor:'#757575',background:'#f5f5f5'}
    ],
    '_default': [
      {valor:'4',label:'Alto (4)',cor:'#c62828',background:'#ffebee'},
      {valor:'2',label:'Médio (2)',cor:'#f57c00',background:'#fff3e0'},
      {valor:'1',label:'Baixo (1)',cor:'#2e7d32',background:'#e8f5e9'},
      {valor:'0',label:'N/A (0)',cor:'#757575',background:'#f5f5f5'}
    ]
  };
  
  const CAT_CORES_PALETTE = ['#37474f','#1a237e','#c62828','#e65100','#00838f','#6a1b9a','#00695c','#1565c0','#4e342e','#558b2f'];
  const CAT_CORES = {};
  [...new Set(window.processosPerguntas.map(pg => pg.categoria))].forEach((c, i) => {
    CAT_CORES[c] = CAT_CORES_PALETTE[i % CAT_CORES_PALETTE.length];
  });
  
  const pergsOrdenadas = [
    ...window.processosPerguntas.filter(pg => pg.categoria === 'Geral'),
    ...window.processosPerguntas.filter(pg => pg.categoria !== 'Geral'),
  ];
  const gruposCats = [];
  const vistosCats = {};
  pergsOrdenadas.forEach(pg => { if (!vistosCats[pg.categoria]) { vistosCats[pg.categoria] = true; gruposCats.push(pg.categoria); } });
  
  container.innerHTML = gruposCats.map(cat => {
    const cor = CAT_CORES[cat] || '#555';
    const itensCat = pergsOrdenadas.filter(pg => pg.categoria === cat);
    return `<div style="margin-bottom:20px;">
      <div style="background:${cor};color:white;padding:8px 16px;border-radius:7px 7px 0 0;font-size:0.8em;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${cat}</div>
      <div style="border:1.5px solid ${cor};border-top:none;border-radius:0 0 7px 7px;overflow:hidden;">
        ${itensCat.map(perg => {
          const i = window.processosPerguntas.indexOf(perg);
          return `<div style="padding:20px 24px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <div style="font-weight:600;color:#1a1a2e;margin-bottom:3px;font-size:0.92em;">${perg.pergunta}</div>
            <div style="font-size:0.81em;color:#888;margin-bottom:12px;line-height:1.5;">${perg.descricao || ''}</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
              ${(OPCOES_RESPOSTA[cat] || OPCOES_RESPOSTA['_default']).slice().sort((a,b) => Number(b.valor) - Number(a.valor)).map(op => {
                const opCor = (op.cor && op.cor !== 'undefined') ? op.cor : ({'4':'#c62828','2':'#f57c00','1':'#2e7d32','0':'#757575'}[String(op.valor)] || '#555');
                const opBg = (op.background && op.background !== 'undefined') ? op.background : ({'4':'#ffebee','2':'#fff3e0','1':'#e8f5e9','0':'#f5f5f5'}[String(op.valor)] || '#f5f5f5');
                return `
                <label style="display:flex;align-items:flex-start;padding:12px 14px;background:white;border:2px solid #e0e0e0;border-radius:8px;cursor:pointer;min-height:56px;">
                  <input type="radio" name="avalInline${i}" value="${op.valor}" data-cor="${opCor}" data-bg="${opBg}" data-label="${op.label}" onchange="calcularScoreInline();atualizarEstiloOpcoes(this);" style="margin-right:8px;margin-top:2px;width:15px;height:15px;flex-shrink:0;">
                  <span style="color:${opCor};font-weight:600;font-size:0.85em;line-height:1.4;">${op.label}</span>
                </label>`;}).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  
  // Pré-selecionar respostas anteriores
  if (p && p.respostas && Object.keys(p.respostas).length > 0) {
    window.processosPerguntas.forEach((perg, i) => {
      const val = p.respostas[perg.pergunta];
      if (val !== undefined) {
        const radio = document.querySelector(`input[name="avalInline${i}"][value="${val}"]`);
        if (radio) {
          radio.checked = true;
          atualizarEstiloOpcoes(radio);
        }
      }
    });
  }
  calcularScoreInline();
};

window.calcularScoreInline = () => {
  let total = 0;
  const pergs = window.processosPerguntas || [];
  pergs.forEach((pg, i) => {
    const sel = document.querySelector(`input[name="avalInline${i}"]:checked`);
    if (sel) total += Number(sel.value);
  });
  // Atualizar resumo de score
  const resumoContainer = document.getElementById('avaliacaoScoreResumo');
  if (resumoContainer && total > 0) {
    const cor = total >= 12 ? '#c62828' : total >= 6 ? '#f57c00' : '#1565c0';
    const tier = total >= 12 ? 'Tier 1 (Crítico)' : total >= 6 ? 'Tier 2 (Essencial)' : 'Tier 3 (Suporte)';
    resumoContainer.innerHTML = `<div style="display:flex;gap:12px;margin-bottom:4px;">
      <div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};">
        <div style="font-size:0.78em;color:#666;margin-bottom:4px;">SCORE</div>
        <div style="font-size:1.8em;font-weight:700;color:${cor};" id="avaliacaoScoreValor">${total}</div>
      </div>
      <div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};">
        <div style="font-size:0.78em;color:#666;margin-bottom:4px;">TIER</div>
        <div style="font-size:0.95em;font-weight:700;" id="avaliacaoTierValor"><span style="background:${cor};color:white;padding:4px 12px;border-radius:12px;">${tier}</span></div>
      </div>
    </div>`;
  }
  // Salvar respostas para incluir no salvarProcesso
  window._avaliacaoRespostas = {};
  pergs.forEach((pg, i) => {
    const sel = document.querySelector(`input[name="avalInline${i}"]:checked`);
    if (sel) window._avaliacaoRespostas[pg.pergunta] = Number(sel.value);
  });
  window._avaliacaoScore = total;
};

// ============================================================
// BCP - Contatos e Responsabilidades
// ============================================================
window._bcpContatos = []; // IDs das dependências selecionadas

function popularSelectContatosBcp() {
  // Mantido para compatibilidade, mas agora usamos busca
  const select = document.getElementById('bcpContatoSelect');
  if (!select) return;
  const catalogo = window.dependenciasCatalogo || [];
  const selecionados = window._bcpContatos || [];
  const disponiveis = catalogo.filter(d => !selecionados.includes(d.id));
  select.innerHTML = '<option value=""></option>' +
    disponiveis.map(d => `<option value="${d.id}">${d.nome} (${d.categoria})</option>`).join('');
}

window.mostrarDropdownContatoBcp = () => {
  const input = document.getElementById('bcpContatoBusca');
  const dropdown = document.getElementById('bcpContatoDropdown');
  if (!input || !dropdown) return;
  
  const catalogo = window.dependenciasCatalogo || [];
  const selecionados = window._bcpContatos || [];
  const filtro = input.value.toLowerCase();
  
  const disponiveis = catalogo.filter(d => 
    !selecionados.includes(d.id) &&
    (filtro === '' || 
     d.nome.toLowerCase().includes(filtro) || 
     (d.categoria || '').toLowerCase().includes(filtro) ||
     (d.setor || '').toLowerCase().includes(filtro) ||
     (d.empresa || '').toLowerCase().includes(filtro) ||
     (d.detalhes || '').toLowerCase().includes(filtro))
  );
  
  if (!disponiveis.length) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:0.88em;color:#999;">Nenhum resultado encontrado.</div>';
    dropdown.style.display = 'block';
    return;
  }
  
  // Agrupar por categoria
  const grupos = {};
  disponiveis.forEach(d => {
    if (!grupos[d.categoria]) grupos[d.categoria] = [];
    grupos[d.categoria].push(d);
  });
  
  let html = '';
  Object.entries(grupos).sort((a,b) => a[0].localeCompare(b[0])).forEach(([cat, itens]) => {
    html += `<div style="padding:6px 12px 3px;font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;">${cat}</div>`;
    itens.forEach(d => {
      const info = [d.setor, d.empresa].filter(Boolean).join(' • ');
      html += `<div class="bcp-contato-option" onmousedown="adicionarContatoBcpById(${d.id})" style="padding:8px 12px 8px 20px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
        <div style="font-weight:600;color:#222;">${d.nome}</div>
        ${info ? `<div style="font-size:0.82em;color:#888;margin-top:2px;">${info}</div>` : ''}
      </div>`;
    });
  });
  
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
  
  dropdown.querySelectorAll('.bcp-contato-option').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = '#f0f4ff');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });
};

window.adicionarContatoBcpById = (id) => {
  if (!window._bcpContatos.includes(id)) {
    window._bcpContatos.push(id);
    renderContatosBcp();
    popularSelectContatosBcp();
  }
  const input = document.getElementById('bcpContatoBusca');
  const dropdown = document.getElementById('bcpContatoDropdown');
  if (input) input.value = '';
  if (dropdown) dropdown.style.display = 'none';
};

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('bcpContatoDropdown');
  const input = document.getElementById('bcpContatoBusca');
  if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

window.adicionarContatoBcp = () => {
  const select = document.getElementById('bcpContatoSelect');
  const id = Number(select.value);
  if (!id) return;
  if (!window._bcpContatos.includes(id)) {
    window._bcpContatos.push(id);
    renderContatosBcp();
    popularSelectContatosBcp();
  }
};

window.removerContatoBcp = (id) => {
  window._bcpContatos = window._bcpContatos.filter(x => x !== id);
  renderContatosBcp();
  popularSelectContatosBcp();
};

function renderContatosBcp() {
  const container = document.getElementById('bcpContatosTabela');
  const catalogo = window.dependenciasCatalogo || [];
  const contatos = window._bcpContatos.map(id => catalogo.find(d => d.id === id)).filter(Boolean);

  let rows = '';
  if (contatos.length) {
    rows = contatos.map(d => `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:12px 14px;font-weight:600;color:#222;">${d.nome || '-'}</td>
          <td style="padding:12px 14px;color:#555;">${d.empresa || '-'}</td>
          <td style="padding:12px 14px;color:#555;">${d.setor || '-'}</td>
          <td style="padding:6px 8px;"><input type="text" class="papel-crise-input" data-id="${d.id}" value="${(d.detalhes || '').replace(/"/g, '&quot;')}" placeholder="Papel neste processo..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.88em;box-sizing:border-box;"></td>
          <td style="padding:12px 14px;color:#555;">${d.telefone || '-'}</td>
          <td style="padding:12px 14px;color:#555;">${d.email || '-'}</td>
          <td style="padding:12px 6px;text-align:center;">
            <button onclick="removerContatoBcp(${d.id})" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:1.1em;" title="Remover">&times;</button>
          </td>
        </tr>`).join('');
  } else {
    rows = `<tr><td colspan="7" style="padding:16px 14px;color:#999;font-size:0.9em;text-align:center;">Nenhum contato adicionado. Use o campo abaixo para buscar e adicionar.</td></tr>`;
  }

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.88em;border:1.5px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f5f6fa;">
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Nome</th>
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Empresa</th>
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Setor</th>
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Papel na Crise</th>
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Telefone</th>
          <th style="padding:11px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">E-mail</th>
          <th style="padding:11px 6px;text-align:center;border-bottom:1.5px solid #e0e0e0;width:50px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

window.fecharModal = () => {
  document.getElementById('drawerProcesso').classList.remove('open');
  document.getElementById('drawerOverlayProcesso').classList.remove('open');
};

function renderizarConfigRespostas(config) {
  const cats = Object.keys(config);
  const CAT_CORES = {
    '_default': { bg: '#455a64', fg: 'white' },
    'Geral': { bg: '#37474f', fg: 'white' },
    'Impacto na Operação e Missão': { bg: '#1a237e', fg: 'white' },
    'Impacto Financeiro': { bg: '#c62828', fg: 'white' },
    'Impacto Jurídico e Regulatório': { bg: '#e65100', fg: 'white' },
    'Impacto Reputacional': { bg: '#00838f', fg: 'white' },
  };
  document.getElementById('lista-respostas').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <h3 style="font-size:1.1em;font-weight:700;color:#1a237e;margin:0 0 4px;">Opções de Resposta por Categoria</h3>
        <p style="font-size:0.85em;color:#888;margin:0;">Personalize os rótulos e pontuações exibidos no questionário</p>
      </div>
      <button class="btn btn-primary" onclick="abrirModalConfigResposta()">+ Nova Opção</button>
    </div>
    ${cats.map(cat => {
      const cor = CAT_CORES[cat] || { bg: '#555', fg: 'white' };
      const itens = config[cat];
      return `<div class="group-card" style="margin-bottom:16px;">
        <div class="group-header" style="background:${cor.bg};color:${cor.fg};display:flex;justify-content:space-between;align-items:center;">
          <span>${cat === '_default' ? 'Padrão (todas as categorias)' : cat}</span>
        </div>
        ${itens.map((op, idx) => `
          <div class="list-row">
            <div class="list-row-main" style="display:flex;align-items:center;gap:12px;">
              <span style="display:inline-block;padding:3px 12px;border-radius:12px;font-size:0.82em;font-weight:700;color:white;background:${op.cor};min-width:24px;text-align:center;">${op.valor}</span>
              <span style="font-weight:600;color:#333;">${op.label}</span>
            </div>
            <div class="list-row-actions">
              <button class="btn-icon" onclick="editarConfigResposta('${cat}', ${idx})" title="Editar">✏️</button>
              <button class="btn-icon" onclick="excluirConfigResposta('${cat}', ${idx})" title="Excluir">🗑️</button>
            </div>
          </div>`).join('')}
      </div>`;
    }).join('')}
    <div class="modal-overlay" id="modalConfigResposta"><div class="modal" onclick="event.stopPropagation()" style="max-width:480px;">
      <h3 id="modalConfigRespostaTitulo" style="font-size:1.1em;font-weight:700;color:#1a237e;border-bottom:2px solid #e8eaf6;padding-bottom:12px;margin-bottom:20px;">Nova Opção de Resposta</h3>
      <input type="hidden" id="crRowIndex">
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Categoria</label>
        <select id="crCategoria" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
          <option value="_default">Padrão (todas as categorias)</option>
          ${(window.categoriasDisponiveis || []).map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:14px;margin-bottom:20px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Pontuação</label>
          <input type="number" id="crValor" min="0" max="10" placeholder="Ex: 3" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Rótulo</label>
          <input type="text" id="crLabel" placeholder="Ex: Alto impacto" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
      </div>
      <input type="hidden" id="crCor" value="#c62828">
      <input type="hidden" id="crBackground" value="#ffebee">
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalConfigResposta()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarConfigResposta()">Salvar</button>
      </div>
    </div></div>
  `;
}

window.abrirModalConfigResposta = (cat, idx) => {
  const isEdit = cat !== undefined && idx !== undefined;
  document.getElementById('modalConfigRespostaTitulo').textContent = isEdit ? 'Editar Opção' : 'Nova Opção de Resposta';
  if (isEdit) {
    const op = window.configRespostasData[cat][idx];
    // Calcular rowIndex real na planilha (header + posição)
    let rowIndex = 2;
    for (const c of Object.keys(window.configRespostasData)) {
      if (c === cat) { rowIndex += idx; break; }
      rowIndex += window.configRespostasData[c].length;
    }
    document.getElementById('crRowIndex').value = rowIndex;
    document.getElementById('crCategoria').value = cat;
    document.getElementById('crValor').value = op.valor;
    document.getElementById('crLabel').value = op.label;
    document.getElementById('crCor').value = op.cor;
    document.getElementById('crBackground').value = op.background;
  } else {
    document.getElementById('crRowIndex').value = '';
    document.getElementById('crCategoria').value = '_default';
    document.getElementById('crValor').value = '';
    document.getElementById('crLabel').value = '';
    document.getElementById('crCor').value = '#c62828';
    document.getElementById('crBackground').value = '#ffebee';
  }
  document.getElementById('modalConfigResposta').classList.add('open');
};

window.editarConfigResposta = (cat, idx) => abrirModalConfigResposta(cat, idx);

window.fecharModalConfigResposta = () => document.getElementById('modalConfigResposta').classList.remove('open');

window.salvarConfigResposta = async () => {
  const rowIndex = document.getElementById('crRowIndex').value;
  const valor = document.getElementById('crValor').value;
  const CORES = { '3': ['#c62828','#ffebee'], '2': ['#f57c00','#fff3e0'], '1': ['#2e7d32','#e8f5e9'], '0': ['#757575','#f5f5f5'] };
  const [cor, background] = CORES[valor] || ['#555','#f5f5f5'];
  const d = {
    categoria: document.getElementById('crCategoria').value,
    valor,
    label: document.getElementById('crLabel').value.trim(),
    cor,
    background,
  };
  if (!d.valor || !d.label) return showToast('Preencha pontuação e rótulo.', '#e65100');
  if (rowIndex) d.rowIndex = rowIndex;
  await API.salvarConfigResposta(d);
  API.invalidate('getConfigRespostas');
  fecharModalConfigResposta();
  showToast('✅ Salvo!', '#2e7d32');
  const config = await API.getConfigRespostas();
  window.configRespostasData = config;
  renderizarConfigRespostas(config);
};

window.excluirConfigResposta = async (cat, idx) => {
  if (!confirm('Excluir esta opção?')) return;
  let rowIndex = 2;
  for (const c of Object.keys(window.configRespostasData)) {
    if (c === cat) { rowIndex += idx; break; }
    rowIndex += window.configRespostasData[c].length;
  }
  await API.excluirConfigResposta({ rowIndex });
  API.invalidate('getConfigRespostas');
  showToast('🗑️ Excluído.', '#555');
  const config = await API.getConfigRespostas();
  window.configRespostasData = config;
  renderizarConfigRespostas(config);
};

window.salvarPergunta = async () => {
  const p = {
    id: document.getElementById('fId').value ? Number(document.getElementById('fId').value) : null,
    categoria: document.getElementById('fCategoria').value,
    pergunta: document.getElementById('fPergunta').value.trim(),
    descricao: document.getElementById('fDescricao').value.trim(),
    ativa: document.getElementById('fAtiva').checked,
  };
  if (!p.pergunta) return showToast('Informe a pergunta.', '#e65100');
  await API.salvarPergunta(p);
  fecharModal();
  showToast('✅ Salvo!', '#2e7d32');
  perguntas();
};

window.excluirPergunta = async (id) => {
  if (!confirm('Excluir esta pergunta?')) return;
  await API.excluirPergunta(id);
  showToast('🗑️ Excluído.', '#555');
  perguntas();
};

// ============================================================
// PÁGINA: ÁREAS (Tabela com ordenação)
// ============================================================
let areasOrdenacao = { coluna: 'nome', direcao: 'asc' };

async function areas() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Áreas</h2><p class="page-sub">Cadastre as áreas da empresa que participam do BIA</p></div>
      <button class="btn btn-primary" onclick="abrirModalArea()">+ Nova Área</button>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="lista" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarAreas('nome')" style="cursor:pointer;">Área <span id="sort-nome"></span></th>
            <th onclick="ordenarAreas('responsavel')" style="cursor:pointer;">Responsável <span id="sort-responsavel"></span></th>
            <th onclick="ordenarAreas('email')" style="cursor:pointer;">Email <span id="sort-email"></span></th>
            <th onclick="ordenarAreas('solucao')" style="cursor:pointer;">Solução <span id="sort-solucao"></span></th>
            <th style="width:100px;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modal"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalTitulo">Nova Área</h3>
      <input type="hidden" id="fId">
      <label>Nome da Área</label>
      <input type="text" id="fNome" placeholder="Ex: Segurança da Informação">
      <label>Responsável</label>
      <input type="text" id="fResponsavel" placeholder="Nome do gestor responsável">
      <label>Email</label>
      <input type="email" id="fEmail" placeholder="email@empresa.com">
      <label>Solução</label>
      <select id="fSolucao">
        <option value="">Selecione...</option>
        <option>Gestão Contábil</option>
        <option>Gestão de Pessoal</option>
        <option>Gestão Financeira</option>
        <option>Gestão Fiscal</option>
        <option>Gestão de Pessoas</option>
        <option>Gestão de TI</option>
        <option>Outras</option>
      </select>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarArea()">Salvar</button>
      </div>
    </div></div>`;

  const data = await API.getAreas();
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('lista').style.display = 'block';
  
  window.areasData = data;
  renderizarAreas();
}

function renderizarAreas() {
  const data = [...window.areasData];
  
  // Ordenar
  data.sort((a, b) => {
    const valA = (a[areasOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[areasOrdenacao.coluna] || '').toString().toLowerCase();
    const comparacao = valA.localeCompare(valB);
    return areasOrdenacao.direcao === 'asc' ? comparacao : -comparacao;
  });
  
  // Atualizar indicadores de ordenação
  ['nome', 'responsavel', 'email', 'solucao'].forEach(col => {
    const el = document.getElementById(`sort-${col}`);
    if (el) {
      if (col === areasOrdenacao.coluna) {
        el.textContent = areasOrdenacao.direcao === 'asc' ? '▲' : '▼';
      } else {
        el.textContent = '';
      }
    }
  });
  
  document.getElementById('rows').innerHTML = data.length
    ? data.map(a => `<tr>
        <td>${a.nome}</td>
        <td>${a.responsavel || ''}</td>
        <td>${a.email || ''}</td>
        <td>${a.solucao || ''}</td>
        <td style="text-align:center;">
          <button class="btn-icon" onclick="editarArea(${a.id})" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="excluirArea(${a.id})" title="Excluir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhuma área cadastrada.</td></tr>';
}

window.ordenarAreas = (coluna) => {
  if (areasOrdenacao.coluna === coluna) {
    areasOrdenacao.direcao = areasOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    areasOrdenacao.coluna = coluna;
    areasOrdenacao.direcao = 'asc';
  }
  renderizarAreas();
};

window.abrirModalArea = (a) => {
  document.getElementById('fId').value = a ? a.id : '';
  document.getElementById('fNome').value = a ? a.nome : '';
  document.getElementById('fResponsavel').value = a ? a.responsavel : '';
  document.getElementById('fEmail').value = a ? a.email : '';
  document.getElementById('fSolucao').value = a ? a.solucao : '';
  document.getElementById('modalTitulo').textContent = a ? 'Editar Área' : 'Nova Área';
  document.getElementById('modal').classList.add('open');
};

window.editarArea = (id) => abrirModalArea(window.areasData.find(a => a.id === id));

window.salvarArea = async () => {
  const a = {
    id: document.getElementById('fId').value ? Number(document.getElementById('fId').value) : null,
    nome: document.getElementById('fNome').value.trim(),
    responsavel: document.getElementById('fResponsavel').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    solucao: document.getElementById('fSolucao').value.trim(),
  };
  if (!a.nome) return showToast('Informe o nome da área.', '#e65100');
  await API.salvarArea(a);
  fecharModal();
  showToast('✅ Salvo!', '#2e7d32');
  areas();
};

window.excluirArea = async (id) => {
  if (!confirm('Excluir esta área?')) return;
  await API.excluirArea(id);
  showToast('🗑️ Excluído.', '#555');
  areas();
};

// ============================================================
// PÁGINA: PROCESSOS (Tabela com ordenação e filtro)
// ============================================================
let processosOrdenacao = { coluna: 'score', direcao: 'desc' };
let processosFiltroArea = '';
let processosFiltroTier = '';

async function processos() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Processos de Negócio</h2><p class="page-sub">Cadastre os processos críticos de cada área</p></div>
      <button class="btn btn-primary" onclick="abrirModalProcesso()">+ Novo Processo</button>
    </div>
    <div style="margin-bottom:16px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Área:</label>
        <select id="filtroArea" onchange="filtrarPorArea(this.value)" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
          <option value="">Todas as áreas</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Tier:</label>
        <select id="filtroTier" onchange="filtrarPorTier(this.value)" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:180px;">
          <option value="">Todos os tiers</option>
          <option value="Tier 1">Tier 1 (Crítico)</option>
          <option value="Tier 2">Tier 2 (Essencial)</option>
          <option value="Tier 3">Tier 3 (Suporte)</option>
          <option value="Pendente">Pendente</option>
        </select>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button id="btnEnviarArea" onclick="enviarParaArea()" style="display:none;padding:9px 18px;background:#1565c0;color:white;border:none;border-radius:7px;font-weight:600;font-size:0.88em;cursor:pointer;">
          ✉️ Enviar Questionário para Área
        </button>
        <button id="btnRelatorioArea" onclick="enviarRelatorioArea()" style="display:none;padding:9px 18px;background:#2e7d32;color:white;border:none;border-radius:7px;font-weight:600;font-size:0.88em;cursor:pointer;">
          📄 Enviar Relatório da Área
        </button>
      </div>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="lista" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarProcessos('area')" style="cursor:pointer;width:10%;">Área <span id="sort-area"></span></th>
            <th onclick="ordenarProcessos('processo')" style="cursor:pointer;width:14%;">Processo de Negócio <span id="sort-processo"></span></th>
            <th onclick="ordenarProcessos('responsavel')" style="cursor:pointer;width:9%;">Responsável <span id="sort-responsavel"></span></th>
            <th onclick="ordenarProcessos('status')" style="cursor:pointer;width:8%;">Tier <span id="sort-status"></span></th>
            <th onclick="ordenarProcessos('score')" style="cursor:pointer;width:6%;">Score <span id="sort-score"></span></th>
            <th onclick="ordenarProcessos('biaHomologada')" style="cursor:pointer;width:9%;">BIA Status <span id="sort-biaHomologada"></span></th>
            <th onclick="ordenarProcessos('bcpStatus')" style="cursor:pointer;width:9%;">BCP Status <span id="sort-bcpStatus"></span></th>
            <th onclick="ordenarProcessos('drpStatus')" style="cursor:pointer;width:9%;">DRP Status <span id="sort-drpStatus"></span></th>
            <th style="width:10%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modalDetalhes"><div class="modal" onclick="event.stopPropagation()" style="max-width:700px;max-height:90vh;overflow-y:auto;">
      <h3 id="modalDetalhesTitulo">Detalhes do Processo</h3>
      <div id="modalDetalhesConteudo"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalDetalhes()">Fechar</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="modalEnviar"><div class="modal" onclick="event.stopPropagation()" style="max-width:480px;">
      <h3 style="font-size:1.1em;font-weight:700;color:#1a237e;border-bottom:2px solid #e8eaf6;padding-bottom:12px;margin-bottom:20px;">Enviar Questionário por E-mail</h3>
      <input type="hidden" id="enviarProcessoId">
      <p id="enviarProcessoNome" style="font-size:0.9em;color:#555;margin-bottom:20px;"></p>
      <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">E-mail do Respondente</label>
      <input type="email" id="enviarEmail" placeholder="nome@empresa.com" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;margin-bottom:8px;">
      <p style="font-size:0.8em;color:#888;margin-bottom:20px;">O respondente receberá um link único válido por 7 dias.</p>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalEnviar()">Cancelar</button>
        <button class="btn btn-primary" onclick="enviarConvite()">Enviar</button>
      </div>
    </div></div>
    <div class="drawer-overlay" id="drawerOverlayAvaliar" onclick="fecharModalAvaliar()"></div>
    <div class="drawer" id="drawerAvaliar">
      <div class="drawer-resize" id="drawerResizeAvaliar"></div>
      <div class="drawer-header">
        <div>
          <h3 id="modalAvaliarTitulo" style="margin:0;">Avaliar Processo</h3>
          <p id="modalAvaliarNome" style="color:#888;font-size:0.85em;margin:4px 0 0;"></p>
        </div>
        <button onclick="fecharModalAvaliar()" style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#999;line-height:1;flex-shrink:0;">&times;</button>
      </div>
      <div class="drawer-body">
        <input type="hidden" id="qProcessoId">
        <input type="hidden" id="qArea">
        <input type="hidden" id="qProcesso">
        <div style="background:#f0f4ff;border-left:4px solid #1a237e;border-radius:0 7px 7px 0;padding:14px 18px;margin-bottom:24px;">
          <div style="font-size:0.78em;font-weight:700;color:#1a237e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📋 Premissas da Avaliação</div>
          <ul style="margin:0;padding-left:18px;">
            <li style="font-size:0.88em;color:#333;line-height:1.6;">O impacto deve ser avaliado, considerando a indisponibilidade/falha do processo no momento em que seja necessário utilizá-lo.</li>
          </ul>
        </div>
        <div id="perguntas-container"></div>
        <div style="background:linear-gradient(135deg,#1a237e,#283593);padding:20px;border-radius:8px;margin:20px 0;color:white;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-weight:600;font-size:1.1em;">Score Total</span>
            <span id="scoreTotal" style="font-size:2.5em;font-weight:700;">0</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.2);">
            <span style="font-weight:600;">Classificação:</span>
            <span id="scoreTier" style="font-weight:700;font-size:1.2em;padding:6px 16px;background:rgba(255,255,255,0.2);border-radius:20px;"></span>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost" onclick="fecharModalAvaliar()">Cancelar</button>
        <button class="btn btn-ghost" onclick="imprimirAvaliacao()" style="color:#1565c0;border-color:#1565c0;">🖨️ Exportar PDF</button>
        <button class="btn btn-primary" onclick="salvarAvaliacaoProcesso()">Salvar Avaliação</button>
      </div>
    </div>
    <div class="drawer-overlay" id="drawerOverlayProcesso" onclick="fecharModal()"></div>
    <div class="drawer" id="drawerProcesso">
      <div class="drawer-resize" id="drawerResize"></div>
      <div class="drawer-header">
        <h3 id="modalTitulo">Novo Processo</h3>
        <button onclick="fecharModal()" style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#999;line-height:1;">&times;</button>
      </div>
      <div class="drawer-body" style="padding:0;display:flex;flex-direction:column;">
        <div style="display:flex;border-bottom:2px solid #e8eaf6;background:white;flex-shrink:0;">
          <button id="tab-identificacao" onclick="trocarAbaProcesso('identificacao')" style="flex:1;padding:12px;border:none;background:none;font-size:0.88em;font-weight:700;color:#1a237e;border-bottom:3px solid #1a237e;cursor:pointer;">Identificação</button>
          <button id="tab-avaliacao" onclick="trocarAbaProcesso('avaliacao')" style="flex:1;padding:12px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Avaliação</button>
          <button id="tab-bia" onclick="trocarAbaProcesso('bia')" style="flex:1;padding:12px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">BIA</button>
          <button id="tab-bcp" onclick="trocarAbaProcesso('bcp')" style="flex:1;padding:12px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">BCP</button>
          <button id="tab-drp" onclick="trocarAbaProcesso('drp')" style="flex:1;padding:12px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">DRP</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;">
          <input type="hidden" id="fId">

          <!-- ABA: IDENTIFICACAO -->
          <div id="painel-identificacao">
            <div style="margin-bottom:20px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Processo de Negócio</label>
              <input type="text" id="fProcesso" placeholder="Ex: Gestão de Identidades e Acessos" style="width:100%;padding:10px 12px;border:2px solid #1a237e;border-radius:7px;font-size:1em;font-weight:600;box-sizing:border-box;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Área</label>
                <select id="fArea" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;"></select>
              </div>
              <div>
                <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Dono do Processo</label>
                <input type="text" id="fDono" placeholder="Responsável pela área" readonly style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;background:#f9f9f9;color:#555;">
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Descrição Funcional</label>
              <textarea id="fDescricaoFuncional" rows="4" placeholder="Descreva a função deste processo" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;resize:vertical;box-sizing:border-box;"></textarea>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Criticidade (Pré-Avaliação)</label>
              <select id="fTierManual" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
                <option value="">Não definido</option>
                <option value="Tier 1 (Crítico)">Tier 1 (Crítico)</option>
                <option value="Tier 2 (Essencial)">Tier 2 (Essencial)</option>
                <option value="Tier 3 (Suporte)">Tier 3 (Suporte)</option>
              </select>
              <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Indica a criticidade percebida antes da avaliação formal. Após a avaliação, o tier calculado prevalece.</span>
            </div>
          </div>

          <!-- ABA: AVALIAÇÃO -->
          <div id="painel-avaliacao" style="display:none;">
            <div id="avaliacaoScoreResumo" style="margin-bottom:20px;"></div>
            <div id="avaliacaoPerguntas"></div>
          </div>

          <!-- ABA: BIA -->
          <div id="painel-bia" style="display:none;">
            <div id="fBiaScoreInfo" style="margin-bottom:20px;"></div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">BIA Status</label>
              <select id="fBiaHomologada" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
                <option value="">Selecione...</option>
                <option>Processo Não Avaliado</option>
                <option>Processo Avaliado</option>
                <option>BIA Realizado</option>
              </select>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Descrição do Impacto para Indisponibilidade</label>
              <p style="font-size:0.78em;color:#888;margin-bottom:6px;">O que acontece se o processo parar? Pense nos impactos para clientes, financeiro, operação e reputação.</p>
              <textarea id="fDescricao" rows="3" placeholder="Ex: Clientes não recebem boletos, causando atraso no fluxo de caixa e reclamações..." style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;resize:vertical;box-sizing:border-box;"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RTO Esperado</label>
                <select id="fRTO" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
                  <option value="">Selecione...</option>
                  <option value="< 1 hora">Menos de 1 hora</option>
                  <option value="< 4 horas">Até 4 horas</option>
                  <option value="4h a 8h">4 a 8 horas</option>
                  <option value="8h a 24h">8 a 24 horas</option>
                  <option value="> 24 horas">Mais de 24 horas</option>
                </select>
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Quanto tempo pode ficar parado sem causar dano grave?</span>
              </div>
              <div>
                <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RPO Esperado</label>
                <select id="fRPO" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
                  <option value="">Selecione...</option>
                  <option value="0 (nenhuma perda)">Nenhuma perda</option>
                  <option value="< 1 hora">Até 1 hora</option>
                  <option value="< 4 horas">Até 4 horas</option>
                  <option value="24 horas">24 horas</option>
                  <option value="> 24 horas">Mais de 24 horas</option>
                </select>
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Quantas horas de dados pode perder?</span>
              </div>
              <div>
                <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">MTD</label>
                <select id="fMTD" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
                  <option value="">Selecione...</option>
                  <option value="4 horas">4 horas</option>
                  <option value="8 horas">8 horas</option>
                  <option value="24 horas">24 horas</option>
                  <option value="48 horas">48 horas</option>
                  <option value="72 horas">72 horas</option>
                  <option value="> 72 horas">Mais de 72 horas</option>
                </select>
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Tempo máximo que a empresa suporta sem o processo?</span>
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Dependências Críticas</label>
              <p style="font-size:0.78em;color:#888;margin-bottom:8px;">Pense: <em>"Se esse recurso falhar, meu processo para?"</em> — se sim, ele é uma dependência crítica. Clique nas opções disponíveis ou digite para adicionar.</p>
              <div id="fDependenciaTabela"></div>
              <input type="hidden" id="fDependencia">
              <div style="margin-top:12px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-ghost" onclick="copiarLinkBIA()" style="font-size:0.82em;color:#555;border-color:#ccc;padding:6px 14px;" title="Gera o link e copia para a área de transferência">🔗 Copiar link</button>
                <button class="btn btn-ghost" onclick="enviarBIADependencias()" style="font-size:0.82em;color:#1a237e;border-color:#1a237e;padding:6px 14px;" title="Envia formulário por e-mail">📧 Enviar por e-mail</button>
              </div>
            </div>

          </div>

          <!-- ABA: BCP -->
          <div id="painel-bcp" style="display:none;">
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">BCP Status</label>
              <select id="fBcpStatus" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
                <option value="">Selecione...</option>
                <option>BCP Pendente</option>
                <option>BCP em Andamento</option>
                <option>BCP Realizado</option>
              </select>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">Informações de Contato e Matriz de Responsabilidade</label>
              <div id="bcpContatosTabela"></div>
              <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
                <div style="flex:1;position:relative;">
                  <input type="text" id="bcpContatoBusca" placeholder="Buscar contato por nome, setor ou categoria..." autocomplete="off" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;" onfocus="mostrarDropdownContatoBcp()" oninput="mostrarDropdownContatoBcp()">
                  <div id="bcpContatoDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1.5px solid #e0e0e0;border-top:none;border-radius:0 0 7px 7px;max-height:220px;overflow-y:auto;z-index:50;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
                </div>
                <button class="btn btn-ghost" onclick="abrirModalDepBcp()" style="padding:8px 14px;font-size:0.85em;white-space:nowrap;" title="Criar nova dependência">+ Novo</button>
              </div>
              <select id="bcpContatoSelect" style="display:none;"><option value=""></option></select>
              <div class="modal-overlay" id="modalDepBcp"><div class="modal" onclick="event.stopPropagation()" style="max-width:540px;">
                <h3 id="modalDepBcpTitulo">Nova Dependência</h3>
                <input type="hidden" id="depBcpId">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Categoria</label>
                    <input type="text" id="depBcpCategoria" list="depBcpCatList" placeholder="Ex: Pessoas" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                    <datalist id="depBcpCatList"></datalist>
                  </div>
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Nome</label>
                    <input type="text" id="depBcpNome" placeholder="Ex: João Silva" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Papel na Crise</label>
                    <input type="text" id="depBcpDetalhes" placeholder="Ex: Coordenador do Plano" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Setor</label>
                    <input type="text" id="depBcpSetor" placeholder="Ex: TI" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Telefone</label>
                    <input type="text" id="depBcpTelefone" placeholder="(00) 0000-0000" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">E-mail</label>
                    <input type="email" id="depBcpEmail" placeholder="email@empresa.com" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                </div>
                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Empresa</label>
                  <input type="text" id="depBcpEmpresa" placeholder="Ex: Fortes Tecnologia" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                </div>
                <input type="hidden" id="depBcpEndereco">
                <div class="modal-footer">
                  <button class="btn btn-ghost" onclick="fecharModalDepBcp()">Cancelar</button>
                  <button class="btn btn-primary" onclick="salvarDepBcp()">Salvar</button>
                </div>
              </div></div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">Fornecedores</label>
              <div id="bcpFornecedoresTabela"></div>
            </div>
          </div>

          <!-- ABA: DRP -->
          <div id="painel-drp" style="display:none;">
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">DRP Status</label>
              <select id="fDrpStatus" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
                <option value="">Selecione...</option>
                <option>DRP Pendente</option>
                <option>DRP em Andamento</option>
                <option>DRP Realizado</option>
              </select>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">Componentes do Serviço</label>
              <div id="drpComponentesTabela"></div>
              <div class="modal-overlay" id="modalCompDrp"><div class="modal" onclick="event.stopPropagation()" style="max-width:540px;">
                <h3 id="modalCompDrpTitulo">Novo Componente</h3>
                <input type="hidden" id="compDrpId">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Tipo</label>
                    <input type="text" id="compDrpTipo" list="compDrpTipoList" placeholder="Ex: Servidor, Banco de Dados" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                    <datalist id="compDrpTipoList"></datalist>
                  </div>
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Nome</label>
                    <input type="text" id="compDrpNome" placeholder="Ex: SQL Server Produção" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                </div>
                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Descrição</label>
                  <input type="text" id="compDrpDescricao" placeholder="Descrição do componente" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">RTO</label>
                    <input type="text" id="compDrpRto" placeholder="Ex: 4 horas" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">RPO</label>
                    <input type="text" id="compDrpRpo" placeholder="Ex: 1 hora" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                  </div>
                </div>
                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Estratégia de Backup</label>
                  <select id="compDrpEstrategia" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;">
                    <option value="">Selecione...</option>
                    <option value="Backup & Restore">Backup & Restore (Restaurar ambiente a partir de backups)</option>
                    <option value="Cold Site">Cold Site (Local alternativo sem infraestrutura ativa)</option>
                    <option value="Warm Standby">Warm Standby (Infraestrutura parcialmente pronta)</option>
                    <option value="Active-Passive">Active-Passive (Ambiente secundário pronto para assumir)</option>
                    <option value="Active-Active">Active-Active (Dois ou mais ambientes ativos simultaneamente)</option>
                  </select>
                </div>
                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Responsável</label>
                  <input type="text" id="compDrpResponsavel" placeholder="Responsável pelo componente" style="width:100%;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.9em;box-sizing:border-box;">
                </div>
                <div class="modal-footer">
                  <button class="btn btn-ghost" onclick="fecharModalCompDrp()">Cancelar</button>
                  <button class="btn btn-primary" onclick="salvarCompDrp()">Salvar</button>
                </div>
              </div></div>
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;align-items:center;">
                <button class="btn btn-ghost" onclick="abrirModalCompDrp()" style="font-size:0.82em;color:#555;border-color:#ccc;padding:6px 14px;" title="Criar novo componente que não está no catálogo">+ Novo componente</button>
                <button class="btn btn-ghost" onclick="copiarLinkDRP()" style="font-size:0.82em;color:#555;border-color:#ccc;padding:6px 14px;" title="Gera o link e copia para a área de transferência">🔗 Copiar link</button>
                <button class="btn btn-ghost" onclick="enviarDRPComponentes()" style="font-size:0.82em;color:#1a237e;border-color:#1a237e;padding:6px 14px;" title="Envia formulário por e-mail para o dono do processo">📧 Enviar por e-mail</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-ghost" onclick="gerarDossieProcesso()" style="color:#1565c0;border-color:#1565c0;">📄 Dossiê</button>
        <button class="btn btn-ghost" onclick="abrirPCNSalvo()" id="btnPcnSalvo" style="color:#2e7d32;border-color:#2e7d32;display:none;">📂 Abrir PCN</button>
        <button class="btn btn-ghost" onclick="gerarPCNProcesso()" style="color:#2e7d32;border-color:#2e7d32;">🤖 Gerar PCN</button>
        <button class="btn btn-primary" onclick="salvarProcesso()">Salvar</button>
      </div>
    </div>`;

  const [processos, areas, perguntas] = await Promise.all([API.getProcessos(), API.getAreas(), API.getPerguntas()]);
  window.processosPerguntas = perguntas.filter(p => p.ativa);
  try { window.configRespostas = await API.getConfigRespostas(); } catch(e) { window.configRespostas = null; }
  try { window.dependenciasCatalogo = await API.getDependencias(); } catch(e) { window.dependenciasCatalogo = []; }
  try { window.componentesCatalogo = await API.getComponentes(); } catch(e) { window.componentesCatalogo = []; }
  
  // Preencher filtro de áreas
  const filtroArea = document.getElementById('filtroArea');
  const areasUnicas = [...new Set(areas.map(a => a.nome))].sort();

  // Gestor: filtrar apenas sua area e ocultar controles de outras areas
  if (window.USER_PERFIL !== 'admin' && window.USER_AREA) {
    processosFiltroArea = window.USER_AREA;
    filtroArea.innerHTML = `<option value="${window.USER_AREA}">${window.USER_AREA}</option>`;
    filtroArea.disabled = true;
    const btnEnviar = document.getElementById('btnEnviarArea');
    const btnRelatorio = document.getElementById('btnRelatorioArea');
    if (btnEnviar) btnEnviar.style.display = 'none';
    if (btnRelatorio) btnRelatorio.style.display = 'none';
  } else if (window.USER_PERFIL !== 'admin' && !window.USER_AREA) {
    // Gestor sem área: bloquear acesso
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const listaEl = document.getElementById('listaProcessos');
    if (listaEl) {
      listaEl.style.display = 'block';
      listaEl.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:3em;margin-bottom:16px;">🔒</div>
          <h3 style="color:#666;margin-bottom:8px;">Acesso não configurado</h3>
          <p>Seu e-mail ainda não está vinculado a uma área. Solicite ao administrador que configure seu acesso.</p>
        </div>`;
    }
    return;
  } else {
    filtroArea.innerHTML = '<option value="">Todas as áreas</option>' +
      areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
  }
  
  // Enriquecer processos com dados da área
  const processosEnriquecidos = processos.map(p => {
    const area = areas.find(a => a.nome === p.area);
    return {
      ...p,
      responsavelArea: area ? area.responsavel : '',
      solucao: area ? area.solucao : ''
    };
  });
  
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('lista').style.display = 'block';
  
  window.processosData = processosEnriquecidos;
  window.areasDisponiveis = areas;
  renderizarProcessos();
}

function renderizarProcessos() {
  let data = [...window.processosData];
  
  // Filtrar por área
  if (processosFiltroArea) {
    data = data.filter(p => p.area === processosFiltroArea);
  }

  // Filtrar por tier
  if (processosFiltroTier) {
    data = data.filter(p => {
      const tier = p.score >= 12 ? 'Tier 1' : p.score >= 6 ? 'Tier 2' : (p.avaliado || p.score > 0) ? 'Tier 3' : (p.tierManual ? p.tierManual.split(' ')[0] + ' ' + p.tierManual.split(' ')[1] : 'Pendente');
      return tier === processosFiltroTier;
    });
  }
  
  // Ordenar
  data.sort((a, b) => {
    if (processosOrdenacao.coluna === 'score' || processosOrdenacao.coluna === 'status') {
      const diff = (a.score || 0) - (b.score || 0);
      return processosOrdenacao.direcao === 'asc' ? diff : -diff;
    }
    const valA = (a[processosOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[processosOrdenacao.coluna] || '').toString().toLowerCase();
    const comparacao = valA.localeCompare(valB);
    return processosOrdenacao.direcao === 'asc' ? comparacao : -comparacao;
  });
  
  // Atualizar indicadores de ordenação
  ['area', 'processo', 'status', 'score', 'responsavel', 'solucao', 'biaHomologada', 'bcpStatus', 'drpStatus'].forEach(col => {
    const el = document.getElementById(`sort-${col}`);
    if (el) {
      if (col === processosOrdenacao.coluna) {
        el.textContent = processosOrdenacao.direcao === 'asc' ? '▲' : '▼';
      } else {
        el.textContent = '';
      }
    }
  });
  
  document.getElementById('rows').innerHTML = data.length
    ? data.map(p => {
        const status = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.avaliado ? 'Tier 3 (Suporte)' : (p.tierManual || 'Pendente');
        const statusColor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : p.avaliado ? '#1565c0' : (p.tierManual === 'Tier 1 (Crítico)' ? '#c62828' : p.tierManual === 'Tier 2 (Essencial)' ? '#f57c00' : p.tierManual === 'Tier 3 (Suporte)' ? '#1565c0' : '#999');
        return `<tr style="cursor:pointer;" onclick="editarProcesso(${p.id})">
        <td>${p.area}</td>
        <td><strong>${p.processo}</strong></td>
        <td>${p.responsavelArea || p.responsavel || ''}</td>
        <td><span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.8em;font-weight:600;color:white;background:${statusColor};">${status}</span></td>
        <td style="text-align:center;font-weight:700;color:${p.avaliado || p.score > 0 ? statusColor : '#bbb'};font-size:0.95em;">${p.avaliado || p.score > 0 ? p.score : '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.biaHomologada || '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.bcpStatus || '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.drpStatus || '-'}</td>
        <td style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation();">
          <button class="btn-icon" onclick="editarProcesso(${p.id})" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="avaliarProcesso(${p.id})" title="Avaliar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a237e" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="abrirModalEnviar(${p.id})" title="Enviar por e-mail">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </button>
          ${p.pcnSalvo ? `<button class="btn-icon" onclick="abrirPCNDireto(${p.id})" title="Abrir PCN">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </button>` : ''}
          <button class="btn-icon" onclick="excluirProcesso(${p.id})" title="Excluir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>`;
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#999;padding:40px;">${processosFiltroArea ? 'Nenhum processo encontrado para esta área.' : 'Nenhum processo cadastrado.'}</td></tr>`;
}

window.filtrarPorArea = (area) => {
  processosFiltroArea = area;
  const btn = document.getElementById('btnEnviarArea');
  if (btn) btn.style.display = area ? 'block' : 'none';
  const btnRel = document.getElementById('btnRelatorioArea');
  if (btnRel) btnRel.style.display = area ? 'block' : 'none';
  renderizarProcessos();
};

window.filtrarPorTier = (tier) => {
  processosFiltroTier = tier;
  renderizarProcessos();
};

window.enviarRelatorioArea = async () => {
  const area = processosFiltroArea;
  if (!area) return;
  const areaObj = window.areasDisponiveis.find(a => a.nome === area);
  if (!areaObj || !areaObj.email) return showToast('E-mail do responsável não cadastrado para esta área.', '#e65100');
  if (!confirm(`Enviar relatório de "${area}" para ${areaObj.responsavel} (${areaObj.email})?`)) return;
  try {
    showToast('⏳ Gerando relatório...', '#1565c0');
    const formData = new FormData();
    formData.append('action', 'gerarRelatorioArea');
    formData.append('area', area);
    formData.append('email', areaObj.email);
    const res = await fetch(API_URL, { method: 'POST', body: formData });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    showToast('✅ Relatório enviado para ' + areaObj.email, '#2e7d32');
  } catch(err) {
    showToast('❌ Erro: ' + err.message, '#c62828');
  }
};

window.enviarParaArea = async () => {
  const area = processosFiltroArea;
  if (!area) return;
  const areaObj = window.areasDisponiveis.find(a => a.nome === area);
  if (!areaObj || !areaObj.email) return showToast('E-mail do responsável não cadastrado para esta área.', '#e65100');
  if (!confirm(`Enviar questionário para ${areaObj.responsavel} (${areaObj.email})?`)) return;
  try {
    const formData = new FormData();
    formData.append('action', 'gerarTokenArea');
    formData.append('area', area);
    formData.append('email', areaObj.email);
    formData.append('nomeResponsavel', areaObj.responsavel || '');
    const res = await fetch(API_URL, { method: 'POST', body: formData });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    showToast('✅ Questionário enviado para ' + areaObj.email, '#2e7d32');
  } catch(err) {
    showToast('❌ Erro: ' + err.message, '#c62828');
  }
};

window.ordenarProcessos = (coluna) => {
  if (processosOrdenacao.coluna === coluna) {
    processosOrdenacao.direcao = processosOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    processosOrdenacao.coluna = coluna;
    processosOrdenacao.direcao = 'asc';
  }
  renderizarProcessos();
};

// ============================================================
// COMPONENTE: Tags de Dependência com Autocomplete
// ============================================================
window._dependenciaSelecionadas = [];

function initDependenciaTags(valorAtual) {
  // Parsear valor atual (string separada por vírgula) e remover duplicatas
  window._dependenciaSelecionadas = valorAtual 
    ? [...new Set(valorAtual.split(',').map(s => s.trim()).filter(Boolean))]
    : [];
  
  renderDependenciaTabela();
}

function renderDependenciaTags() {
  // Atualizar hidden input e re-renderizar tabela
  document.getElementById('fDependencia').value = window._dependenciaSelecionadas.join(', ');
  renderDependenciaTabela();
}

function renderDependenciaTabela() {
  const tabelaContainer = document.getElementById('fDependenciaTabela');
  if (!tabelaContainer) return;
  const catalogo = window.dependenciasCatalogo || [];
  const selecionadas = window._dependenciaSelecionadas || [];
  
  // Ícones por categoria
  const catIcons = {
    'Fornecedores': '🏢', 'Fornecedor': '🏢',
    'Infraestrutura': '⚡',
    'Pessoas': '👤', 'Pessoa': '👤',
    'Sistemas': '💻', 'Sistema': '💻',
    'Outros': '📦'
  };
  
  // Obter categorias do catálogo
  const categoriasSet = new Set(catalogo.map(d => d.categoria));
  selecionadas.forEach(nome => {
    const dep = catalogo.find(d => d.nome === nome);
    if (dep) categoriasSet.add(dep.categoria);
  });
  const categorias = [...categoriasSet].sort();
  
  if (!categorias.length) {
    tabelaContainer.innerHTML = '<p style="font-size:0.85em;color:#999;padding:8px 0;">Nenhuma dependência cadastrada no catálogo.</p>';
    return;
  }
  
  // Agrupar selecionadas por categoria
  const grupos = {};
  categorias.forEach(cat => { grupos[cat] = []; });
  selecionadas.forEach(nome => {
    // Buscar TODAS as categorias onde esse nome existe no catálogo
    const deps = catalogo.filter(d => d.nome === nome);
    if (deps.length > 1) {
      // Item existe em múltiplas categorias — mostrar em todas
      deps.forEach(dep => {
        if (grupos[dep.categoria] && !grupos[dep.categoria].includes(nome)) {
          grupos[dep.categoria].push(nome);
        }
      });
    } else {
      const cat = deps.length ? deps[0].categoria : 'Outros';
      if (!grupos[cat]) grupos[cat] = [];
      if (!grupos[cat].includes(nome)) grupos[cat].push(nome);
    }
  });
  
  let html = `<table style="width:100%;border-collapse:collapse;font-size:0.9em;">
    <thead>
      <tr>
        <th style="padding:12px 0;text-align:left;font-weight:600;color:#555;font-size:0.82em;border-bottom:1.5px solid #e0e0e0;width:28%;">Tipo de Dependência</th>
        <th style="padding:12px 0 12px 20px;text-align:left;font-weight:600;color:#555;font-size:0.82em;border-bottom:1.5px solid #e0e0e0;">Recursos Necessários para Continuidade</th>
      </tr>
    </thead>
    <tbody>`;
  
  categorias.forEach((cat) => {
    const recursos = grupos[cat] || [];
    const icon = catIcons[cat] || '📦';
    const count = recursos.length;
    
    // Exemplos por categoria
    const catExamples = {
      'Fornecedores': 'Ex: Provedor de internet, empresa de energia, gráfica, banco, transportadora, software terceirizado',
      'Fornecedor': 'Ex: Provedor de internet, empresa de energia, gráfica, banco, transportadora, software terceirizado',
      'Infraestrutura': 'Ex: Internet, energia elétrica, climatização, switches/roteadores, servidor de banco de dados, telefonia',
      'Pessoas': 'Ex: DBA, analista financeiro, gerente aprovador, operador do sistema, técnico especialista',
      'Pessoa': 'Ex: DBA, analista financeiro, gerente aprovador, operador do sistema, técnico especialista',
      'Sistemas': 'Ex: ERP Fortes, banco de dados PostgreSQL/Oracle, e-mail corporativo, Active Directory, sistema bancário',
      'Sistema': 'Ex: ERP Fortes, banco de dados PostgreSQL/Oracle, e-mail corporativo, Active Directory, sistema bancário'
    };
    const example = catExamples[cat] || '';
    
    const tags = recursos.map((nome) => {
      const globalIdx = selecionadas.indexOf(nome);
      const dep = catalogo.find(d => d.nome === nome);
      const tooltip = dep ? [dep.empresa, dep.detalhes, dep.telefone].filter(Boolean).join(' • ') : '';
      return `<span class="dep-tag-item" style="display:inline-flex;align-items:center;gap:3px;background:#1a237e;color:white;padding:4px 10px 4px 12px;border-radius:14px;font-size:0.85em;font-weight:500;white-space:nowrap;cursor:default;" title="${tooltip ? tooltip.replace(/"/g, '&quot;') : nome}">${nome}<button onclick="removerDependenciaTag(${globalIdx})" style="background:none;border:none;cursor:pointer;font-size:1.1em;color:rgba(255,255,255,0.7);line-height:1;padding:0 3px;" onmouseenter="this.style.color='white'" onmouseleave="this.style.color='rgba(255,255,255,0.7)'" title="Remover">&times;</button></span>`;
    }).join(' ');
    
    const emptyMsg = !count ? `<span style="font-size:0.82em;color:#bbb;font-style:italic;">Nenhum recurso mapeado</span>` : '';
    
    // Chips de itens disponíveis no catálogo (não selecionados)
    const disponiveisNaCat = catalogo.filter(d => d.categoria === cat && !selecionadas.includes(d.nome));
    const chips = disponiveisNaCat.map(d => {
      return `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.78em;font-weight:500;background:#f5f6fa;color:#1a237e;cursor:pointer;border:1px solid #e0e0e0;transition:all 0.15s;" onmouseenter="this.style.background='#c5cae9';this.style.borderColor='#1a237e'" onmouseleave="this.style.background='#f5f6fa';this.style.borderColor='#e0e0e0'" onclick="selecionarDependenciaCategoria('${d.nome.replace(/'/g, "\\'")}')" title="${[d.empresa, d.detalhes].filter(Boolean).join(' • ') || d.nome}">${d.nome}</span>`;
    }).join(' ');

    html += `
      <tr>
        <td style="padding:14px 0;color:#222;font-weight:600;font-size:0.92em;vertical-align:top;border-bottom:1px solid #f0f0f0;">
          <span style="margin-right:4px;">${icon}</span>${cat}${count ? ` <span style="font-size:0.75em;color:#888;font-weight:400;">(${count})</span>` : ''}
          ${example ? `<div style="font-size:0.72em;font-weight:400;color:#999;margin-top:4px;line-height:1.4;font-style:italic;">${example}</div>` : ''}
        </td>
        <td style="padding:10px 0 10px 20px;color:#444;font-size:0.9em;line-height:2;border-bottom:1px solid #f0f0f0;vertical-align:middle;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            ${tags}
            ${emptyMsg}
            <div style="position:relative;flex:1;min-width:180px;display:flex;align-items:center;gap:4px;">
              <input type="text" class="dep-cat-input" data-categoria="${cat}" placeholder="Digite para buscar ou criar..." autocomplete="off" style="border:none;border-bottom:1.5px solid #e8eaf6;outline:none;font-size:0.88em;padding:5px 2px;width:100%;background:transparent;transition:border-color 0.2s;" onfocus="this.style.borderColor='#1a237e';mostrarDropdownCategoria(this,'${cat.replace(/'/g, "\\'")}')" oninput="mostrarDropdownCategoria(this,'${cat.replace(/'/g, "\\'")}')" onblur="this.style.borderColor='#e8eaf6';setTimeout(()=>{const dd=this.parentElement.querySelector('.dep-cat-dropdown');if(dd)dd.style.display='none';},200)">
              <div class="dep-cat-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1.5px solid #e0e0e0;border-radius:0 0 7px 7px;max-height:200px;overflow-y:auto;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,0.12);"></div>
            </div>
          </div>
          ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed #f0f0f0;"><span style="font-size:0.7em;color:#999;margin-right:4px;">Disponíveis:</span>${chips}</div>` : ''}
        </td>
      </tr>`;
  });
  
  html += `</tbody></table>`;
  tabelaContainer.innerHTML = html;
  
  // Atualizar hidden input
  document.getElementById('fDependencia').value = selecionadas.join(', ');
  
  // Adicionar listeners nos inputs
  tabelaContainer.querySelectorAll('.dep-cat-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        const cat = input.dataset.categoria;
        if (val) {
          // Se existe no catálogo, selecionar diretamente
          const catalogo = window.dependenciasCatalogo || [];
          const existe = catalogo.find(d => d.nome.toLowerCase() === val.toLowerCase() && d.categoria === cat);
          if (existe && !window._dependenciaSelecionadas.includes(existe.nome)) {
            selecionarDependenciaCategoria(existe.nome);
            input.value = '';
          } else {
            // Mostrar dropdown com opção de criar
            mostrarDropdownCategoria(input, cat);
          }
        }
      } else if (e.key === 'Escape') {
        const dd = input.parentElement.querySelector('.dep-cat-dropdown');
        if (dd) dd.style.display = 'none';
        input.blur();
      }
    });
  });
}

window.mostrarDropdownCategoria = (input, categoria) => {
  const dropdown = input.parentElement.querySelector('.dep-cat-dropdown');
  if (!dropdown) return;
  const catalogo = window.dependenciasCatalogo || [];
  const filtro = input.value.toLowerCase();
  
  const disponiveis = catalogo.filter(d => 
    d.categoria === categoria &&
    !window._dependenciaSelecionadas.includes(d.nome) &&
    (filtro === '' || d.nome.toLowerCase().includes(filtro))
  );
  
  if (!disponiveis.length && !input.value.trim()) {
    dropdown.style.display = 'none';
    return;
  }
  
  let html = '';
  disponiveis.forEach(d => {
    const info = [d.empresa, d.detalhes].filter(Boolean).join(' • ');
    html += `<div class="dep-option" onmousedown="selecionarDependenciaCategoria('${d.nome.replace(/'/g, "\\'")}')" style="padding:8px 12px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #f8f8f8;">
      <div style="font-size:0.9em;font-weight:500;color:#222;">${d.nome}</div>
      ${info ? `<div style="font-size:0.75em;color:#888;margin-top:2px;">${info}</div>` : ''}
    </div>`;
  });
  
  if (input.value.trim() && !catalogo.some(d => d.nome.toLowerCase() === input.value.trim().toLowerCase())) {
    html += `<div class="dep-option" onmousedown="adicionarDependenciaCategoria('${input.value.trim().replace(/'/g, "\\'")}','${categoria.replace(/'/g, "\\'")}')" style="padding:9px 12px;cursor:pointer;color:#1a237e;font-weight:600;border-top:1.5px solid #e8eaf6;background:#f8f9ff;">+ Criar "${input.value.trim()}"</div>`;
  }
  
  if (!html) {
    dropdown.style.display = 'none';
    return;
  }
  
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
  
  dropdown.querySelectorAll('.dep-option').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = '#f0f4ff');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });
};

window.selecionarDependenciaCategoria = (nome) => {
  if (!window._dependenciaSelecionadas.includes(nome)) {
    window._dependenciaSelecionadas.push(nome);
    renderDependenciaTabela();
  }
};

window.adicionarDependenciaCategoria = (nome, categoria) => {
  if (!window._dependenciaSelecionadas.includes(nome)) {
    window._dependenciaSelecionadas.push(nome);
  }
  // Verificar se existe no catálogo COM esta categoria específica
  const existeNaCategoria = (window.dependenciasCatalogo || []).some(d => d.nome.toLowerCase() === nome.toLowerCase() && d.categoria === categoria);
  if (!existeNaCategoria) {
    // Adicionar ao catálogo local e salvar no backend
    const novaDep = { id: null, categoria, nome };
    window.dependenciasCatalogo.push(novaDep);
    API.invalidate('getDependencias');
    API.salvarDependencia({ categoria, nome }).then(r => {
      novaDep.id = r.id;
    });
  }
  renderDependenciaTabela();
};

window.removerDependenciaTag = (idx) => {
  window._dependenciaSelecionadas.splice(idx, 1);
  renderDependenciaTabela();
};

// ============================================================
// BCP - Modal de Criar/Editar Dependência inline
// ============================================================
window.abrirModalDepBcp = (d) => {
  document.getElementById('depBcpId').value = d ? d.id : '';
  document.getElementById('depBcpCategoria').value = d ? d.categoria : '';
  document.getElementById('depBcpNome').value = d ? d.nome : '';
  document.getElementById('depBcpDetalhes').value = d ? (d.detalhes || '') : '';
  document.getElementById('depBcpSetor').value = d ? (d.setor || '') : '';
  document.getElementById('depBcpEmpresa').value = d ? (d.empresa || '') : '';
  document.getElementById('depBcpTelefone').value = d ? (d.telefone || '') : '';
  document.getElementById('depBcpEmail').value = d ? (d.email || '') : '';
  document.getElementById('depBcpEndereco').value = d ? (d.endereco || '') : '';
  document.getElementById('modalDepBcpTitulo').textContent = d ? 'Editar Dependência' : 'Nova Dependência';
  // Preencher datalist de categorias
  const cats = [...new Set((window.dependenciasCatalogo || []).map(x => x.categoria))].sort();
  document.getElementById('depBcpCatList').innerHTML = cats.map(c => `<option value="${c}">`).join('');
  document.getElementById('modalDepBcp').classList.add('open');
};

window.fecharModalDepBcp = () => {
  document.getElementById('modalDepBcp').classList.remove('open');
};

window.editarContatoBcp = (id) => {
  const d = (window.dependenciasCatalogo || []).find(x => x.id === id);
  if (d) abrirModalDepBcp(d);
};

window.salvarDepBcp = async () => {
  const d = {
    id: document.getElementById('depBcpId').value ? Number(document.getElementById('depBcpId').value) : null,
    categoria: document.getElementById('depBcpCategoria').value.trim(),
    nome: document.getElementById('depBcpNome').value.trim(),
    detalhes: document.getElementById('depBcpDetalhes').value.trim(),
    setor: document.getElementById('depBcpSetor').value.trim(),
    empresa: document.getElementById('depBcpEmpresa').value.trim(),
    telefone: document.getElementById('depBcpTelefone').value.trim(),
    email: document.getElementById('depBcpEmail').value.trim(),
    endereco: document.getElementById('depBcpEndereco').value.trim(),
  };
  if (!d.categoria) return showToast('Informe a categoria.', '#e65100');
  if (!d.nome) return showToast('Informe o nome.', '#e65100');
  try {
    const result = await API.salvarDependencia(d);
    fecharModalDepBcp();
    showToast('✅ Dependência salva!', '#2e7d32');
    // Atualizar catálogo local
    if (d.id) {
      const idx = (window.dependenciasCatalogo || []).findIndex(x => x.id === d.id);
      if (idx !== -1) window.dependenciasCatalogo[idx] = { ...d };
    } else {
      d.id = result.id;
      window.dependenciasCatalogo = window.dependenciasCatalogo || [];
      window.dependenciasCatalogo.push(d);
      // Adicionar automaticamente à tabela de contatos
      if (!window._bcpContatos.includes(d.id)) {
        window._bcpContatos.push(d.id);
      }
    }
    API.invalidate('getDependencias');
    renderContatosBcp();
    popularSelectContatosBcp();
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};

// ============================================================
// BCP - Avaliação de Riscos
// ============================================================
window._bcpRiscos = [];

function renderRiscosBcp() {
  const container = document.getElementById('bcpRiscosTabela');
  if (!window._bcpRiscos.length) {
    container.innerHTML = '<p style="font-size:0.85em;color:#999;padding:8px 0;">Nenhum evento de risco cadastrado.</p>';
    return;
  }

  const corProb = { 'Baixo': '#e8f5e9', 'Médio': '#fff8e1', 'Alto': '#ffebee' };
  const corProbText = { 'Baixo': '#2e7d32', 'Médio': '#f57c00', 'Alto': '#c62828' };

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85em;border:1px solid #e0e0e0;border-radius:7px;overflow:hidden;">
      <thead>
        <tr style="background:#f5f6fa;">
          <th style="padding:8px 10px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:28%;">Evento</th>
          <th style="padding:8px 10px;text-align:center;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:18%;">Probabilidade</th>
          <th style="padding:8px 10px;text-align:center;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:18%;">Impacto</th>
          <th style="padding:8px 10px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:28%;">Mitigação</th>
          <th style="padding:8px 6px;text-align:center;border-bottom:1px solid #e0e0e0;width:8%;"></th>
        </tr>
      </thead>
      <tbody>
        ${window._bcpRiscos.map((r, idx) => `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:6px 10px;"><input type="text" value="${(r.evento || '').replace(/"/g, '&quot;')}" onchange="atualizarRiscoBcp(${idx},'evento',this.value)" placeholder="Descreva o evento" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
          <td style="padding:6px 6px;text-align:center;"><select onchange="atualizarRiscoBcp(${idx},'probabilidade',this.value)" style="padding:5px 8px;border-radius:12px;border:none;font-size:0.88em;font-weight:600;cursor:pointer;background:${corProb[r.probabilidade] || '#f5f5f5'};color:${corProbText[r.probabilidade] || '#555'};">
            <option value="" ${!r.probabilidade ? 'selected' : ''}>-</option>
            <option value="Baixo" ${r.probabilidade === 'Baixo' ? 'selected' : ''}>Baixo</option>
            <option value="Médio" ${r.probabilidade === 'Médio' ? 'selected' : ''}>Médio</option>
            <option value="Alto" ${r.probabilidade === 'Alto' ? 'selected' : ''}>Alto</option>
          </select></td>
          <td style="padding:6px 6px;text-align:center;"><select onchange="atualizarRiscoBcp(${idx},'impacto',this.value)" style="padding:5px 8px;border-radius:12px;border:none;font-size:0.88em;font-weight:600;cursor:pointer;background:${corProb[r.impacto] || '#f5f5f5'};color:${corProbText[r.impacto] || '#555'};">
            <option value="" ${!r.impacto ? 'selected' : ''}>-</option>
            <option value="Baixo" ${r.impacto === 'Baixo' ? 'selected' : ''}>Baixo</option>
            <option value="Médio" ${r.impacto === 'Médio' ? 'selected' : ''}>Médio</option>
            <option value="Alto" ${r.impacto === 'Alto' ? 'selected' : ''}>Alto</option>
          </select></td>
          <td style="padding:6px 10px;"><input type="text" value="${(r.mitigacao || '').replace(/"/g, '&quot;')}" onchange="atualizarRiscoBcp(${idx},'mitigacao',this.value)" placeholder="Ação de mitigação" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
          <td style="padding:6px 6px;text-align:center;">
            <button onclick="removerRiscoBcp(${idx})" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:1.1em;" title="Remover">&times;</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

window.adicionarRiscoBcp = () => {
  window._bcpRiscos.push({ evento: '', probabilidade: '', impacto: '', mitigacao: '' });
  renderRiscosBcp();
};

window.atualizarRiscoBcp = (idx, campo, valor) => {
  if (window._bcpRiscos[idx]) {
    window._bcpRiscos[idx][campo] = valor;
    // Re-render para atualizar cores dos selects
    if (campo === 'probabilidade' || campo === 'impacto') renderRiscosBcp();
  }
};

window.removerRiscoBcp = (idx) => {
  window._bcpRiscos.splice(idx, 1);
  renderRiscosBcp();
};

// ============================================================
// BCP - Medidas Preventivas
// ============================================================
window._bcpPreventivas = [];

function renderPreventivasBcp() {
  const container = document.getElementById('bcpPreventivasTabela');
  if (!window._bcpPreventivas.length) {
    container.innerHTML = '<p style="font-size:0.85em;color:#999;padding:8px 0;">Nenhuma medida preventiva cadastrada.</p>';
    return;
  }

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85em;border:1px solid #e0e0e0;border-radius:7px;overflow:hidden;">
      <thead>
        <tr style="background:#f5f6fa;">
          <th style="padding:8px 10px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:30%;">Controle</th>
          <th style="padding:8px 10px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e0e0;width:62%;">Descrição</th>
          <th style="padding:8px 6px;text-align:center;border-bottom:1px solid #e0e0e0;width:8%;"></th>
        </tr>
      </thead>
      <tbody>
        ${window._bcpPreventivas.map((r, idx) => `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:6px 10px;"><input type="text" value="${(r.controle || '').replace(/"/g, '&quot;')}" onchange="atualizarPreventivaBcp(${idx},'controle',this.value)" placeholder="Ex: Energia" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
          <td style="padding:6px 10px;"><input type="text" value="${(r.descricao || '').replace(/"/g, '&quot;')}" onchange="atualizarPreventivaBcp(${idx},'descricao',this.value)" placeholder="Descreva a medida preventiva" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
          <td style="padding:6px 6px;text-align:center;">
            <button onclick="removerPreventivaBcp(${idx})" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:1.1em;" title="Remover">&times;</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

window.adicionarPreventivaBcp = () => {
  window._bcpPreventivas.push({ controle: '', descricao: '' });
  renderPreventivasBcp();
};

window.atualizarPreventivaBcp = (idx, campo, valor) => {
  if (window._bcpPreventivas[idx]) {
    window._bcpPreventivas[idx][campo] = valor;
  }
};

window.removerPreventivaBcp = (idx) => {
  window._bcpPreventivas.splice(idx, 1);
  renderPreventivasBcp();
};

window.abrirModalProcesso = (p) => {
  // Preencher dropdown de áreas
  const selectArea = document.getElementById('fArea');
  selectArea.innerHTML = '<option value="">Selecione...</option>' + 
    window.areasDisponiveis.map(a => `<option value="${a.nome}">${a.nome}</option>`).join('');
  
  document.getElementById('fId').value = p ? p.id : '';
  document.getElementById('fArea').value = p ? p.area : '';
  document.getElementById('fProcesso').value = p ? p.processo : '';
  document.getElementById('fDescricao').value = p ? p.descricao : '';
  document.getElementById('fDescricaoFuncional').value = p ? (p.descricaoFuncional || '') : '';
  document.getElementById('fTierManual').value = p ? (p.tierManual || '') : '';
  // Preencher tags de dependência
  initDependenciaTags(p ? p.dependencia : '');
  document.getElementById('fBiaHomologada').value = p ? p.biaHomologada : '';
  const fBcpEl = document.getElementById('fBcpStatus'); if (fBcpEl) fBcpEl.value = p ? (p.bcpStatus || '') : '';
  // Preencher contatos BCP
  window._bcpContatos = p && p.bcpContatos ? (typeof p.bcpContatos === 'string' ? JSON.parse(p.bcpContatos) : p.bcpContatos) : [];
  renderContatosBcp();

  // Preencher campos DRP
  document.getElementById('fDrpStatus').value = p ? (p.drpStatus || '') : '';
  // Preencher componentes DRP
  window._drpComponentes = p && p.drpComponentes ? (typeof p.drpComponentes === 'string' ? JSON.parse(p.drpComponentes) : p.drpComponentes) : [];
  renderComponentesDrp();



  // Preencher Dono do Processo com base na area selecionada
  const atualizarDono = () => {
    const areaSel = document.getElementById('fArea').value;
    const areaObj = window.areasDisponiveis.find(a => a.nome === areaSel);
    document.getElementById('fDono').value = areaObj ? (areaObj.responsavel || '') : '';
  };
  document.getElementById('fArea').onchange = atualizarDono;
  atualizarDono();
  
  const titulo = p ? 'Editar Processo' : 'Novo Processo';
  const scoreHtml = p && p.score > 0 ? (() => {
    const status = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : 'Tier 3 (Suporte)';
    const cor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : '#1565c0';
    return `<span style="margin-left:12px;font-size:0.82em;font-weight:600;padding:3px 10px;border-radius:10px;background:${cor};color:white;vertical-align:middle;">${status} &bull; Score ${p.score}</span>`;
  })() : '';
  document.getElementById('modalTitulo').innerHTML = titulo + scoreHtml + (p ? `<div style="font-size:0.75em;color:#555;font-weight:400;margin-top:4px;">${p.processo}</div>` : '');
  document.getElementById('drawerProcesso').classList.add('open');
  document.getElementById('drawerOverlayProcesso').classList.add('open');
  // Resetar botão salvar
  const btnSalvar = document.querySelector('#drawerProcesso .drawer-footer .btn-primary');
  if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = 'Salvar'; btnSalvar.style.opacity = '1'; btnSalvar.style.cursor = 'pointer'; }
  trocarAbaProcesso('identificacao');
  // Reset avaliação inline
  window._avaliacaoRespostas = {};
  window._avaliacaoScore = 0;
  // Mostrar/ocultar botão Abrir PCN
  const btnPcnSalvo = document.getElementById('btnPcnSalvo');
  if (btnPcnSalvo) btnPcnSalvo.style.display = (p && p.pcnSalvo) ? 'inline-block' : 'none';
  // Score/Tier cards na BIA
  const scoreInfo = document.getElementById('fBiaScoreInfo');
  if (scoreInfo && p && p.score > 0) {
    const cor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : '#1565c0';
    const tierLabel = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : 'Tier 3 (Suporte)';
    scoreInfo.innerHTML = `<div style="display:flex;gap:12px;margin-bottom:4px;"><div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};"><div style="font-size:0.78em;color:#666;margin-bottom:4px;">SCORE</div><div style="font-size:1.8em;font-weight:700;color:${cor};">${p.score}</div></div><div style="flex:1;background:#f5f6fa;border-radius:8px;padding:14px;text-align:center;border-top:3px solid ${cor};"><div style="font-size:0.78em;color:#666;margin-bottom:4px;">TIER</div><div style="font-size:0.95em;font-weight:700;"><span style="background:${cor};color:white;padding:4px 12px;border-radius:12px;">${tierLabel}</span></div></div></div>`;
  } else if (scoreInfo) { scoreInfo.innerHTML = ''; }
  // Preencher RTO/RPO/MTD
  const fRTO = document.getElementById('fRTO'); if (fRTO) fRTO.value = p ? (p.rto || '') : '';
  const fRPO = document.getElementById('fRPO'); if (fRPO) fRPO.value = p ? (p.rpo || '') : '';
  const fMTD = document.getElementById('fMTD'); if (fMTD) fMTD.value = p ? (p.mtd || '') : '';
  iniciarDrawerResize();
};

window.editarProcesso = (id) => abrirModalProcesso(window.processosData.find(p => p.id === id));

window.avaliarProcessoFromBia = () => {
  const id = Number(document.getElementById('fId').value);
  if (!id) return;
  fecharModal();
  setTimeout(() => avaliarProcesso(id), 300);
};

window.salvarProcesso = async () => {
  const p = {
    id: document.getElementById('fId').value ? Number(document.getElementById('fId').value) : null,
    area: document.getElementById('fArea').value.trim(),
    processo: document.getElementById('fProcesso').value.trim(),
    descricao: document.getElementById('fDescricao').value.trim(),
    dependencia: (window._dependenciaSelecionadas || []).join(', '),
    rto: (document.getElementById('fRTO') || {value:''}).value.trim(),
    rpo: (document.getElementById('fRPO') || {value:''}).value.trim(),
    mtd: (document.getElementById('fMTD') || {value:''}).value.trim(),
    biaHomologada: document.getElementById('fBiaHomologada').value.trim(),
    bcpStatus: (document.getElementById('fBcpStatus') || {value:''}).value.trim(),
    descricaoFuncional: document.getElementById('fDescricaoFuncional').value.trim(),
    tierManual: document.getElementById('fTierManual').value,
    bcpContatos: window._bcpContatos || [],
    drpStatus: document.getElementById('fDrpStatus').value.trim(),
    drpComponentes: window._drpComponentes || [],
  };

  if (!p.area) return showToast('Selecione a área.', '#e65100');
  if (!p.processo) return showToast('Informe o processo.', '#e65100');
  // Prevenir duplicatas
  if (!p.id) {
    const duplicado = (window.processosData || []).find(x => x.area.toLowerCase() === p.area.toLowerCase() && x.processo.toLowerCase() === p.processo.toLowerCase());
    if (duplicado) return showToast('Já existe um processo com esse nome nesta área.', '#e65100');
  }
  
  // Prevenir duplicatas: se não tem id, verificar se já existe processo com mesmo nome e área
  if (!p.id) {
    const duplicado = (window.processosData || []).find(x => 
      x.area.toLowerCase() === p.area.toLowerCase() && 
      x.processo.toLowerCase() === p.processo.toLowerCase()
    );
    if (duplicado) {
      return showToast('Já existe um processo com esse nome nesta área.', '#e65100');
    }
  }
  
  // Coletar respostas da avaliação inline (se houver)
  const pergs = window.processosPerguntas || [];
  const avalScores = {};
  let avalTotal = 0;
  let temResposta = false;
  pergs.forEach((pg, i) => {
    const sel = document.querySelector(`input[name="avalInline${i}"]:checked`);
    if (sel) {
      avalScores[pg.pergunta] = parseInt(sel.value);
      avalTotal += parseInt(sel.value);
      temResposta = true;
    }
  });

  // Desabilitar botão e mostrar loading
  const btnSalvar = document.querySelector('#drawerProcesso .drawer-footer .btn-primary');
  const textoOriginal = btnSalvar ? btnSalvar.innerHTML : '';
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.innerHTML = '⏳ Salvando...'; btnSalvar.classList.add('btn-loading'); }

  // Optimistic: fechar drawer e atualizar UI imediatamente
  const area = window.areasDisponiveis ? window.areasDisponiveis.find(a => a.nome === p.area) : null;
  const pEnriquecido = { ...p, responsavelArea: area ? area.responsavel : '', solucao: area ? area.solucao : '', score: 0, respostas: [] };
  if (p.id) {
    const idx = window.processosData.findIndex(x => x.id === p.id);
    if (idx !== -1) {
      pEnriquecido.score = temResposta ? avalTotal : window.processosData[idx].score;
      pEnriquecido.respostas = temResposta ? avalScores : window.processosData[idx].respostas;
      pEnriquecido.pcnSalvo = window.processosData[idx].pcnSalvo;
      pEnriquecido.avaliado = window.processosData[idx].avaliado || temResposta;
      window.processosData[idx] = pEnriquecido;
    }
  } else {
    pEnriquecido.id = Date.now(); // ID temporário
    pEnriquecido.score = temResposta ? avalTotal : 0;
    pEnriquecido.respostas = temResposta ? avalScores : {};
    window.processosData.push(pEnriquecido);
  }
  fecharModal();
  // Resetar botão salvar para próximo uso
  if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = 'Salvar'; btnSalvar.classList.remove('btn-loading'); }
  renderizarProcessos();
  showToast('✅ Salvando...', '#1a237e');

  try {
    const result = await API.salvarProcesso(p);
    
    // Salvar avaliação se respondida
    if (temResposta) {
      await API.post('salvarRespostas', { area: p.area, processo: p.processo, scores: avalScores });
    }
    
    // Atualizar ID real se era novo
    if (!p.id && result.id) {
      const tempIdx = window.processosData.findIndex(x => x.id === pEnriquecido.id);
      if (tempIdx !== -1) window.processosData[tempIdx].id = result.id;
      renderizarProcessos();
    }
    showToast('✅ Salvo!', '#2e7d32');
    API.invalidate('getProcessos');
  } catch (err) {
    console.error('Erro ao salvar processo:', err);
    showToast('❌ Erro ao salvar: ' + err.message, '#c62828');
    // Reverter optimistic update
    if (p.id) {
      API.invalidate('getProcessos');
    } else {
      window.processosData = window.processosData.filter(x => x.id !== pEnriquecido.id);
      renderizarProcessos();
    }
  }
};

window.excluirProcesso = async (id) => {
  if (!confirm('Excluir este processo?')) return;
  await API.excluirProcesso(id);
  showToast('🗑️ Excluído.', '#555');
  window.processosData = window.processosData.filter(p => p.id !== id);
  renderizarProcessos();
};

window.verDetalhesProcesso = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p) return;
  
  const status = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Pendente';
  const statusColor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : p.score > 0 ? '#1565c0' : '#999';
  
  document.getElementById('modalDetalhesTitulo').textContent = p.processo;
  document.getElementById('modalDetalhesConteudo').innerHTML = `
    <div style="display:grid;gap:16px;">
      <div><strong>Área:</strong> ${p.area}</div>
      <div><strong>Responsável:</strong> ${p.responsavelArea || p.responsavel || '-'}</div>
      <div><strong>Solução:</strong> ${p.solucao || '-'}</div>
      <div><strong>Status:</strong> <span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.9em;font-weight:600;color:white;background:${statusColor};">${status}${p.score > 0 ? ' (Score: ' + p.score + ')' : ''}</span></div>
      <div><strong>Descrição do Impacto:</strong><br>${p.descricao || '-'}</div>
      <div><strong>Dependência Crítica:</strong> ${p.dependencia || '-'}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#f5f5f5;padding:12px;border-radius:6px;text-align:center;">
          <div style="font-size:0.8em;color:#666;margin-bottom:4px;">RTO</div>
          <div style="font-weight:600;color:#1a237e;">${p.rto || '-'}</div>
        </div>
        <div style="background:#f5f5f5;padding:12px;border-radius:6px;text-align:center;">
          <div style="font-size:0.8em;color:#666;margin-bottom:4px;">RPO</div>
          <div style="font-weight:600;color:#1a237e;">${p.rpo || '-'}</div>
        </div>
        <div style="background:#f5f5f5;padding:12px;border-radius:6px;text-align:center;">
          <div style="font-size:0.8em;color:#666;margin-bottom:4px;">MTPD</div>
          <div style="font-weight:600;color:#1a237e;">${p.mtpd || '-'}</div>
        </div>
      </div>
      <div><strong>BIA Homologada:</strong> ${p.biaHomologada || '-'}</div>
    </div>
  `;
  document.getElementById('modalDetalhes').classList.add('open');
};

window.fecharModalDetalhes = () => {
  document.getElementById('modalDetalhes').classList.remove('open');
};

window.avaliarProcesso = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p) return;
  document.getElementById('qProcessoId').value = p.id;
  document.getElementById('qArea').value = p.area;
  document.getElementById('qProcesso').value = p.processo;
  document.getElementById('modalAvaliarNome').textContent = p.area;
  document.getElementById('modalAvaliarTitulo').textContent = p.processo;
  const container = document.getElementById('perguntas-container');
  const OPCOES_RESPOSTA = window.configRespostas || {
    'Geral': [
      {valor:'4',label:'Acontece o tempo todo',cor:'#c62828',background:'#ffebee'},
      {valor:'2',label:'Acontece com alguma frequência',cor:'#f57c00',background:'#fff3e0'},
      {valor:'1',label:'Acontece raramente',cor:'#2e7d32',background:'#e8f5e9'},
      {valor:'0',label:'Nunca aconteceu',cor:'#757575',background:'#f5f5f5'}
    ],
    '_default': [
      {valor:'4',label:'Alto (4)',cor:'#c62828',background:'#ffebee'},
      {valor:'2',label:'Médio (2)',cor:'#f57c00',background:'#fff3e0'},
      {valor:'1',label:'Baixo (1)',cor:'#2e7d32',background:'#e8f5e9'},
      {valor:'0',label:'N/A (0)',cor:'#757575',background:'#f5f5f5'}
    ]
  };
  const CAT_CORES_PALETTE = ['#37474f','#1a237e','#c62828','#e65100','#00838f','#6a1b9a','#00695c','#1565c0','#4e342e','#558b2f'];
  const CAT_CORES_AVALIAR = {};
  [...new Set(window.processosPerguntas.map(p => p.categoria))].forEach((c, i) => {
    CAT_CORES_AVALIAR[c] = CAT_CORES_PALETTE[i % CAT_CORES_PALETTE.length];
  });
  const pergsOrdenadas = [
    ...window.processosPerguntas.filter(p => p.categoria === 'Geral'),
    ...window.processosPerguntas.filter(p => p.categoria !== 'Geral'),
  ];
  const gruposCats = [];
  const vistosCats = {};
  pergsOrdenadas.forEach(p => { if (!vistosCats[p.categoria]) { vistosCats[p.categoria] = true; gruposCats.push(p.categoria); } });
  container.innerHTML = gruposCats.map(cat => {
    const cor = CAT_CORES_AVALIAR[cat] || '#555';
    const itensCat = pergsOrdenadas.filter(p => p.categoria === cat);
    return `<div style="margin-bottom:20px;">
      <div style="background:${cor};color:white;padding:8px 16px;border-radius:7px 7px 0 0;font-size:0.8em;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${cat}</div>
      <div style="border:1.5px solid ${cor};border-top:none;border-radius:0 0 7px 7px;overflow:hidden;">
        ${itensCat.map(perg => {
          const i = window.processosPerguntas.indexOf(perg);
          return `<div style="padding:20px 24px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <div style="font-weight:600;color:#1a1a2e;margin-bottom:3px;font-size:0.92em;">${perg.pergunta}</div>
            <div style="font-size:0.81em;color:#888;margin-bottom:12px;line-height:1.5;">${perg.descricao || ''}</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
              ${(OPCOES_RESPOSTA[cat] || OPCOES_RESPOSTA['_default'] || [{valor:'3',label:'Crítico',cor:'#c62828',background:'#ffebee'},{valor:'2',label:'Alto',cor:'#f57c00',background:'#fff3e0'},{valor:'1',label:'Moderado',cor:'#2e7d32',background:'#e8f5e9'},{valor:'0',label:'Baixo',cor:'#757575',background:'#f5f5f5'}]).slice().sort((a,b) => Number(b.valor) - Number(a.valor)).map(op => {
                const opCor = (op.cor && op.cor !== 'undefined') ? op.cor : ({'4':'#c62828','2':'#f57c00','1':'#2e7d32','0':'#757575'}[String(op.valor)] || '#555');
                const opBg = (op.background && op.background !== 'undefined') ? op.background : ({'4':'#ffebee','2':'#fff3e0','1':'#e8f5e9','0':'#f5f5f5'}[String(op.valor)] || '#f5f5f5');
                return `
                <label style="display:flex;align-items:flex-start;padding:12px 14px;background:white;border:2px solid #e0e0e0;border-radius:8px;cursor:pointer;min-height:56px;">
                  <input type="radio" name="pergunta${i}" value="${op.valor}" data-cor="${opCor}" data-bg="${opBg}" data-label="${op.label}" onchange="calcularScore();atualizarEstiloOpcoes(this);" style="margin-right:8px;margin-top:2px;width:15px;height:15px;flex-shrink:0;">
                  <span style="color:${opCor};font-weight:600;font-size:0.85em;line-height:1.4;">${op.label}</span>
                </label>`;}).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  calcularScore();
  // Pré-selecionar respostas anteriores
  if (p.respostas && Object.keys(p.respostas).length > 0) {
    window.processosPerguntas.forEach((perg, i) => {
      const val = p.respostas[perg.pergunta];
      if (val !== undefined) {
        const radio = document.querySelector(`input[name="pergunta${i}"][value="${val}"]`);
        if (radio) {
          radio.checked = true;
          atualizarEstiloOpcoes(radio);
          radio.dispatchEvent(new Event('change'));
        }
      }
    });
    calcularScore();
  }
  document.getElementById('drawerAvaliar').classList.add('open');
  document.getElementById('drawerOverlayAvaliar').classList.add('open');
  iniciarDrawerResizeAvaliar();
};

window.fecharModalAvaliar = () => {
  document.getElementById('drawerAvaliar').classList.remove('open');
  document.getElementById('drawerOverlayAvaliar').classList.remove('open');
};

window.imprimirAvaliacao = () => {
  const titulo = document.getElementById('modalAvaliarTitulo').textContent;
  const area = document.getElementById('modalAvaliarNome').textContent;
  const scoreTotal = document.getElementById('scoreTotal').textContent;
  const scoreTier = document.getElementById('scoreTier').textContent;

  // Coletar respostas selecionadas
  const pergs = window.processosPerguntas || window.questionarioPerguntas || [];
  const CAT_CORES_PALETTE_PDF = ['#37474f','#1a237e','#c62828','#e65100','#00838f','#6a1b9a','#00695c','#1565c0','#4e342e','#558b2f'];
  const CAT_CORES = {};
  [...new Set(pergs.map(p => p.categoria))].forEach((c, i) => { CAT_CORES[c] = CAT_CORES_PALETTE_PDF[i % CAT_CORES_PALETTE_PDF.length]; });
  const OPCOES = window.configRespostas || {};
  const pergsOrdenadas = [...pergs.filter(p => p.categoria === 'Geral'), ...pergs.filter(p => p.categoria !== 'Geral')];
  const grupos = []; const vistos = {};
  pergsOrdenadas.forEach(p => { if (!vistos[p.categoria]) { vistos[p.categoria] = true; grupos.push(p.categoria); } });

  const conteudoHtml = grupos.map(cat => {
    const cor = CAT_CORES[cat] || '#555';
    const itens = pergsOrdenadas.filter(p => p.categoria === cat);
    const ops = ((OPCOES[cat] || OPCOES['_default']) || [
      {valor:'4',label:'Alto (4)',cor:'#c62828',background:'#ffebee'},
      {valor:'2',label:'Médio (2)',cor:'#f57c00',background:'#fff3e0'},
      {valor:'1',label:'Baixo (1)',cor:'#2e7d32',background:'#e8f5e9'},
      {valor:'0',label:'N/A (0)',cor:'#757575',background:'#f5f5f5'}
    ]).slice().sort((a,b) => Number(b.valor) - Number(a.valor));

    return '<div style="margin-bottom:20px;">' +
      '<div style="background:' + cor + ';color:white;padding:8px 16px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:6px 6px 0 0;">' + cat + '</div>' +
      '<div style="border:1.5px solid ' + cor + ';border-top:none;border-radius:0 0 6px 6px;overflow:hidden;">' +
      itens.map((perg, idx) => {
        const i = pergs.indexOf(perg);
        const sel = document.querySelector('input[name="pergunta' + i + '"]:checked');
        const valSel = sel ? String(sel.value) : null;
        console.log('perg', i, perg.pergunta.substring(0,30), 'valSel:', valSel);
        return '<div style="padding:14px 16px;background:#fafafa;border-bottom:1px solid #f0f0f0;">' +
          '<div style="font-weight:600;font-size:13px;margin-bottom:3px;">' + perg.pergunta + '</div>' +
          '<div style="font-size:11px;color:#888;margin-bottom:10px;">' + (perg.descricao || '') + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">' +
          ops.map(op => {
            const selecionada = valSel === String(op.valor);
            const bg = selecionada ? op.background : 'white';
            const borda = selecionada ? op.cor : '#e0e0e0';
            const bw = selecionada ? '2.5px' : '1.5px';
            return '<div style="border:' + bw + ' solid ' + borda + ';border-radius:6px;padding:8px 10px;background:' + bg + ';">' +
              '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid ' + op.cor + ';background:' + (selecionada ? op.cor : 'white') + ';margin-right:6px;vertical-align:middle;flex-shrink:0;"></span>' +
              '<span style="color:' + op.cor + ';font-weight:' + (selecionada ? '700' : '600') + ';font-size:11px;">' + (selecionada ? '✔ ' : '') + op.label + '</span>' +
              '</div>';
          }).join('') +
          '</div></div>';
      }).join('') +
      '</div></div>';
  }).join('');

  const janela = window.open('', '_blank');
  janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>BIA - ${titulo}</title>
    <style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px;color:#1a1a2e;}h1{color:#1a237e;font-size:20px;margin-bottom:4px;}.rodape{margin-top:32px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:16px;}@media print{body{padding:16px;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}</style>
    </head><body>
    <h1>${titulo}</h1>
    <div style="color:#888;font-size:13px;margin-bottom:24px;">${area}</div>
    <div style="background:#f0f4ff;border-left:4px solid #1a237e;padding:12px 16px;margin-bottom:24px;font-size:13px;border-radius:0 6px 6px 0;">
      <strong>&#128203; Premissa:</strong> O impacto deve ser avaliado, considerando a indisponibilidade/falha do processo no momento em que seja necessário utilizá-lo.
    </div>
    ${conteudoHtml}
    <div style="background:#1a237e;color:white;padding:16px 20px;border-radius:8px;margin-top:24px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:14px;font-weight:600;">Score Total</div></div>
      <div style="text-align:right;"><div style="font-size:36px;font-weight:700;">${scoreTotal}</div><div style="background:rgba(255,255,255,0.2);padding:4px 14px;border-radius:20px;font-weight:700;font-size:13px;">${scoreTier}</div></div>
    </div>
    <div class="rodape">Relatório gerado pelo Sistema BIA &middot; Fortes Tecnologia &middot; ${new Date().toLocaleDateString('pt-BR')}</div>
    <script>window.onload=()=>{window.print();}<\/script></body></html>`);
  janela.document.close();
};

window.abrirModalEnviar = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p) return;
  document.getElementById('enviarProcessoId').value = id;
  document.getElementById('enviarProcessoNome').textContent = `${p.area} › ${p.processo}`;
  document.getElementById('enviarEmail').value = '';
  document.getElementById('modalEnviar').classList.add('open');
};

window.fecharModalEnviar = () => document.getElementById('modalEnviar').classList.remove('open');

window.enviarConvite = async () => {
  const processoId = document.getElementById('enviarProcessoId').value;
  const email = document.getElementById('enviarEmail').value.trim();
  if (!email) return showToast('Informe o e-mail do respondente.', '#e65100');
  const p = window.processosData.find(proc => proc.id === Number(processoId));
  if (!p) return;
  try {
    const formData = new FormData();
    formData.append('action', 'gerarToken');
    formData.append('area', p.area);
    formData.append('processo', p.processo);
    formData.append('email', email);
    const res = await fetch(API_URL, { method: 'POST', body: formData });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    fecharModalEnviar();
    showToast('✅ Convite enviado para ' + email, '#2e7d32');
  } catch(err) {
    showToast('❌ Erro: ' + err.message, '#c62828');
  }
};

// ============================================================
// PÁGINA: DEPENDÊNCIAS (Catálogo)
// ============================================================
let dependenciasData = [];
let dependenciasOrdenacao = { coluna: 'categoria', direcao: 'asc' };

async function dependencias() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Catálogo de Dependências</h2><p class="page-sub">Gerencie as dependências críticas reutilizáveis nos processos</p></div>
      <button class="btn btn-primary" onclick="abrirModalDependencia()">+ Nova Dependência</button>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Categoria:</label>
      <select id="filtroDepCategoria" onchange="filtrarDependencias()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
        <option value="">Todas as categorias</option>
      </select>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="listaDeps" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarDependencias('categoria')" style="cursor:pointer;width:12%;">Categoria <span id="sort-dep-categoria"></span></th>
            <th onclick="ordenarDependencias('nome')" style="cursor:pointer;width:15%;">Nome <span id="sort-dep-nome"></span></th>
            <th onclick="ordenarDependencias('empresa')" style="cursor:pointer;width:13%;">Empresa <span id="sort-dep-empresa"></span></th>
            <th style="width:12%;">Papel</th>
            <th style="width:10%;">Setor</th>
            <th style="width:10%;">Telefone</th>
            <th style="width:13%;">Email</th>
            <th style="width:10%;">Endereço</th>
            <th style="width:6%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="depRows"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modalDep"><div class="modal" onclick="event.stopPropagation()" style="max-width:580px;">
      <h3 id="modalDepTitulo">Nova Dependência</h3>
      <input type="hidden" id="depId">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Categoria</label>
          <input type="text" id="depCategoria" list="depCategoriaList" placeholder="Ex: Infraestrutura" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <datalist id="depCategoriaList"></datalist>
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Nome</label>
          <input type="text" id="depNome" placeholder="Ex: Switches e roteadores" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Papel</label>
          <input type="text" id="depDetalhes" placeholder="Papel ou função desta dependência" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Setor</label>
          <input type="text" id="depSetor" list="depSetorList" placeholder="Ex: TI, Facilities" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <datalist id="depSetorList"></datalist>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Empresa</label>
        <input type="text" id="depEmpresa" list="depEmpresaList" placeholder="Ex: Fortes Tecnologia" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        <datalist id="depEmpresaList"></datalist>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Telefone</label>
          <input type="text" id="depTelefone" placeholder="(00) 0000-0000" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Email</label>
          <input type="email" id="depEmail" placeholder="contato@fornecedor.com" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Endereço</label>
        <input type="text" id="depEndereco" placeholder="Endereço ou localização" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalDependencia()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarDep()">Salvar</button>
      </div>
    </div></div>`;

  try {
    dependenciasData = await API.getDependencias();
  } catch(e) { dependenciasData = []; }
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('listaDeps').style.display = 'block';
  // Popular filtro de categorias
  const cats = [...new Set(dependenciasData.map(d => d.categoria))].sort();
  document.getElementById('filtroDepCategoria').innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  renderizarDependencias();
}

function renderizarDependencias() {
  let data = [...dependenciasData];

  // Filtrar por categoria
  const filtro = document.getElementById('filtroDepCategoria');
  if (filtro && filtro.value) {
    data = data.filter(d => d.categoria === filtro.value);
  }

  data.sort((a, b) => {
    const valA = (a[dependenciasOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[dependenciasOrdenacao.coluna] || '').toString().toLowerCase();
    const cmp = valA.localeCompare(valB);
    return dependenciasOrdenacao.direcao === 'asc' ? cmp : -cmp;
  });

  ['categoria', 'nome', 'empresa'].forEach(col => {
    const el = document.getElementById(`sort-dep-${col}`);
    if (el) el.textContent = col === dependenciasOrdenacao.coluna ? (dependenciasOrdenacao.direcao === 'asc' ? '▲' : '▼') : '';
  });

  document.getElementById('depRows').innerHTML = data.length
    ? data.map(d => `<tr>
        <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${d.categoria}</span></td>
        <td style="font-weight:600;color:#222;">${d.nome}</td>
        <td style="font-size:0.85em;color:#555;">${d.empresa || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.detalhes || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.setor || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.telefone || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.email || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.endereco || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn-icon" onclick="editarDep(${d.id})" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="excluirDep(${d.id})" title="Excluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="9" style="text-align:center;color:#999;padding:40px;">Nenhuma dependência cadastrada.</td></tr>';
}

window.filtrarDependencias = () => renderizarDependencias();

window.ordenarDependencias = (coluna) => {
  if (dependenciasOrdenacao.coluna === coluna) {
    dependenciasOrdenacao.direcao = dependenciasOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    dependenciasOrdenacao.coluna = coluna;
    dependenciasOrdenacao.direcao = 'asc';
  }
  renderizarDependencias();
};

window.abrirModalDependencia = (d) => {
  document.getElementById('depId').value = d ? d.id : '';
  document.getElementById('depCategoria').value = d ? d.categoria : '';
  document.getElementById('depNome').value = d ? d.nome : '';
  document.getElementById('depDetalhes').value = d ? (d.detalhes || '') : '';
  document.getElementById('depSetor').value = d ? (d.setor || '') : '';
  document.getElementById('depEmpresa').value = d ? (d.empresa || '') : '';
  document.getElementById('depTelefone').value = d ? (d.telefone || '') : '';
  document.getElementById('depEmail').value = d ? (d.email || '') : '';
  document.getElementById('depEndereco').value = d ? (d.endereco || '') : '';
  document.getElementById('modalDepTitulo').textContent = d ? 'Editar Dependência' : 'Nova Dependência';
  // Preencher datalist de categorias
  const cats = [...new Set(dependenciasData.map(x => x.categoria))].sort();
  document.getElementById('depCategoriaList').innerHTML = cats.map(c => `<option value="${c}">`).join('');
  // Preencher datalist de setores existentes
  const setores = [...new Set(dependenciasData.map(x => x.setor).filter(Boolean))].sort();
  const setorList = document.getElementById('depSetorList');
  if (setorList) setorList.innerHTML = setores.map(s => `<option value="${s}">`).join('');
  // Preencher datalist de empresas existentes
  const empresas = [...new Set(dependenciasData.map(x => x.empresa).filter(Boolean))].sort();
  const empresaList = document.getElementById('depEmpresaList');
  if (empresaList) empresaList.innerHTML = empresas.map(e => `<option value="${e}">`).join('');
  document.getElementById('modalDep').classList.add('open');
};

window.fecharModalDependencia = () => {
  document.getElementById('modalDep').classList.remove('open');
};

window.editarDep = (id) => {
  const d = dependenciasData.find(x => x.id === id);
  if (d) abrirModalDependencia(d);
};

window.excluirDep = async (id) => {
  if (!confirm('Excluir esta dependência?')) return;
  try {
    await API.excluirDependencia(id);
    dependenciasData = dependenciasData.filter(x => x.id !== id);
    renderizarDependencias();
    showToast('✅ Excluída!', '#2e7d32');
    API.invalidate('getDependencias');
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};

window.salvarDep = async () => {
  const d = {
    id: document.getElementById('depId').value ? Number(document.getElementById('depId').value) : null,
    categoria: document.getElementById('depCategoria').value.trim(),
    nome: document.getElementById('depNome').value.trim(),
    detalhes: document.getElementById('depDetalhes').value.trim(),
    setor: document.getElementById('depSetor').value.trim(),
    empresa: document.getElementById('depEmpresa').value.trim(),
    telefone: document.getElementById('depTelefone').value.trim(),
    email: document.getElementById('depEmail').value.trim(),
    endereco: document.getElementById('depEndereco').value.trim(),
  };
  if (!d.categoria) return showToast('Informe a categoria.', '#e65100');
  if (!d.nome) return showToast('Informe o nome.', '#e65100');
  try {
    const result = await API.salvarDependencia(d);
    fecharModalDependencia();
    showToast('✅ Salvo!', '#2e7d32');
    if (d.id) {
      const idx = dependenciasData.findIndex(x => x.id === d.id);
      if (idx !== -1) dependenciasData[idx] = { ...d };
    } else {
      d.id = result.id;
      dependenciasData.push(d);
    }
    renderizarDependencias();
    API.invalidate('getDependencias');
    // Atualizar catálogo global se estiver carregado
    window.dependenciasCatalogo = dependenciasData;
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};

// ============================================================
// PÁGINA: ADMIN (Painel)
// ============================================================
async function admin() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Painel</h2><p class="page-sub">Resumo geral do BIA</p></div>
    </div>
    <div class="loading" id="loading">⏳ Carregando...</div>
    <div id="painel" style="display:none;"></div>
  `;

  const [processos, areas] = await Promise.all([API.getProcessos(), API.getAreas()]);

  // Gestor sem área: bloquear acesso
  if (window.USER_PERFIL !== 'admin' && !window.USER_AREA) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('painel').style.display = 'block';
    document.getElementById('painel').innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#999;">
        <div style="font-size:3em;margin-bottom:16px;">🔒</div>
        <h3 style="color:#666;margin-bottom:8px;">Acesso não configurado</h3>
        <p>Seu e-mail ainda não está vinculado a uma área. Solicite ao administrador que configure seu acesso.</p>
      </div>`;
    return;
  }

  // Gestor: filtrar apenas sua area
  const processosVisiveis = (window.USER_PERFIL !== 'admin' && window.USER_AREA)
    ? processos.filter(p => p.area === window.USER_AREA)
    : processos;
  const areasVisiveis = (window.USER_PERFIL !== 'admin' && window.USER_AREA)
    ? areas.filter(a => a.nome === window.USER_AREA)
    : areas;

  document.getElementById('loading').style.display = 'none';
  document.getElementById('painel').style.display = 'block';

  const total = processosVisiveis.length;
  const avaliados = processosVisiveis.filter(p => p.avaliado || p.score > 0).length;
  const pendentes = total - avaliados;
  const tier1 = processosVisiveis.filter(p => p.score >= 12 || (!p.score && p.tierManual === 'Tier 1 (Crítico)')).length;
  const tier2 = processosVisiveis.filter(p => (p.score >= 6 && p.score < 12) || (!p.score && p.tierManual === 'Tier 2 (Essencial)')).length;
  const tier3 = processosVisiveis.filter(p => ((p.avaliado || p.score > 0) && p.score < 6) || (!p.score && p.tierManual === 'Tier 3 (Suporte)')).length;
  const pct = total > 0 ? Math.round((avaliados / total) * 100) : 0;

  // Resumo por área
  const porArea = areasVisiveis.map(a => {
    const procs = processosVisiveis.filter(p => p.area === a.nome);
    const aval = procs.filter(p => p.avaliado || p.score > 0).length;
    const t1 = procs.filter(p => p.score >= 12).length;
    const t2 = procs.filter(p => p.score >= 6 && p.score < 12).length;
    const t3 = procs.filter(p => (p.avaliado || p.score > 0) && p.score < 6).length;
    return { nome: a.nome, total: procs.length, avaliados: aval, t1, t2, t3 };
  }).filter(a => a.total > 0);

  document.getElementById('painel').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px;">
      <div style="background:white;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-top:4px solid #1a237e;">
        <div style="font-size:0.85em;color:#666;margin-bottom:8px;">Total de Processos</div>
        <div style="font-size:2.2em;font-weight:700;color:#1a237e;">${total}</div>
      </div>
      <div style="background:white;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-top:4px solid #2e7d32;">
        <div style="font-size:0.85em;color:#666;margin-bottom:8px;">Avaliados</div>
        <div style="font-size:2.2em;font-weight:700;color:#2e7d32;">${avaliados}</div>
        <div style="font-size:0.8em;color:#999;margin-top:4px;">${pct}% do total</div>
      </div>
      <div style="background:white;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-top:4px solid #999;">
        <div style="font-size:0.85em;color:#666;margin-bottom:8px;">Pendentes</div>
        <div style="font-size:2.2em;font-weight:700;color:#999;">${pendentes}</div>
      </div>
      <div style="background:white;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-top:4px solid #c62828;">
        <div style="font-size:0.85em;color:#666;margin-bottom:8px;">Tier 1 (Crítico)</div>
        <div style="font-size:2.2em;font-weight:700;color:#c62828;">${tier1}</div>
      </div>
    </div>

    <div style="background:white;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:28px;border-top:4px solid #c62828;">
      <div style="font-weight:600;color:#333;margin-bottom:6px;">Cobertura dos Processos Críticos (Tier 1)</div>
      <div style="font-size:0.82em;color:#999;margin-bottom:16px;">Percentual de processos Tier 1 com BIA, BCP e DRP realizados</div>
      <div id="painelTier1Cobertura"></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
      <div style="background:white;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-weight:600;color:#333;margin-bottom:16px;">Progresso de Avaliação</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <div style="flex:1;background:#f0f0f0;border-radius:20px;height:14px;overflow:hidden;">
            <div style="width:${pct}%;background:linear-gradient(90deg,#1a237e,#3949ab);height:100%;border-radius:20px;transition:width 0.5s;"></div>
          </div>
          <span style="font-weight:700;color:#1a237e;min-width:40px;">${pct}%</span>
        </div>
        <div style="font-size:0.85em;color:#999;">${avaliados} de ${total} processos avaliados</div>
      </div>

      <div style="background:white;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-weight:600;color:#333;margin-bottom:16px;">Distribuição por Tier</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:130px;font-size:0.85em;color:#555;">Tier 1 (Crítico)</span>
            <div style="flex:1;background:#f0f0f0;border-radius:20px;height:10px;overflow:hidden;">
              <div style="width:${avaliados > 0 ? Math.round(tier1/total*100) : 0}%;background:#c62828;height:100%;border-radius:20px;"></div>
            </div>
            <span style="font-weight:700;color:#c62828;min-width:24px;text-align:right;">${tier1}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:130px;font-size:0.85em;color:#555;">Tier 2 (Essencial)</span>
            <div style="flex:1;background:#f0f0f0;border-radius:20px;height:10px;overflow:hidden;">
              <div style="width:${avaliados > 0 ? Math.round(tier2/total*100) : 0}%;background:#f57c00;height:100%;border-radius:20px;"></div>
            </div>
            <span style="font-weight:700;color:#f57c00;min-width:24px;text-align:right;">${tier2}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:130px;font-size:0.85em;color:#555;">Tier 3 (Suporte)</span>
            <div style="flex:1;background:#f0f0f0;border-radius:20px;height:10px;overflow:hidden;">
              <div style="width:${avaliados > 0 ? Math.round(tier3/total*100) : 0}%;background:#1565c0;height:100%;border-radius:20px;"></div>
            </div>
            <span style="font-weight:700;color:#1565c0;min-width:24px;text-align:right;">${tier3}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:130px;font-size:0.85em;color:#555;">Pendentes</span>
            <div style="flex:1;background:#f0f0f0;border-radius:20px;height:10px;overflow:hidden;">
              <div style="width:${Math.round(pendentes/total*100)}%;background:#999;height:100%;border-radius:20px;"></div>
            </div>
            <span style="font-weight:700;color:#999;min-width:24px;text-align:right;">${pendentes}</span>
          </div>
        </div>
      </div>
    </div>

    <div style="background:white;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <div style="font-weight:600;color:#333;margin-bottom:6px;">Matriz de Calor</div>
      <div style="font-size:0.82em;color:#999;margin-bottom:16px;">Score por processo — quanto maior o score, mais crítico</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:10px 12px;text-align:left;font-size:0.8em;color:#555;font-weight:600;min-width:140px;">Área</th>
              <th style="padding:10px 12px;text-align:left;font-size:0.8em;color:#555;font-weight:600;">Processo</th>
              <th style="padding:10px 12px;text-align:center;font-size:0.8em;color:#555;font-weight:600;width:70px;">Score</th>
              <th style="padding:10px 12px;text-align:left;font-size:0.8em;color:#555;font-weight:600;">Calor</th>
            </tr>
          </thead>
          <tbody>
            ${[...processosVisiveis].sort((a,b) => (b.score||0) - (a.score||0)).map(p => {
              const s = p.score || 0;
              const pct = Math.min(Math.round(s / 24 * 100), 100);
              const bg = s >= 12 ? '#c62828' : s >= 6 ? '#f57c00' : s > 0 ? '#1565c0' : '#e0e0e0';
              const label = s >= 12 ? 'Tier 1' : s >= 6 ? 'Tier 2' : s > 0 ? 'Tier 3' : 'Pendente';
              return `<tr style="border-top:1px solid #f0f0f0;">
                <td style="padding:10px 12px;font-size:0.85em;color:#555;">${p.area}</td>
                <td style="padding:10px 12px;font-size:0.88em;font-weight:500;">${p.processo}</td>
                <td style="padding:10px 12px;text-align:center;font-weight:700;color:${s > 0 ? bg : '#bbb'};">${s > 0 ? s : '-'}</td>
                <td style="padding:10px 16px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="flex:1;background:#f0f0f0;border-radius:20px;height:12px;overflow:hidden;min-width:80px;">
                      <div style="width:${pct}%;background:${bg};height:100%;border-radius:20px;"></div>
                    </div>
                    <span style="font-size:0.78em;font-weight:600;color:${s > 0 ? bg : '#bbb'};min-width:55px;">${label}</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="background:white;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <div style="font-weight:600;color:#333;margin-bottom:16px;">Resumo por Área</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 12px;text-align:left;font-size:0.85em;color:#555;font-weight:600;">Área</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#555;font-weight:600;">Total</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#555;font-weight:600;">Avaliados</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#c62828;font-weight:600;">Tier 1</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#f57c00;font-weight:600;">Tier 2</th>
            <th style="padding:10px 12px;text-align:center;font-size:0.85em;color:#1565c0;font-weight:600;">Tier 3</th>
            <th style="padding:10px 12px;text-align:left;font-size:0.85em;color:#555;font-weight:600;">Progresso</th>
          </tr>
        </thead>
        <tbody>
          ${porArea.map(a => {
            const pctA = a.total > 0 ? Math.round(a.avaliados / a.total * 100) : 0;
            return `<tr style="border-top:1px solid #f0f0f0;">
              <td style="padding:12px;font-weight:500;">${a.nome}</td>
              <td style="padding:12px;text-align:center;color:#666;">${a.total}</td>
              <td style="padding:12px;text-align:center;color:#2e7d32;font-weight:600;">${a.avaliados}</td>
              <td style="padding:12px;text-align:center;color:#c62828;font-weight:600;">${a.t1 || '-'}</td>
              <td style="padding:12px;text-align:center;color:#f57c00;font-weight:600;">${a.t2 || '-'}</td>
              <td style="padding:12px;text-align:center;color:#1565c0;font-weight:600;">${a.t3 || '-'}</td>
              <td style="padding:12px;min-width:120px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;background:#f0f0f0;border-radius:20px;height:8px;overflow:hidden;">
                    <div style="width:${pctA}%;background:linear-gradient(90deg,#1a237e,#3949ab);height:100%;border-radius:20px;"></div>
                  </div>
                  <span style="font-size:0.8em;color:#666;min-width:32px;">${pctA}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Popular cobertura Tier 1
  const coberturaEl = document.getElementById('painelTier1Cobertura');
  if (coberturaEl) {
    if (tier1 > 0) {
      const t1Procs = processosVisiveis.filter(p => p.score >= 12);
      const t1Bia = t1Procs.filter(p => p.biaHomologada === 'BIA Realizado').length;
      const t1Bcp = t1Procs.filter(p => p.bcpStatus === 'BCP Realizado').length;
      const t1Drp = t1Procs.filter(p => p.drpStatus === 'DRP Realizado').length;
      const pctBia = Math.round(t1Bia / tier1 * 100);
      const pctBcp = Math.round(t1Bcp / tier1 * 100);
      const pctDrp = Math.round(t1Drp / tier1 * 100);
      const corBia = pctBia >= 80 ? '#2e7d32' : pctBia >= 50 ? '#f57c00' : '#c62828';
      const corBcp = pctBcp >= 80 ? '#2e7d32' : pctBcp >= 50 ? '#f57c00' : '#c62828';
      const corDrp = pctDrp >= 80 ? '#2e7d32' : pctDrp >= 50 ? '#f57c00' : '#c62828';
      coberturaEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">' +
        '<div style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">' +
          '<div style="font-size:0.78em;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">BIA Realizado</div>' +
          '<div style="font-size:2em;font-weight:700;color:' + corBia + ';">' + pctBia + '%</div>' +
          '<div style="font-size:0.8em;color:#888;margin-top:4px;">' + t1Bia + ' de ' + tier1 + ' processos</div>' +
          '<div style="margin-top:8px;background:#e0e0e0;border-radius:20px;height:8px;overflow:hidden;">' +
            '<div style="width:' + pctBia + '%;background:' + corBia + ';height:100%;border-radius:20px;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">' +
          '<div style="font-size:0.78em;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">BCP Realizado</div>' +
          '<div style="font-size:2em;font-weight:700;color:' + corBcp + ';">' + pctBcp + '%</div>' +
          '<div style="font-size:0.8em;color:#888;margin-top:4px;">' + t1Bcp + ' de ' + tier1 + ' processos</div>' +
          '<div style="margin-top:8px;background:#e0e0e0;border-radius:20px;height:8px;overflow:hidden;">' +
            '<div style="width:' + pctBcp + '%;background:' + corBcp + ';height:100%;border-radius:20px;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:center;padding:16px;background:#f8f9fa;border-radius:8px;">' +
          '<div style="font-size:0.78em;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">DRP Realizado</div>' +
          '<div style="font-size:2em;font-weight:700;color:' + corDrp + ';">' + pctDrp + '%</div>' +
          '<div style="font-size:0.8em;color:#888;margin-top:4px;">' + t1Drp + ' de ' + tier1 + ' processos</div>' +
          '<div style="margin-top:8px;background:#e0e0e0;border-radius:20px;height:8px;overflow:hidden;">' +
            '<div style="width:' + pctDrp + '%;background:' + corDrp + ';height:100%;border-radius:20px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    } else {
      coberturaEl.innerHTML = '<p style="font-size:0.9em;color:#999;">Nenhum processo classificado como Tier 1 ainda.</p>';
    }
  }
}

// ============================================================
// PÁGINA: QUESTIONÁRIO (Avaliação de Processos)
// ============================================================
let questionarioAreaSelecionada = '';

async function questionario() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Questionário BIA</h2><p class="page-sub">Avalie o impacto da interrupção de cada processo</p></div>
    </div>
    <div style="margin-bottom:20px;">
      <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Selecione a Área:</label>
      <select id="filtroAreaQuestionario" onchange="filtrarProcessosQuestionario(this.value)" style="padding:10px 14px;border:1px solid #ddd;border-radius:7px;font-size:0.95em;min-width:300px;">
        <option value="">Selecione uma área...</option>
      </select>
    </div>
    <div class="loading" id="loading">
      <div class="skeleton-table">
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:15%;height:16px;"></div><div class="skeleton skeleton-cell" style="width:25%;height:16px;"></div><div class="skeleton skeleton-cell" style="width:15%;height:16px;"></div><div class="skeleton skeleton-cell" style="width:8%;height:16px;"></div><div class="skeleton skeleton-cell" style="width:12%;height:16px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:15%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:30%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:12%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:8%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:10%;height:14px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:12%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:22%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:18%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:6%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:14%;height:14px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:18%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:20%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:14%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:7%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:11%;height:14px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:14%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:28%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:10%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:8%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:12%;height:14px;"></div></div>
      </div>
    </div>
    <div id="listaProcessos" style="display:none;"></div>
    
    <div class="modal-overlay" id="modalQuestionario"><div class="modal" onclick="event.stopPropagation()" style="max-width:700px;max-height:90vh;overflow-y:auto;">
      <h3 id="modalTituloQuestionario">Avaliar Processo</h3>
      <p id="modalProcessoNome" style="color:#666;margin-bottom:20px;font-size:0.95em;"></p>
      <input type="hidden" id="qProcessoId">
      <input type="hidden" id="qArea">
      <input type="hidden" id="qProcesso">
      
      <div id="perguntas-container"></div>
      
      <div style="background:linear-gradient(135deg,#1a237e,#283593);padding:20px;border-radius:8px;margin:20px 0;color:white;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-weight:600;font-size:1.1em;">Score Total</span>
          <span id="scoreTotal" style="font-size:2.5em;font-weight:700;">0</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.2);">
          <span style="font-weight:600;">Classificação:</span>
          <span id="scoreTier" style="font-weight:700;font-size:1.2em;padding:6px 16px;background:rgba(255,255,255,0.2);border-radius:20px;"></span>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalQuestionario()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAvaliacaoProcesso()">Salvar Avaliação</button>
      </div>
    </div></div>
  `;

  try {
    const [processos, areas, perguntas] = await Promise.all([
      API.getProcessos(),
      API.getAreas(),
      API.getPerguntas()
    ]);
    
    // Preencher dropdown de áreas
    const filtroArea = document.getElementById('filtroAreaQuestionario');
    const areasUnicas = [...new Set(areas.map(a => a.nome))].sort();
    filtroArea.innerHTML = '<option value="">Selecione uma área...</option>' + 
      areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
    
    document.getElementById('loading').style.display = 'none';
    
    window.questionarioProcessos = processos;
    window.questionarioAreas = areas;
    window.questionarioPerguntas = perguntas.filter(p => p.ativa);
    window.processosPerguntas = null;
  } catch (err) {
    console.error('Erro ao carregar questionário:', err);
    document.getElementById('loading').innerHTML = '<p style="color:#c62828;text-align:center;">Erro ao carregar dados.</p>';
  }
}

window.filtrarProcessosQuestionario = (area) => {
  questionarioAreaSelecionada = area;
  const container = document.getElementById('listaProcessos');
  
  if (!area) {
    container.style.display = 'none';
    return;
  }
  
  const processosDaArea = window.questionarioProcessos.filter(p => p.area === area);
  
  if (processosDaArea.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">Nenhum processo cadastrado para esta área.</p>';
    return;
  }
  
  container.style.display = 'block';
  container.innerHTML = `
    <div class="group-card">
      <div class="group-header" style="background:#1a237e;color:white;">Processos de ${area}</div>
      ${processosDaArea.map(p => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${p.processo}</div>
            <div class="list-row-sub">${p.descricao || 'Sem descrição'}</div>
          </div>
          <div class="list-row-actions">
            <button class="btn btn-primary" onclick="abrirModalAvaliacaoProcesso(${p.id}, '${p.area.replace(/'/g, "\\'")}'  , '${p.processo.replace(/'/g, "\\'")}')" style="font-size:0.85em;padding:8px 16px;">Avaliar</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

window.abrirModalAvaliacaoProcesso = (processoId, area, processo) => {
  document.getElementById('qProcessoId').value = processoId;
  document.getElementById('qArea').value = area;
  document.getElementById('qProcesso').value = processo;
  document.getElementById('modalProcessoNome').textContent = `${area} > ${processo}`;
  
  // Renderizar perguntas
  const container = document.getElementById('perguntas-container');
  container.innerHTML = window.questionarioPerguntas.map((p, i) => `
    <div style="margin-bottom:32px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #1a237e;">
      <div style="font-weight:600;color:#1a237e;margin-bottom:6px;font-size:0.95em;">${p.pergunta}</div>
      <div style="font-size:0.85em;color:#666;margin-bottom:16px;line-height:1.5;">${p.descricao || ''}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='#c62828'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="4" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#c62828';this.parentElement.style.background='#ffebee';" style="margin-right:8px;width:18px;height:18px;">
          <span style="color:#c62828;font-weight:600;font-size:0.9em;">Alto (4)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='#f57c00'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="2" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#f57c00';this.parentElement.style.background='#fff3e0';" style="margin-right:8px;width:18px;height:18px;">
          <span style="color:#f57c00;font-weight:600;font-size:0.9em;">Médio (2)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='#2e7d32'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="1" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#2e7d32';this.parentElement.style.background='#e8f5e9';" style="margin-right:8px;width:18px;height:18px;">
          <span style="color:#2e7d32;font-weight:600;font-size:0.9em;">Baixo (1)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='#757575'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="0" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#757575';this.parentElement.style.background='#f5f5f5';" style="margin-right:8px;width:18px;height:18px;">
          <span style="color:#757575;font-weight:600;font-size:0.9em;">N/A (0)</span>
        </label>
      </div>
    </div>
  `).join('');
  
  calcularScore();
  document.getElementById('modalQuestionario').classList.add('open');
};

window.atualizarEstiloOpcoes = (radio) => {
  const grupo = radio.parentElement.parentElement;
  const CORES_FALLBACK = {'4':'#c62828','2':'#f57c00','1':'#2e7d32','0':'#757575'};
  const BGS_FALLBACK = {'4':'#ffebee','2':'#fff3e0','1':'#e8f5e9','0':'#f5f5f5'};
  grupo.querySelectorAll('input[type="radio"]').forEach(r => {
    const label = r.parentElement;
    const span = label.querySelector('span');
    const cor = (r.dataset.cor && r.dataset.cor !== 'undefined') ? r.dataset.cor : (CORES_FALLBACK[r.value] || '#555');
    const bg = (r.dataset.bg && r.dataset.bg !== 'undefined') ? r.dataset.bg : (BGS_FALLBACK[r.value] || '#f5f5f5');
    const lbl = (r.dataset.label && r.dataset.label !== 'undefined') ? r.dataset.label : (span ? span.textContent.replace(String.fromCharCode(10004)+' ','') : '');
    const sel = r.checked;
    label.style.borderColor = sel ? cor : '#e0e0e0';
    label.style.borderWidth = sel ? '2.5px' : '2px';
    label.style.background = sel ? bg : 'white';
    if (span) {
      span.style.color = cor;
      span.style.fontWeight = sel ? '700' : '600';
      span.textContent = (sel ? String.fromCharCode(10004)+' ' : '') + lbl;
    }
  });
};

function iniciarDrawerResizeAvaliar() {
  const drawer = document.getElementById('drawerAvaliar');
  const handle = document.getElementById('drawerResizeAvaliar');
  if (!handle || handle._resizeInit) return;
  handle._resizeInit = true;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = drawer.offsetWidth;
    handle.classList.add('resizing');
    const onMove = ev => {
      const newW = Math.min(Math.max(startW + (startX - ev.clientX), 400), window.innerWidth * 0.95);
      drawer.style.width = newW + 'px';
    };
    const onUp = () => {
      handle.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function iniciarDrawerResize() {
  const drawer = document.getElementById('drawerProcesso');
  const handle = document.getElementById('drawerResize');
  if (!handle || handle._resizeInit) return;
  handle._resizeInit = true;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = drawer.offsetWidth;
    handle.classList.add('resizing');
    const onMove = ev => {
      const newW = Math.min(Math.max(startW + (startX - ev.clientX), 320), window.innerWidth * 0.9);
      drawer.style.width = newW + 'px';
    };
    const onUp = () => {
      handle.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

window.calcularScore = () => {
  let total = 0;
  const pergs = window.processosPerguntas || window.questionarioPerguntas || [];
  pergs.forEach((p, i) => {
    const selected = document.querySelector(`input[name="pergunta${i}"]:checked`);
    if (selected) {
      total += parseInt(selected.value);
    }
  });
  
  document.getElementById('scoreTotal').textContent = total;
  document.getElementById('scoreTotal').style.color = 'white';
  
  // Calcular tier
  let tier = '';
  let tierColor = '';
  if (total >= 12) {
    tier = 'Tier 1 (Crítico)';
    tierColor = '#ffcdd2';
  } else if (total >= 6) {
    tier = 'Tier 2 (Essencial)';
    tierColor = '#ffe0b2';
  } else {
    tier = 'Tier 3 (Suporte)';
    tierColor = '#bbdefb';
  }
  
  const tierEl = document.getElementById('scoreTier');
  tierEl.textContent = tier;
  tierEl.style.background = tierColor;
  tierEl.style.color = total > 0 ? '#1a237e' : 'white';
};

window.fecharModalQuestionario = () => {
  document.getElementById('modalQuestionario').classList.remove('open');
};

window.salvarAvaliacaoProcesso = async () => {
  const area = document.getElementById('qArea').value;
  const processo = document.getElementById('qProcesso').value;
  const scores = {};
  let todasRespondidas = true;
  const pergs = window.processosPerguntas || window.questionarioPerguntas || [];
  pergs.forEach((p, i) => {
    const selected = document.querySelector(`input[name="pergunta${i}"]:checked`);
    if (selected) scores[p.pergunta] = parseInt(selected.value);
    else todasRespondidas = false;
  });
  if (!todasRespondidas) return showToast('Por favor, responda todas as perguntas.', '#e65100');

  // Desabilitar botões de salvar e mostrar loading
  const btns = document.querySelectorAll('button[onclick="salvarAvaliacaoProcesso()"]');
  const textoOriginal = [];
  btns.forEach((btn, i) => {
    textoOriginal[i] = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Salvando...';
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
  });

  try {
    const result = await API.post('salvarRespostas', { area, processo, scores });
    if (result.error) throw new Error(result.error);
    if (window.processosPerguntas) {
      fecharModalAvaliar();
      showToast('✅ Avaliação salva com sucesso!', '#2e7d32');
      API.invalidate('getProcessos');
      processos();
    } else {
      fecharModalQuestionario();
      showToast('✅ Avaliação salva com sucesso!', '#2e7d32');
    }
  } catch (err) {
    showToast('❌ Erro ao salvar: ' + err.message, '#c62828');
    // Reabilitar botões em caso de erro
    btns.forEach((btn, i) => {
      btn.disabled = false;
      btn.innerHTML = textoOriginal[i];
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    });
  }
};


// ============================================================
// PÁGINA: COMPONENTES DE SERVIÇO (Catálogo)
// ============================================================
let componentesData = [];
let componentesOrdenacao = { coluna: 'tipo', direcao: 'asc' };

async function componentes() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Componentes de Serviço</h2><p class="page-sub">Gerencie os componentes de infraestrutura e serviços para o DRP</p></div>
      <button class="btn btn-primary" onclick="abrirModalComponente()">+ Novo Componente</button>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Tipo:</label>
      <select id="filtroCompTipo" onchange="filtrarComponentes()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
        <option value="">Todos os tipos</option>
      </select>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="listaComps" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarComponentes('tipo')" style="cursor:pointer;width:12%;">Tipo <span id="sort-comp-tipo"></span></th>
            <th onclick="ordenarComponentes('nome')" style="cursor:pointer;width:15%;">Nome <span id="sort-comp-nome"></span></th>
            <th style="width:18%;">Descrição</th>
            <th style="width:8%;">RTO</th>
            <th style="width:8%;">RPO</th>
            <th style="width:16%;">Estratégia de Backup</th>
            <th onclick="ordenarComponentes('responsavel')" style="cursor:pointer;width:12%;">Responsável <span id="sort-comp-responsavel"></span></th>
            <th style="width:6%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="compRows"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modalComp"><div class="modal" onclick="event.stopPropagation()" style="max-width:580px;">
      <h3 id="modalCompTitulo">Novo Componente</h3>
      <input type="hidden" id="compId">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Tipo</label>
          <input type="text" id="compTipo" list="compTipoList" placeholder="Ex: Servidor, Banco de Dados" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <datalist id="compTipoList"></datalist>
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Nome</label>
          <input type="text" id="compNome" placeholder="Ex: SQL Server Produção" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Descrição</label>
        <input type="text" id="compDescricao" placeholder="Descrição do componente" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RTO</label>
          <input type="text" id="compRto" placeholder="Ex: 4 horas" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RPO</label>
          <input type="text" id="compRpo" placeholder="Ex: 1 hora" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Estratégia de Backup</label>
        <select id="compEstrategia" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
          <option value="">Selecione...</option>
          <option value="Backup & Restore">Backup & Restore (Restaurar ambiente a partir de backups)</option>
          <option value="Cold Site">Cold Site (Local alternativo sem infraestrutura ativa)</option>
          <option value="Warm Standby">Warm Standby (Infraestrutura parcialmente pronta)</option>
          <option value="Active-Passive">Active-Passive (Ambiente secundário pronto para assumir)</option>
          <option value="Active-Active">Active-Active (Dois ou mais ambientes ativos simultaneamente)</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Responsável</label>
        <input type="text" id="compResponsavel" placeholder="Responsável pelo componente" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalComponente()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarComp()">Salvar</button>
      </div>
    </div></div>`;

  try {
    componentesData = await API.getComponentes();
  } catch(e) { componentesData = []; }
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('listaComps').style.display = 'block';
  const tipos = [...new Set(componentesData.map(d => d.tipo))].sort();
  document.getElementById('filtroCompTipo').innerHTML = '<option value="">Todos os tipos</option>' +
    tipos.map(c => `<option value="${c}">${c}</option>`).join('');
  renderizarComponentes();
}

function renderizarComponentes() {
  let data = [...componentesData];
  const filtro = document.getElementById('filtroCompTipo');
  if (filtro && filtro.value) data = data.filter(d => d.tipo === filtro.value);

  data.sort((a, b) => {
    const valA = (a[componentesOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[componentesOrdenacao.coluna] || '').toString().toLowerCase();
    const cmp = valA.localeCompare(valB);
    return componentesOrdenacao.direcao === 'asc' ? cmp : -cmp;
  });

  ['tipo', 'nome', 'responsavel'].forEach(col => {
    const el = document.getElementById(`sort-comp-${col}`);
    if (el) el.textContent = col === componentesOrdenacao.coluna ? (componentesOrdenacao.direcao === 'asc' ? '▲' : '▼') : '';
  });

  document.getElementById('compRows').innerHTML = data.length
    ? data.map(d => `<tr>
        <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${d.tipo}</span></td>
        <td style="font-weight:600;color:#222;">${d.nome}</td>
        <td style="font-size:0.85em;color:#555;">${d.descricao || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.rto || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.rpo || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.estrategia || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.responsavel || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn-icon" onclick="editarComp(${d.id})" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="excluirComp(${d.id})" title="Excluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:#999;padding:40px;">Nenhum componente cadastrado.</td></tr>';
}

window.filtrarComponentes = () => renderizarComponentes();
window.ordenarComponentes = (coluna) => {
  if (componentesOrdenacao.coluna === coluna) {
    componentesOrdenacao.direcao = componentesOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    componentesOrdenacao.coluna = coluna;
    componentesOrdenacao.direcao = 'asc';
  }
  renderizarComponentes();
};

window.abrirModalComponente = (d) => {
  document.getElementById('compId').value = d ? d.id : '';
  document.getElementById('compTipo').value = d ? d.tipo : '';
  document.getElementById('compNome').value = d ? d.nome : '';
  document.getElementById('compDescricao').value = d ? (d.descricao || '') : '';
  document.getElementById('compRto').value = d ? (d.rto || '') : '';
  document.getElementById('compRpo').value = d ? (d.rpo || '') : '';
  document.getElementById('compEstrategia').value = d ? (d.estrategia || '') : '';
  document.getElementById('compResponsavel').value = d ? (d.responsavel || '') : '';
  document.getElementById('modalCompTitulo').textContent = d ? 'Editar Componente' : 'Novo Componente';
  const tipos = [...new Set(componentesData.map(x => x.tipo))].sort();
  document.getElementById('compTipoList').innerHTML = tipos.map(c => `<option value="${c}">`).join('');
  document.getElementById('modalComp').classList.add('open');
};
window.fecharModalComponente = () => document.getElementById('modalComp').classList.remove('open');
window.editarComp = (id) => { const d = componentesData.find(x => x.id === id); if (d) abrirModalComponente(d); };
window.excluirComp = async (id) => {
  if (!confirm('Excluir este componente?')) return;
  try {
    await API.excluirComponente(id);
    componentesData = componentesData.filter(x => x.id !== id);
    renderizarComponentes();
    showToast('✅ Excluído!', '#2e7d32');
    API.invalidate('getComponentes');
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};
window.salvarComp = async () => {
  const d = {
    id: document.getElementById('compId').value ? Number(document.getElementById('compId').value) : null,
    tipo: document.getElementById('compTipo').value.trim(),
    nome: document.getElementById('compNome').value.trim(),
    descricao: document.getElementById('compDescricao').value.trim(),
    rto: document.getElementById('compRto').value.trim(),
    rpo: document.getElementById('compRpo').value.trim(),
    estrategia: document.getElementById('compEstrategia').value.trim(),
    responsavel: document.getElementById('compResponsavel').value.trim(),
  };
  if (!d.tipo) return showToast('Informe o tipo.', '#e65100');
  if (!d.nome) return showToast('Informe o nome.', '#e65100');
  try {
    const result = await API.salvarComponente(d);
    fecharModalComponente();
    showToast('✅ Salvo!', '#2e7d32');
    if (d.id) {
      const idx = componentesData.findIndex(x => x.id === d.id);
      if (idx !== -1) componentesData[idx] = { ...d };
    } else {
      d.id = result.id;
      componentesData.push(d);
    }
    renderizarComponentes();
    API.invalidate('getComponentes');
    window.componentesCatalogo = componentesData;
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};

// ============================================================
// DRP - Componentes do Serviço (inline no drawer - modelo tags por tipo)
// ============================================================
window._drpComponentes = [];

function renderComponentesDrp() {
  const container = document.getElementById('drpComponentesTabela');
  if (!container) return;
  const catalogo = window.componentesCatalogo || [];
  const selecionados = window._drpComponentes || [];
  const comps = selecionados.map(id => catalogo.find(d => d.id === id)).filter(Boolean);

  // Ícones por tipo
  const tipoIcons = {
    'Servidor': '🖥️', 'Servidores': '🖥️',
    'Banco de Dados': '🗄️', 'Database': '🗄️',
    'Aplicação': '📦', 'Aplicações': '📦', 'Software': '📦',
    'Rede': '🌐', 'Network': '🌐',
    'Storage': '💾', 'Armazenamento': '💾',
    'Cloud': '☁️', 'Nuvem': '☁️',
    'Segurança': '🔒',
    'Comunicação': '📡',
    'Outros': '⚙️'
  };

  // Exemplos por tipo
  const tipoExamples = {
    'Servidor': 'Ex: Servidor de aplicação, servidor web, VM de produção',
    'Servidores': 'Ex: Servidor de aplicação, servidor web, VM de produção',
    'Banco de Dados': 'Ex: PostgreSQL primário, SQL Server cluster, Redis cache',
    'Database': 'Ex: PostgreSQL primário, SQL Server cluster, Redis cache',
    'Aplicação': 'Ex: ERP Fortes, portal do cliente, API de integração',
    'Aplicações': 'Ex: ERP Fortes, portal do cliente, API de integração',
    'Software': 'Ex: ERP Fortes, portal do cliente, API de integração',
    'Rede': 'Ex: Firewall, switch core, link dedicado, VPN site-to-site',
    'Network': 'Ex: Firewall, switch core, link dedicado, VPN site-to-site',
    'Storage': 'Ex: NAS, SAN, backup em nuvem, file server',
    'Armazenamento': 'Ex: NAS, SAN, backup em nuvem, file server',
    'Cloud': 'Ex: AWS EC2, Azure VM, Google Cloud Run, S3 bucket',
    'Nuvem': 'Ex: AWS EC2, Azure VM, Google Cloud Run, S3 bucket',
    'Segurança': 'Ex: WAF, antivírus endpoint, SIEM, cofre de senhas',
    'Comunicação': 'Ex: E-mail corporativo, Teams/Slack, PABX, DNS'
  };

  // Obter tipos do catálogo (mesclar Certificados em Segurança)
  const tiposMerge = { 'Certificados': 'Segurança' };
  const tiposSet = new Set(catalogo.map(d => tiposMerge[d.tipo] || d.tipo).filter(Boolean));
  comps.forEach(c => { if (c.tipo) tiposSet.add(tiposMerge[c.tipo] || c.tipo); });
  const tipos = [...tiposSet].sort();

  if (!tipos.length) {
    container.innerHTML = '<p style="font-size:0.85em;color:#999;padding:8px 0;">Nenhum componente cadastrado no catálogo. Clique em "+ Novo" para criar.</p>';
    return;
  }

  // Agrupar selecionados por tipo (com merge)
  const grupos = {};
  tipos.forEach(t => { grupos[t] = []; });
  comps.forEach(c => {
    const t = tiposMerge[c.tipo] || c.tipo || 'Outros';
    if (!grupos[t]) grupos[t] = [];
    if (!grupos[t].find(x => x.id === c.id)) grupos[t].push(c);
  });

  let html = `<p style="font-size:0.78em;color:#888;margin-bottom:10px;">Pense: <em>"Se esse componente falhar, o processo é afetado?"</em> — selecione ou crie os componentes técnicos necessários.</p>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:0.9em;">
    <thead>
      <tr>
        <th style="padding:12px 0;text-align:left;font-weight:600;color:#555;font-size:0.82em;border-bottom:1.5px solid #e0e0e0;width:28%;">Tipo</th>
        <th style="padding:12px 0 12px 20px;text-align:left;font-weight:600;color:#555;font-size:0.82em;border-bottom:1.5px solid #e0e0e0;">Componentes Selecionados</th>
      </tr>
    </thead>
    <tbody>`;

  tipos.forEach(tipo => {
    const itens = grupos[tipo] || [];
    const icon = tipoIcons[tipo] || '⚙️';
    const example = tipoExamples[tipo] || '';
    const count = itens.length;
    const disponiveisNoTipo = catalogo.filter(d => (tiposMerge[d.tipo] || d.tipo) === tipo && !selecionados.includes(d.id));

    const tags = itens.map(c => {
      const tooltip = [c.estrategia, c.responsavel, c.rto ? 'RTO:'+c.rto : ''].filter(Boolean).join(' • ');
      return `<span style="display:inline-flex;align-items:center;gap:3px;background:#1a237e;color:white;padding:4px 10px 4px 12px;border-radius:14px;font-size:0.85em;font-weight:500;white-space:nowrap;cursor:default;" title="${tooltip.replace(/"/g,'&quot;')}">${c.nome}<button onclick="removerComponenteDrp(${c.id})" style="background:none;border:none;cursor:pointer;font-size:1.1em;color:rgba(255,255,255,0.7);line-height:1;padding:0 3px;" onmouseenter="this.style.color='white'" onmouseleave="this.style.color='rgba(255,255,255,0.7)'" title="Remover">&times;</button></span>`;
    }).join(' ');

    const chips = disponiveisNoTipo.map(d => {
      return `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.78em;font-weight:500;background:#f5f6fa;color:#1a237e;cursor:pointer;border:1px solid #e0e0e0;transition:all 0.15s;" onmouseenter="this.style.background='#c5cae9';this.style.borderColor='#1a237e'" onmouseleave="this.style.background='#f5f6fa';this.style.borderColor='#e0e0e0'" onclick="adicionarComponenteDrpById(${d.id})" title="${d.descricao || d.nome}">${d.nome}</span>`;
    }).join(' ');

    const emptyMsg = !count ? `<span style="font-size:0.82em;color:#bbb;font-style:italic;">Nenhum selecionado</span>` : '';

    html += `
      <tr>
        <td style="padding:14px 0;color:#222;font-weight:600;font-size:0.92em;vertical-align:top;border-bottom:1px solid #f0f0f0;">
          <span style="margin-right:4px;">${icon}</span>${tipo}${count ? ` <span style="font-size:0.75em;color:#888;font-weight:400;">(${count})</span>` : ''}
          ${example ? `<div style="font-size:0.72em;font-weight:400;color:#999;margin-top:4px;line-height:1.4;font-style:italic;">${example}</div>` : ''}
        </td>
        <td style="padding:10px 0 10px 20px;color:#444;font-size:0.9em;line-height:2;border-bottom:1px solid #f0f0f0;vertical-align:middle;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            ${tags}
            ${emptyMsg}
            <div style="position:relative;flex:1;min-width:150px;">
              <input type="text" class="drp-type-input" data-tipo="${tipo.replace(/"/g,'&quot;')}" placeholder="Digite para buscar ou criar..." autocomplete="off" style="border:none;border-bottom:1.5px solid #e8eaf6;outline:none;font-size:0.85em;padding:4px 2px;width:100%;background:transparent;transition:border-color 0.2s;" onfocus="this.style.borderColor='#1a237e';mostrarDropdownCompDrp(this,'${tipo.replace(/'/g, "\\'")}')" oninput="mostrarDropdownCompDrp(this,'${tipo.replace(/'/g, "\\'")}')" onblur="this.style.borderColor='#e8eaf6';setTimeout(()=>{const dd=this.parentElement.querySelector('.drp-type-dropdown');if(dd)dd.style.display='none';},200)">
              <div class="drp-type-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:white;border:1.5px solid #e0e0e0;border-radius:0 0 7px 7px;max-height:180px;overflow-y:auto;z-index:50;box-shadow:0 4px 12px rgba(0,0,0,0.12);"></div>
            </div>
          </div>
          ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px;padding-top:4px;border-top:1px dashed #f0f0f0;"><span style="font-size:0.7em;color:#999;margin-right:4px;">Disponíveis:</span>${chips}</div>` : ''}
        </td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Adicionar listeners de Enter nos inputs por tipo
  container.querySelectorAll('.drp-type-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        const tipo = input.dataset.tipo;
        if (val) {
          // Se existe no catálogo, selecionar diretamente
          const catalogo = window.componentesCatalogo || [];
          const existe = catalogo.find(c => c.nome.toLowerCase() === val.toLowerCase() && (tiposMergeGlobal[c.tipo] || c.tipo) === tipo);
          if (existe && !window._drpComponentes.includes(existe.id)) {
            window._drpComponentes.push(existe.id);
            renderComponentesDrp();
            input.value = '';
          }
          // Se não existe, não criar automaticamente — o usuário deve usar o dropdown "+" ou modal
        }
      }
    });
  });
}

// Criar componente rápido (inline, sem modal)
async function criarComponenteRapido(nome, tipo) {
  const catalogo = window.componentesCatalogo || [];
  // Verificar se já existe
  const existe = catalogo.find(c => c.nome.toLowerCase() === nome.toLowerCase() && (tiposMergeGlobal[c.tipo] || c.tipo) === tipo);
  if (existe) {
    if (!window._drpComponentes.includes(existe.id)) {
      window._drpComponentes.push(existe.id);
      renderComponentesDrp();
    }
    return;
  }
  // Criar no backend
  try {
    const result = await API.salvarComponente({ tipo, nome });
    const novComp = { id: result.id, tipo, nome };
    window.componentesCatalogo.push(novComp);
    window._drpComponentes.push(result.id);
    renderComponentesDrp();
    API.invalidate('getComponentes');
  } catch(e) {
    showToast('Erro ao criar: ' + e.message, '#c62828');
  }
}
// Referência global para merge de tipos (usada em criarComponenteRapido)
const tiposMergeGlobal = { 'Certificados': 'Segurança' };

// Dropdown para input de componentes DRP por tipo
window.mostrarDropdownCompDrp = (input, tipo) => {
  const dropdown = input.parentElement.querySelector('.drp-type-dropdown');
  if (!dropdown) return;
  const catalogo = window.componentesCatalogo || [];
  const selecionados = window._drpComponentes || [];
  const filtro = input.value.toLowerCase();

  const disponiveis = catalogo.filter(d =>
    (tiposMergeGlobal[d.tipo] || d.tipo) === tipo &&
    !selecionados.includes(d.id) &&
    (filtro === '' || d.nome.toLowerCase().includes(filtro))
  );

  let html = '';
  disponiveis.forEach(d => {
    html += `<div class="drp-dd-option" onmousedown="adicionarComponenteDrpById(${d.id})" style="padding:7px 12px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
      <div style="font-weight:500;color:#222;">${d.nome}</div>
      ${d.descricao ? `<div style="font-size:0.75em;color:#888;margin-top:1px;">${d.descricao}</div>` : ''}
    </div>`;
  });

  if (input.value.trim() && !catalogo.some(d => d.nome.toLowerCase() === input.value.trim().toLowerCase() && (tiposMergeGlobal[d.tipo] || d.tipo) === tipo)) {
    html += `<div class="drp-dd-option" onmousedown="criarComponenteRapido('${input.value.trim().replace(/'/g,"\\'")}','${tipo.replace(/'/g,"\\'")}')" style="padding:8px 12px;cursor:pointer;color:#1a237e;font-weight:600;border-top:1.5px solid #e8eaf6;background:#f8f9ff;">+ Criar "${input.value.trim()}"</div>`;
  }

  if (!html) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
  dropdown.querySelectorAll('.drp-dd-option').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = '#f0f4ff');
    el.addEventListener('mouseleave', () => el.style.background = el.style.borderTop ? '#f8f9ff' : 'transparent');
  });
};

window.mostrarDropdownComponenteDrp = () => {
  const input = document.getElementById('drpComponenteBusca');
  const dropdown = document.getElementById('drpComponenteDropdown');
  if (!input || !dropdown) return;
  const catalogo = window.componentesCatalogo || [];
  const selecionados = window._drpComponentes || [];
  const filtro = input.value.toLowerCase();
  const disponiveis = catalogo.filter(d =>
    !selecionados.includes(d.id) &&
    (filtro === '' || d.nome.toLowerCase().includes(filtro) || (d.tipo || '').toLowerCase().includes(filtro) || (d.descricao || '').toLowerCase().includes(filtro))
  );
  if (!disponiveis.length) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:0.88em;color:#999;">Nenhum resultado encontrado.</div>';
    dropdown.style.display = 'block';
    return;
  }
  const grupos = {};
  disponiveis.forEach(d => { if (!grupos[d.tipo]) grupos[d.tipo] = []; grupos[d.tipo].push(d); });
  let html = '';
  Object.entries(grupos).sort((a,b) => a[0].localeCompare(b[0])).forEach(([tipo, itens]) => {
    html += `<div style="padding:6px 12px 3px;font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;">${tipo}</div>`;
    itens.forEach(d => {
      html += `<div class="drp-comp-option" onmousedown="adicionarComponenteDrpById(${d.id})" style="padding:8px 12px 8px 20px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
        <div style="font-weight:600;color:#222;">${d.nome}</div>
        ${d.descricao ? `<div style="font-size:0.82em;color:#888;margin-top:2px;">${d.descricao}</div>` : ''}
      </div>`;
    });
  });
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
  dropdown.querySelectorAll('.drp-comp-option').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = '#f0f4ff');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
  });
};

window.adicionarComponenteDrpById = (id) => {
  if (!window._drpComponentes.includes(id)) {
    window._drpComponentes.push(id);
    renderComponentesDrp();
  }
  const input = document.getElementById('drpComponenteBusca');
  const dropdown = document.getElementById('drpComponenteDropdown');
  if (input) input.value = '';
  if (dropdown) dropdown.style.display = 'none';
};

window.removerComponenteDrp = (id) => {
  window._drpComponentes = window._drpComponentes.filter(x => x !== id);
  renderComponentesDrp();
};

window.abrirModalCompDrp = (d) => {
  document.getElementById('compDrpId').value = d ? d.id : '';
  document.getElementById('compDrpTipo').value = d ? d.tipo : '';
  document.getElementById('compDrpNome').value = d ? d.nome : '';
  document.getElementById('compDrpDescricao').value = d ? (d.descricao || '') : '';
  document.getElementById('compDrpRto').value = d ? (d.rto || '') : '';
  document.getElementById('compDrpRpo').value = d ? (d.rpo || '') : '';
  document.getElementById('compDrpEstrategia').value = d ? (d.estrategia || '') : '';
  document.getElementById('compDrpResponsavel').value = d ? (d.responsavel || '') : '';
  document.getElementById('modalCompDrpTitulo').textContent = d ? 'Editar Componente' : 'Novo Componente';
  const tipos = [...new Set((window.componentesCatalogo || []).map(x => x.tipo))].sort();
  document.getElementById('compDrpTipoList').innerHTML = tipos.map(c => `<option value="${c}">`).join('');
  document.getElementById('modalCompDrp').classList.add('open');
};
window.fecharModalCompDrp = () => document.getElementById('modalCompDrp').classList.remove('open');
window.salvarCompDrp = async () => {
  const d = {
    id: document.getElementById('compDrpId').value ? Number(document.getElementById('compDrpId').value) : null,
    tipo: document.getElementById('compDrpTipo').value.trim(),
    nome: document.getElementById('compDrpNome').value.trim(),
    descricao: document.getElementById('compDrpDescricao').value.trim(),
    rto: document.getElementById('compDrpRto').value.trim(),
    rpo: document.getElementById('compDrpRpo').value.trim(),
    estrategia: document.getElementById('compDrpEstrategia').value.trim(),
    responsavel: document.getElementById('compDrpResponsavel').value.trim(),
  };
  if (!d.tipo) return showToast('Informe o tipo.', '#e65100');
  if (!d.nome) return showToast('Informe o nome.', '#e65100');
  try {
    const result = await API.salvarComponente(d);
    fecharModalCompDrp();
    showToast('✅ Salvo!', '#2e7d32');
    if (d.id) {
      const idx = (window.componentesCatalogo || []).findIndex(x => x.id === d.id);
      if (idx !== -1) window.componentesCatalogo[idx] = { ...d };
    } else {
      d.id = result.id;
      window.componentesCatalogo = window.componentesCatalogo || [];
      window.componentesCatalogo.push(d);
    }
    if (!window._drpComponentes.includes(d.id)) {
      window._drpComponentes.push(d.id);
    }
    renderComponentesDrp();
    API.invalidate('getComponentes');
  } catch(e) { showToast('Erro: ' + e.message, '#c62828'); }
};


// ============================================================
// ENVIAR BIA DEPENDÊNCIAS POR E-MAIL (formulário externo via token)
// ============================================================
window.enviarBIADependencias = async () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes de enviar.', '#e65100');

  // Buscar email do responsável da área
  const areas = window.areasDisponiveis || [];
  const area = areas.find(a => a.nome === p.area);
  const emailPadrao = area ? area.email : '';

  const email = prompt('E-mail do dono do processo:', emailPadrao);
  if (!email) return;

  try {
    showToast('📧 Enviando...', '#1a237e');
    const result = await API.post('gerarTokenBIA', { area: p.area, processo: p.processo, email });
    if (result.error) throw new Error(result.error);
    showToast('✅ Formulário enviado para ' + email, '#2e7d32');
  } catch(e) {
    showToast('❌ ' + e.message, '#c62828');
  }
};

// ============================================================
// COPIAR LINK BIA (gerar token sem enviar email)
// ============================================================
window.copiarLinkBIA = async () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes.', '#e65100');

  try {
    showToast('🔗 Gerando link...', '#1a237e');
    const result = await API.post('gerarTokenBIA', { area: p.area, processo: p.processo, email: '_link_only_' });
    if (result.error) throw new Error(result.error);
    await navigator.clipboard.writeText(result.link);
    showToast('✅ Link copiado! Cole no chat para enviar.', '#2e7d32');
  } catch(e) {
    showToast('❌ ' + e.message, '#c62828');
  }
};

// ============================================================
// ENVIAR DRP COMPONENTES POR E-MAIL (formulário externo via token)
// ============================================================
window.enviarDRPComponentes = async () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes de enviar.', '#e65100');

  const areas = window.areasDisponiveis || [];
  const area = areas.find(a => a.nome === p.area);
  const emailPadrao = area ? area.email : '';

  const email = prompt('E-mail do dono do processo:', emailPadrao);
  if (!email) return;

  try {
    showToast('📧 Enviando...', '#1a237e');
    const result = await API.post('gerarTokenDRP', { area: p.area, processo: p.processo, email, id: String(id) });
    if (result.error) throw new Error(result.error);
    showToast('✅ Formulário enviado para ' + email, '#2e7d32');
  } catch(e) {
    showToast('❌ ' + e.message, '#c62828');
  }
};

// ============================================================
// COPIAR LINK DRP (gerar token sem enviar email)
// ============================================================
window.copiarLinkDRP = async () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes.', '#e65100');

  try {
    showToast('🔗 Gerando link...', '#1a237e');
    const result = await API.post('gerarTokenDRP', { area: p.area, processo: p.processo, email: '_link_only_', id: String(id) });
    if (result.error) throw new Error(result.error);
    const link = result.link;
    await navigator.clipboard.writeText(link);
    showToast('✅ Link copiado! Cole no chat para enviar.', '#2e7d32');
  } catch(e) {
    showToast('❌ ' + e.message, '#c62828');
  }
};

// ============================================================
// DOSSIÊ DO PROCESSO
// ============================================================
window.gerarDossieProcesso = () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes de gerar o dossiê.', '#e65100');
  const catalogo = window.dependenciasCatalogo || [];
  const componentesCat = window.componentesCatalogo || [];
  const area = window.areasDisponiveis ? window.areasDisponiveis.find(a => a.nome === p.area) : null;
  const responsavel = area ? area.responsavel : '';
  const score = p.score || 0;
  const tier = score >= 12 ? 'Tier 1 (Crítico)' : score >= 6 ? 'Tier 2 (Essencial)' : score > 0 ? 'Tier 3 (Suporte)' : 'Não avaliado';
  const deps = (p.dependencia || '').split(',').map(s => s.trim()).filter(Boolean);
  const depGrupos = {};
  deps.forEach(nome => { const dep = catalogo.find(d => d.nome === nome); const cat = dep ? dep.categoria : 'Outros'; if (!depGrupos[cat]) depGrupos[cat] = []; depGrupos[cat].push(nome); });
  const contatos = (p.bcpContatos || []).map(cid => catalogo.find(d => d.id === cid)).filter(Boolean);
  const comps = (p.drpComponentes || []).map(cid => componentesCat.find(d => d.id === cid)).filter(Boolean);
  const pergs = window.processosPerguntas || [];
  const respostas = p.respostas || {};
  const win = window.open('', '_blank');
  if (!win) return showToast('Popup bloqueado.', '#e65100');
  win.document.write('<html><head><title>Dossiê - ' + p.processo + '</title><style>body{font-family:Arial;padding:40px;max-width:900px;margin:0 auto;font-size:11pt;line-height:1.6}h1{color:#1a237e}h2{color:#1a237e;border-bottom:2px solid #e8eaf6;padding-bottom:6px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:9.5pt}th{background:#1a237e;color:white;padding:8px 10px;text-align:left}td{padding:7px 10px;border:1px solid #e0e0e0}.badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:9pt;font-weight:700;color:white;background:' + (score >= 12 ? '#c62828' : score >= 6 ? '#f57c00' : '#1565c0') + '}</style></head><body>');
  win.document.write('<h1>' + p.processo + '</h1><p>' + p.area + ' — ' + responsavel + '</p><span class="badge">' + tier + ' • Score ' + score + '</span>');
  win.document.write('<h2>Identificação</h2><p><b>Descrição:</b> ' + (p.descricaoFuncional || '-') + '</p>');
  win.document.write('<h2>BIA</h2><p><b>Status:</b> ' + (p.biaHomologada || '-') + '</p><p><b>Impacto:</b> ' + (p.descricao || '-') + '</p><p><b>RTO:</b> ' + (p.rto || '-') + ' | <b>RPO:</b> ' + (p.rpo || '-') + ' | <b>MTD:</b> ' + (p.mtd || '-') + '</p>');
  if (Object.keys(depGrupos).length) { win.document.write('<h3>Dependências</h3><table><tr><th>Tipo</th><th>Recursos</th></tr>'); Object.entries(depGrupos).sort().forEach(function(e) { win.document.write('<tr><td><b>' + e[0] + '</b></td><td>' + e[1].join(', ') + '</td></tr>'); }); win.document.write('</table>'); }
  win.document.write('<h2>BCP</h2><p><b>Status:</b> ' + (p.bcpStatus || '-') + '</p>');
  if (contatos.length) { win.document.write('<table><tr><th>Nome</th><th>Empresa</th><th>Setor</th><th>Telefone</th><th>Email</th></tr>'); contatos.forEach(function(d) { win.document.write('<tr><td><b>' + d.nome + '</b></td><td>' + (d.empresa||'-') + '</td><td>' + (d.setor||'-') + '</td><td>' + (d.telefone||'-') + '</td><td>' + (d.email||'-') + '</td></tr>'); }); win.document.write('</table>'); }
  win.document.write('<h2>DRP</h2><p><b>Status:</b> ' + (p.drpStatus || '-') + '</p>');
  if (comps.length) { win.document.write('<table><tr><th>Tipo</th><th>Nome</th><th>Estratégia</th></tr>'); comps.forEach(function(c) { win.document.write('<tr><td>' + c.tipo + '</td><td><b>' + c.nome + '</b></td><td>' + (c.estrategia||'-') + '</td></tr>'); }); win.document.write('</table>'); }
  win.document.write('<div style="margin-top:30px;border-top:1px solid #ddd;padding-top:10px;font-size:8pt;color:#999;text-align:center;">Dossiê gerado em ' + new Date().toLocaleDateString('pt-BR') + '</div></body></html>');
  win.document.close();
};

// ============================================================
// GERAÇÃO DE PCN VIA IA (Gemini) - com sidebar recolhível
// ============================================================
window.gerarPCNProcesso = async () => {
  const id = Number(document.getElementById('fId').value);
  if (!id) return showToast('Salve o processo antes de gerar o PCN.', '#e65100');
  
  // Abrir janela de loading (mesma origin para evitar CORS)
  const win = window.open('pcn-viewer.html?loading=1', '_blank');
  if (!win) return showToast('Popup bloqueado. Permita popups para este site.', '#e65100');
  
  const btn = document.querySelector('button[onclick="gerarPCNProcesso()"]');
  const textoOriginal = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Gerando...'; btn.style.opacity = '0.7'; }
  try {
    const result = await API.post('gerarPCN', { id });
    if (result.error) throw new Error(result.error);
    let pcnContent = (result.pcn || '');
    const htmlStart = pcnContent.indexOf('<');
    if (htmlStart > 0) pcnContent = pcnContent.substring(htmlStart);
    pcnContent = pcnContent.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
    const pcnHtml = _buildPCNPage(pcnContent, result, id);
    // Escrever diretamente na janela aberta
    win.document.open();
    win.document.write(pcnHtml);
    win.document.close();
    showToast('✅ PCN gerado!', '#2e7d32');
  } catch(err) {
    console.error('Erro PCN:', err);
    showToast('❌ ' + err.message, '#c62828');
    if (win) win.close();
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; btn.style.opacity = '1'; } }
};

// ============================================================
// ABRIR PCN SALVO
// ============================================================
window.abrirPCNSalvo = () => {
  const id = Number(document.getElementById('fId').value);
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p || !p.pcnSalvo) return showToast('Nenhum PCN salvo.', '#e65100');
  const tier = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Não avaliado';
  const versoes = _parsePCNVersoes(p.pcnSalvo);
  const ultimaVersao = versoes[versoes.length - 1];
  const pcnHtml = _buildPCNPage(ultimaVersao.html, { processo: p.processo, area: p.area, tier, score: p.score }, id, versoes);
  const win = window.open('', '_blank');
  if (!win) return showToast('Popup bloqueado.', '#e65100');
  win.document.open();
  win.document.write(pcnHtml);
  win.document.close();
};

// ============================================================
// PARSER DE VERSÕES DO PCN
// ============================================================
function _parsePCNVersoes(pcnSalvo) {
  if (!pcnSalvo) return [];
  try {
    const parsed = JSON.parse(pcnSalvo);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && parsed.html) return [parsed];
    return [{ versao: 1, data: new Date().toISOString(), autor: 'sistema', html: pcnSalvo }];
  } catch(e) {
    // HTML legado
    return [{ versao: 1, data: new Date().toISOString(), autor: 'sistema', html: pcnSalvo }];
  }
}

// ============================================================
// TEMPLATE HTML DO PCN (compartilhado)
// ============================================================
function _buildPCNPage(pcnContent, info, processId, versoes) {
  const versoesJson = versoes ? JSON.stringify(versoes).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/</g, '\\x3c') : '[]';
  const versaoAtual = versoes ? versoes.length : 1;
  const seletorVersoes = versoes && versoes.length > 1 ? `
    <div style="position:fixed;bottom:16px;right:20px;z-index:60;background:white;border:1.5px solid #e0e0e0;border-radius:8px;padding:8px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-size:9pt;display:flex;align-items:center;gap:8px;">
      <span style="color:#666;">Versão:</span>
      <select id="pcn-versao-select" onchange="trocarVersaoPCN(this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:9pt;">
        ${versoes.map(function(v) { return '<option value="' + (v.versao-1) + '"' + (v.versao === versaoAtual ? ' selected' : '') + '>v' + v.versao + ' — ' + new Date(v.data).toLocaleDateString('pt-BR') + ' ' + new Date(v.data).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</option>'; }).join('')}
      </select>
      <span style="color:#999;font-size:8pt;">${versoes.length} versões</span>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>PCN - ${info.processo || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#333;font-size:10.5pt;line-height:1.6;margin:0}
.sidebar{position:fixed;left:0;top:0;width:260px;height:100vh;overflow-y:auto;background:linear-gradient(180deg,#1a237e,#283593);padding:20px 16px;z-index:50;box-shadow:4px 0 16px rgba(0,0,0,0.15);transition:transform 0.3s ease}
.sidebar.collapsed{transform:translateX(-260px)}
.sidebar h3{color:rgba(255,255,255,0.9);font-size:10pt;margin-bottom:12px}
.sidebar ol{list-style:none;padding:0;margin:0}
.sidebar li{margin-bottom:6px}
.sidebar a{color:rgba(255,255,255,0.75);text-decoration:none;font-size:8.5pt;display:block;padding:4px 8px;border-radius:4px;transition:background 0.2s}
.sidebar a:hover{background:rgba(255,255,255,0.1);color:white}
.sidebar a.h1-link{font-weight:700;font-size:9pt}
.sidebar a.h2-link{font-size:8.5pt}
.sidebar a.h3-link{font-size:8pt;opacity:0.7;padding-left:16px}
.toggle-btn{position:fixed;left:268px;top:12px;z-index:60;background:#1a237e;color:white;border:none;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.2);transition:left 0.3s ease}
.toggle-btn.collapsed{left:12px}
.main{margin-left:280px;padding:40px 50px;max-width:950px;transition:margin-left 0.3s ease}
.main.expanded{margin-left:20px}
h1{font-size:22pt;color:#1a237e;margin-bottom:4px}
h2{font-size:13pt;color:#1a237e;margin:30px 0 14px;padding:8px 14px;background:linear-gradient(135deg,#e8eaf6,#f5f6fa);border-left:4px solid #1a237e;border-radius:0 6px 6px 0}
h3{font-size:11pt;color:#333;margin:20px 0 8px}
p{margin-bottom:8px}
ul,ol{margin:6px 0 12px 24px}
li{margin-bottom:5px}
table{width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:9.5pt}
th{background:#1a237e;color:white;padding:9px 12px;text-align:left;font-weight:600;font-size:9pt}
td{padding:8px 12px;border:1px solid #ddd;vertical-align:top}
tr:nth-child(even){background:#fafbfc}
.cover{background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:40px 50px;margin:-40px -50px 30px;border-radius:0 0 12px 12px}
.cover h1{color:white;font-size:24pt}
.cover p{color:rgba(255,255,255,0.85)}
.cover .badge{background:rgba(255,255,255,0.2);color:white;display:inline-block;padding:5px 16px;border-radius:14px;font-size:9.5pt;font-weight:700;margin-top:10px}
.btn-action{position:fixed;top:12px;padding:10px 20px;background:#1a237e;color:white;border:none;border-radius:8px;font-size:9.5pt;cursor:pointer;font-weight:600;z-index:60;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.btn-action:hover{opacity:0.9}
.footer{margin-top:40px;padding-top:16px;border-top:2px solid #e8eaf6;font-size:8pt;color:#999;text-align:center}
@media print{.sidebar,.toggle-btn,.btn-action,#pcn-versao-select,.version-panel{display:none!important}.main{margin-left:0!important;padding:20px 30px}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.cover{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;margin:-20px -30px 20px;padding:30px}th{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}h2{page-break-after:avoid}table{page-break-inside:avoid}}
</style>
</head>
<body>
<nav class="sidebar" id="pcn-sidebar"><h3>📋 Navegação</h3><ol id="pcn-nav-list"></ol></nav>
<button class="toggle-btn" id="pcn-toggle" onclick="togglePCNSidebar()">☰</button>
<button class="btn-action" style="right:180px;" onclick="window.print()">🖨️ Imprimir / PDF</button>
<button class="btn-action" style="right:20px;background:#2e7d32;" onclick="salvarVersaoPCN()">💾 Salvar versão</button>
${seletorVersoes}
<div class="main" id="pcn-main">
  <div class="cover">
    <img src="https://bia-forte-2025.web.app/logo_fortes.png" style="height:40px;margin-bottom:16px;" alt="Fortes" onerror="this.style.display='none'">
    <h1>Plano de Continuidade de Negócios</h1>
    <p style="font-size:13pt;">${info.processo || ''}</p>
    <p>Área: ${info.area || ''}</p>
    <span class="badge">${info.tier || ''} • Score ${info.score || 0}</span>
    <p style="margin-top:16px;font-size:9pt;opacity:0.7;">Versão ${versaoAtual} • ${new Date().toLocaleDateString('pt-BR')} • Classificação: Uso Interno</p>
  </div>
  <div id="pcn-editavel" contenteditable="true" style="outline:none;min-height:200px;">
  ${pcnContent}
  </div>
  <div class="footer">
    <img src="https://bia-forte-2025.web.app/logo_fortes.png" style="height:24px;margin-bottom:6px;" alt="Fortes" onerror="this.style.display='none'"><br>
    PCN v${versaoAtual} • Fortes Tecnologia
  </div>
</div>
<script>
var PROCESS_ID = ${processId};
var PCN_API_URL = '` + API_URL + `';
var PCN_AREA = '${(info.area || '').replace(/'/g, "\\'")}';
var PCN_PROCESSO = '${(info.processo || '').replace(/'/g, "\\'")}';
var PCN_VERSOES = JSON.parse('${versoesJson}');
function buildNav(){
  var el = document.getElementById('pcn-editavel');
  var nav = document.getElementById('pcn-nav-list');
  if(!el||!nav)return;
  var hs = el.querySelectorAll('h1,h2,h3');
  if(!hs.length){document.getElementById('pcn-sidebar').style.display='none';document.getElementById('pcn-toggle').style.display='none';return;}
  var html='';
  for(var i=0;i<hs.length;i++){var h=hs[i];var sid='s'+i;h.id=sid;var cls=h.tagName==='H1'?'h1-link':h.tagName==='H2'?'h2-link':'h3-link';html+='<li style="'+(h.tagName==='H3'?'padding-left:12px;':'')+'"><a href="#'+sid+'" class="'+cls+'">'+h.textContent.trim()+'</a></li>';}
  nav.innerHTML=html;
}
// Tentar construir nav em múltiplos momentos para garantir que funciona
setTimeout(buildNav, 300);
setTimeout(buildNav, 1000);
setTimeout(buildNav, 2000);
setTimeout(buildNav, 4000);
// Também observer mutations no conteúdo
if(window.MutationObserver){
  var _navBuilt = false;
  var _obs = new MutationObserver(function(){if(!_navBuilt){_navBuilt=true;setTimeout(buildNav,200);}});
  var _target = document.getElementById('pcn-editavel');
  if(_target) _obs.observe(_target,{childList:true,subtree:true});
}
function togglePCNSidebar(){
  var sb=document.getElementById('pcn-sidebar');
  var mn=document.getElementById('pcn-main');
  var tb=document.getElementById('pcn-toggle');
  sb.classList.toggle('collapsed');
  mn.classList.toggle('expanded');
  tb.classList.toggle('collapsed');
}
function trocarVersaoPCN(idx) {
  var versao = PCN_VERSOES[Number(idx)];
  if (versao && versao.html) {
    document.getElementById('pcn-editavel').innerHTML = versao.html;
    setTimeout(function(){
      var el = document.getElementById('pcn-editavel');
      var nav = document.getElementById('pcn-nav-list');
      var hs = el.querySelectorAll('h1,h2,h3');
      var html='';
      for(var i=0;i<hs.length;i++){var h=hs[i];var sid='s'+i;h.id=sid;var cls=h.tagName==='H1'?'h1-link':h.tagName==='H2'?'h2-link':'h3-link';html+='<li style="'+(h.tagName==='H3'?'padding-left:12px;':'')+'"><a href="#'+sid+'" class="'+cls+'">'+h.textContent.trim()+'</a></li>';}
      nav.innerHTML=html;
    },100);
  }
}
async function salvarVersaoPCN(){
  var conteudo=document.getElementById('pcn-editavel').innerHTML;
  var btn=document.querySelector('button[onclick="salvarVersaoPCN()"]');
  if(btn){btn.disabled=true;btn.textContent='⏳ Salvando...';}
  try{
    var payload = JSON.stringify({action:'salvarPCN',id:String(PROCESS_ID),area:PCN_AREA,processo:PCN_PROCESSO,pcnHtml:conteudo});
    var res = await fetch(PCN_API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body: payload,
      redirect:'follow'
    });
    var text = await res.text();
    var data = JSON.parse(text);
    if(data.error) throw new Error(data.error);
    alert('✅ Versão ' + (data.versao || '') + ' salva com sucesso! (' + (data.totalVersoes || '') + ' versões no total)');
  }catch(e){alert('❌ Erro: '+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='💾 Salvar versão';}}
}
</script>
</body>
</html>`;
}


// ============================================================
// ABRIR PCN DIRETO DA TABELA DE PROCESSOS
// ============================================================
window.abrirPCNDireto = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p || !p.pcnSalvo) return showToast('Nenhum PCN salvo para este processo.', '#e65100');
  const tier = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Não avaliado';
  const versoes = _parsePCNVersoes(p.pcnSalvo);
  const ultimaVersao = versoes[versoes.length - 1];
  const pcnHtml = _buildPCNPage(ultimaVersao.html, { processo: p.processo, area: p.area, tier, score: p.score }, id, versoes);
  const win = window.open('', '_blank');
  if (!win) return showToast('Popup bloqueado.', '#e65100');
  win.document.open();
  win.document.write(pcnHtml);
  win.document.close();
};


// ============================================================
// BCP - TABELA DE FORNECEDORES (com Plano B e SLA)
// ============================================================
function renderFornecedoresBcp() {
  const container = document.getElementById('bcpFornecedoresTabela');
  if (!container) return;
  const catalogo = window.dependenciasCatalogo || [];
  const selecionadas = window._dependenciaSelecionadas || [];
  
  // Filtrar fornecedores do processo
  const fornecedores = selecionadas.filter(nome => {
    const dep = catalogo.find(d => d.nome === nome);
    return dep && ['Fornecedores', 'Fornecedor'].includes(dep.categoria);
  });
  
  if (!fornecedores.length) {
    container.innerHTML = '<p style="font-size:0.85em;color:#999;padding:8px 0;">Nenhum fornecedor mapeado na BIA.</p>';
    return;
  }
  
  let html = `<table style="width:100%;border-collapse:collapse;font-size:0.88em;border:1.5px solid #e0e0e0;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#f5f6fa;">
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Nome</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Empresa</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Papel</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Telefone</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Contingência / Plano B</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">SLA Contratado</th>
      </tr>
    </thead>
    <tbody>`;
  
  fornecedores.forEach(nome => {
    const dep = catalogo.find(d => d.nome === nome) || {};
    html += `<tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:10px 14px;font-weight:600;color:#222;">${nome}</td>
      <td style="padding:10px 14px;color:#555;">${dep.empresa || '-'}</td>
      <td style="padding:10px 14px;color:#555;">${dep.detalhes || '-'}</td>
      <td style="padding:10px 14px;color:#555;">${dep.telefone || '-'}</td>
      <td style="padding:6px 8px;"><input type="text" class="planoB-contingencia" data-dep="${nome}" placeholder="Ex: Provedor alternativo..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.9em;box-sizing:border-box;"></td>
      <td style="padding:6px 8px;"><input type="text" class="sla-valor" data-dep="${nome}" placeholder="Ex: Suporte 24x7, 15min..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.9em;box-sizing:border-box;"></td>
    </tr>`;
  });
  
  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ============================================================
// PÁGINA: PCNs - Biblioteca de Planos de Continuidade
// ============================================================
async function pcns() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>📋 Planos de Continuidade (PCNs)</h2><p class="page-sub">Navegue pelos PCNs gerados, organizados por área</p></div>
    </div>
    <div class="loading" id="loading">
      <div class="skeleton-table">
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:100%;height:40px;border-radius:8px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:60%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:20%;height:14px;"></div></div>
        <div class="skeleton-row"><div class="skeleton skeleton-cell" style="width:50%;height:14px;"></div><div class="skeleton skeleton-cell" style="width:15%;height:14px;"></div></div>
      </div>
    </div>
    <div id="pcns-lista"></div>`;

  try {
    // Invalidar cache para garantir dados frescos
    API.invalidate('getProcessos');
    // Carregar processos (que contêm os PCNs salvos)
    const processos = await API.getProcessos();
    window.processosData = processos; // Garantir que está disponível para abrirPCNDireto
    document.getElementById('loading').style.display = 'none';

    // Filtrar apenas processos com PCN salvo
    let comPCN = processos.filter(p => p.pcnSalvo);

    // Gestor: filtrar apenas sua área
    if (window.USER_PERFIL !== 'admin' && window.USER_AREA) {
      comPCN = comPCN.filter(p => p.area === window.USER_AREA);
    } else if (window.USER_PERFIL !== 'admin' && !window.USER_AREA) {
      document.getElementById('pcns-lista').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:3em;margin-bottom:16px;">🔒</div>
          <h3 style="color:#666;margin-bottom:8px;">Acesso não configurado</h3>
          <p>Seu e-mail ainda não está vinculado a uma área. Solicite ao administrador que configure seu acesso.</p>
        </div>`;
      return;
    }

    if (!comPCN.length) {
      document.getElementById('pcns-lista').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:3em;margin-bottom:16px;">📄</div>
          <h3 style="color:#666;margin-bottom:8px;">Nenhum PCN gerado ainda</h3>
          <p>Gere PCNs na tela de Processos clicando em "🤖 Gerar PCN".</p>
        </div>`;
      return;
    }

    // Agrupar por área
    const porArea = {};
    comPCN.forEach(p => {
      const area = p.area || 'Sem Área';
      if (!porArea[area]) porArea[area] = [];
      porArea[area].push(p);
    });

    // Cores por tier
    const tierColor = (score) => score >= 12 ? '#c62828' : score >= 6 ? '#f57c00' : score > 0 ? '#1565c0' : '#999';
    const tierLabel = (score) => score >= 12 ? 'Tier 1' : score >= 6 ? 'Tier 2' : score > 0 ? 'Tier 3' : '-';

    // Renderizar
    let html = `<div style="margin-bottom:16px;display:flex;align-items:center;gap:16px;">
      <span style="font-size:0.9em;color:#666;">${comPCN.length} PCN${comPCN.length > 1 ? 's' : ''} em ${Object.keys(porArea).length} área${Object.keys(porArea).length > 1 ? 's' : ''}</span>
    </div>`;

    Object.entries(porArea).sort((a, b) => a[0].localeCompare(b[0])).forEach(([area, procs]) => {
      html += `<div style="margin-bottom:24px;">
        <div style="background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:12px 20px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;font-size:1em;">📁 ${area}</span>
          <span style="font-size:0.8em;opacity:0.8;">${procs.length} processo${procs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="border:1.5px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">`;

      procs.sort((a, b) => (b.score || 0) - (a.score || 0)).forEach(p => {
        const versoes = _parsePCNVersoes(p.pcnSalvo);
        const ultimaVersao = versoes[versoes.length - 1];
        const dataVersao = ultimaVersao && ultimaVersao.data ? new Date(ultimaVersao.data).toLocaleDateString('pt-BR') : '-';
        const numVersoes = versoes.length;

        html += `<div style="display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid #f0f0f0;transition:background 0.15s;" 
                      onmouseenter="this.style.background='#f8f9ff'" onmouseleave="this.style.background='white'">
          <div style="flex:1;cursor:pointer;" onclick="abrirPCNDireto(${p.id})">
            <div style="font-weight:600;color:#222;font-size:0.95em;">${p.processo}</div>
            <div style="font-size:0.8em;color:#888;margin-top:3px;">
              Última versão: ${dataVersao} • ${numVersoes} versão${numVersoes > 1 ? 'ões' : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="background:${tierColor(p.score)};color:white;padding:3px 10px;border-radius:10px;font-size:0.75em;font-weight:700;">${tierLabel(p.score)} • ${p.score || 0}</span>
            <span style="color:#1a237e;font-size:1.2em;cursor:pointer;" onclick="abrirPCNDireto(${p.id})" title="Abrir PCN">📄</span>
            <button onclick="event.stopPropagation();excluirPCN(${p.id},'${p.area.replace(/'/g,"\\'")}','${p.processo.replace(/'/g,"\\'")}')" style="background:none;border:none;cursor:pointer;color:#999;font-size:1.1em;padding:4px;" onmouseenter="this.style.color='#c62828'" onmouseleave="this.style.color='#999'" title="Excluir PCN">🗑️</button>
          </div>
        </div>`;
      });

      html += `</div></div>`;
    });

    document.getElementById('pcns-lista').innerHTML = html;
  } catch (err) {
    document.getElementById('loading').innerHTML = `
      <div style="color:#c62828;padding:20px;text-align:center;">
        <h3>❌ Erro ao carregar PCNs</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

// ============================================================
// EXCLUIR PCN
// ============================================================
window.excluirPCN = async (id, area, processo) => {
  if (!confirm('Tem certeza que deseja excluir o PCN de "' + processo + '"? Esta ação não pode ser desfeita.')) return;
  try {
    showToast('🗑️ Excluindo PCN...', '#555');
    const result = await API.post('excluirPCN', { id: String(id), area, processo });
    if (result.error) throw new Error(result.error);
    // Atualizar localmente
    const p = window.processosData.find(proc => proc.id === id);
    if (p) p.pcnSalvo = '';
    showToast('✅ PCN excluído.', '#2e7d32');
    API.invalidate('getProcessos');
    pcns(); // Recarregar lista
  } catch(e) {
    showToast('❌ ' + e.message, '#c62828');
  }
};
