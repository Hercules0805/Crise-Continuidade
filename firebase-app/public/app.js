// ============================================================
// SPA - ROTEAMENTO E PÁGINAS
// ============================================================

const app = document.getElementById('app');
const pages = {
  processos, perguntas, areas, pessoas, admin, dependencias, componentes, pcns, riscos,
  'indicadores-dashboard': indicadoresDashboard,
  'indicadores-cadastro': indicadoresCadastro,
  'indicadores-lancamento': indicadoresLancamento,
  'indicadores-matriz': indicadoresMatriz,
  monitor,
  fornecedores,
  'fornecedores-criterios': fornecedoresCriterios,
  'fornecedores-cadastro': fornecedoresCadastro,
  'fornecedores-categorias': fornecedoresCategorias,
  perfis,
};

// Paleta rotativa de 10 cores para tags de categoria dinâmicas (dependências/BIA).
// Fonte única — ver .amazonq/rules/ui-referencias.md, seção "Paleta de categorias".
// avaliar.html mantém sua própria cópia por ser uma página pública standalone.
const CATEGORIA_CORES = ['#37474f','#1a237e','#c62828','#e65100','#00838f','#6a1b9a','#00695c','#1565c0','#4e342e','#558b2f'];

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
  const hash = window.location.hash.slice(1) || _paginaInicialDoPerfil();
  const [page, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr || '');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.nav-group').forEach(g => g.classList.toggle('has-active', !!g.querySelector('.nav-link.active')));

  // Menu escondido nao e permissao. Sem esta guarda, digitar #processos na barra
  // de endereco abria a tela para quem nao deveria ve-la — as regras do banco
  // protegiam os dados, mas a tela abria e parecia um sistema quebrado.
  if (!Perfis.podeVerTela(window.USER_PERFIL, page)) {
    _telaSemAcesso(page);
    return;
  }

  const pageFunc = pages[page] || pages[_paginaInicialDoPerfil()];
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

/** Primeira tela que este perfil ve — e onde ele cai quando nao pede nada. */
function _paginaInicialDoPerfil() {
  const telas = Perfis.telasDoPerfil(window.USER_PERFIL);
  if (telas === '*') return 'processos';
  return telas[0] || 'processos';
}

function _telaSemAcesso(pagina) {
  const inicial = _paginaInicialDoPerfil();
  app.innerHTML = `
    <div style="max-width:520px;margin:60px auto;text-align:center;">
      <div style="font-size:2.4em;margin-bottom:10px;">🔒</div>
      <h2 style="color:#1a237e;margin-bottom:8px;">Esta tela não é do seu perfil</h2>
      <p style="color:#666;font-size:0.95em;line-height:1.6;">
        O seu acesso é <strong>${esc(Perfis.rotulo(window.USER_PERFIL))}</strong>, que não inclui esta tela.
        Se você precisa dela, peça ao administrador do sistema.
      </p>
      <a href="#${esc(inicial)}" class="btn btn-primary" style="margin-top:16px;display:inline-block;">Voltar para o início</a>
    </div>`;
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
    <div style="margin-bottom:16px;">
      <input type="text" id="buscaPergunta" placeholder="🔍 Buscar pergunta..." oninput="filtrarPerguntas()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:300px;">
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
          <div class="list-row-sub">${esc(p.descricao || '')}</div>
        </div>
        <div class="list-row-actions">
          ${p.ativa ? '<span class="badge badge-green">Ativa</span>' : '<span class="badge badge-gray">Inativa</span>'}
          <button class="btn-icon" onclick="editarPergunta('${p.id}')">✏️</button>
          <button class="btn-icon" onclick="excluirPergunta('${p.id}')">🗑️</button>
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

window.filtrarPerguntas = () => {
  const busca = (document.getElementById('buscaPergunta') || {}).value || '';
  const termo = busca.toLowerCase();
  const lista = document.getElementById('lista');
  if (!lista) return;
  lista.querySelectorAll('.list-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!termo || text.includes(termo)) ? '' : 'none';
  });
};
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
  
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  
  // Mostrar score/tier se já avaliado
  if (resumoContainer && p && p.score > 0) {
    const tier = Criticidade.tierDoProcesso(p);
    const cor = Criticidade.corDoTier(tier);
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
  
  const CAT_CORES_PALETTE = CATEGORIA_CORES;
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
  
  // Marca de qual processo sao estes radios. salvarProcesso so aceita as
  // respostas quando esta marca casa com o processo aberto — sem isso, os
  // radios do processo anterior sobrevivem no DOM e vao para o processo atual.
  container.dataset.processoId = id;
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
            <div style="font-size:0.81em;color:#888;margin-bottom:12px;line-height:1.5;">${esc(perg.descricao || '')}</div>
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
        const radio = container.querySelector(`input[name="avalInline${i}"][value="${val}"]`);
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
  // Le sempre dentro da aba Avaliacao, nunca do documento inteiro: um radio
  // orfao de outro processo nao pode entrar na conta.
  const escopoAval = document.getElementById('avaliacaoPerguntas') || document;
  let total = 0;
  const pergs = window.processosPerguntas || [];
  pergs.forEach((pg, i) => {
    const sel = escopoAval.querySelector(`input[name="avalInline${i}"]:checked`);
    if (sel) total += Number(sel.value);
  });
  // Atualizar resumo de score
  const resumoContainer = document.getElementById('avaliacaoScoreResumo');
  if (resumoContainer && total > 0) {
    const tier = Criticidade.tierPorScore(total);
    const cor = Criticidade.corDoTier(tier);
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
    const sel = escopoAval.querySelector(`input[name="avalInline${i}"]:checked`);
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
    disponiveis.map(d => `<option value="${d.id}">${esc(d.nome)} (${esc(d.categoria)})</option>`).join('');
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
      html += `<div class="bcp-contato-option" onmousedown="adicionarContatoBcpById('${d.id}')" style="padding:8px 12px 8px 20px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
        <div style="font-weight:600;color:#222;">${esc(d.nome)}</div>
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
          <td style="padding:12px 14px;font-weight:600;color:#222;">${esc(d.nome || '-')}</td>
          <td style="padding:12px 14px;color:#555;">${esc(d.empresa || '-')}</td>
          <td style="padding:12px 14px;color:#555;">${esc(d.setor || '-')}</td>
          <td style="padding:6px 8px;"><input type="text" class="papel-crise-input" data-id="${d.id}" value="${esc(d.detalhes || '')}" placeholder="Papel neste processo..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.88em;box-sizing:border-box;"></td>
          <td style="padding:12px 14px;color:#555;">${esc(d.telefone || '-')}</td>
          <td style="padding:12px 14px;color:#555;">${esc(d.email || '-')}</td>
          <td style="padding:12px 6px;text-align:center;">
            <button onclick="removerContatoBcp('${d.id}')" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:1.1em;" title="Remover">&times;</button>
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
              <button class="btn-icon" onclick="editarConfigResposta('${escJs(cat)}', ${idx})" title="Editar">✏️</button>
              <button class="btn-icon" onclick="excluirConfigResposta('${escJs(cat)}', ${idx})" title="Excluir">🗑️</button>
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
    // docId do documento no Firestore (exposto como rowIndex/id pelo api.js)
    document.getElementById('crRowIndex').value = op.rowIndex || op.id || '';
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
  const op = window.configRespostasData[cat][idx];
  const rowIndex = op.rowIndex || op.id;
  await API.excluirConfigResposta({ rowIndex });
  API.invalidate('getConfigRespostas');
  showToast('🗑️ Excluído.', '#555');
  const config = await API.getConfigRespostas();
  window.configRespostasData = config;
  renderizarConfigRespostas(config);
};

window.salvarPergunta = async () => {
  const p = {
    id: document.getElementById('fId').value || null,
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
// Compartilhado com Pessoas (Cadastros) e com o modal de Fornecedor: e o
// mesmo catalogo de dependencias, categoria Pessoas.
let pessoasData = [];

async function areas() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Áreas</h2><p class="page-sub">Cadastre as áreas da empresa que participam do BIA</p></div>
      <button class="btn btn-primary" onclick="abrirModalArea()">+ Nova Área</button>
    </div>
    <div style="margin-bottom:16px;">
      <input type="text" id="buscaArea" placeholder="🔍 Buscar área..." oninput="renderizarAreas()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:300px;">
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
      <select id="fResponsavel"><option value="">Selecione...</option></select>
      <span style="font-size:0.75em;color:#888;display:block;margin-top:-6px;margin-bottom:8px;">Vem do cadastro de Pessoas (Cadastros → Pessoas).</span>
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

  const [data, deps] = await Promise.all([API.getAreas(), API.getDependencias()]);
  pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('lista').style.display = 'block';

  window.areasData = data;
  renderizarAreas();
}

function renderizarAreas() {
  let data = [...window.areasData];

  // Filtrar por busca
  const busca = (document.getElementById('buscaArea') || {}).value || '';
  if (busca.trim()) {
    const termo = busca.toLowerCase();
    data = data.filter(a => 
      (a.nome || '').toLowerCase().includes(termo) ||
      (a.responsavel || '').toLowerCase().includes(termo) ||
      (a.email || '').toLowerCase().includes(termo)
    );
  }
  
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
        <td>${esc(a.nome)}</td>
        <td>${esc(a.responsavel || '')}</td>
        <td>${esc(a.email || '')}</td>
        <td>${esc(a.solucao || '')}</td>
        <td style="text-align:center;">
          <button class="btn-icon" onclick="editarArea('${a.id}')" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="excluirArea('${a.id}')" title="Excluir">
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
  const responsavelAtual = a ? (a.responsavel || '') : '';
  // Area antiga pode ter responsavel em texto livre que nao bate com nenhuma
  // pessoa cadastrada -- vira opcao extra selecionada, nunca some em silencio
  // so por abrir o modal (mesmo padrao ja usado pra Categoria do fornecedor).
  const temNaLista = pessoasData.some((p) => p.nome === responsavelAtual);
  document.getElementById('fResponsavel').innerHTML = '<option value="">Selecione...</option>' +
    pessoasData.map((p) => `<option value="${esc(p.nome)}">${esc(p.nome)}</option>`).join('') +
    (responsavelAtual && !temNaLista ? `<option value="${esc(responsavelAtual)}">${esc(responsavelAtual)} (não cadastrado como pessoa)</option>` : '');
  document.getElementById('fResponsavel').value = responsavelAtual;
  document.getElementById('fEmail').value = a ? a.email : '';
  document.getElementById('fSolucao').value = a ? a.solucao : '';
  document.getElementById('modalTitulo').textContent = a ? 'Editar Área' : 'Nova Área';
  document.getElementById('modal').classList.add('open');
};

window.editarArea = (id) => abrirModalArea(window.areasData.find(a => a.id === id));

window.salvarArea = async () => {
  const a = {
    id: document.getElementById('fId').value || null,
    nome: document.getElementById('fNome').value.trim(),
    responsavel: document.getElementById('fResponsavel').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    solucao: document.getElementById('fSolucao').value.trim(),
  };
  if (!a.nome) return showToast('Informe o nome da área.', '#e65100');
  const r = await API.salvarArea(a);
  // Ja sabemos exatamente o que foi gravado (r.dado) -- so atualiza esta area
  // no array ja carregado, sem reconstruir a pagina inteira nem buscar Areas
  // e Dependencias de novo (o que areas() fazia).
  const item = { ...r.dado, id: r.id };
  const idx = window.areasData.findIndex((x) => String(x.id) === String(r.id));
  if (idx >= 0) window.areasData[idx] = item; else window.areasData.push(item);
  fecharModal();
  showToast('✅ Salvo!', '#2e7d32');
  renderizarAreas();
};

window.excluirArea = async (id) => {
  if (!confirm('Excluir esta área?')) return;
  await API.excluirArea(id);
  showToast('🗑️ Excluído.', '#555');
  areas();
};

// ============================================================
// PÁGINA: PESSOAS (Tabela com ordenação)
//
// Pessoas ja existia como uma das 5 categorias do catalogo /dependencias
// (Fornecedores, Infraestrutura, Pessoas, Sistemas, Processos Internos), mas
// so era editavel pela tela generica de Cadastros -> Dependencias. Ganha tela
// propria pela mesma razao que Fornecedores ja tem uma: e usada em outro
// lugar do sistema (Gestor do Contrato do fornecedor, Responsavel da area) e
// precisa de uma lista limpa pra escolher, sem os campos que so fazem
// sentido pras outras 4 categorias.
// ============================================================
let pessoasOrdenacao = { coluna: 'nome', direcao: 'asc' };

async function pessoas() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Pessoas</h2><p class="page-sub">Usadas como Gestor do Contrato (Fornecedores) e Responsável (Áreas)</p></div>
      <button class="btn btn-primary" onclick="abrirModalPessoa()">+ Nova Pessoa</button>
    </div>
    <div style="margin-bottom:16px;">
      <input type="text" id="buscaPessoa" placeholder="🔍 Buscar pessoa..." oninput="renderizarPessoas()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:300px;">
    </div>
    <div class="loading" id="loadingPessoas">⏳ Carregando...</div>
    <div class="data-table" id="listaPessoas" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarPessoas('nome')" style="cursor:pointer;">Nome <span id="sort-pessoa-nome"></span></th>
            <th onclick="ordenarPessoas('detalhes')" style="cursor:pointer;">Cargo <span id="sort-pessoa-detalhes"></span></th>
            <th onclick="ordenarPessoas('telefone')" style="cursor:pointer;">Telefone <span id="sort-pessoa-telefone"></span></th>
            <th onclick="ordenarPessoas('email')" style="cursor:pointer;">Email <span id="sort-pessoa-email"></span></th>
            <th style="width:100px;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="rowsPessoas"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modalPessoa"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalPessoaTitulo">Nova Pessoa</h3>
      <input type="hidden" id="pessoaId">
      <label>Nome</label>
      <input type="text" id="pessoaNome" placeholder="Nome da pessoa">
      <label>Cargo / Papel</label>
      <input type="text" id="pessoaDetalhes" placeholder="Ex: Gerente de TI">
      <label>Telefone</label>
      <input type="text" id="pessoaTelefone" placeholder="Telefone">
      <label>Email</label>
      <input type="email" id="pessoaEmail" placeholder="email@empresa.com">
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalPessoa()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPessoaCadastro()">Salvar</button>
      </div>
    </div></div>`;

  const deps = await API.getDependencias();
  pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
  document.getElementById('loadingPessoas').style.display = 'none';
  document.getElementById('listaPessoas').style.display = 'block';
  renderizarPessoas();
}

function renderizarPessoas() {
  let data = [...pessoasData];

  const busca = (document.getElementById('buscaPessoa') || {}).value || '';
  if (busca.trim()) {
    const termo = busca.toLowerCase();
    data = data.filter((p) =>
      (p.nome || '').toLowerCase().includes(termo) ||
      (p.detalhes || '').toLowerCase().includes(termo) ||
      (p.email || '').toLowerCase().includes(termo));
  }

  data.sort((a, b) => {
    const valA = (a[pessoasOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[pessoasOrdenacao.coluna] || '').toString().toLowerCase();
    const comparacao = valA.localeCompare(valB);
    return pessoasOrdenacao.direcao === 'asc' ? comparacao : -comparacao;
  });

  ['nome', 'detalhes', 'telefone', 'email'].forEach((col) => {
    const el = document.getElementById(`sort-pessoa-${col}`);
    if (el) el.textContent = col === pessoasOrdenacao.coluna ? (pessoasOrdenacao.direcao === 'asc' ? '▲' : '▼') : '';
  });

  document.getElementById('rowsPessoas').innerHTML = data.length
    ? data.map((p) => `<tr>
        <td style="font-weight:600;">${esc(p.nome)}</td>
        <td>${esc(p.detalhes || '')}</td>
        <td>${esc(p.telefone || '')}</td>
        <td>${esc(p.email || '')}</td>
        <td style="text-align:center;">
          <button class="btn-icon" onclick="abrirModalPessoa('${esc(p.id)}')" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="excluirPessoaCadastro('${esc(p.id)}')" title="Excluir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhuma pessoa cadastrada.</td></tr>';
}

window.ordenarPessoas = (coluna) => {
  if (pessoasOrdenacao.coluna === coluna) {
    pessoasOrdenacao.direcao = pessoasOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    pessoasOrdenacao.coluna = coluna;
    pessoasOrdenacao.direcao = 'asc';
  }
  renderizarPessoas();
};

window.abrirModalPessoa = (id) => {
  const p = id ? pessoasData.find((x) => String(x.id) === String(id)) : null;
  document.getElementById('pessoaId').value = p ? p.id : '';
  document.getElementById('pessoaNome').value = p ? (p.nome || '') : '';
  document.getElementById('pessoaDetalhes').value = p ? (p.detalhes || '') : '';
  document.getElementById('pessoaTelefone').value = p ? (p.telefone || '') : '';
  document.getElementById('pessoaEmail').value = p ? (p.email || '') : '';
  document.getElementById('modalPessoaTitulo').textContent = p ? 'Editar Pessoa' : 'Nova Pessoa';
  document.getElementById('modalPessoa').classList.add('open');
};

window.fecharModalPessoa = () => document.getElementById('modalPessoa').classList.remove('open');

window.salvarPessoaCadastro = async () => {
  const nome = document.getElementById('pessoaNome').value.trim();
  if (!nome) return showToast('Informe o nome da pessoa.', '#e65100');
  const id = document.getElementById('pessoaId').value || null;

  try {
    const r = await API.salvarDependencia({
      id,
      categoria: 'Pessoas',
      nome,
      detalhes: document.getElementById('pessoaDetalhes').value.trim(),
      telefone: document.getElementById('pessoaTelefone').value.trim(),
      email: document.getElementById('pessoaEmail').value.trim(),
    });
    fecharModalPessoa();
    API.invalidate('getDependencias');
    // Ja sabemos exatamente o que foi gravado (r.dado) -- so atualiza esta
    // pessoa no array ja carregado, sem buscar o catalogo inteiro de novo.
    const item = { ...r.dado, id: r.id };
    const idx = pessoasData.findIndex((x) => String(x.id) === String(r.id));
    if (idx >= 0) pessoasData[idx] = item; else pessoasData.push(item);
    renderizarPessoas();
    showToast('✅ Salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

window.excluirPessoaCadastro = async (id) => {
  const p = pessoasData.find((x) => String(x.id) === String(id));
  if (!p) return;
  const aviso = `Excluir "${p.nome}"?\n\nSe essa pessoa estiver marcada como Gestor do Contrato de algum fornecedor ou Responsável de alguma área, o nome continua lá como texto (não é apagado em cascata), mas deixa de aparecer nas listas de seleção. Continuar?`;
  if (!confirm(aviso)) return;

  try {
    await API.excluirDependencia(id);
    API.invalidate('getDependencias');
    const deps = await API.getDependencias();
    pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
    renderizarPessoas();
    showToast('🗑️ Excluído.', '#555');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível excluir.'), '#c62828');
  }
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
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">PCN:</label>
        <select id="filtroPCN" onchange="renderizarProcessos()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:140px;">
          <option value="">Todos</option>
          <option value="com">Com PCN</option>
          <option value="sem">Sem PCN</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">&nbsp;</label>
        <input type="text" id="buscaProcesso" placeholder="🔍 Buscar processo..." oninput="renderizarProcessos()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:200px;">
      </div>
      <div style="display:flex;align-items:flex-end;">
        <span id="contadorProcessos" style="font-size:0.82em;color:#888;padding:10px 0;white-space:nowrap;"></span>
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
          <button id="tab-identificacao" onclick="trocarAbaProcesso('identificacao')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#1a237e;border-bottom:3px solid #1a237e;cursor:pointer;">Identificação</button>
          <button id="tab-avaliacao" onclick="trocarAbaProcesso('avaliacao')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Avaliação</button>
          <button id="tab-bia" onclick="trocarAbaProcesso('bia')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">BIA</button>
          <button id="tab-bcp" onclick="trocarAbaProcesso('bcp')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">BCP</button>
          <button id="tab-drp" onclick="trocarAbaProcesso('drp')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">DRP</button>
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
            <div style="margin-bottom:16px;padding-top:12px;border-top:1px solid #f0f0f0;">
              <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">Levantamento PCN</label>
              <div id="levantamentoStatus" style="font-size:0.82em;color:#999;margin-bottom:8px;"></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-ghost" onclick="abrirLevantamento()" id="btnAbrirLev" style="font-size:0.82em;color:#1a237e;border-color:#1a237e;padding:6px 14px;display:none;">📄 Abrir Levantamento</button>
                <button class="btn btn-ghost" onclick="copiarLinkLevantamento()" style="font-size:0.82em;color:#555;border-color:#ccc;padding:6px 14px;">🔗 Copiar link</button>
                <button class="btn btn-ghost" onclick="enviarLinkLevantamento()" style="font-size:0.82em;color:#1a237e;border-color:#1a237e;padding:6px 14px;">📧 Enviar por e-mail</button>
              </div>
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
        <button class="btn btn-ghost" onclick="gerarPCNProcesso()" id="btnGerarPcn" style="color:#2e7d32;border-color:#2e7d32;">🤖 Gerar PCN</button>
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

  // Filtrar por busca
  const buscaProc = (document.getElementById('buscaProcesso') || {}).value || '';
  if (buscaProc.trim()) {
    const termo = buscaProc.toLowerCase();
    data = data.filter(p => 
      (p.processo || '').toLowerCase().includes(termo) ||
      (p.area || '').toLowerCase().includes(termo) ||
      (p.descricaoFuncional || '').toLowerCase().includes(termo)
    );
  }

  // Filtrar por tier
  if (processosFiltroTier) {
    data = data.filter(p => {
      const tier = Criticidade.tierCurto(p);
      return tier === processosFiltroTier;
    });
  }

  // Filtrar por PCN
  const filtroPCN = (document.getElementById('filtroPCN') || {}).value || '';
  if (filtroPCN === 'com') data = data.filter(p => p.pcnSalvo);
  else if (filtroPCN === 'sem') data = data.filter(p => !p.pcnSalvo);
  
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

  // Atualizar contador de processos
  const contadorEl = document.getElementById('contadorProcessos');
  const total = window.processosData.length;
  if (contadorEl) {
    if (data.length === total) {
      contadorEl.textContent = `${total} processo${total !== 1 ? 's' : ''}`;
    } else {
      contadorEl.textContent = `${data.length} de ${total} processo${total !== 1 ? 's' : ''}`;
    }
  }
  
  document.getElementById('rows').innerHTML = data.length
    ? data.map(p => {
        const status = Criticidade.tierDoProcesso(p);
        const statusColor = Criticidade.corDoTier(status);
        return `<tr style="cursor:pointer;" onclick="editarProcesso('${p.id}')">
        <td>${esc(p.area)}</td>
        <td><strong>${esc(p.processo)}</strong></td>
        <td>${p.responsavelArea || p.responsavel || ''}</td>
        <td><span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.8em;font-weight:600;color:white;background:${statusColor};">${status}</span></td>
        <td style="text-align:center;font-weight:700;color:${p.avaliado || p.score > 0 ? statusColor : '#bbb'};font-size:0.95em;">${p.avaliado || p.score > 0 ? p.score : '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.biaHomologada || '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.bcpStatus || '-'}</td>
        <td style="font-size:0.8em;color:#555;">${p.drpStatus || '-'}</td>
        <td style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation();">
          <button class="btn-icon" onclick="editarProcesso('${p.id}')" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="avaliarProcesso('${p.id}')" title="Avaliar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a237e" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="abrirModalEnviar('${p.id}')" title="Enviar por e-mail">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </button>
          ${p.pcnSalvo ? `<button class="btn-icon" onclick="abrirPCNDireto('${p.id}')" title="Abrir PCN">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </button>` : ''}
          ${p.levantamentoPCN ? `<button class="btn-icon" onclick="abrirLevantamentoDireto('${p.id}')" title="Abrir Levantamento PCN" style="color:#2e7d32;">📋</button>` : ''}
          <button class="btn-icon" onclick="excluirProcesso('${p.id}')" title="Excluir">
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
  if (!confirm(`Enviar relatório de "${area}" para ${esc(areaObj.responsavel)} (${esc(areaObj.email)})?`)) return;
  try {
    showToast('⏳ Gerando relatório...', '#1565c0');
    const result = await API.post('gerarRelatorioArea', { area, email: areaObj.email });
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
  if (!confirm(`Enviar questionário para ${esc(areaObj.responsavel)} (${esc(areaObj.email)})?`)) return;
  try {
    const result = await API.post('gerarTokenArea', { area, email: areaObj.email, nomeResponsavel: areaObj.responsavel || '' });
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
    'Processos Internos': '🔄', 'Processo Interno': '🔄',
    'Outros': '📦'
  };
  
  // Obter categorias do catálogo
  const categoriasSet = new Set(catalogo.map(d => d.categoria));
  // Garantir que categorias dos 5Ps sempre apareçam
  ['Fornecedores', 'Infraestrutura', 'Pessoas', 'Sistemas', 'Processos Internos'].forEach(c => categoriasSet.add(c));
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
      deps.forEach(dep => {
        if (grupos[dep.categoria] && !grupos[dep.categoria].includes(nome)) {
          grupos[dep.categoria].push(nome);
        }
      });
    } else if (deps.length === 1) {
      const cat = deps[0].categoria;
      if (!grupos[cat]) grupos[cat] = [];
      if (!grupos[cat].includes(nome)) grupos[cat].push(nome);
    } else {
      // Não está no catálogo — verificar se é um processo interno
      const isProcessoInterno = (window.processosData || []).some(p => p.processo === nome);
      const cat = isProcessoInterno ? 'Processos Internos' : 'Outros';
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
      'Sistema': 'Ex: ERP Fortes, banco de dados PostgreSQL/Oracle, e-mail corporativo, Active Directory, sistema bancário',
      'Processos Internos': 'Ex: Faturamento, folha de pagamento, processamento de pagamentos, aprovação de crédito, atendimento ao cliente',
      'Processo Interno': 'Ex: Faturamento, folha de pagamento, processamento de pagamentos, aprovação de crédito, atendimento ao cliente'
    };
    const example = catExamples[cat] || '';
    
    const tags = recursos.map((nome) => {
      const globalIdx = selecionadas.indexOf(nome);
      const dep = catalogo.find(d => d.nome === nome);
      const tooltip = dep ? [dep.empresa, dep.detalhes, dep.telefone].filter(Boolean).join(' • ') : '';
      return `<span class="dep-tag-item" style="display:inline-flex;align-items:center;gap:3px;background:#1a237e;color:white;padding:4px 10px 4px 12px;border-radius:14px;font-size:0.85em;font-weight:500;white-space:nowrap;cursor:default;" title="${esc(tooltip || nome)}">${nome}<button onclick="removerDependenciaTag(${globalIdx})" style="background:none;border:none;cursor:pointer;font-size:1.1em;color:rgba(255,255,255,0.7);line-height:1;padding:0 3px;" onmouseenter="this.style.color='white'" onmouseleave="this.style.color='rgba(255,255,255,0.7)'" title="Remover">&times;</button></span>`;
    }).join(' ');
    
    const emptyMsg = !count ? `<span style="font-size:0.82em;color:#bbb;font-style:italic;">Nenhum recurso mapeado</span>` : '';
    
    // Chips de itens disponíveis no catálogo (não selecionados)
    const disponiveisNaCat = catalogo.filter(d => d.categoria === cat && !selecionadas.includes(d.nome));
    const chips = disponiveisNaCat.map(d => {
      const label = d.empresa ? d.empresa + ' - ' + d.nome : d.nome;
      return `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.78em;font-weight:500;background:#f5f6fa;color:#1a237e;cursor:pointer;border:1px solid #e0e0e0;transition:all 0.15s;" onmouseenter="this.style.background='#c5cae9';this.style.borderColor='#1a237e'" onmouseleave="this.style.background='#f5f6fa';this.style.borderColor='#e0e0e0'" onclick="selecionarDependenciaCategoria('${escJs(d.nome)}')" title="${[d.detalhes, d.telefone].filter(Boolean).join(' • ') || d.nome}">${label}</span>`;
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
              <input type="text" class="dep-cat-input" data-categoria="${cat}" placeholder="Digite para buscar ou criar..." autocomplete="off" style="border:none;border-bottom:1.5px solid #e8eaf6;outline:none;font-size:0.88em;padding:5px 2px;width:100%;background:transparent;transition:border-color 0.2s;" onfocus="this.style.borderColor='#1a237e';mostrarDropdownCategoria(this,'${escJs(cat)}')" oninput="mostrarDropdownCategoria(this,'${escJs(cat)}')" onblur="this.style.borderColor='#e8eaf6';setTimeout(()=>{const dd=this.parentElement.querySelector('.dep-cat-dropdown');if(dd)dd.style.display='none';},300)">
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
          const isProcessos = (cat === 'Processos Internos' || cat === 'Processo Interno');
          // Verificar se existe no catálogo ou nos processos do sistema
          const catalogo = window.dependenciasCatalogo || [];
          const existe = catalogo.find(d => d.nome.toLowerCase() === val.toLowerCase() && d.categoria === cat);
          const existeProcesso = isProcessos && (window.processosData || []).find(p => p.processo.toLowerCase() === val.toLowerCase());
          
          if ((existe || existeProcesso) && !window._dependenciaSelecionadas.includes(val)) {
            selecionarDependenciaCategoria(existe ? existe.nome : existeProcesso.processo);
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
  
  let disponiveis;
  let isProcessos = (categoria === 'Processos Internos' || categoria === 'Processo Interno');
  
  if (isProcessos) {
    // Para Processos Internos, listar processos do sistema
    const processos = window.processosData || [];
    const currentId = Number((document.getElementById('fId') || {}).value || 0);
    const currentProcesso = (document.getElementById('fProcesso') || {}).value || '';
    disponiveis = processos
      .filter(p => p.id !== currentId && p.processo !== currentProcesso && !window._dependenciaSelecionadas.includes(p.processo) && (filtro === '' || p.processo.toLowerCase().includes(filtro) || p.area.toLowerCase().includes(filtro)))
      .map(p => ({ nome: p.processo, empresa: p.area, detalhes: '' }));
  } else {
    disponiveis = catalogo.filter(d => 
      d.categoria === categoria &&
      !window._dependenciaSelecionadas.includes(d.nome) &&
      (filtro === '' || d.nome.toLowerCase().includes(filtro))
    );
  }
  
  if (!disponiveis.length && !input.value.trim()) {
    dropdown.style.display = 'none';
    return;
  }
  
  let html = '';
  disponiveis.forEach(d => {
    const info = [d.empresa, d.detalhes].filter(Boolean).join(' • ');
    const encodedNome = encodeURIComponent(d.nome);
    html += `<div class="dep-option" onmousedown="selecionarDependenciaCategoria(decodeURIComponent('${encodedNome}'))" style="padding:8px 12px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #f8f8f8;">
      <div style="font-size:0.9em;font-weight:500;color:#222;">${esc(d.nome)}</div>
      ${info ? `<div style="font-size:0.75em;color:#888;margin-top:2px;">${info}</div>` : ''}
    </div>`;
  });
  
  if (input.value.trim()) {
    const val = input.value.trim().toLowerCase();
    const existeNoCatalogo = catalogo.some(d => d.nome.toLowerCase() === val);
    const existeNosProcessos = isProcessos && (window.processosData || []).some(p => p.processo.toLowerCase() === val);
    if (!existeNoCatalogo && !existeNosProcessos) {
      html += `<div class="dep-option" onmousedown="adicionarDependenciaCategoria('${escJs(input.value.trim())}','${escJs(categoria)}')" style="padding:9px 12px;cursor:pointer;color:#1a237e;font-weight:600;border-top:1.5px solid #e8eaf6;background:#f8f9ff;">+ Criar "${input.value.trim()}"</div>`;
    }
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
    // QUARTO caminho que cria dependencia — e o mais silencioso deles: digitar
    // um nome novo aqui gravava no catalogo sem aviso nenhum, e a promessa nao
    // tinha tratamento de erro. Se a gravacao falhasse, a tag aparecia na tela,
    // o processo era salvo apontando para ela, e a dependencia nao existia no
    // banco. Agora avisa, e avisa tambem quando falha.
    const novaDep = { id: null, categoria, nome };
    window.dependenciasCatalogo.push(novaDep);
    API.invalidate('getDependencias');
    API.salvarDependencia({ categoria, nome }).then(r => {
      novaDep.id = r.id;
      if (Perfis.categoriaDeFornecedor(categoria)) {
        showToast(`✅ Fornecedor "${nome}" criado. Ele aparece em Fornecedores como "Não avaliado".`, '#2e7d32');
      }
    }).catch(err => {
      console.error('Falha ao criar a dependência no catálogo', err);
      const i = (window.dependenciasCatalogo || []).indexOf(novaDep);
      if (i !== -1) window.dependenciasCatalogo.splice(i, 1);
      const j = (window._dependenciaSelecionadas || []).indexOf(nome);
      if (j !== -1) window._dependenciaSelecionadas.splice(j, 1);
      renderDependenciaTabela();
      showToast(`❌ Não foi possível criar "${nome}" no catálogo. Ela não foi vinculada ao processo.`, '#c62828');
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
    id: document.getElementById('depBcpId').value || null,
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

  // Este e um TERCEIRO caminho que cria fornecedor: o cadastro rapido de
  // dependencia de dentro do processo. Nao foi bloqueado de proposito — obrigar
  // a sair do PCN no meio do preenchimento para cadastrar o fornecedor em outra
  // tela e pior. Mas fornecedor criado por aqui nasce SEM avaliacao, e ficaria
  // invisivel: o aviso abaixo existe para isso nao passar em silencio.
  const ehFornecedor = Perfis.categoriaDeFornecedor(d.categoria);
  // Empresa agora pode ter N pessoas (nome/e-mail/telefone por pessoa), e este
  // formulario generico so tem um nome (o da empresa) e um e-mail/telefone
  // soltos, sem como dizer de quem e o contato. Em vez de gravar um contato sem
  // nome que a tela de Fornecedores nao consegue mostrar, este caminho so grava
  // o nome da empresa quando a categoria e Fornecedor — o aviso abaixo diz isso.
  let contatoIgnorado = false;
  if (ehFornecedor) {
    if (d.empresa || d.email || d.telefone) contatoIgnorado = true;
    d.empresa = '';
    d.email = '';
    d.telefone = '';
  }

  try {
    const result = await API.salvarDependencia(d);
    fecharModalDepBcp();
    showToast(ehFornecedor && !d.id
      ? `✅ Fornecedor criado! Ele aparece em Fornecedores como "Não avaliado" — avalie para ele entrar na conta de risco.${contatoIgnorado ? ' Contato não foi salvo: cadastre a pessoa em Fornecedores → Cadastro.' : ''}`
      : '✅ Dependência salva!', '#2e7d32');
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
          <td style="padding:6px 10px;"><input type="text" value="${esc(r.evento || '')}" onchange="atualizarRiscoBcp(${idx},'evento',this.value)" placeholder="Descreva o evento" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
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
          <td style="padding:6px 10px;"><input type="text" value="${esc(r.mitigacao || '')}" onchange="atualizarRiscoBcp(${idx},'mitigacao',this.value)" placeholder="Ação de mitigação" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
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
          <td style="padding:6px 10px;"><input type="text" value="${esc(r.controle || '')}" onchange="atualizarPreventivaBcp(${idx},'controle',this.value)" placeholder="Ex: Energia" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
          <td style="padding:6px 10px;"><input type="text" value="${esc(r.descricao || '')}" onchange="atualizarPreventivaBcp(${idx},'descricao',this.value)" placeholder="Descreva a medida preventiva" style="width:100%;border:1px solid #e8e8e8;border-radius:5px;padding:6px 8px;font-size:0.95em;box-sizing:border-box;"></td>
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
  // Recarregar catálogos se foram invalidados
  API.getDependencias().then(deps => { window.dependenciasCatalogo = deps; }).catch(()=>{});
  API.getComponentes().then(comps => { window.componentesCatalogo = comps; }).catch(()=>{});

  // Preencher dropdown de áreas
  const selectArea = document.getElementById('fArea');
  selectArea.innerHTML = '<option value="">Selecione...</option>' + 
    window.areasDisponiveis.map(a => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('');
  
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
    const status = Criticidade.tierDoProcesso(p);
    const cor = Criticidade.corDoTier(status);
    return `<span style="margin-left:12px;font-size:0.82em;font-weight:600;padding:3px 10px;border-radius:10px;background:${cor};color:white;vertical-align:middle;">${status} &bull; Score ${p.score}</span>`;
  })() : '';
  document.getElementById('modalTitulo').innerHTML = titulo + scoreHtml + (p ? `<div style="font-size:0.75em;color:#555;font-weight:400;margin-top:4px;">${esc(p.processo)}</div>` : '');
  document.getElementById('drawerProcesso').classList.add('open');
  document.getElementById('drawerOverlayProcesso').classList.add('open');
  // Resetar botão salvar
  const btnSalvar = document.querySelector('#drawerProcesso .drawer-footer .btn-primary');
  if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.innerHTML = 'Salvar'; btnSalvar.style.opacity = '1'; btnSalvar.style.cursor = 'pointer'; }
  trocarAbaProcesso('identificacao');
  // Reset avaliação inline. Limpar o HTML é essencial, nao so as variaveis: a
  // aba Avaliacao so e redesenhada por trocarAbaProcesso('avaliacao'), entao
  // sem isso os radios marcados do processo anterior sobrevivem no DOM.
  window._avaliacaoRespostas = {};
  window._avaliacaoScore = 0;
  const contAval = document.getElementById('avaliacaoPerguntas');
  if (contAval) { contAval.innerHTML = ''; delete contAval.dataset.processoId; }
  const resumoAval = document.getElementById('avaliacaoScoreResumo');
  if (resumoAval) resumoAval.innerHTML = '';
  // Mostrar/ocultar botão Abrir PCN
  const btnPcnSalvo = document.getElementById('btnPcnSalvo');
  if (btnPcnSalvo) btnPcnSalvo.style.display = (p && p.pcnSalvo) ? 'inline-block' : 'none';
  // Mostrar botão Gerar PCN apenas para admin
  const btnGerarPcn = document.getElementById('btnGerarPcn');
  if (btnGerarPcn) btnGerarPcn.style.display = (window.USER_PERFIL === 'admin') ? 'inline-block' : 'none';
  // Mostrar status e botão do levantamento PCN
  const levStatus = document.getElementById('levantamentoStatus');
  const btnAbrirLev = document.getElementById('btnAbrirLev');
  if (levStatus && p) {
    if (p.levantamentoPCN) {
      levStatus.innerHTML = '<span style="color:#2e7d32;font-weight:600;">✅ Levantamento preenchido</span>';
      if (btnAbrirLev) btnAbrirLev.style.display = 'inline-block';
    } else {
      levStatus.innerHTML = '<span style="color:#999;">Pendente — envie o formulário ao dono do processo</span>';
      if (btnAbrirLev) btnAbrirLev.style.display = 'none';
    }
  }
  // Score/Tier cards na BIA
  const scoreInfo = document.getElementById('fBiaScoreInfo');
  if (scoreInfo && p && p.score > 0) {
    const tierLabel = Criticidade.tierDoProcesso(p);
    const cor = Criticidade.corDoTier(tierLabel);
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
  const id = document.getElementById('fId').value || '';
  if (!id) return;
  fecharModal();
  setTimeout(() => avaliarProcesso(id), 300);
};

window.salvarProcesso = async () => {
  // Contingencia e SLA por fornecedor, lidos da tabela da aba BCP. Essa tabela
  // so existe no DOM quando a aba foi aberta nesta edicao: se nao foi, os dois
  // campos ficam FORA do payload, em vez de irem vazios e apagarem o que ja
  // estava gravado.
  const camposFornecedoresBcp = {};
  const _planoB = _coletarMapaBcp('.planoB-contingencia');
  const _slas = _coletarMapaBcp('.sla-valor');
  if (_planoB !== null) camposFornecedoresBcp.bcpPlanoBProvedores = JSON.stringify(_planoB);
  if (_slas !== null) camposFornecedoresBcp.bcpSlas = JSON.stringify(_slas);

  const p = {
    id: document.getElementById('fId').value || null,
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
    ...camposFornecedoresBcp,
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
  // Só considera as respostas da aba Avaliacao se ela estiver desenhada para
  // ESTE processo. Guarda contra o vazamento: abrir o processo A, ver a aba,
  // fechar, abrir B e salvar gravava as respostas de A em B, com o tier
  // recalculado em cima delas e sem nenhum aviso.
  const contAvaliacao = document.getElementById('avaliacaoPerguntas');
  const idAberto = document.getElementById('fId').value || '';
  const avaliacaoEDesteProcesso = !!contAvaliacao
    && contAvaliacao.dataset.processoId !== undefined
    && contAvaliacao.dataset.processoId === idAberto;
  (avaliacaoEDesteProcesso ? pergs : []).forEach((pg, i) => {
    const sel = contAvaliacao.querySelector(`input[name="avalInline${i}"]:checked`);
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
    pEnriquecido.id = '_tmp_' + Date.now(); // ID temporário (string)
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
  const p = window.processosData.find(proc => proc.id === id);
  if (!p) return;
  if (!confirm(`Excluir o processo "${esc(p.processo)}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await API.post('excluirProcesso', { id: String(id), area: p.area, processo: p.processo });
    showToast('🗑️ Excluído.', '#555');
    window.processosData = window.processosData.filter(proc => proc.id !== id);
    API.invalidate('getProcessos');
    renderizarProcessos();
  } catch(e) {
    showToast('❌ Erro ao excluir: ' + e.message, '#c62828');
  }
};

window.verDetalhesProcesso = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p) return;
  
  const status = Criticidade.tierDoProcesso(p);
  const statusColor = Criticidade.corDoTier(status);
  
  document.getElementById('modalDetalhesTitulo').textContent = p.processo;
  document.getElementById('modalDetalhesConteudo').innerHTML = `
    <div style="display:grid;gap:16px;">
      <div><strong>Área:</strong> ${esc(p.area)}</div>
      <div><strong>Responsável:</strong> ${p.responsavelArea || p.responsavel || '-'}</div>
      <div><strong>Solução:</strong> ${esc(p.solucao || '-')}</div>
      <div><strong>Status:</strong> <span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.9em;font-weight:600;color:white;background:${statusColor};">${status}${p.score > 0 ? ' (Score: ' + p.score + ')' : ''}</span></div>
      <div><strong>Descrição do Impacto:</strong><br>${esc(p.descricao || '-')}</div>
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
  const CAT_CORES_PALETTE = CATEGORIA_CORES;
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
            <div style="font-size:0.81em;color:#888;margin-bottom:12px;line-height:1.5;">${esc(perg.descricao || '')}</div>
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
  const CAT_CORES_PALETTE_PDF = CATEGORIA_CORES;
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
  document.getElementById('enviarProcessoNome').textContent = `${esc(p.area)} › ${esc(p.processo)}`;
  document.getElementById('enviarEmail').value = '';
  document.getElementById('modalEnviar').classList.add('open');
};

window.fecharModalEnviar = () => document.getElementById('modalEnviar').classList.remove('open');

window.enviarConvite = async () => {
  const processoId = document.getElementById('enviarProcessoId').value;
  const email = document.getElementById('enviarEmail').value.trim();
  if (!email) return showToast('Informe o e-mail do respondente.', '#e65100');
  const p = window.processosData.find(proc => proc.id === processoId);
  if (!p) return;
  try {
    const result = await API.post('gerarToken', { area: p.area, processo: p.processo, email });
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
    <div style="border:1px solid #e0e0e0;background:#f8f9ff;border-radius:9px;padding:11px 14px;margin-bottom:16px;font-size:0.86em;color:#555;">
      Os <strong>fornecedores</strong> saíram desta tela e são gerenciados em
      <a href="#fornecedores-cadastro" style="color:#1a237e;font-weight:700;">Fornecedores → Cadastro</a>,
      onde também são avaliados. Eles continuam no mesmo catálogo e continuam aparecendo para os processos
      declararem de quem dependem — só a edição mudou de lugar.
    </div>
    <div style="margin-bottom:16px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Categoria:</label>
        <select id="filtroDepCategoria" onchange="filtrarDependencias()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
          <option value="">Todas as categorias</option>
        </select>
      </div>
      <div>
        <input type="text" id="buscaDep" placeholder="🔍 Buscar dependência..." oninput="filtrarDependencias()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:250px;">
      </div>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="listaDeps" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarDependencias('categoria')" style="cursor:pointer;width:12%;">Categoria <span id="sort-dep-categoria"></span></th>
            <th onclick="ordenarDependencias('empresa')" style="cursor:pointer;width:13%;">Empresa <span id="sort-dep-empresa"></span></th>
            <th onclick="ordenarDependencias('nome')" style="cursor:pointer;width:15%;">Nome <span id="sort-dep-nome"></span></th>
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
    // Fornecedor nao entra: a gestao dele migrou para o modulo de Fornecedores.
    // O filtro e aqui, e nao no banco, para que o catalogo continue inteiro —
    // e o mesmo de que os processos dependem.
    const todas = await API.getDependencias();
    dependenciasData = todas.filter(d => !Perfis.categoriaDeFornecedor(d.categoria));
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

  // Filtrar por busca
  const busca = (document.getElementById('buscaDep') || {}).value || '';
  if (busca.trim()) {
    const termo = busca.toLowerCase();
    data = data.filter(d => 
      (d.nome || '').toLowerCase().includes(termo) ||
      (d.empresa || '').toLowerCase().includes(termo) ||
      (d.categoria || '').toLowerCase().includes(termo) ||
      (d.setor || '').toLowerCase().includes(termo) ||
      (d.detalhes || '').toLowerCase().includes(termo)
    );
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
        <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(d.categoria)}</span></td>
        <td style="font-size:0.85em;color:#555;">${esc(d.empresa || '-')}</td>
        <td style="font-weight:600;color:#222;">${esc(d.nome)}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.detalhes || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.setor || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.telefone || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.email || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.endereco || '-')}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn-icon" onclick="editarDep('${d.id}')" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="excluirDep('${d.id}')" title="Excluir">
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
    id: document.getElementById('depId').value || null,
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
  // Sem esta guarda, digitar "Fornecedores" no campo de categoria criaria um
  // fornecedor que esta tela nao mostra mais: sumiria da vista de quem acabou
  // de cadastrar.
  if (Perfis.categoriaDeFornecedor(d.categoria)) {
    return showToast('Fornecedor é cadastrado em Fornecedores → Cadastro.', '#e65100');
  }

  // Optimistic: fechar modal e atualizar UI imediatamente
  fecharModalDependencia();
  const isNew = !d.id;
  let tempId = null;
  if (d.id) {
    const idx = dependenciasData.findIndex(x => x.id === d.id);
    if (idx !== -1) dependenciasData[idx] = { ...d };
  } else {
    tempId = '_tmp_' + Date.now(); // ID temporário (apenas para UI)
    d.id = tempId;
    dependenciasData.push(d);
  }
  renderizarDependencias();
  window.dependenciasCatalogo = dependenciasData;
  showToast('✅ Salvando...', '#1a237e');

  try {
    // Enviar ao backend SEM o ID temporário para novos registros
    const payload = { ...d };
    if (isNew) payload.id = null;
    const result = await API.salvarDependencia(payload);
    // Atualizar ID real se era novo
    if (isNew && result.id) {
      const tempIdx = dependenciasData.findIndex(x => x.id === tempId);
      if (tempIdx !== -1) dependenciasData[tempIdx].id = result.id;
    }
    API.invalidate('getDependencias');
    showToast('✅ Salvo!', '#2e7d32');
  } catch(e) {
    showToast('❌ Erro: ' + e.message, '#c62828');
    // Reverter (remove o registro temporário criado nesta operação)
    if (isNew && tempId) {
      dependenciasData = dependenciasData.filter(x => x.id !== tempId);
      renderizarDependencias();
    }
  }
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
  const tier1 = processosVisiveis.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T1)).length;
  const tier2 = processosVisiveis.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T2)).length;
  const tier3 = processosVisiveis.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T3)).length;
  const pct = total > 0 ? Math.round((avaliados / total) * 100) : 0;

  // Resumo por área
  const porArea = areasVisiveis.map(a => {
    const procs = processosVisiveis.filter(p => p.area === a.nome);
    const aval = procs.filter(p => p.avaliado || p.score > 0).length;
    const t1 = procs.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T1)).length;
    const t2 = procs.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T2)).length;
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
              const label = s > 0 ? Criticidade.tierCurto(Criticidade.tierPorScore(s)) : Criticidade.TIER.PENDENTE;
              const bg = s > 0 ? Criticidade.corDoTier(Criticidade.tierPorScore(s)) : '#e0e0e0';
              return `<tr style="border-top:1px solid #f0f0f0;">
                <td style="padding:10px 12px;font-size:0.85em;color:#555;">${esc(p.area)}</td>
                <td style="padding:10px 12px;font-size:0.88em;font-weight:500;">${esc(p.processo)}</td>
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
              <td style="padding:12px;font-weight:500;">${esc(a.nome)}</td>
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
      const t1Procs = processosVisiveis.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T1));
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
            <div class="list-row-title">${esc(p.processo)}</div>
            <div class="list-row-sub">${esc(p.descricao || 'Sem descrição')}</div>
          </div>
          <div class="list-row-actions">
            <button class="btn btn-primary" onclick="abrirModalAvaliacaoProcesso(${p.id}, '${escJs(p.area)}'  , '${escJs(p.processo)}')" style="font-size:0.85em;padding:8px 16px;">Avaliar</button>
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
      <div style="font-size:0.85em;color:#666;margin-bottom:16px;line-height:1.5;">${esc(p.descricao || '')}</div>
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
  // O tier vem da regra unica; as cores aqui sao tons pastel proprios desta
  // tela (fundo de destaque), diferentes das cores de badge de Criticidade.
  const tier = Criticidade.tierPorScore(total);
  const FUNDO_TIER = {
    [Criticidade.TIER.T1]: '#ffcdd2',
    [Criticidade.TIER.T2]: '#ffe0b2',
    [Criticidade.TIER.T3]: '#bbdefb',
  };
  const tierColor = FUNDO_TIER[tier];
  
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
    <div style="margin-bottom:16px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Tipo:</label>
        <select id="filtroCompTipo" onchange="filtrarComponentes()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
          <option value="">Todos os tipos</option>
        </select>
      </div>
      <div>
        <input type="text" id="buscaComp" placeholder="🔍 Buscar componente..." oninput="filtrarComponentes()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:250px;">
      </div>
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

  // Filtrar por busca
  const busca = (document.getElementById('buscaComp') || {}).value || '';
  if (busca.trim()) {
    const termo = busca.toLowerCase();
    data = data.filter(d => 
      (d.nome || '').toLowerCase().includes(termo) ||
      (d.tipo || '').toLowerCase().includes(termo) ||
      (d.descricao || '').toLowerCase().includes(termo) ||
      (d.responsavel || '').toLowerCase().includes(termo)
    );
  }

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
        <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(d.tipo)}</span></td>
        <td style="font-weight:600;color:#222;">${esc(d.nome)}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.descricao || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${d.rto || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${d.rpo || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.estrategia || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(d.responsavel || '-')}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn-icon" onclick="editarComp('${d.id}')" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="excluirComp('${d.id}')" title="Excluir">
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
    id: document.getElementById('compId').value || null,
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
// PÁGINA: GESTÃO DE RISCOS
// ============================================================
let riscosData = [];
// Abre pelo maior risco: e a pergunta que a tela responde.
let riscosOrdenacao = { coluna: 'score', direcao: 'desc' };
let riscosAreasCache = [];
let riscosProcessosCache = [];
let riscosFornecedoresCache = [];
let riscosCriticidadePorFornecedorCache = {};
const RISCO_STATUS = ['Identificado', 'Em Análise', 'Em Avaliação', 'Em Tratamento', 'Em Monitoramento', 'Aceito', 'Encerrado'];
const RISCO_CATEGORIAS = [
  { valor: 'Financeiro', descricao: 'Risco de perda monetária direta, multas ou custos inesperados. Ex.: fraude, erro de faturamento, multa regulatória.' },
  { valor: 'Operacional', descricao: 'Risco que compromete a execução normal dos processos do dia a dia. Ex.: falha de sistema, indisponibilidade de infraestrutura, erro humano em processo crítico.' },
  { valor: 'Reputacional', descricao: 'Risco à imagem da empresa perante clientes, mercado ou colaboradores. Ex.: vazamento de dados divulgado publicamente, crítica pública recorrente, insatisfação de clientes.' },
  { valor: 'Regulatório/Legal', descricao: 'Risco de descumprimento de lei, norma ou contrato, com possíveis sanções. Ex.: não conformidade com a LGPD, descumprimento de cláusula contratual, autuação de órgão fiscalizador.' },
];

/** Componentes do Impacto Financeiro do risco, agrupados por secao (aba Análise & Avaliação). */
const RISCO_IMPACTO_FINANCEIRO_SECOES = [
  { secao: 'Financeiro', categorias: ['Perda de Receita', 'Custo de Recuperação/Remediação', 'Custos Legais/Indenizações'] },
  { secao: 'Operacional', categorias: ['Perda de Produtividade'] },
  { secao: 'Reputacional', categorias: ['Dano à Reputação/Imagem (estimado)'] },
  { secao: 'Regulatório/Legal', categorias: ['Multas e Penalidades Regulatórias'] },
];

function _corStatusRisco(status) {
  const cores = {
    'Identificado': '#9e9e9e', 'Em Análise': '#1565c0', 'Em Avaliação': '#0277bd',
    'Em Tratamento': '#f57c00', 'Em Monitoramento': '#6a1b9a', 'Aceito': '#2e7d32', 'Encerrado': '#455a64',
  };
  return cores[status] || '#9e9e9e';
}
/**
 * Score do risco, recalculado a partir de probabilidade e impacto.
 *
 * Nao usa o campo `score` gravado: ele vinha do navegador e podia divergir da
 * escala. O servidor faz o mesmo recalculo ao registrar a medicao — aqui e a
 * versao de exibicao, com os mesmos pesos.
 */
// A regra vive em risco-consolidado.js, que tambem alimenta o numero por area
// e da empresa. Estas duas linhas existem para o resto do app.js nao precisar
// mudar — e para nao voltar a haver duas copias da mesma escala.
const _scoreDoRisco = (r) => RiscoConsolidado.scoreDoRisco(r);
const _faixaScoreRisco = (n) => RiscoConsolidado.faixaScore(n);

function _badgeScoreRisco(r) {
  const n = _scoreDoRisco(r);
  if (n === null) {
    // Escala nao reconhecida (risco importado de PCN) ou ainda sem avaliar.
    // Cinza e "-" em vez de zero: ausencia nao e risco baixo.
    return `<span title="Probabilidade ou impacto fora da escala — reavalie este risco" style="color:#999;font-weight:600;">-</span>`;
  }
  const f = _faixaScoreRisco(n);
  return `<span title="${f.rotulo} (${n} de 12)" style="display:inline-block;min-width:26px;padding:3px 8px;border-radius:10px;font-size:0.82em;font-weight:700;background:${f.fundo};color:${f.cor};">${n}</span>`;
}

function _badgeStatusRisco(status) {
  const s = status || 'Identificado';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;color:white;background:${_corStatusRisco(s)};white-space:nowrap;">${s}</span>`;
}
// 'Crítica' (Prioridade, feminino) ao lado de 'Crítico' (Impacto) -- mesmas
// cores, so a escala de Prioridade usa a forma feminina.
function _corProbImpactoRisco(valor) {
  const bg = { 'Alta': '#ffcdd2', 'Alto': '#fff3e0', 'Crítico': '#ffcdd2', 'Crítica': '#ffcdd2', 'Média': '#fff3e0', 'Moderado': '#e8f5e9', 'Baixa': '#e8f5e9', 'Baixo': '#f5f5f5' };
  const texto = { 'Alta': '#c62828', 'Alto': '#e65100', 'Crítico': '#c62828', 'Crítica': '#c62828', 'Média': '#e65100', 'Moderado': '#2e7d32', 'Baixa': '#2e7d32', 'Baixo': '#666' };
  return { bg: bg[valor] || '#f5f5f5', texto: texto[valor] || '#666' };
}
function _badgeProbImpactoRisco(valor) {
  if (!valor) return '<span style="color:#bbb;">-</span>';
  const c = _corProbImpactoRisco(valor);
  return `<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.78em;font-weight:600;background:${c.bg};color:${c.texto};">${valor}</span>`;
}

/** Quanto este risco soma na "Carga de Risco da Empresa" -- mesma regra do
 *  card acima da grade (risco-consolidado.js), nunca recalculada aqui. */
function _badgeCargaRisco(r, processosPorId) {
  if (!RiscoConsolidado.contaNoConsolidado(r)) {
    return '<span title="Encerrado não soma na Carga da Empresa" style="color:#bbb;">-</span>';
  }
  const carga = RiscoConsolidado.cargaDoRisco(r, processosPorId, riscosCriticidadePorFornecedorCache);
  if (carga === null) {
    return '<span title="Probabilidade ou impacto fora da escala — reavalie este risco" style="color:#999;font-weight:600;">-</span>';
  }
  return `<span style="font-weight:700;color:#1a237e;">${carga}</span>`;
}

function _formatarReais(v) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR');
}

async function riscos() {
  const isAdmin = window.USER_PERFIL === 'admin';
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Gestão de Riscos</h2><p class="page-sub">Registro, análise, tratamento e monitoramento dos riscos identificados</p></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="abrirImportarRiscosPCN()" id="btnImportarRiscosPCN" style="color:#1a237e;border-color:#1a237e;display:none;">📥 Importar de um PCN</button>
        <button class="btn btn-primary" onclick="abrirDrawerRisco()" id="btnNovoRisco" style="display:none;">+ Novo Risco</button>
      </div>
    </div>
    <div id="painelRiscoConsolidado" style="margin-bottom:20px;"></div>
    <div style="margin-bottom:16px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Área:</label>
        <select id="filtroRiscoArea" onchange="filtrarRiscos()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:200px;">
          <option value="">Todas as áreas</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Status:</label>
        <select id="filtroRiscoStatus" onchange="filtrarRiscos()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:200px;">
          <option value="">Todos os status</option>
          ${RISCO_STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Fornecedor:</label>
        <select id="filtroRiscoFornecedor" onchange="filtrarRiscos()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:200px;">
          <option value="">Todos (inclui sem fornecedor)</option>
          <option value="_qualquer_">Somente riscos de fornecedores</option>
        </select>
      </div>
      <div>
        <input type="text" id="buscaRisco" placeholder="🔍 Buscar risco..." oninput="filtrarRiscos()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:250px;">
      </div>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="listaRiscos" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarRiscos('area')" style="cursor:pointer;width:9%;">Área <span id="sort-risco-area"></span></th>
            <th style="width:9%;">Processo / Fornecedor</th>
            <th onclick="ordenarRiscos('titulo')" style="cursor:pointer;width:13%;">Título <span id="sort-risco-titulo"></span></th>
            <th style="width:7%;">Categoria</th>
            <th style="width:8%;">Responsável</th>
            <th style="width:6%;">Probab.</th>
            <th style="width:6%;">Impacto</th>
            <th onclick="ordenarRiscos('score')" style="cursor:pointer;width:5%;text-align:center;" title="Probabilidade x Impacto, de 1 a 12">Score <span id="sort-risco-score"></span></th>
            <th style="width:5%;text-align:center;" title="Score x peso do Tier do processo (ou criticidade do fornecedor) -- quanto este risco soma na Carga de Risco da Empresa">Carga</th>
            <th style="width:9%;text-align:right;">Impacto Financeiro</th>
            <th style="width:7%;">Status</th>
            <th style="width:6%;">Prioridade</th>
            <th style="width:6%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="riscoRows"></tbody>
      </table>
    </div>

    ${_htmlDrawerRisco()}
    ${_htmlModalImportarRiscosPCN()}
  `;

  document.getElementById('btnNovoRisco').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('btnImportarRiscosPCN').style.display = isAdmin ? 'inline-block' : 'none';

  try {
    // Indicadores entram aqui para que a sugestao de probabilidade funcione ao
    // abrir um risco gerado por desvio de indicador.
    // Processos entram aqui porque o numero consolidado pondera cada risco pela
    // criticidade do processo ligado a ele — sem os processos, todo risco viraria
    // peso padrao e o numero perderia justamente o que liga o BIA ao risco.
    const [riscos_, areas_, deps_, inds_, procs_, avalsForn_] = await Promise.all([
      API.getRiscos(), API.getAreas(), API.getDependencias(), API.getIndicadoresSeguranca(),
      // Nao pode derrubar a pagina: se os processos nao vierem, o registro de
      // riscos continua utilizavel e o painel avisa que esta sem os pesos.
      API.getProcessos().catch((e) => {
        console.error('Riscos: processos nao carregaram; o numero consolidado usara peso padrao', e);
        return [];
      }),
      // Mesma logica: sem as avaliacoes, risco de fornecedor cai no peso padrao.
      API.getAvaliacoesFornecedor().catch((e) => {
        console.error('Riscos: avaliacoes de fornecedor nao carregaram; criticidade usara peso padrao', e);
        return [];
      }),
    ]);
    riscosData = riscos_; riscosAreasCache = areas_; indicadoresData = inds_; riscosProcessosCache = procs_;
    riscosFornecedoresCache = deps_.filter(d => ['Fornecedores', 'Fornecedor'].includes(d.categoria));
    // Responsavel do risco escolhe uma Pessoa -- mesmo catalogo que Areas e
    // Fornecedores ja usam, sem requisicao nova (deps_ ja veio pro fornecedor).
    pessoasData = deps_.filter(d => d.categoria === 'Pessoas');
    riscosCriticidadePorFornecedorCache = {};
    (avalsForn_ || []).forEach((av) => { if (av && av.fornecedorId) riscosCriticidadePorFornecedorCache[String(av.fornecedorId)] = av.scoreCriticidade; });
  } catch (e) {
    // Antes este catch zerava a lista em silencio, e a tela dizia "Nenhum risco
    // cadastrado" — indistinguivel de registro vazio. Quem visse isso podia
    // concluir que nao havia riscos e recadastrar o que ja existia.
    console.error('Riscos: falha ao carregar', e);
    riscosData = []; riscosAreasCache = []; riscosFornecedoresCache = []; riscosCriticidadePorFornecedorCache = {};
    const corpo = document.getElementById('riscoRows');
    if (corpo) {
      corpo.innerHTML = `<tr><td colspan="13" style="padding:24px;text-align:center;color:#c62828;">
        Não foi possível carregar os riscos.<br>
        <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
        <button class="btn btn-ghost" onclick="riscos()" style="margin-top:12px;">Tentar de novo</button>
      </td></tr>`;
    }
    showToast('❌ Não foi possível carregar os riscos.', '#c62828');
    return;
  }
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('listaRiscos').style.display = 'block';

  document.getElementById('filtroRiscoArea').innerHTML = '<option value="">Todas as áreas</option>' +
    riscosAreasCache.map(a => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('');
  document.getElementById('filtroRiscoFornecedor').innerHTML = '<option value="">Todos (inclui sem fornecedor)</option>' +
    '<option value="_qualquer_">Somente riscos de fornecedores</option>' +
    riscosFornecedoresCache.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('');

  renderizarRiscos();
}

/**
 * Carga de risco consolidada: da empresa e de cada area.
 *
 * Le SEMPRE a lista inteira de riscos, nunca a lista filtrada. Um numero que
 * muda quando alguem mexe num filtro de tela nao e o risco da empresa — e o
 * risco daquela tela, e ninguem leva isso a um comite.
 *
 * A carga nao tem teto, de proposito (ver risco-consolidado.js). Por isso a
 * tela NAO pinta faixa nem cor no total: "312" nao e bom nem ruim por si. O que
 * se le e a composicao (quantos criticos, altos, moderados, baixos), o pior
 * caso, e — quando o grafico existir — a variacao no tempo. As barras das areas
 * sao relativas a maior area, nao a um maximo absoluto que nao existe.
 *
 * Mostra tambem quantos riscos ficaram fora por nao terem probabilidade ou
 * impacto preenchidos. Sem esse aviso, um registro pela metade baixa a carga e
 * se disfarca de melhora.
 */
function _renderPainelRiscoConsolidado() {
  const painel = document.getElementById('painelRiscoConsolidado');
  if (!painel) return;

  const r = RiscoConsolidado.consolidar(riscosData, riscosProcessosCache, riscosCriticidadePorFornecedorCache);
  const emp = r.empresa;
  const semNada = emp.contados === 0 && emp.semAvaliacao === 0;
  const maiorCarga = r.areas.reduce((m, a) => Math.max(m, a.carga), 0);

  const badgesComposicao = (comp, compacto) => RiscoConsolidado.FAIXAS
    .filter((f) => comp[f] > 0)
    .map((f) => {
      const cor = RiscoConsolidado.faixaScore(f === 'Crítico' ? 9 : f === 'Alto' ? 6 : f === 'Moderado' ? 3 : 1);
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:${compacto ? '0.74em' : '0.78em'};font-weight:700;background:${cor.fundo};color:${cor.cor};margin-right:4px;" title="${comp[f]} risco(s) na faixa ${f}">${comp[f]} ${compacto ? f.charAt(0) : f}</span>`;
    }).join('');

  const avisoSemAvaliacao = (n) => n > 0
    ? `<div style="font-size:0.74em;color:#e65100;margin-top:6px;">\u26a0 ${n} risco${n > 1 ? 's' : ''} sem probabilidade ou impacto — fora da conta, o que puxa a carga para baixo</div>`
    : '';

  const cartaoEmpresa = `
    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;background:#fff;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;">Carga de risco da empresa</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin:8px 0 10px;">
        <span style="font-size:2.8em;font-weight:800;line-height:1;color:#1a237e;">${semNada ? '–' : emp.carga}</span>
        ${semNada ? '' : '<span style="font-size:0.85em;color:#aaa;">pontos</span>'}
      </div>
      <div>${badgesComposicao(emp.composicao, false) || '<span style="font-size:0.8em;color:#999;">Nenhum risco na conta</span>'}</div>
      <div style="font-size:0.76em;color:#777;margin-top:10px;">
        ${emp.contados} risco${emp.contados === 1 ? '' : 's'} somado${emp.contados === 1 ? '' : 's'}${emp.piorScore !== null ? ` · pior caso ${emp.piorScore} de 12 (${esc(emp.piorFaixa.rotulo)})` : ''}
      </div>
      ${avisoSemAvaliacao(emp.semAvaliacao)}
      ${!riscosProcessosCache.length && (riscosData || []).some((x) => x.processoId)
        ? '<div style="font-size:0.74em;color:#e65100;margin-top:6px;">\u26a0 Os processos não carregaram: todo risco está pesando igual. Recarregue a página.</div>'
        : ''}
    </div>`;

  const linhasAreas = r.areas.map((a) => `
    <tr>
      <td style="padding:7px 10px;font-weight:600;color:#333;">${esc(a.area)}</td>
      <td style="padding:7px 10px;width:38%;">
        <div style="background:#f0f0f0;border-radius:6px;height:9px;overflow:hidden;" title="Barra proporcional à área de maior carga">
          <div style="width:${maiorCarga ? Math.round((a.carga / maiorCarga) * 100) : 0}%;height:100%;background:${a.piorFaixa ? a.piorFaixa.cor : '#bbb'};"></div>
        </div>
      </td>
      <td style="padding:7px 10px;text-align:right;font-weight:700;color:#1a237e;white-space:nowrap;">${a.contados ? a.carga : '–'}</td>
      <td style="padding:7px 10px;white-space:nowrap;">
        ${badgesComposicao(a.composicao, true)}${a.semAvaliacao ? `<span style="color:#e65100;font-size:0.74em;" title="${a.semAvaliacao} sem probabilidade ou impacto — fora da conta">+${a.semAvaliacao} \u26a0</span>` : ''}
      </td>
    </tr>`).join('');

  const cartaoAreas = `
    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px 8px 10px;background:#fff;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;padding:0 10px 6px;">Carga por área</div>
      ${r.areas.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:0.9em;">${linhasAreas}</table>`
        : '<div style="padding:10px;color:#999;font-size:0.88em;">Nenhum risco registrado.</div>'}
    </div>`;

  painel.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start;">
      ${cartaoEmpresa}
      ${cartaoAreas}
    </div>
    <div style="font-size:0.74em;color:#999;margin-top:8px;line-height:1.5;">
      Como a conta é feita: cada risco soma a sua nota (1 a 12) multiplicada pela criticidade do processo ligado a ele
      (Tier 1 pesa 3, Tier 2 pesa 2, Tier 3 pesa 1; risco corporativo ou em processo ainda Pendente pesa 2). Risco de
      fornecedor sem processo pesa pela criticidade avaliada do fornecedor (Alta 3, Média 2, Baixa 1; sem avaliação pesa 2).
      Um risco soma no máximo 36 pontos. A carga da empresa é a soma das áreas — dá para conferir somando a coluna.
      Riscos aceitos entram na conta: aceitar um risco não o faz desaparecer. Encerrados ficam fora${r.foraPorStatus ? ` (${r.foraPorStatus} hoje)` : ''}.
      A carga não tem teto, então não existe número "bom" ou "ruim" por si: o que se lê é a composição, o pior caso e a variação ao longo do tempo.
    </div>`;
}

// ============================================================
// MONITOR — Risco no tempo (Fase 5)
//
// Le o retrato diario (historico_risco, gravado 1x por dia pela Cloud
// Function retratoDiarioRisco + o backfill que reconstroi o passado a
// partir do livro de medicoes). So admin ve esta tela por enquanto — ver
// firestore.rules e a aba Roadmap para o motivo (documento por dia mistura
// todas as areas, nao ha como recortar por gestor ainda).
//
// Paleta: slots 1-4 da paleta categorica validada (dataviz), sempre na
// mesma ordem — a cor nunca acompanha o ranking do dia, acompanha a
// entidade (Empresa e sempre azul; a 2a maior area de hoje pode nao ser a
// 2a maior de ontem, mas mantem a cor que recebeu ao entrar no grafico).
const _CORES_MONITOR = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

function _idadeEmDias(diaISO) {
  const hoje = new Date();
  const dia = new Date(diaISO + 'T12:00:00');
  return Math.max(0, Math.round((hoje - dia) / (24 * 60 * 60 * 1000)));
}

function _corIdade(dias) {
  if (dias <= 1) return { cor: '#2e7d32', fundo: '#e8f5e9', rotulo: 'em dia' };
  if (dias <= 6) return { cor: '#e65100', fundo: '#fff3e0', rotulo: 'atrasado' };
  return { cor: '#c62828', fundo: '#ffebee', rotulo: 'muito atrasado' };
}

function _dataCurta(diaISO) {
  const [, m, d] = diaISO.split('-');
  return `${d}/${m}`;
}

/**
 * Monta o SVG da curva. `historico` vem em ordem cronologica (mais antigo
 * primeiro) — ver _lerHistoricoRisco em api.js.
 *
 * `opcoes.campo` escolhe o que plotar (`'carga'` ou `'impactoFinanceiro'`) --
 * a mesma funcao serve pros dois graficos do Monitor, so trocando o campo e o
 * formato do numero. As 3 areas escolhidas pra aparecer sao rankeadas pelo
 * PROPRIO campo (a area mais critica em risco nao e necessariamente a de
 * maior exposicao financeira).
 */
function _svgLinhaTempoRisco(historico, opcoes) {
  if (!historico || historico.length === 0) return null;
  const campo = (opcoes && opcoes.campo) || 'carga';
  const formatarValor = (opcoes && opcoes.formatarValor) || ((v) => String(v));
  const rotuloGrafico = (opcoes && opcoes.rotulo) || 'Carga de risco ao longo do tempo';

  const LARGURA = 1200, ALTURA = 280;
  const MARGEM = { topo: 16, baixo: 34, esq: 46, dir: 16 };
  const areaW = LARGURA - MARGEM.esq - MARGEM.dir;
  const areaH = ALTURA - MARGEM.topo - MARGEM.baixo;

  // Quais areas entram no grafico: as de MAIOR valor (no campo escolhido) no
  // dia mais recente, no maximo 3 — alem de Empresa. Fixadas pelo ultimo dia
  // para a cor de cada linha nao pular de area a cada atualizacao.
  const ultimoDia = historico[historico.length - 1];
  const topAreas = (ultimoDia.areas || [])
    .slice()
    .sort((a, b) => (b[campo] || 0) - (a[campo] || 0))
    .slice(0, 3)
    .map((a) => a.area);

  const series = [{ nome: 'Empresa', cor: _CORES_MONITOR[0] }]
    .concat(topAreas.map((area, i) => ({ nome: area, cor: _CORES_MONITOR[i + 1] })));

  const valorDoDia = (dia, nomeSerie) => {
    if (nomeSerie === 'Empresa') return dia.empresa[campo] || 0;
    const a = (dia.areas || []).find((x) => x.area === nomeSerie);
    return a ? (a[campo] || 0) : 0;
  };

  const todosValores = series.flatMap((s) => historico.map((dia) => valorDoDia(dia, s.nome)));
  const maxValor = Math.max(1, ...todosValores) * 1.15;

  const n = historico.length;
  const x = (i) => MARGEM.esq + (n === 1 ? areaW / 2 : (areaW * i) / (n - 1));
  const y = (v) => MARGEM.topo + areaH - (areaH * v) / maxValor;

  // Grade horizontal + rotulos do eixo Y (4 faixas).
  const NUM_FAIXAS = 4;
  let grade = '';
  for (let f = 0; f <= NUM_FAIXAS; f++) {
    const v = Math.round((maxValor / NUM_FAIXAS) * f);
    const yy = y(v);
    grade += `<line x1="${MARGEM.esq}" y1="${yy}" x2="${LARGURA - MARGEM.dir}" y2="${yy}" stroke="#eee" stroke-width="1"/>`;
    grade += `<text x="${MARGEM.esq - 8}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#999">${esc(formatarValor(v))}</text>`;
  }

  // Rotulos do eixo X: primeiro, ultimo, e alguns no meio (nunca mais que ~7, senao colide).
  const passo = Math.max(1, Math.ceil(n / 7));
  let rotulosX = '';
  for (let i = 0; i < n; i += passo) {
    rotulosX += `<text x="${x(i)}" y="${ALTURA - MARGEM.baixo + 16}" text-anchor="middle" font-size="10" fill="#999">${_dataCurta(historico[i].dia)}</text>`;
  }
  if ((n - 1) % passo !== 0) {
    rotulosX += `<text x="${x(n - 1)}" y="${ALTURA - MARGEM.baixo + 16}" text-anchor="middle" font-size="10" fill="#999">${_dataCurta(historico[n - 1].dia)}</text>`;
  }

  const linhas = series.map((s) => {
    const pontos = historico.map((dia, i) => `${x(i)},${y(valorDoDia(dia, s.nome))}`).join(' ');
    const circulos = historico.map((dia, i) => {
      const v = valorDoDia(dia, s.nome);
      return `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.cor}"><title>${esc(s.nome)} — ${_dataCurta(dia.dia)}: ${esc(formatarValor(v))}</title></circle>`;
    }).join('');
    const linha = n > 1
      ? `<polyline points="${pontos}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      : '';
    return linha + circulos;
  }).join('');

  const legenda = series.map((s) => `
    <span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px;font-size:0.78em;color:#555;">
      <span style="width:10px;height:10px;border-radius:50%;background:${s.cor};display:inline-block;"></span>${esc(s.nome)}
    </span>`).join('');

  const svg = `<svg viewBox="0 0 ${LARGURA} ${ALTURA}" style="width:100%;height:auto;display:block;" role="img" aria-label="${esc(rotuloGrafico)}">
    ${grade}${rotulosX}${linhas}
    <line x1="${MARGEM.esq}" y1="${MARGEM.topo}" x2="${MARGEM.esq}" y2="${ALTURA - MARGEM.baixo}" stroke="#ccc" stroke-width="1"/>
    <line x1="${MARGEM.esq}" y1="${ALTURA - MARGEM.baixo}" x2="${LARGURA - MARGEM.dir}" y2="${ALTURA - MARGEM.baixo}" stroke="#ccc" stroke-width="1"/>
  </svg>`;

  return { svg, legendaHtml: legenda };
}

async function monitor() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Monitor de Risco</h2><p class="page-sub">A carga de risco da empresa ao longo do tempo — empresa e as áreas mais carregadas hoje</p></div>
    </div>
    <div class="loading" id="loadingMonitor">⏳ Carregando...</div>
    <div id="monitorConteudo"></div>`;

  let historico;
  try {
    historico = await API.getHistoricoRisco();
  } catch (e) {
    console.error('Monitor: falha ao carregar', e);
    document.getElementById('loadingMonitor').style.display = 'none';
    document.getElementById('monitorConteudo').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar o histórico.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="monitor()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingMonitor').style.display = 'none';
  const conteudo = document.getElementById('monitorConteudo');

  if (!historico.length) {
    conteudo.innerHTML = `<div style="border:1px solid #e0e0e0;border-radius:10px;padding:24px;background:#fff;color:#666;">
      Ainda não existe nenhum retrato registrado.<br>
      <span style="font-size:0.88em;">A rotina diária grava o primeiro amanhã de manhã. Para preencher os dias já registrados no livro de medições, alguém precisa rodar o script de reconstrução (<code>scripts/backfill-historico-risco.js</code>) uma vez, no computador.</span>
    </div>`;
    return;
  }

  const ultimo = historico[historico.length - 1];
  const idade = _idadeEmDias(ultimo.dia);
  const statusIdade = _corIdade(idade);
  const grafico = _svgLinhaTempoRisco(historico, { campo: 'carga', rotulo: 'Carga de risco ao longo do tempo' });
  const graficoFinanceiro = _svgLinhaTempoRisco(historico, {
    campo: 'impactoFinanceiro', formatarValor: _formatarReais, rotulo: 'Impacto financeiro estimado ao longo do tempo',
  });

  const badgesComposicao = (comp) => RiscoConsolidado.FAIXAS
    .filter((f) => comp[f] > 0)
    .map((f) => {
      const cor = RiscoConsolidado.faixaScore(f === 'Crítico' ? 9 : f === 'Alto' ? 6 : f === 'Moderado' ? 3 : 1);
      return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.78em;font-weight:700;background:${cor.fundo};color:${cor.cor};margin-right:4px;">${comp[f]} ${f}</span>`;
    }).join('');

  conteudo.innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px;">
      <div>
        <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;">Retrato mais recente</div>
        <div style="font-size:1.3em;font-weight:800;color:#1a237e;">${_dataCurta(ultimo.dia)}</div>
      </div>
      <span style="padding:4px 12px;border-radius:12px;font-size:0.82em;font-weight:700;background:${statusIdade.fundo};color:${statusIdade.cor};">
        ${idade === 0 ? 'hoje' : idade === 1 ? 'há 1 dia' : `há ${idade} dias`} · ${statusIdade.rotulo}
      </span>
      ${idade > 1 ? `<span style="font-size:0.82em;color:#999;">A rotina diária roda às 6h — se o atraso continuar, vale checar os logs da função <code>retratoDiarioRisco</code>.</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div style="border:1px solid #e0e0e0;border-radius:10px;padding:20px 22px;background:#fff;">
        <div style="font-size:0.74em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;">Carga da Empresa Hoje</div>
        <div style="font-size:3.2em;font-weight:800;line-height:1;margin:10px 0 12px;color:#1a237e;">${ultimo.empresa.carga}</div>
        <div>${badgesComposicao(ultimo.empresa.composicao) || '<span style="font-size:0.8em;color:#999;">Nenhum risco na conta</span>'}</div>
        <div style="font-size:0.8em;color:#777;margin-top:12px;">${ultimo.empresa.contados} risco${ultimo.empresa.contados === 1 ? '' : 's'} somado${ultimo.empresa.contados === 1 ? '' : 's'}</div>
      </div>
      <div style="border:1px solid #e0e0e0;border-radius:10px;padding:20px 22px;background:#fff;">
        <div style="font-size:0.74em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;">Impacto Financeiro Estimado Hoje</div>
        <div style="font-size:2.4em;font-weight:800;line-height:1;margin:10px 0 10px;color:#1a237e;">${_formatarReais(ultimo.empresa.impactoFinanceiro)}</div>
        ${ultimo.semImpactoFinanceiro ? `<div style="font-size:0.8em;color:#e65100;margin-top:12px;">${ultimo.semImpactoFinanceiro} risco${ultimo.semImpactoFinanceiro > 1 ? 's' : ''} sem estimativa</div>` : ''}
      </div>
    </div>

    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;background:#fff;margin-bottom:16px;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">Carga ao longo do tempo</div>
      ${grafico ? grafico.svg : '<div style="color:#999;">Sem dados suficientes para o gráfico.</div>'}
      <div style="margin-top:8px;">${grafico ? grafico.legendaHtml : ''}</div>
      ${historico.length < 5 ? `<div style="font-size:0.76em;color:#999;margin-top:10px;">Só ${historico.length} dia${historico.length === 1 ? '' : 's'} de histórico até agora — a curva fica mais útil conforme os dias passam.</div>` : ''}
    </div>

    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;background:#fff;margin-bottom:16px;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">Impacto financeiro estimado ao longo do tempo</div>
      ${graficoFinanceiro ? graficoFinanceiro.svg : '<div style="color:#999;">Sem dados suficientes para o gráfico.</div>'}
      <div style="margin-top:8px;">${graficoFinanceiro ? graficoFinanceiro.legendaHtml : ''}</div>
      ${ultimo.semImpactoFinanceiro ? `<div style="font-size:0.76em;color:#e65100;margin-top:10px;">⚠ ${ultimo.semImpactoFinanceiro} risco${ultimo.semImpactoFinanceiro > 1 ? 's' : ''} sem estimativa financeira — fora desta conta, o que a puxa para baixo</div>` : ''}
    </div>

    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px 8px 10px;background:#fff;margin-bottom:16px;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;padding:0 10px 6px;">Carga por área hoje</div>
      ${(ultimo.areas || []).length ? `<table style="width:100%;border-collapse:collapse;font-size:0.9em;">
        <thead>
          <tr>
            <th style="padding:4px 10px 8px;text-align:left;font-size:0.78em;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px;">Área</th>
            <th style="padding:4px 10px 8px;text-align:right;font-size:0.78em;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px;">Nº de Riscos</th>
            <th style="padding:4px 10px 8px;text-align:right;font-size:0.78em;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px;">Carga</th>
            <th style="padding:4px 10px 8px;text-align:right;font-size:0.78em;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px;">Impacto Financeiro</th>
            <th style="padding:4px 10px 8px;text-align:left;font-size:0.78em;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.4px;">Composição</th>
          </tr>
        </thead>
        <tbody>
          ${ultimo.areas.map((a) => `<tr>
            <td style="padding:7px 10px;font-weight:600;color:#333;">${esc(a.area)}</td>
            <td style="padding:7px 10px;text-align:right;color:#555;">${a.contados}</td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;color:#1a237e;">${a.carga}</td>
            <td style="padding:7px 10px;text-align:right;color:#555;">${_formatarReais(a.impactoFinanceiro)}</td>
            <td style="padding:7px 10px;color:#777;">${badgesComposicao(a.composicao)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="padding:10px;color:#999;font-size:0.88em;">Nenhum risco registrado.</div>'}
    </div>
    <div style="font-size:0.76em;color:#999;margin-top:14px;">
      Só quem tem perfil de administrador vê esta tela por enquanto — ver a aba Roadmap sobre abrir por área.
    </div>`;
}


function renderizarRiscos() {
  _renderPainelRiscoConsolidado();
  let data = [...riscosData];
  const isAdmin = window.USER_PERFIL === 'admin';

  const filtroArea = document.getElementById('filtroRiscoArea');
  if (filtroArea && filtroArea.value) data = data.filter(r => r.area === filtroArea.value);

  const filtroStatus = document.getElementById('filtroRiscoStatus');
  if (filtroStatus && filtroStatus.value) data = data.filter(r => r.status === filtroStatus.value);

  const filtroFornecedor = document.getElementById('filtroRiscoFornecedor');
  if (filtroFornecedor && filtroFornecedor.value === '_qualquer_') data = data.filter(r => r.fornecedor);
  else if (filtroFornecedor && filtroFornecedor.value) data = data.filter(r => r.fornecedor === filtroFornecedor.value);

  const busca = (document.getElementById('buscaRisco') || {}).value || '';
  if (busca.trim()) {
    const termo = busca.toLowerCase();
    data = data.filter(r =>
      (r.titulo || '').toLowerCase().includes(termo) ||
      (r.descricao || '').toLowerCase().includes(termo) ||
      (r.responsavel || '').toLowerCase().includes(termo) ||
      (r.categorias || []).some((c) => c.toLowerCase().includes(termo)) ||
      (r.processo || '').toLowerCase().includes(termo) ||
      (r.fornecedorNome || '').toLowerCase().includes(termo)
    );
  }

  data.sort((a, b) => {
    // Score ordena por numero, nao por texto: "10" vem depois de "9".
    if (riscosOrdenacao.coluna === 'score') {
      const nA = _scoreDoRisco(a);
      const nB = _scoreDoRisco(b);
      // Sem score vai sempre para o fim, independente da direcao: e ausencia
      // de avaliacao, nao risco baixo.
      if (nA === null && nB === null) return 0;
      if (nA === null) return 1;
      if (nB === null) return -1;
      return riscosOrdenacao.direcao === 'asc' ? nA - nB : nB - nA;
    }
    const valA = (a[riscosOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[riscosOrdenacao.coluna] || '').toString().toLowerCase();
    const cmp = valA.localeCompare(valB);
    return riscosOrdenacao.direcao === 'asc' ? cmp : -cmp;
  });

  ['area', 'titulo', 'score'].forEach(col => {
    const el = document.getElementById(`sort-risco-${col}`);
    if (el) el.textContent = col === riscosOrdenacao.coluna ? (riscosOrdenacao.direcao === 'asc' ? '▲' : '▼') : '';
  });

  const processosPorId = RiscoConsolidado.indexarProcessos(riscosProcessosCache);

  document.getElementById('riscoRows').innerHTML = data.length
    ? data.map(r => `<tr style="cursor:pointer;" onclick="editarRisco('${r.id}')">
        <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(r.area || '-')}</span></td>
        <td style="font-size:0.85em;color:#555;">${r.processo || (r.fornecedorNome ? `🏢 ${esc(r.fornecedorNome)}` : '<span style="color:#bbb;">Corporativo</span>')}</td>
        <td style="font-weight:600;color:#222;">${esc(r.titulo)}</td>
        <td style="font-size:0.85em;color:#555;">${esc((r.categorias || []).join(', ')) || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${esc(r.responsavel || '-')}</td>
        <td>${_badgeProbImpactoRisco(r.probabilidade)}</td>
        <td>${_badgeProbImpactoRisco(r.impacto)}</td>
        <td style="text-align:center;">${_badgeScoreRisco(r)}</td>
        <td style="text-align:center;">${_badgeCargaRisco(r, processosPorId)}</td>
        <td style="text-align:right;">${r.impactoFinanceiro === null || r.impactoFinanceiro === undefined ? '<span style="color:#bbb;">-</span>' : _formatarReais(r.impactoFinanceiro)}</td>
        <td>${_badgeStatusRisco(r.status)}</td>
        <td>${_badgeProbImpactoRisco(r.prioridade)}</td>
        <td style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation();">
          <button class="btn-icon" onclick="editarRisco('${r.id}')" title="${isAdmin ? 'Editar' : 'Visualizar'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${isAdmin ? `<button class="btn-icon" onclick="clonarRisco('${r.id}')" title="Clonar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a237e" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>` : ''}
          ${isAdmin ? `<button class="btn-icon" onclick="excluirRisco('${r.id}')" title="Excluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>` : ''}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="13" style="text-align:center;color:#999;padding:40px;">Nenhum risco cadastrado.</td></tr>';
}

window.clonarRisco = (id) => {
  const original = riscosData.find((r) => r.id === id);
  if (!original) return;
  abrirDrawerRisco({
    ...original,
    id: '',
    titulo: `${original.titulo} (cópia)`,
    status: 'Identificado',
    dataIdentificacao: new Date().toISOString().slice(0, 10),
    dataUltimaReavaliacao: null,
    proximaReavaliacao: null,
    historicoReavaliacao: '',
    dataEncerramento: null,
    justificativaEncerramento: '',
    origem: 'Manual',
  });
};

window.filtrarRiscos = () => renderizarRiscos();
window.ordenarRiscos = (coluna) => {
  if (riscosOrdenacao.coluna === coluna) {
    riscosOrdenacao.direcao = riscosOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    riscosOrdenacao.coluna = coluna;
    riscosOrdenacao.direcao = 'asc';
  }
  renderizarRiscos();
};

// ------------------------------------------------------------
// Drawer de edição do risco (5 abas cobrindo o ciclo de vida)
// ------------------------------------------------------------
function _htmlDrawerRisco() {
  const lbl = 'display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;';
  const inp = 'width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;';
  return `
    <div class="drawer-overlay" id="drawerOverlayRisco" onclick="fecharDrawerRisco()"></div>
    <div class="drawer" id="drawerRisco">
      <div class="drawer-header">
        <h3 id="riscoDrawerTitulo">Novo Risco</h3>
        <button onclick="fecharDrawerRisco()" style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#999;line-height:1;">&times;</button>
      </div>
      <div class="drawer-body" style="padding:0;display:flex;flex-direction:column;">
        <div style="display:flex;border-bottom:2px solid #e8eaf6;background:white;flex-shrink:0;flex-wrap:wrap;">
          <button id="tab-risco-identificacao" onclick="trocarAbaRisco('identificacao')" style="flex:1;min-width:120px;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#1a237e;border-bottom:3px solid #1a237e;cursor:pointer;">Identificação</button>
          <button id="tab-risco-analise" onclick="trocarAbaRisco('analise')" style="flex:1;min-width:120px;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Análise &amp; Avaliação</button>
          <button id="tab-risco-tratamento" onclick="trocarAbaRisco('tratamento')" style="flex:1;min-width:120px;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Tratamento</button>
          <button id="tab-risco-monitoramento" onclick="trocarAbaRisco('monitoramento')" style="flex:1;min-width:120px;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Monitoramento</button>
          <button id="tab-risco-encerramento" onclick="trocarAbaRisco('encerramento')" style="flex:1;min-width:120px;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Reavaliação &amp; Encerramento</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;">
          <input type="hidden" id="rId">

          <!-- ABA: IDENTIFICAÇÃO / REGISTRO -->
          <div id="painel-risco-identificacao">
            <div style="margin-bottom:20px;">
              <label style="${lbl}">Título / Evento</label>
              <input type="text" id="rTitulo" placeholder="Ex: Falha de energia no data center" style="${inp}border:2px solid #1a237e;font-weight:600;">
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Descrição</label>
              <textarea id="rDescricao" rows="3" placeholder="Descreva o risco e seu impacto potencial" style="${inp}resize:vertical;"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Área</label>
                <select id="rArea" style="${inp}"></select>
              </div>
              <div>
                <label style="${lbl}">Processo Relacionado (opcional)</label>
                <select id="rProcesso" style="${inp}"><option value="">-- Nenhum (risco corporativo) --</option></select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Fornecedor Relacionado (opcional)</label>
                <select id="rFornecedor" style="${inp}"><option value="">-- Nenhum --</option></select>
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Use quando o risco foi reportado por (ou envolve) um fornecedor do catálogo de Dependências.</span>
              </div>
              <div>
                <label style="${lbl}">Indicador Relacionado (opcional)</label>
                <select id="rIndicador" style="${inp}"><option value="">-- Nenhum --</option></select>
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Use quando o risco tem relação com um indicador de segurança. Risco gerado por desvio de meta já vem preenchido.</span>
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Categorias do Risco</label>
              <div id="rCategoriasLista" style="display:flex;flex-direction:column;gap:8px;">
                ${RISCO_CATEGORIAS.map(c => `
                  <label style="display:flex;gap:8px;align-items:flex-start;border:1px solid #eee;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:0.88em;">
                    <input type="checkbox" class="risco-categoria-check" value="${esc(c.valor)}" style="margin-top:3px;">
                    <span><strong>${esc(c.valor)}</strong><br><span style="color:#888;">${esc(c.descricao)}</span></span>
                  </label>`).join('')}
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Responsável (Owner)</label>
              <select id="rResponsavel" style="${inp}"><option value="">Selecione...</option></select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Data de Identificação</label>
                <input type="date" id="rDataIdentificacao" style="${inp}">
              </div>
              <div>
                <label style="${lbl}">Status</label>
                <select id="rStatus" style="${inp}">${RISCO_STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
              </div>
            </div>
            <div id="rOrigemInfo" style="font-size:0.8em;color:#888;"></div>
          </div>

          <!-- ABA: ANÁLISE (IMPACTO FINANCEIRO) & AVALIAÇÃO -->
          <div id="painel-risco-analise" style="display:none;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Probabilidade</label>
                <select id="rProbabilidade" style="${inp}" onchange="_calcularScoreRisco()">
                  <option value="">Selecione...</option>
                  <option value="Baixa">Baixa — Pouco provável que aconteça</option>
                  <option value="Média">Média — Pode acontecer eventualmente</option>
                  <option value="Alta">Alta — Muito provável que aconteça</option>
                </select>
              </div>
              <div>
                <label style="${lbl}">Impacto</label>
                <select id="rImpacto" style="${inp}" onchange="_calcularScoreRisco()">
                  <option value="">Selecione...</option>
                  <option value="Baixo">Baixo — Pouco impacto na operação</option>
                  <option value="Moderado">Moderado — Impacto perceptível, mas gerenciável</option>
                  <option value="Alto">Alto — Impacto significativo na operação</option>
                  <option value="Crítico">Crítico — Risco à continuidade do negócio</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}margin-bottom:8px;">Componentes do Impacto Financeiro, por seção</label>
              ${RISCO_IMPACTO_FINANCEIRO_SECOES.map((s, i) => `
                <div style="border:1px solid #eee;border-radius:9px;padding:12px 14px;margin-bottom:10px;">
                  <div style="font-size:0.78em;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${esc(s.secao)}</div>
                  <div id="impactoFinanceiroTabela_${i}"></div>
                  <div style="display:grid;grid-template-columns:${s.categorias.length > 1 ? '1.3fr ' : ''}1.5fr 1fr auto;gap:8px;margin-top:8px;align-items:end;">
                    ${s.categorias.length > 1 ? `
                    <div>
                      <select id="ifCategoria_${i}" style="${inp}">
                        <option value="">Selecione...</option>
                        ${s.categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
                      </select>
                    </div>` : ''}
                    <div><input type="text" id="ifDescricao_${i}" placeholder="Descrição (opcional)" style="${inp}"></div>
                    <div><input type="number" id="ifValor_${i}" placeholder="Valor R$" style="${inp}"></div>
                    <button class="btn btn-ghost" onclick="adicionarImpactoFinanceiroItem(${i})" style="padding:9px 14px;white-space:nowrap;">+ Adicionar</button>
                  </div>
                </div>`).join('')}
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Impacto Financeiro Estimado (R$)</label>
              <input type="number" id="rImpactoFinanceiro" readonly style="${inp}background:#f5f6fa;color:#1a237e;font-weight:700;">
              <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Calculado automaticamente pela soma dos componentes acima.</span>
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Observações Gerais do Impacto Financeiro</label>
              <textarea id="rImpactoFinanceiroDescricao" rows="3" placeholder="Premissas, ressalvas ou contexto da estimativa" style="${inp}resize:vertical;"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Score (Priorização)</label>
                <input type="number" id="rScore" readonly style="${inp}background:#f5f6fa;color:#1a237e;font-weight:700;">
                <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Calculado automaticamente: Probabilidade × Impacto.</span>
              </div>
              <div>
                <label style="${lbl}">Prioridade</label>
                <select id="rPrioridade" style="${inp}">
                  <option value="">Selecione...</option>
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica</option>
                </select>
              </div>
            </div>
          </div>

          <!-- ABA: TRATAMENTO & PLANO DE AÇÃO -->
          <div id="painel-risco-tratamento" style="display:none;">
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Estratégia de Tratamento</label>
              <select id="rEstrategiaTratamento" style="${inp}">
                <option value="">Selecione...</option>
                <option value="Mitigar">Mitigar</option>
                <option value="Transferir">Transferir</option>
                <option value="Aceitar">Aceitar</option>
                <option value="Evitar">Evitar</option>
              </select>
            </div>
            <div style="margin-bottom:20px;">
              <label style="${lbl}">Estratégia / Medidas de Mitigação</label>
              <textarea id="rEstrategiaDescricao" rows="3" placeholder="Descreva a estratégia de tratamento" style="${inp}resize:vertical;"></textarea>
            </div>
            <div>
              <label style="${lbl}margin-bottom:8px;">Plano de Ação (5W2H)</label>
              <div id="planoAcaoTabela"></div>
              <div style="background:#fafbff;border:1px solid #e8eaf6;border-radius:8px;padding:14px;margin-top:10px;">
                <div id="paEdicaoAviso" style="display:none;font-size:0.8em;color:#1565c0;font-weight:600;margin-bottom:10px;">
                  ✎ Editando ação — <a href="#" onclick="cancelarEdicaoPlanoAcao();return false;" style="color:#1565c0;">cancelar edição</a>
                </div>
                <div style="margin-bottom:10px;">
                  <label style="${lbl}">Ação (o quê)</label>
                  <input type="text" id="paAcao" placeholder="O que será feito" style="${inp}">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <div><label style="${lbl}">Por quê</label><input type="text" id="paPorque" placeholder="Motivo da ação" style="${inp}"></div>
                  <div><label style="${lbl}">Responsável (quem)</label><input type="text" id="paResponsavel" placeholder="Nome ou área" style="${inp}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <div><label style="${lbl}">Onde</label><input type="text" id="paOnde" placeholder="Local ou sistema" style="${inp}"></div>
                  <div><label style="${lbl}">Quando</label><input type="date" id="paQuando" style="${inp}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                  <div><label style="${lbl}">Como</label><input type="text" id="paComo" placeholder="Forma de execução" style="${inp}"></div>
                  <div><label style="${lbl}">Quanto custa (R$)</label><input type="number" id="paQuantoCusta" placeholder="0,00" style="${inp}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
                  <div>
                    <label style="${lbl}">Status</label>
                    <select id="paStatus" style="${inp}">
                      <option value="Pendente">Pendente</option>
                      <option value="Em andamento">Em andamento</option>
                      <option value="Concluído">Concluído</option>
                      <option value="Atrasado">Atrasado</option>
                    </select>
                  </div>
                  <button class="btn btn-ghost" id="btnAdicionarPlanoAcao" onclick="adicionarPlanoAcaoItem()" style="padding:9px 14px;white-space:nowrap;">+ Adicionar</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ABA: MONITORAMENTO (KRIs) -->
          <div id="painel-risco-monitoramento" style="display:none;">
            <label style="${lbl}margin-bottom:8px;">Indicadores-Chave de Risco (KRIs)</label>
            <div id="krisTabela"></div>
            <div style="background:#fafbff;border:1px solid #e8eaf6;border-radius:8px;padding:14px;margin-top:10px;">
              <div id="kriEdicaoAviso" style="display:none;font-size:0.8em;color:#1565c0;font-weight:600;margin-bottom:10px;">
                ✎ Editando lançamento — <a href="#" onclick="cancelarEdicaoKri();return false;" style="color:#1565c0;">cancelar edição</a>
              </div>
              <div style="margin-bottom:10px;"><input type="text" id="kriIndicador" placeholder="Indicador" style="${inp}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
                <div><input type="text" id="kriMeta" placeholder="Meta" style="${inp}"></div>
                <div><input type="text" id="kriValorAtual" placeholder="Valor atual" style="${inp}"></div>
                <div><input type="date" id="kriDataLancamento" style="${inp}"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">
                <div>
                  <select id="kriFrequencia" style="${inp}">
                    <option value="Diária">Diária</option>
                    <option value="Semanal">Semanal</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Trimestral">Trimestral</option>
                  </select>
                </div>
                <div>
                  <select id="kriStatus" style="${inp}">
                    <option value="Dentro da meta">Dentro da meta</option>
                    <option value="Atenção">Atenção</option>
                    <option value="Fora da meta">Fora da meta</option>
                  </select>
                </div>
                <button class="btn btn-ghost" id="btnAdicionarKri" onclick="adicionarKriItem()" style="padding:9px 14px;white-space:nowrap;">+ Adicionar</button>
              </div>
            </div>
          </div>

          <!-- ABA: REAVALIAÇÃO & ENCERRAMENTO -->
          <div id="painel-risco-encerramento" style="display:none;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
              <div>
                <label style="${lbl}">Data da Última Reavaliação</label>
                <input type="date" id="rDataUltimaReavaliacao" style="${inp}">
              </div>
              <div>
                <label style="${lbl}">Próxima Reavaliação</label>
                <input type="date" id="rProximaReavaliacao" style="${inp}">
              </div>
            </div>
            <div style="margin-bottom:20px;">
              <label style="${lbl}">Histórico de Reavaliação</label>
              <textarea id="rHistoricoReavaliacao" rows="3" placeholder="Registre observações de cada reavaliação" style="${inp}resize:vertical;"></textarea>
            </div>
            <div style="margin-bottom:16px;">
              <label style="${lbl}">Data de Encerramento</label>
              <input type="date" id="rDataEncerramento" style="${inp}">
            </div>
            <div>
              <label style="${lbl}">Justificativa de Aceitação/Encerramento</label>
              <textarea id="rJustificativaEncerramento" rows="3" placeholder="Motivo da aceitação do risco ou encerramento" style="${inp}resize:vertical;"></textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost" onclick="fecharDrawerRisco()">Fechar</button>
        <button class="btn btn-primary" onclick="salvarRisco()" id="btnSalvarRisco">Salvar</button>
      </div>
    </div>`;
}

window.trocarAbaRisco = (aba) => {
  ['identificacao', 'analise', 'tratamento', 'monitoramento', 'encerramento'].forEach(a => {
    document.getElementById('painel-risco-' + a).style.display = a === aba ? 'block' : 'none';
    const btn = document.getElementById('tab-risco-' + a);
    btn.style.color = a === aba ? '#1a237e' : '#999';
    btn.style.borderBottom = a === aba ? '3px solid #1a237e' : '3px solid transparent';
  });
};

/** Título + badge de status do drawer. Reaproveitado ao abrir e depois de salvar
 *  (Salvar não fecha mais o drawer — ver salvarRisco). */
function _atualizarTituloDrawerRisco(r) {
  // r truthy com id vazio e o caso do clone (abrirDrawerRisco chamado com um
  // rascunho pre-preenchido, mas ainda sem documento gravado) -- so a
  // presenca de um id de verdade significa "isto ja existe no banco".
  const titulo = (r && r.id) ? 'Editar Risco' : 'Novo Risco';
  const subtitulo = r && r.titulo ? `<div style="font-size:0.75em;color:#555;font-weight:400;margin-top:4px;">${esc(r.titulo)}</div>` : '';
  document.getElementById('riscoDrawerTitulo').innerHTML = titulo + (r ? ` ${_badgeStatusRisco(r.status)}` : '') + subtitulo;
}

window.abrirDrawerRisco = async (r) => {
  const isAdmin = window.USER_PERFIL === 'admin';
  document.getElementById('rId').value = r ? r.id : '';

  if (!riscosProcessosCache.length) {
    try { riscosProcessosCache = await API.getProcessos(); } catch (e) { riscosProcessosCache = []; }
  }
  document.getElementById('rArea').innerHTML = riscosAreasCache.map(a => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('');
  document.getElementById('rProcesso').innerHTML = '<option value="">-- Nenhum (risco corporativo) --</option>' +
    riscosProcessosCache.map(p => `<option value="${p.id}" data-area="${esc(p.area)}" data-tier="${esc(Criticidade.tierDoProcesso(p))}">${esc(p.area)} — ${esc(p.processo)}</option>`).join('');
  document.getElementById('rProcesso').onchange = () => {
    const sel = document.getElementById('rProcesso');
    const op = sel.options[sel.selectedIndex];
    const area = op ? op.dataset.area : '';
    if (area) document.getElementById('rArea').value = area;
    // O BIA ja mediu o quanto dói se este processo parar. Usar isso como ponto
    // de partida do impacto e o que liga os dois modulos — antes o analista
    // digitava do zero, ignorando um numero que o sistema ja tinha.
    _sugerirImpactoPeloTier(op ? op.dataset.tier : '');
  };

  if (!riscosFornecedoresCache.length) {
    try {
      const deps = await API.getDependencias();
      riscosFornecedoresCache = deps.filter(d => ['Fornecedores', 'Fornecedor'].includes(d.categoria));
    } catch (e) { riscosFornecedoresCache = []; }
  }
  document.getElementById('rFornecedor').innerHTML = '<option value="">-- Nenhum --</option>' +
    riscosFornecedoresCache.map(f => `<option value="${f.id}" data-nome="${esc(f.nome)}">${esc(f.nome)}</option>`).join('');

  // Vinculo risco -> indicador. Um risco aponta para no maximo um indicador; um
  // indicador pode ter varios riscos. O risco gerado por desvio de meta ja nasce
  // com o vinculo; este campo permite que um risco criado a mao aponte para o
  // mesmo indicador, que e o que faz o indicador virar insumo do hub.
  if (!(indicadoresData || []).length) {
    try { indicadoresData = await API.getIndicadoresSeguranca(); } catch (e) { indicadoresData = []; }
  }
  document.getElementById('rIndicador').innerHTML = '<option value="">-- Nenhum --</option>' +
    (indicadoresData || []).map(i => `<option value="${esc(i.id)}">${esc(i.nome)}${i.pilar ? ' — ' + esc(i.pilar) : ''}${i.foraDaMeta ? ' (fora da meta)' : ''}</option>`).join('');
  document.getElementById('rIndicador').onchange = () => {
    const sel = document.getElementById('rIndicador');
    const aviso = document.getElementById('rProbabilidade-sugestao');
    if (aviso) aviso.remove();
    if (sel.value) _sugerirProbabilidadePeloIndicador(sel.value);
  };

  _limparSugestoes();
  document.getElementById('rArea').value = r ? r.area : '';
  document.getElementById('rProcesso').value = r && r.processoId ? r.processoId : '';
  document.getElementById('rFornecedor').value = r && r.fornecedor ? r.fornecedor : '';
  document.getElementById('rIndicador').value = r && r.indicadorId ? r.indicadorId : '';
  document.getElementById('rTitulo').value = r ? r.titulo : '';
  // Risco antigo pode ter so `categoria` (string, um valor so) -- cai num
  // array de 1 item, sem precisar de migracao de dado.
  const categoriasAtuais = r ? (Array.isArray(r.categorias) ? r.categorias : (r.categoria ? [r.categoria] : [])) : [];
  document.querySelectorAll('.risco-categoria-check').forEach((chk) => { chk.checked = categoriasAtuais.includes(chk.value); });
  const responsavelAtual = r ? (r.responsavel || '') : '';
  // Risco antigo pode ter responsavel em texto livre que nao bate com nenhuma
  // pessoa cadastrada -- vira opcao extra selecionada, nunca some em silencio
  // so por abrir o drawer (mesmo padrao ja usado pra Responsavel de Area).
  const temNaLista = pessoasData.some((p) => p.nome === responsavelAtual);
  document.getElementById('rResponsavel').innerHTML = '<option value="">Selecione...</option>' +
    pessoasData.map((p) => `<option value="${esc(p.nome)}">${esc(p.nome)}</option>`).join('') +
    (responsavelAtual && !temNaLista ? `<option value="${esc(responsavelAtual)}">${esc(responsavelAtual)} (não cadastrado como pessoa)</option>` : '');
  document.getElementById('rResponsavel').value = responsavelAtual;
  document.getElementById('rDataIdentificacao').value = r ? (r.dataIdentificacao || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('rStatus').value = r ? (r.status || 'Identificado') : 'Identificado';
  document.getElementById('rDescricao').value = r ? (r.descricao || '') : '';
  document.getElementById('rOrigemInfo').textContent = r && r.origem === 'Importado de PCN' ? '📥 Origem: importado de um PCN'
    : r && r.origem === 'Indicador de Segurança' ? '📊 Origem: gerado automaticamente por desvio de indicador de segurança'
    : r && r.origem === 'Fornecedor' ? '🏢 Origem: gerado automaticamente por nota de conformidade do fornecedor abaixo do limiar'
    : '';

  document.getElementById('rProbabilidade').value = r ? (r.probabilidade || '') : '';
  document.getElementById('rImpacto').value = r ? (r.impacto || '') : '';
  window._riscoImpactoFinanceiro = r && r.impactoFinanceiroComponentes ? [...r.impactoFinanceiroComponentes] : [];
  renderImpactoFinanceiroRisco();
  document.getElementById('rImpactoFinanceiroDescricao').value = r ? (r.impactoFinanceiroDescricao || '') : '';
  _calcularScoreRisco();
  document.getElementById('rPrioridade').value = r ? (r.prioridade || '') : '';

  document.getElementById('rEstrategiaTratamento').value = r ? (r.estrategiaTratamento || '') : '';
  document.getElementById('rEstrategiaDescricao').value = r ? (r.estrategiaDescricao || '') : '';
  window._riscoPlanoAcao = r && r.planoAcao ? [...r.planoAcao] : [];
  window.cancelarEdicaoPlanoAcao();
  renderPlanoAcaoRisco();

  window._riscoKris = r && r.kris ? [...r.kris] : [];
  window.cancelarEdicaoKri();
  renderKrisRisco();

  document.getElementById('rDataUltimaReavaliacao').value = r ? (r.dataUltimaReavaliacao || '') : '';
  document.getElementById('rProximaReavaliacao').value = r ? (r.proximaReavaliacao || '') : '';
  document.getElementById('rHistoricoReavaliacao').value = r ? (r.historicoReavaliacao || '') : '';
  document.getElementById('rDataEncerramento').value = r ? (r.dataEncerramento || '') : '';
  document.getElementById('rJustificativaEncerramento').value = r ? (r.justificativaEncerramento || '') : '';

  _atualizarTituloDrawerRisco(r);

  // Somente admin edita; demais perfis visualizam em modo leitura.
  // Setas da Fase 3: o BIA sugere o impacto, o indicador sugere a probabilidade.
  // Ambas so preenchem campo vazio — um risco ja avaliado nao e tocado.
  const opProc = document.getElementById('rProcesso').selectedOptions[0];
  if (opProc) _sugerirImpactoPeloTier(opProc.dataset.tier || '');
  const indSel = document.getElementById('rIndicador');
  if (indSel && indSel.value) _sugerirProbabilidadePeloIndicador(indSel.value);

  document.querySelectorAll('#drawerRisco input, #drawerRisco select, #drawerRisco textarea').forEach(el => { el.disabled = !isAdmin; });
  document.querySelectorAll('#drawerRisco .btn-ghost[onclick*="Item("], #drawerRisco .btn-ghost[onclick^="adicionar"]').forEach(el => { el.style.display = isAdmin ? 'inline-block' : 'none'; });
  document.getElementById('btnSalvarRisco').style.display = isAdmin ? 'inline-block' : 'none';

  trocarAbaRisco('identificacao');
  document.getElementById('drawerRisco').classList.add('open');
  document.getElementById('drawerOverlayRisco').classList.add('open');
};

window.fecharDrawerRisco = () => {
  document.getElementById('drawerRisco').classList.remove('open');
  document.getElementById('drawerOverlayRisco').classList.remove('open');
};

window.editarRisco = (id) => abrirDrawerRisco(riscosData.find(r => r.id === id));

window.excluirRisco = async (id) => {
  if (!confirm('Excluir este risco?')) return;
  try {
    await API.excluirRisco(id);
    riscosData = riscosData.filter(x => x.id !== id);
    renderizarRiscos();
    showToast('✅ Excluído!', '#2e7d32');
    API.invalidate('getRiscos');
  } catch (e) { showToast('Erro: ' + e.message, '#c62828'); }
};

window.salvarRisco = async () => {
  const procSel = document.getElementById('rProcesso');
  const procOpt = procSel.options[procSel.selectedIndex];
  const fornSel = document.getElementById('rFornecedor');
  const fornOpt = fornSel.options[fornSel.selectedIndex];
  const r = {
    id: document.getElementById('rId').value || null,
    area: document.getElementById('rArea').value.trim(),
    processoId: procSel.value || null,
    processo: procSel.value && procOpt ? procOpt.textContent.split(' — ').slice(1).join(' — ') : null,
    fornecedor: fornSel.value || null,
    fornecedorNome: fornSel.value && fornOpt ? fornOpt.dataset.nome : null,
    indicadorId: document.getElementById('rIndicador').value || null,
    titulo: document.getElementById('rTitulo').value.trim(),
    descricao: document.getElementById('rDescricao').value.trim(),
    categorias: Array.from(document.querySelectorAll('.risco-categoria-check:checked')).map((c) => c.value),
    responsavel: document.getElementById('rResponsavel').value.trim(),
    dataIdentificacao: document.getElementById('rDataIdentificacao').value,
    status: document.getElementById('rStatus').value,
    probabilidade: document.getElementById('rProbabilidade').value,
    impacto: document.getElementById('rImpacto').value,
    impactoFinanceiro: document.getElementById('rImpactoFinanceiro').value ? Number(document.getElementById('rImpactoFinanceiro').value) : null,
    impactoFinanceiroComponentes: window._riscoImpactoFinanceiro || [],
    impactoFinanceiroDescricao: document.getElementById('rImpactoFinanceiroDescricao').value.trim(),
    score: document.getElementById('rScore').value ? Number(document.getElementById('rScore').value) : null,
    prioridade: document.getElementById('rPrioridade').value,
    estrategiaTratamento: document.getElementById('rEstrategiaTratamento').value,
    estrategiaDescricao: document.getElementById('rEstrategiaDescricao').value.trim(),
    planoAcao: window._riscoPlanoAcao || [],
    kris: window._riscoKris || [],
    dataUltimaReavaliacao: document.getElementById('rDataUltimaReavaliacao').value || null,
    proximaReavaliacao: document.getElementById('rProximaReavaliacao').value || null,
    historicoReavaliacao: document.getElementById('rHistoricoReavaliacao').value.trim(),
    dataEncerramento: document.getElementById('rDataEncerramento').value || null,
    justificativaEncerramento: document.getElementById('rJustificativaEncerramento').value.trim(),
  };
  if (!r.area) return showToast('Selecione a área.', '#e65100');
  if (!r.titulo) return showToast('Informe o título do risco.', '#e65100');

  const isNew = !r.id;
  if (isNew) r.origem = 'Manual';

  try {
    const result = await API.salvarRisco(r);
    if (isNew) {
      r.id = result.id;
      // Sem fechar o drawer, o proximo "Salvar" precisa gravar no MESMO
      // registro em vez de criar um segundo risco identico.
      document.getElementById('rId').value = r.id;
    }
    const idx = riscosData.findIndex(x => x.id === r.id);
    if (idx !== -1) riscosData[idx] = { ...riscosData[idx], ...r };
    else riscosData.push({ origem: 'Manual', ...r });
    renderizarRiscos();
    _atualizarTituloDrawerRisco(r);
    showToast('✅ Salvo!', '#2e7d32');
    API.invalidate('getRiscos');
  } catch (e) { showToast('❌ Erro: ' + e.message, '#c62828'); }
};

/**
 * Sugestoes vindas dos outros modulos — as "setas" da Fase 3.
 *
 * Sao SUGESTOES: preenchem o campo quando ele esta vazio e avisam o que fizeram.
 * Nunca sobrescrevem uma escolha do analista. E a mesma regra do RTO: o numero
 * que uma pessoa decidiu nao e apagado por um calculo.
 */
const _IMPACTO_POR_TIER = {
  [Criticidade.TIER.T1]: 'Crítico',
  [Criticidade.TIER.T2]: 'Alto',
  [Criticidade.TIER.T3]: 'Moderado',
};

function _sugerirImpactoPeloTier(tier) {
  const campo = document.getElementById('rImpacto');
  if (!campo || campo.value) return;            // ja escolhido: nao encosta
  const sugerido = _IMPACTO_POR_TIER[tier];
  if (!sugerido) return;                         // processo Pendente: nada a sugerir
  campo.value = sugerido;
  _calcularScoreRisco();
  _marcarSugestao('rImpacto', `Sugerido a partir do BIA: o processo é ${tier}.`);
}

/**
 * O desempenho do indicador sugere a probabilidade.
 *
 * Indicador fora da meta significa que o controle que deveria evitar o evento
 * nao esta funcionando — isso e probabilidade, nao impacto.
 */
function _sugerirProbabilidadePeloIndicador(indicadorId) {
  const campo = document.getElementById('rProbabilidade');
  if (!campo || campo.value) return;
  const ind = (indicadoresData || []).find(i => i.id === indicadorId);
  if (!ind || ind.ultimoDesempenho == null) return;
  const fora = _indicadorForaDaMeta(ind, ind.ultimoDesempenho);
  campo.value = fora ? 'Alta' : 'Média';
  _calcularScoreRisco();
  _marcarSugestao('rProbabilidade', fora
    ? `Sugerido: o indicador "${ind.nome}" está fora da meta.`
    : `Sugerido: o indicador "${ind.nome}" está dentro da meta.`);
}

/** Aviso discreto sob o campo, para a sugestao nao passar por decisao humana. */
function _marcarSugestao(idCampo, texto) {
  const campo = document.getElementById(idCampo);
  if (!campo) return;
  let aviso = document.getElementById(idCampo + '-sugestao');
  if (!aviso) {
    aviso = document.createElement('span');
    aviso.id = idCampo + '-sugestao';
    aviso.style.cssText = 'display:block;font-size:0.72em;color:#1565c0;margin-top:3px;';
    campo.parentElement.appendChild(aviso);
  }
  aviso.textContent = '↳ ' + texto + ' Ajuste se discordar.';
}

function _limparSugestoes() {
  ['rImpacto', 'rProbabilidade'].forEach(id => {
    const a = document.getElementById(id + '-sugestao');
    if (a) a.remove();
  });
}

// Plano de Ação (sub-lista embutida no risco)
// Score automático de risco: Probabilidade x Impacto (1-12).
const RISCO_PESO_PROBABILIDADE = { 'Baixa': 1, 'Média': 2, 'Alta': 3 };
const RISCO_PESO_IMPACTO = { 'Baixo': 1, 'Moderado': 2, 'Alto': 3, 'Crítico': 4 };
window._calcularScoreRisco = () => {
  const probabilidade = document.getElementById('rProbabilidade').value;
  const impacto = document.getElementById('rImpacto').value;
  const pesoP = RISCO_PESO_PROBABILIDADE[probabilidade];
  const pesoI = RISCO_PESO_IMPACTO[impacto];
  document.getElementById('rScore').value = (pesoP && pesoI) ? pesoP * pesoI : '';
};

// Componentes do Impacto Financeiro (sub-lista embutida no risco), agora
// exibida em 4 sub-tabelas (uma por secao de RISCO_IMPACTO_FINANCEIRO_SECOES)
// -- o array salvo continua um so e plano, so a exibicao e agrupada.
window._riscoImpactoFinanceiro = [];

function renderImpactoFinanceiroRisco() {
  const itens = window._riscoImpactoFinanceiro || [];
  const isAdmin = window.USER_PERFIL === 'admin';
  const total = itens.reduce((soma, it) => soma + (Number(it.valor) || 0), 0);
  const totalInput = document.getElementById('rImpactoFinanceiro');
  if (totalInput) totalInput.value = itens.length ? total : '';

  RISCO_IMPACTO_FINANCEIRO_SECOES.forEach((s, secaoIdx) => {
    const container = document.getElementById(`impactoFinanceiroTabela_${secaoIdx}`);
    if (!container) return;
    // Guarda o indice no array PLANO (window._riscoImpactoFinanceiro) antes de
    // filtrar -- e esse indice que removerImpactoFinanceiroItem precisa, nao
    // a posicao dentro da secao.
    const itensDaSecao = itens
      .map((it, i) => ({ ...it, _i: i }))
      .filter((it) => s.categorias.includes(it.categoria));

    if (!itensDaSecao.length) { container.innerHTML = '<p style="font-size:0.85em;color:#999;">Nenhum componente adicionado nesta seção.</p>'; return; }
    container.innerHTML = `<table class="data-table" style="box-shadow:none;"><tbody>` +
      itensDaSecao.map((it) => `<tr>
          ${s.categorias.length > 1 ? `<td style="font-weight:600;color:#222;">${esc(it.categoria)}</td>` : ''}
          <td style="font-size:0.85em;color:#555;">${esc(it.descricao || '-')}</td>
          <td style="font-size:0.9em;font-weight:600;color:${it.valor === null || it.valor === undefined ? '#999' : '#333'};">${it.valor === null || it.valor === undefined ? 'sem valor estimado' : `R$ ${Number(it.valor).toLocaleString('pt-BR')}`}</td>
          <td style="text-align:center;">${isAdmin ? `<button class="btn-icon" onclick="removerImpactoFinanceiroItem(${it._i})" title="Remover" style="color:#c62828;font-weight:700;">&times;</button>` : ''}</td>
        </tr>`).join('') + `</tbody></table>`;
  });
}

window.adicionarImpactoFinanceiroItem = (secaoIdx) => {
  const s = RISCO_IMPACTO_FINANCEIRO_SECOES[secaoIdx];
  const categoria = s.categorias.length > 1
    ? document.getElementById(`ifCategoria_${secaoIdx}`).value.trim()
    : s.categorias[0];
  if (s.categorias.length > 1 && !categoria) return showToast('Informe a categoria.', '#e65100');
  const descricao = document.getElementById(`ifDescricao_${secaoIdx}`).value.trim();
  const valorRaw = document.getElementById(`ifValor_${secaoIdx}`).value;
  if (valorRaw !== '' && isNaN(Number(valorRaw))) return showToast('Informe um valor válido.', '#e65100');
  // Valor deixou de ser obrigatorio (o analista pode so descrever um impacto
  // ainda nao quantificado), mas uma linha sem descricao NEM valor nao diz
  // nada -- exige pelo menos um dos dois.
  if (!descricao && valorRaw === '') return showToast('Informe uma descrição ou um valor.', '#e65100');
  window._riscoImpactoFinanceiro = window._riscoImpactoFinanceiro || [];
  window._riscoImpactoFinanceiro.push({
    categoria,
    descricao,
    valor: valorRaw === '' ? null : Number(valorRaw),
  });
  if (s.categorias.length > 1) document.getElementById(`ifCategoria_${secaoIdx}`).value = '';
  document.getElementById(`ifDescricao_${secaoIdx}`).value = '';
  document.getElementById(`ifValor_${secaoIdx}`).value = '';
  renderImpactoFinanceiroRisco();
};
window.removerImpactoFinanceiroItem = (idx) => {
  window._riscoImpactoFinanceiro.splice(idx, 1);
  renderImpactoFinanceiroRisco();
};

window._riscoPlanoAcao = [];
window._planoAcaoEditandoIndex = null;
function renderPlanoAcaoRisco() {
  const container = document.getElementById('planoAcaoTabela');
  if (!container) return;
  const itens = window._riscoPlanoAcao || [];
  const isAdmin = window.USER_PERFIL === 'admin';
  if (!itens.length) { container.innerHTML = '<p style="font-size:0.85em;color:#999;">Nenhuma ação cadastrada.</p>'; return; }
  // Compatibilidade com itens salvos no formato antigo (acao/responsavel/prazo/status):
  // `quando` cai para `prazo` quando o item nao tem o campo novo.
  container.innerHTML = `<table class="data-table" style="box-shadow:none;"><tbody>` +
    itens.map((it, i) => `<tr>
        <td>
          <div style="font-weight:600;color:#222;">${esc(it.acao)}</div>
          ${it.porque ? `<div style="font-size:0.78em;color:#888;margin-top:2px;">Por quê: ${esc(it.porque)}</div>` : ''}
          ${it.como ? `<div style="font-size:0.78em;color:#888;margin-top:2px;">Como: ${esc(it.como)}</div>` : ''}
        </td>
        <td style="font-size:0.85em;color:#555;">${esc(it.responsavel || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(it.onde || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${it.quando || it.prazo || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${it.quantoCusta != null && it.quantoCusta !== '' ? 'R$ ' + Number(it.quantoCusta).toLocaleString('pt-BR') : '-'}</td>
        <td>${it.status || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${isAdmin ? `
          <button class="btn-icon" onclick="editarPlanoAcaoItem(${i})" title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="removerPlanoAcaoItem(${i})" title="Remover" style="color:#c62828;font-weight:700;">&times;</button>` : ''}</td>
      </tr>`).join('') + `</tbody></table>`;
}
function _limparFormularioPlanoAcao() {
  ['paAcao', 'paPorque', 'paResponsavel', 'paOnde', 'paQuando', 'paComo', 'paQuantoCusta'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('paStatus').value = 'Pendente';
}
window.adicionarPlanoAcaoItem = () => {
  const acao = document.getElementById('paAcao').value.trim();
  if (!acao) return showToast('Informe a ação.', '#e65100');
  const quantoCusta = document.getElementById('paQuantoCusta').value;
  const item = {
    acao,
    porque: document.getElementById('paPorque').value.trim(),
    responsavel: document.getElementById('paResponsavel').value.trim(),
    onde: document.getElementById('paOnde').value.trim(),
    quando: document.getElementById('paQuando').value,
    como: document.getElementById('paComo').value.trim(),
    quantoCusta: quantoCusta !== '' ? Number(quantoCusta) : null,
    status: document.getElementById('paStatus').value,
  };
  window._riscoPlanoAcao = window._riscoPlanoAcao || [];
  if (window._planoAcaoEditandoIndex != null) {
    window._riscoPlanoAcao[window._planoAcaoEditandoIndex] = item;
    window._planoAcaoEditandoIndex = null;
    document.getElementById('paEdicaoAviso').style.display = 'none';
    document.getElementById('btnAdicionarPlanoAcao').textContent = '+ Adicionar';
  } else {
    window._riscoPlanoAcao.push(item);
  }
  _limparFormularioPlanoAcao();
  renderPlanoAcaoRisco();
};
window.editarPlanoAcaoItem = (idx) => {
  const it = window._riscoPlanoAcao[idx];
  if (!it) return;
  window._planoAcaoEditandoIndex = idx;
  document.getElementById('paAcao').value = it.acao || '';
  document.getElementById('paPorque').value = it.porque || '';
  document.getElementById('paResponsavel').value = it.responsavel || '';
  document.getElementById('paOnde').value = it.onde || '';
  document.getElementById('paQuando').value = it.quando || it.prazo || '';
  document.getElementById('paComo').value = it.como || '';
  document.getElementById('paQuantoCusta').value = it.quantoCusta != null ? it.quantoCusta : '';
  document.getElementById('paStatus').value = it.status || 'Pendente';
  document.getElementById('paEdicaoAviso').style.display = 'block';
  document.getElementById('btnAdicionarPlanoAcao').textContent = 'Salvar alteração';
  trocarAbaRisco('tratamento');
};
window.cancelarEdicaoPlanoAcao = () => {
  window._planoAcaoEditandoIndex = null;
  document.getElementById('paEdicaoAviso').style.display = 'none';
  document.getElementById('btnAdicionarPlanoAcao').textContent = '+ Adicionar';
  _limparFormularioPlanoAcao();
};
window.removerPlanoAcaoItem = (idx) => {
  window._riscoPlanoAcao.splice(idx, 1);
  if (window._planoAcaoEditandoIndex === idx) window.cancelarEdicaoPlanoAcao();
  renderPlanoAcaoRisco();
};

// KRIs (sub-lista embutida no risco)
window._riscoKris = [];
window._kriEditandoIndex = null;
function renderKrisRisco() {
  const container = document.getElementById('krisTabela');
  if (!container) return;
  const itens = window._riscoKris || [];
  const isAdmin = window.USER_PERFIL === 'admin';
  if (!itens.length) { container.innerHTML = '<p style="font-size:0.85em;color:#999;">Nenhum KRI cadastrado.</p>'; return; }
  // dataLancamento e o nome novo do campo; ultimaAtualizacao e o antigo, mantido
  // como fallback para KRIs ja lancados antes desta tela ganhar o campo visivel.
  container.innerHTML = `<table class="data-table" style="box-shadow:none;"><tbody>` +
    itens.map((it, i) => `<tr>
        <td style="font-weight:600;color:#222;">${esc(it.indicador)}</td>
        <td style="font-size:0.85em;color:#555;">${esc(it.meta || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(it.valorAtual || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${it.dataLancamento || it.ultimaAtualizacao || '-'}</td>
        <td style="font-size:0.85em;color:#555;">${it.frequencia || '-'}</td>
        <td>${it.status || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${isAdmin ? `
          <button class="btn-icon" onclick="editarKriItem(${i})" title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="removerKriItem(${i})" title="Remover" style="color:#c62828;font-weight:700;">&times;</button>` : ''}</td>
      </tr>`).join('') + `</tbody></table>`;
}
function _limparFormularioKri() {
  ['kriIndicador', 'kriMeta', 'kriValorAtual'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('kriDataLancamento').value = new Date().toISOString().slice(0, 10);
  document.getElementById('kriFrequencia').value = 'Mensal';
  document.getElementById('kriStatus').value = 'Dentro da meta';
}
window.adicionarKriItem = () => {
  const indicador = document.getElementById('kriIndicador').value.trim();
  if (!indicador) return showToast('Informe o indicador.', '#e65100');
  const item = {
    indicador,
    meta: document.getElementById('kriMeta').value.trim(),
    valorAtual: document.getElementById('kriValorAtual').value.trim(),
    dataLancamento: document.getElementById('kriDataLancamento').value || new Date().toISOString().slice(0, 10),
    frequencia: document.getElementById('kriFrequencia').value,
    status: document.getElementById('kriStatus').value,
  };
  window._riscoKris = window._riscoKris || [];
  if (window._kriEditandoIndex != null) {
    window._riscoKris[window._kriEditandoIndex] = item;
    window._kriEditandoIndex = null;
    document.getElementById('kriEdicaoAviso').style.display = 'none';
    document.getElementById('btnAdicionarKri').textContent = '+ Adicionar';
  } else {
    window._riscoKris.push(item);
  }
  _limparFormularioKri();
  renderKrisRisco();
};
window.editarKriItem = (idx) => {
  const it = window._riscoKris[idx];
  if (!it) return;
  window._kriEditandoIndex = idx;
  document.getElementById('kriIndicador').value = it.indicador || '';
  document.getElementById('kriMeta').value = it.meta || '';
  document.getElementById('kriValorAtual').value = it.valorAtual || '';
  document.getElementById('kriDataLancamento').value = it.dataLancamento || it.ultimaAtualizacao || '';
  document.getElementById('kriFrequencia').value = it.frequencia || 'Mensal';
  document.getElementById('kriStatus').value = it.status || 'Dentro da meta';
  document.getElementById('kriEdicaoAviso').style.display = 'block';
  document.getElementById('btnAdicionarKri').textContent = 'Salvar alteração';
  trocarAbaRisco('monitoramento');
};
window.cancelarEdicaoKri = () => {
  window._kriEditandoIndex = null;
  document.getElementById('kriEdicaoAviso').style.display = 'none';
  document.getElementById('btnAdicionarKri').textContent = '+ Adicionar';
  _limparFormularioKri();
};
window.removerKriItem = (idx) => {
  window._riscoKris.splice(idx, 1);
  if (window._kriEditandoIndex === idx) window.cancelarEdicaoKri();
  renderKrisRisco();
};

// ------------------------------------------------------------
// Importação de riscos identificados em um PCN já gerado
// ------------------------------------------------------------
function _htmlModalImportarRiscosPCN() {
  return `
    <div class="modal-overlay" id="modalImportarRiscosPCN"><div class="modal" onclick="event.stopPropagation()" style="max-width:720px;">
      <h3>Importar Riscos de um PCN</h3>
      <label style="display:block;font-size:0.82em;font-weight:600;color:#555;margin:14px 0 5px;">Processo</label>
      <select id="importPcnProcesso" onchange="onProcessoImportRiscoChange()" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.92em;">
        <option value="">Selecione um processo com PCN gerado...</option>
      </select>
      <div id="importPcnVersaoWrap" style="display:none;">
        <label style="display:block;font-size:0.82em;font-weight:600;color:#555;margin:14px 0 5px;">Versão do PCN</label>
        <select id="importPcnVersao" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.92em;"></select>
      </div>
      <div style="margin-top:14px;">
        <button class="btn btn-ghost" onclick="carregarRiscosPCNImport()" id="btnCarregarRiscosPCN" style="display:none;">Carregar riscos deste PCN</button>
      </div>
      <div id="importPcnResultado" style="margin-top:16px;max-height:320px;overflow-y:auto;"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharImportarRiscosPCN()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarImportarRiscosPCN()" id="btnConfirmarImportarRiscos" style="display:none;">Importar selecionados</button>
      </div>
    </div></div>`;
}

window.abrirImportarRiscosPCN = async () => {
  document.getElementById('importPcnResultado').innerHTML = '';
  document.getElementById('importPcnVersaoWrap').style.display = 'none';
  document.getElementById('btnCarregarRiscosPCN').style.display = 'none';
  document.getElementById('btnConfirmarImportarRiscos').style.display = 'none';
  window._riscoImportExtraidos = [];

  try {
    if (!riscosProcessosCache.length) riscosProcessosCache = await API.getProcessos();
  } catch (e) { riscosProcessosCache = []; }
  const comPCN = riscosProcessosCache.filter(p => p.pcnSalvo);
  document.getElementById('importPcnProcesso').innerHTML = '<option value="">Selecione um processo com PCN gerado...</option>' +
    comPCN.map(p => `<option value="${p.id}">${esc(p.area)} — ${esc(p.processo)}</option>`).join('');

  document.getElementById('modalImportarRiscosPCN').classList.add('open');
};

window.fecharImportarRiscosPCN = () => {
  document.getElementById('modalImportarRiscosPCN').classList.remove('open');
};

window.onProcessoImportRiscoChange = () => {
  const id = document.getElementById('importPcnProcesso').value;
  document.getElementById('importPcnResultado').innerHTML = '';
  document.getElementById('btnConfirmarImportarRiscos').style.display = 'none';
  if (!id) {
    document.getElementById('importPcnVersaoWrap').style.display = 'none';
    document.getElementById('btnCarregarRiscosPCN').style.display = 'none';
    return;
  }
  const p = riscosProcessosCache.find(x => x.id === id);
  const versoes = p && p.pcnSalvo ? _parsePCNVersoes(p.pcnSalvo) : [];
  const versaoWrap = document.getElementById('importPcnVersaoWrap');
  if (versoes.length > 1) {
    document.getElementById('importPcnVersao').innerHTML = versoes.map((v, i) =>
      `<option value="${i}" ${i === versoes.length - 1 ? 'selected' : ''}>Versão ${v.versao || i + 1} — ${v.data ? new Date(v.data).toLocaleDateString('pt-BR') : ''}</option>`
    ).join('');
    versaoWrap.style.display = 'block';
  } else {
    versaoWrap.style.display = 'none';
  }
  document.getElementById('btnCarregarRiscosPCN').style.display = 'inline-block';
};

window.carregarRiscosPCNImport = () => {
  const id = document.getElementById('importPcnProcesso').value;
  const p = riscosProcessosCache.find(x => x.id === id);
  if (!p || !p.pcnSalvo) return;
  const versoes = _parsePCNVersoes(p.pcnSalvo);
  const versaoWrap = document.getElementById('importPcnVersaoWrap');
  const versao = versaoWrap.style.display === 'block'
    ? versoes[Number(document.getElementById('importPcnVersao').value)]
    : versoes[versoes.length - 1];
  if (!versao) return showToast('Nenhuma versão de PCN encontrada.', '#e65100');

  const extraidos = _extrairRiscosDoPCN(versao.html || '');
  window._riscoImportExtraidos = extraidos.map(r => ({ ...r, selecionado: true }));

  const resultado = document.getElementById('importPcnResultado');
  if (!extraidos.length) {
    resultado.innerHTML = '<p style="color:#e65100;font-size:0.9em;">Nenhuma tabela de riscos encontrada neste PCN.</p>';
    document.getElementById('btnConfirmarImportarRiscos').style.display = 'none';
    return;
  }

  resultado.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;color:#555;margin-bottom:8px;cursor:pointer;">
      <input type="checkbox" checked onchange="toggleTodosImportRiscos(this.checked)"> Selecionar todos (${extraidos.length})
    </label>
    <table class="data-table" style="box-shadow:none;"><tbody>` +
    extraidos.map((r, i) => `<tr>
        <td style="width:5%;"><input type="checkbox" checked onchange="window._riscoImportExtraidos[${i}].selecionado = this.checked"></td>
        <td style="font-weight:600;color:#222;">${esc(r.evento)}</td>
        <td>${_badgeProbImpactoRisco(r.probabilidade)}</td>
        <td>${_badgeProbImpactoRisco(r.impacto)}</td>
        <td style="font-size:0.82em;color:#555;">${esc(r.mitigacao || '-')}</td>
      </tr>`).join('') + `</tbody></table>`;

  document.getElementById('btnConfirmarImportarRiscos').style.display = 'inline-block';
};

window.toggleTodosImportRiscos = (checked) => {
  (window._riscoImportExtraidos || []).forEach(r => r.selecionado = checked);
  document.querySelectorAll('#importPcnResultado tbody input[type="checkbox"]').forEach(cb => cb.checked = checked);
};

window.confirmarImportarRiscosPCN = async () => {
  const id = document.getElementById('importPcnProcesso').value;
  const p = riscosProcessosCache.find(x => x.id === id);
  const selecionados = (window._riscoImportExtraidos || []).filter(r => r.selecionado);
  if (!p || !selecionados.length) return showToast('Selecione ao menos um risco.', '#e65100');

  try {
    for (const row of selecionados) {
      await API.salvarRisco({
        area: p.area,
        processoId: p.id,
        processo: p.processo,
        titulo: row.evento,
        descricao: row.evento,
        categoria: '',
        responsavel: '',
        dataIdentificacao: new Date().toISOString().slice(0, 10),
        status: 'Identificado',
        origem: 'Importado de PCN',
        probabilidade: row.probabilidade || '',
        impacto: row.impacto || '',
        estrategiaTratamento: '',
        estrategiaDescricao: row.mitigacao || '',
        planoAcao: [],
        kris: [],
      });
    }
    fecharImportarRiscosPCN();
    showToast(`✅ ${selecionados.length} risco(s) importado(s)!`, '#2e7d32');
    API.invalidate('getRiscos');
    riscosData = await API.getRiscos();
    renderizarRiscos();
  } catch (e) { showToast('❌ Erro ao importar: ' + e.message, '#c62828'); }
};

// Extrai a tabela "Avaliação de Riscos" de um PCN gerado (mesma heurística do
// realce ao vivo em pcn-live.js, estendida para cobrir headings h2/h3 e <li>).
function _extrairRiscosDoPCN(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let table = null;

  const headings = doc.querySelectorAll('h1, h2, h3');
  let heading = null;
  headings.forEach(h => {
    const t = h.textContent.toLowerCase();
    if (!heading && t.includes('risco') && (t.includes('avaliação') || t.includes('análise'))) heading = h;
  });
  if (heading) {
    let next = heading.nextElementSibling;
    while (next && next.tagName !== 'TABLE' && next.tagName !== 'H2' && next.tagName !== 'H3') next = next.nextElementSibling;
    if (next && next.tagName === 'TABLE') table = next;
  }

  if (!table) {
    doc.querySelectorAll('li').forEach(li => {
      if (table) return;
      const t = (li.textContent || '').toLowerCase();
      if (t.includes('risco') && (t.includes('avaliação') || t.includes('análise'))) {
        const tb = li.querySelector('table');
        if (tb) table = tb;
      }
    });
  }
  if (!table) return [];

  let headerCells = table.querySelectorAll('thead th');
  if (!headerCells.length) {
    const primeiraLinha = table.querySelector('tr');
    if (primeiraLinha) headerCells = primeiraLinha.querySelectorAll('th, td');
  }
  let idxEvento = -1, idxProb = -1, idxImpacto = -1, idxMitigacao = -1;
  headerCells.forEach((th, i) => {
    const t = th.textContent.toLowerCase();
    if (t.includes('evento') || t.includes('ameaça')) idxEvento = i;
    else if (t.includes('probabilidade')) idxProb = i;
    else if (t.includes('impacto')) idxImpacto = i;
    else if (t.includes('mitiga') || t.includes('estratégia')) idxMitigacao = i;
  });

  const lerCelula = (td) => {
    if (!td) return '';
    const select = td.querySelector('select');
    if (select) {
      const opt = select.querySelector('option[selected]');
      return (opt ? opt.value : select.value) || '';
    }
    return (td.textContent || '').trim();
  };

  let linhas = table.querySelectorAll('tbody tr');
  if (!linhas.length) linhas = Array.from(table.querySelectorAll('tr')).slice(1);

  const riscos = [];
  linhas.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const evento = idxEvento >= 0 ? lerCelula(cells[idxEvento]) : lerCelula(cells[0]);
    if (!evento) return;
    riscos.push({
      evento,
      probabilidade: idxProb >= 0 ? lerCelula(cells[idxProb]) : '',
      impacto: idxImpacto >= 0 ? lerCelula(cells[idxImpacto]) : '',
      mitigacao: idxMitigacao >= 0 ? lerCelula(cells[idxMitigacao]) : '',
    });
  });
  return riscos;
}

// ============================================================
// INDICADORES DE SEGURANÇA — estado e helpers compartilhados
// pelas 4 telas (Dashboard, Cadastro, Lançamento Mensal, Matriz)
// ============================================================
let indicadoresData = [];
let indicadoresOrdenacao = { coluna: 'nome', direcao: 'asc' };
let indicadoresPaginaAtual = 1;
const INDICADORES_POR_PAGINA = 20;
let indicadoresFiltrosCadastro = { pilar: '', responsavel: '', busca: '' };
let indicadoresFiltrosMatriz = { pilar: '', responsavel: '', busca: '' };
let indicadoresSelecionados = new Set();
let indicadoresPaginaIds = [];
let indicadoresDashboardFiltro = { modo: 'foraDaMeta', pilar: null };
let indicadoresDashboardPaginaAtual = 1;
let indicadoresDashboardMes = '';
const INDICADOR_PILARES = ['Crise e Continuidade', 'GRC', 'Operações e Infra', 'Produto e Aplicações'];
const INDICADOR_TIPOS = ['CR', 'Estratégico', 'Operacional'];

/**
 * Sentido da meta. Ate 20/09/2026 so existia um: "quanto maior melhor".
 *
 * Indicadores em que MENOR e melhor — vulnerabilidades criticas em aberto,
 * tempo de resposta a incidente, cliques em phishing, indisponibilidade —
 * apareciam como dentro da meta exatamente quando estavam piorando. Para um hub
 * de riscos isso inverte o sinal numa classe inteira de indicadores: justamente
 * os que deveriam empurrar o risco para cima eram lidos ao contrario.
 *
 * O padrao continua "maior e melhor", para nao mudar a leitura de nenhum
 * indicador existente sem alguem decidir. Cada indicador e marcado a mao.
 */
const SENTIDO_META = { MAIOR_MELHOR: 'maiorMelhor', MENOR_MELHOR: 'menorMelhor' };

function _indicadorForaDaMeta(indicador, desempenho) {
  if (desempenho == null || isNaN(Number(desempenho)) || indicador.metaMinima == null || indicador.metaMinima === '') return false;
  const d = Number(desempenho);
  const meta = Number(indicador.metaMinima);
  return indicador.sentidoMeta === SENTIDO_META.MENOR_MELHOR ? d > meta : d < meta;
}

/** Rotulo do campo de meta, que muda com o sentido. */
function _rotuloMeta(indicador) {
  return (indicador && indicador.sentidoMeta === SENTIDO_META.MENOR_MELHOR) ? 'Meta máxima' : 'Meta mínima';
}
function _badgeDesvioIndicador(foraDaMeta) {
  return foraDaMeta
    ? '<span class="badge" style="background:#ffebee;color:#c62828;">⚠ Fora da meta</span>'
    : '<span class="badge badge-green">Dentro da meta</span>';
}
function _formatMes(mes) {
  if (!mes) return '-';
  const [ano, m] = String(mes).split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const idx = Number(m) - 1;
  return nomes[idx] ? `${nomes[idx]}/${ano}` : mes;
}

// União de todos os meses (AAAA-MM) presentes no histórico de qualquer indicador, desc.
function _mesesDisponiveis() {
  const set = new Set();
  indicadoresData.forEach(d => (d.historico || []).forEach(h => { if (h.mes) set.add(h.mes); }));
  return [...set].sort().reverse();
}

// Resolve {mes, desempenho} de um indicador para um mês de referência
// específico (busca no histórico) ou, sem mês informado, para o último mês
// com dado do próprio indicador — usado pelo filtro de mês do Dashboard.
function _pegarDesempenhoNoMes(indicador, mes) {
  if (!mes) return { mes: indicador.ultimoMes, desempenho: indicador.ultimoDesempenho };
  const entrada = (indicador.historico || []).find(h => h.mes === mes);
  return entrada ? { mes: entrada.mes, desempenho: entrada.desempenho } : { mes, desempenho: null };
}

// Valores distintos de Responsável já cadastrados, para popular o filtro.
function _responsaveisDisponiveis() {
  return [...new Set(indicadoresData.map(d => d.responsavel).filter(Boolean))].sort();
}

// Núcleo comum de Pilar/Responsável/Mês/Busca, usado por Cadastro, Matriz e
// Lançamento Mensal — só muda o campo onde o texto buscado é procurado
// (indicadores usam `nome`, linhas de lançamento usam `indicadorNome`).
function _aplicarFiltrosIndicadores(lista, filtros, campoBusca) {
  let data = lista;
  if (filtros.pilar) data = data.filter(d => d.pilar === filtros.pilar);
  if (filtros.responsavel) data = data.filter(d => d.responsavel === filtros.responsavel);
  if (filtros.mes) data = data.filter(d => d.mes === filtros.mes);
  if (filtros.busca && filtros.busca.trim()) {
    const termo = filtros.busca.trim().toLowerCase();
    data = data.filter(d => (d[campoBusca] || '').toLowerCase().includes(termo));
  }
  return data;
}

// Filtros comuns a Cadastro e Matriz (Pilar, Responsável, busca por nome).
function _filtrarIndicadores(lista, filtros) { return _aplicarFiltrosIndicadores(lista, filtros, 'nome'); }

async function _carregarIndicadoresData() {
  try { indicadoresData = await API.getIndicadoresSeguranca(); } catch (e) { indicadoresData = []; }
}

// Re-renderiza a tela de Indicadores atualmente aberta, qualquer que seja
// (usado por ações que podem ser disparadas de mais de uma tela, como editar
// ou lançar resultado a partir do Dashboard).
function _atualizarTelaIndicadorAtual() {
  if (document.getElementById('indicadoresConteudoCadastro')) renderizarIndicadoresCadastro();
  if (document.getElementById('indicadoresConteudoMatriz')) renderizarIndicadoresMatriz();
  if (document.getElementById('indicadoresConteudoDashboard')) renderizarIndicadoresDashboard();
  if (document.getElementById('indicadoresGradeLancamentos')) { _renderFiltrosLancamento(); renderizarGradeLancamentos(); }
}

// Mesmo padrão de filtro usado em Processos/Dependências/Componentes/Riscos
// (ver .amazonq/rules/ui-referencias.md, seção "Barra de filtros").
const _estiloFiltroLabel = 'font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;';
const _estiloFiltroInput = 'padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:190px;';

// Barra de filtros compartilhada por Cadastro, Matriz e Lançamento Mensal.
// `handler` é o nome da função global (window.atualizarFiltro...) chamada no
// onchange/oninput de cada campo; `comMes` liga o campo Mês (só Lançamento).
function _renderBarraFiltrosIndicadores(containerId, filtros, handler, { comMes = false } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const responsaveis = _responsaveisDisponiveis();
  el.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
      ${comMes ? `
      <div>
        <label style="${_estiloFiltroLabel}">Mês</label>
        <select onchange="${handler}('mes',this.value)" style="${_estiloFiltroInput}">
          <option value="">Todos os meses</option>
          ${_mesesDisponiveis().map(m => `<option value="${m}" ${filtros.mes === m ? 'selected' : ''}>${_formatMes(m)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div>
        <label style="${_estiloFiltroLabel}">Pilar</label>
        <select onchange="${handler}('pilar',this.value)" style="${_estiloFiltroInput}">
          <option value="">Todos os pilares</option>
          ${INDICADOR_PILARES.map(p => `<option value="${p}" ${filtros.pilar === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="${_estiloFiltroLabel}">Responsável</label>
        <select onchange="${handler}('responsavel',this.value)" style="${_estiloFiltroInput}">
          <option value="">Todos</option>
          ${responsaveis.map(r => `<option value="${r}" ${filtros.responsavel === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="${_estiloFiltroLabel}">Indicador</label>
        <input type="text" value="${filtros.busca}" oninput="${handler}('busca',this.value)" placeholder="🔍 Buscar indicador..." style="${_estiloFiltroInput}">
      </div>
    </div>`;
}

// Grava o(s) resultado(s) mensal(is) de um indicador (upsert por mês no
// histórico) e dispara a conversão automática em risco se sair da meta.
// Usada tanto pelo lançamento manual (1 entrada) quanto pela importação CSV
// (várias entradas de uma vez, uma por mês do arquivo).
async function _lancarResultadosIndicador(indicador, novasEntradas, arquivoOrigem, riscosCache) {
  // Cada mes vira um documento proprio. Antes a lista inteira era regravada a
  // partir da copia em memoria: dois lancamentos simultaneos se apagavam.
  await API.lancarResultados(indicador.id, novasEntradas, arquivoOrigem || '');

  const agora = new Date().toISOString();
  const historicoPorMes = new Map((indicador.historico || []).map(h => [h.mes, h]));
  novasEntradas.forEach(e => historicoPorMes.set(e.mes, { mes: e.mes, desempenho: e.desempenho, importadoEm: agora, arquivo: arquivoOrigem || '' }));
  const historico = [...historicoPorMes.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  // "Último" para fins de status = mês mais recente que já tem desempenho
  // preenchido (meses sem dado não geram falso "fora da meta").
  const ultimoComDado = [...historico].reverse().find(h => h.desempenho != null);
  const foraDaMetaAgora = ultimoComDado ? _indicadorForaDaMeta(indicador, ultimoComDado.desempenho) : false;

  // Estes tres continuam no documento do indicador, mas agora como CACHE de
  // exibicao — a verdade e a colecao de lancamentos.
  await API.salvarIndicadorSeguranca({
    id: indicador.id,
    ultimoDesempenho: ultimoComDado ? ultimoComDado.desempenho : null,
    ultimoMes: ultimoComDado ? ultimoComDado.mes : null,
    foraDaMeta: foraDaMetaAgora,
  });
  indicador.historico = historico;
  indicador.ultimoDesempenho = ultimoComDado ? ultimoComDado.desempenho : null;
  indicador.ultimoMes = ultimoComDado ? ultimoComDado.mes : null;
  indicador.foraDaMeta = foraDaMetaAgora;
  API.invalidate('getIndicadoresSeguranca');

  // Indicador voltou para dentro da meta: encerra o risco automatico que estava
  // aberto. Antes isso nunca acontecia — o indicador ficava verde no painel e
  // vermelho no registro de riscos ao mesmo tempo, e quem levava o registro ao
  // comite reportava numero inflado.
  if (!foraDaMetaAgora) {
    try {
      const riscosAtuais = riscosCache || await API.getRiscos();
      const abertos = riscosAtuais.filter(r =>
        r.indicadorId === indicador.id &&
        r.origem === 'Indicador de Segurança' &&
        r.status !== 'Encerrado');
      for (const r of abertos) {
        await API.salvarRisco({
          id: r.id,
          status: 'Encerrado',
          dataEncerramento: new Date().toISOString().slice(0, 10),
          justificativaEncerramento: `Encerrado automaticamente: o indicador "${indicador.nome}" voltou para dentro da meta em ${_formatMes(ultimoComDado ? ultimoComDado.mes : '')}.`,
        });
      }
      if (abertos.length) API.invalidate('getRiscos');
    } catch (e) {
      console.error('Não foi possível encerrar o risco automático do indicador', e);
    }
  }

  // Conversão automática: só abre um risco novo se não já existir um risco
  // automático em aberto para este indicador (evita duplicar a cada lançamento).
  let riscoGerado = false;
  if (foraDaMetaAgora) {
    const riscosAtuais = riscosCache || await API.getRiscos();
    const jaExiste = riscosAtuais.some(r => r.indicadorId === indicador.id && r.origem === 'Indicador de Segurança' && !['Aceito', 'Encerrado'].includes(r.status));
    if (!jaExiste) {
      await API.salvarRisco({
        area: '',
        titulo: `Desvio no indicador "${esc(indicador.nome)}"`,
        descricao: `O indicador "${esc(indicador.nome)}" (${esc(indicador.pilar || 'sem pilar')}) atingiu ${ultimoComDado.desempenho}% de desempenho em ${_formatMes(ultimoComDado.mes)}, ${indicador.sentidoMeta === SENTIDO_META.MENOR_MELHOR ? 'acima da meta máxima' : 'abaixo da meta mínima'} de ${indicador.metaMinima}%.`,
        // Desvio de indicador e falha de controle: cai sempre em Operacional,
        // dentro da lista fechada de categorias de risco (o Pilar do indicador
        // e outra taxonomia e nunca bateu com essa lista).
        categoria: 'Operacional',
        responsavel: indicador.responsavel || '',
        dataIdentificacao: new Date().toISOString().slice(0, 10),
        status: 'Identificado',
        origem: 'Indicador de Segurança',
        indicadorId: indicador.id,
        planoAcao: [],
        kris: [],
      });
      riscoGerado = true;
      API.invalidate('getRiscos');
    }
  }
  return { riscoGerado };
}

// ============================================================
// PÁGINA: INDICADORES — DASHBOARD
// ============================================================
async function indicadoresDashboard() {
  indicadoresDashboardFiltro = { modo: 'foraDaMeta', pilar: null };
  indicadoresDashboardPaginaAtual = 1;
  indicadoresDashboardMes = '';
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Dashboard de Indicadores</h2><p class="page-sub">Visão geral dos indicadores de segurança e desvios de meta — clique num card para filtrar a lista</p></div>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div id="indicadoresConteudoDashboard" style="display:none;"></div>
    ${_htmlModalIndicador()}
  `;
  await _carregarIndicadoresData();
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('indicadoresConteudoDashboard').style.display = 'block';
  renderizarIndicadoresDashboard();
}

// Cards de resumo funcionam como filtro da lista abaixo. Clicar no card já
// ativo limpa o filtro (volta pra "Todos").
window.filtrarDashboardIndicadores = (modo, pilar) => {
  const atual = indicadoresDashboardFiltro;
  const mesmoFiltro = atual.modo === modo && (modo !== 'pilar' || atual.pilar === pilar);
  indicadoresDashboardFiltro = mesmoFiltro ? { modo: 'todos', pilar: null } : { modo, pilar: pilar || null };
  indicadoresDashboardPaginaAtual = 1;
  renderizarIndicadoresDashboard();
};

window.irParaPaginaDashboard = (delta) => {
  indicadoresDashboardPaginaAtual += delta;
  renderizarIndicadoresDashboard();
};

window.atualizarMesDashboard = (mes) => {
  indicadoresDashboardMes = mes;
  indicadoresDashboardPaginaAtual = 1;
  renderizarIndicadoresDashboard();
};

function renderizarIndicadoresDashboard() {
  const conteudo = document.getElementById('indicadoresConteudoDashboard');
  if (!conteudo) return;
  const isAdmin = window.USER_PERFIL === 'admin';
  const f = indicadoresDashboardFiltro;

  const mesRef = indicadoresDashboardMes;
  const total = indicadoresData.length;
  // "Fora da meta" é sempre calculado ao vivo (metaMinima atual x desempenho
  // do mês de referência), nunca a partir do flag persistido — que só é
  // recalculado quando um resultado é lançado, e fica desatualizado se a
  // Meta Mínima mudar depois disso.
  const foraDaMeta = indicadoresData.filter(d => {
    const { desempenho } = _pegarDesempenhoNoMes(d, mesRef);
    return desempenho != null && _indicadorForaDaMeta(d, desempenho);
  });
  const semMeta = indicadoresData.filter(d => d.metaMinima == null || d.metaMinima === '');
  const porPilar = {};
  indicadoresData.forEach(d => { const p = d.pilar || 'Sem Pilar'; porPilar[p] = (porPilar[p] || 0) + 1; });

  const cardBase = 'background:white;border-radius:10px;padding:14px 20px;min-width:140px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);cursor:pointer;';
  const anelAtivo = 'outline:2.5px solid #1a237e;outline-offset:2px;';

  const cardsPilar = Object.entries(porPilar).sort((a, b) => a[0].localeCompare(b[0])).map(([p, n]) => {
    const ativo = f.modo === 'pilar' && f.pilar === p;
    return `<div style="${cardBase}border-top:3px solid #1a237e;${ativo ? anelAtivo : ''}" onclick="filtrarDashboardIndicadores('pilar','${p}')" title="Clique para filtrar por este pilar">
      <div style="font-size:1.4em;font-weight:700;color:#1a237e;">${n}</div>
      <div style="font-size:0.75em;color:#666;">${p}</div>
    </div>`;
  }).join('');

  // Lista filtrada de acordo com o card ativo.
  let lista, titulo;
  if (f.modo === 'todos') { lista = [...indicadoresData]; titulo = 'Todos os Indicadores'; }
  else if (f.modo === 'semMeta') { lista = semMeta; titulo = 'Indicadores Sem Meta Definida'; }
  else if (f.modo === 'pilar') { lista = indicadoresData.filter(d => (d.pilar || 'Sem Pilar') === f.pilar); titulo = `Indicadores — Pilar: ${esc(f.pilar)}`; }
  else { lista = foraDaMeta; titulo = 'Indicadores Fora da Meta'; }

  lista = f.modo === 'foraDaMeta'
    ? [...lista].sort((a, b) => {
        const desvioA = Number(a.metaMinima) - Number(_pegarDesempenhoNoMes(a, mesRef).desempenho);
        const desvioB = Number(b.metaMinima) - Number(_pegarDesempenhoNoMes(b, mesRef).desempenho);
        return desvioB - desvioA;
      })
    : [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  const totalLista = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(totalLista / INDICADORES_POR_PAGINA));
  if (indicadoresDashboardPaginaAtual > totalPaginas) indicadoresDashboardPaginaAtual = totalPaginas;
  if (indicadoresDashboardPaginaAtual < 1) indicadoresDashboardPaginaAtual = 1;
  const inicio = (indicadoresDashboardPaginaAtual - 1) * INDICADORES_POR_PAGINA;
  const pagina = lista.slice(inicio, inicio + INDICADORES_POR_PAGINA);

  conteudo.innerHTML = `
    <div style="margin-bottom:16px;">
      <label style="${_estiloFiltroLabel}">Mês de referência</label>
      <select onchange="atualizarMesDashboard(this.value)" style="${_estiloFiltroInput}">
        <option value="">Mais recente</option>
        ${_mesesDisponiveis().map(m => `<option value="${m}" ${m === mesRef ? 'selected' : ''}>${_formatMes(m)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
      <div style="${cardBase}border-top:3px solid #1a237e;${f.modo === 'todos' ? anelAtivo : ''}" onclick="filtrarDashboardIndicadores('todos')" title="Clique para ver todos os indicadores">
        <div style="font-size:1.6em;font-weight:700;color:#1a237e;">${total}</div>
        <div style="font-size:0.75em;color:#666;">Total de Indicadores</div>
      </div>
      <div style="${cardBase}border-top:3px solid #c62828;${f.modo === 'foraDaMeta' ? anelAtivo : ''}" onclick="filtrarDashboardIndicadores('foraDaMeta')" title="Clique para filtrar os fora da meta">
        <div style="font-size:1.6em;font-weight:700;color:#c62828;">${foraDaMeta.length}</div>
        <div style="font-size:0.75em;color:#666;">Fora da Meta</div>
      </div>
      <div style="${cardBase}border-top:3px solid #757575;${f.modo === 'semMeta' ? anelAtivo : ''}" onclick="filtrarDashboardIndicadores('semMeta')" title="Clique para filtrar os sem meta definida">
        <div style="font-size:1.6em;font-weight:700;color:#757575;">${semMeta.length}</div>
        <div style="font-size:0.75em;color:#666;">Sem Meta Definida</div>
      </div>
      ${cardsPilar}
    </div>
    <h3 style="font-size:1em;color:#1a237e;margin-bottom:12px;">${titulo}</h3>
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:12%;">Pilar</th>
            <th style="width:26%;">Indicador</th>
            <th style="width:16%;">Responsável</th>
            <th style="width:10%;">Mês</th>
            <th style="width:12%;">Desempenho</th>
            <th style="width:12%;">Meta Mínima</th>
            ${isAdmin ? '<th style="width:8%;text-align:center;">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${pagina.length ? pagina.map(d => {
            const { mes, desempenho } = _pegarDesempenhoNoMes(d, mesRef);
            const foraMeta = desempenho != null && _indicadorForaDaMeta(d, desempenho);
            return `<tr>
              <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(d.pilar || '-')}</span></td>
              <td style="font-weight:600;color:#222;">${esc(d.nome)}</td>
              <td style="font-size:0.85em;color:#555;">${esc(d.responsavel || '-')}</td>
              <td style="font-size:0.85em;color:#555;">${mes ? _formatMes(mes) : '-'}</td>
              <td style="font-size:0.9em;font-weight:600;color:${foraMeta ? '#c62828' : '#333'};">${desempenho != null ? desempenho + '%' : '-'}</td>
              <td style="font-size:0.85em;color:#555;">${d.metaMinima != null && d.metaMinima !== '' ? d.metaMinima + '%' : '-'}</td>
              ${isAdmin ? `<td style="text-align:center;"><button class="btn-icon" onclick="editarIndicador('${d.id}')" title="Editar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button></td>` : ''}
            </tr>`;
          }).join('') : `<tr><td colspan="${isAdmin ? 7 : 6}" style="text-align:center;color:#999;padding:40px;">${f.modo === 'foraDaMeta' ? 'Nenhum indicador fora da meta 🎉' : 'Nenhum indicador encontrado.'}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:0.85em;color:#666;">
      <span>${totalLista ? `Mostrando ${inicio + 1}–${inicio + pagina.length} de ${totalLista} indicador(es)` : ''}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="irParaPaginaDashboard(-1)" ${indicadoresDashboardPaginaAtual <= 1 ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">‹ Anterior</button>
        <span style="padding:6px 4px;">Página ${indicadoresDashboardPaginaAtual} de ${totalPaginas}</span>
        <button class="btn btn-ghost" onclick="irParaPaginaDashboard(1)" ${indicadoresDashboardPaginaAtual >= totalPaginas ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">Próxima ›</button>
      </div>
    </div>`;
}

// ============================================================
// PÁGINA: INDICADORES — CADASTRO
// ============================================================
async function indicadoresCadastro() {
  const isAdmin = window.USER_PERFIL === 'admin';
  indicadoresPaginaAtual = 1;
  indicadoresFiltrosCadastro = { pilar: '', responsavel: '', busca: '' };
  indicadoresSelecionados = new Set();
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Cadastro de Indicadores</h2><p class="page-sub">Pilar, tipo, responsável e meta mínima de cada indicador de segurança</p></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="excluirIndicadoresSelecionados()" id="btnExcluirIndicadoresSelecionados" style="color:#c62828;border-color:#c62828;display:none;">🗑️ Excluir selecionados</button>
        <button class="btn btn-primary" onclick="abrirModalIndicador()" id="btnNovoIndicador" style="display:none;">+ Novo Indicador</button>
      </div>
    </div>
    <div id="indicadoresFiltrosCadastro" style="margin-bottom:16px;"></div>
    <div class="loading">⏳ Carregando...</div>
    <div id="indicadoresConteudoCadastro" style="display:none;"></div>
    ${_htmlModalIndicador()}
  `;

  document.getElementById('btnNovoIndicador').style.display = isAdmin ? 'inline-block' : 'none';

  await _carregarIndicadoresData();
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('indicadoresConteudoCadastro').style.display = 'block';

  _renderFiltrosIndicadoresCadastro();
  renderizarIndicadoresCadastro();
}

function _renderFiltrosIndicadoresCadastro() {
  _renderBarraFiltrosIndicadores('indicadoresFiltrosCadastro', indicadoresFiltrosCadastro, 'atualizarFiltroCadastro');
}

window.atualizarFiltroCadastro = (campo, valor) => {
  indicadoresFiltrosCadastro[campo] = valor;
  indicadoresPaginaAtual = 1;
  renderizarIndicadoresCadastro();
};

window.irParaPaginaIndicadores = (delta) => {
  indicadoresPaginaAtual += delta;
  renderizarIndicadoresCadastro();
};

// Célula de Meta Mínima do Cadastro em modo exibição: texto com sinalização
// visual (sublinhado tracejado + ✎) em vez de input sempre visível — mesmo
// padrão adotado na grade de Lançamentos (clique pra editar, Salvar/Cancelar
// explícitos, nada salva sozinho ao perder o foco).
function _htmlCelulaMetaMinima(id, metaMinima, isAdmin) {
  const texto = metaMinima != null && metaMinima !== '' ? metaMinima + '%' : '<span style="color:#bbb;">definir</span>';
  if (!isAdmin) return texto;
  return `<span onclick="iniciarEdicaoMetaMinima(this,'${id}')" style="cursor:pointer;border-bottom:1px dashed #999;padding-bottom:1px;" title="Clique para editar">${texto} <span style="font-size:0.85em;color:#bbb;">✎</span></span>`;
}

window.iniciarEdicaoMetaMinima = (spanEl, id) => {
  const indicador = indicadoresData.find(x => x.id === id);
  const valorAtual = indicador && indicador.metaMinima != null ? indicador.metaMinima : '';
  const td = spanEl.closest('td');
  td.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">
      <input type="number" step="any" min="0" max="100" value="${valorAtual}" style="width:60px;padding:4px 6px;border:1.5px solid #1a237e;border-radius:5px;font-size:0.88em;">%
      <button class="btn-icon" title="Salvar (Enter)" style="color:#2e7d32;" onclick="salvarEdicaoMetaMinima(this,'${id}')">✔</button>
      <button class="btn-icon" title="Cancelar (Esc)" style="color:#c62828;" onclick="cancelarEdicaoMetaMinima(this,'${id}')">✕</button>
    </span>`;
  const input = td.querySelector('input');
  input.focus();
  input.select();
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') salvarEdicaoMetaMinima(input, id);
    if (ev.key === 'Escape') cancelarEdicaoMetaMinima(input, id);
  });
};

window.cancelarEdicaoMetaMinima = (el, id) => {
  const td = el.closest('td');
  const indicador = indicadoresData.find(x => x.id === id);
  td.innerHTML = _htmlCelulaMetaMinima(id, indicador ? indicador.metaMinima : null, true);
};

window.salvarEdicaoMetaMinima = async (el, id) => {
  const td = el.closest('td');
  const input = td.querySelector('input');
  const valorTexto = input.value;
  if (valorTexto !== '' && isNaN(Number(valorTexto))) return showToast('Informe uma meta válida.', '#e65100');
  const indicador = indicadoresData.find(x => x.id === id);
  if (!indicador) return;
  const metaMinima = valorTexto !== '' ? Number(valorTexto) : null;
  const foraDaMeta = _indicadorForaDaMeta({ metaMinima }, indicador.ultimoDesempenho);
  input.disabled = true;
  try {
    await API.salvarIndicadorSeguranca({ id, metaMinima, foraDaMeta });
    indicador.metaMinima = metaMinima;
    indicador.foraDaMeta = foraDaMeta;
    API.invalidate('getIndicadoresSeguranca');
    showToast('✅ Meta atualizada!', '#2e7d32');
    _atualizarTelaIndicadorAtual();
  } catch (e) {
    showToast('Erro: ' + e.message, '#c62828');
    input.disabled = false;
  }
};

function renderizarIndicadoresCadastro() {
  const conteudo = document.getElementById('indicadoresConteudoCadastro');
  if (!conteudo) return;
  let data = _filtrarIndicadores(indicadoresData, indicadoresFiltrosCadastro);
  const isAdmin = window.USER_PERFIL === 'admin';

  data.sort((a, b) => {
    const valA = (a[indicadoresOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[indicadoresOrdenacao.coluna] || '').toString().toLowerCase();
    const cmp = valA.localeCompare(valB);
    return indicadoresOrdenacao.direcao === 'asc' ? cmp : -cmp;
  });

  const total = data.length;
  const totalPaginas = Math.max(1, Math.ceil(total / INDICADORES_POR_PAGINA));
  if (indicadoresPaginaAtual > totalPaginas) indicadoresPaginaAtual = totalPaginas;
  if (indicadoresPaginaAtual < 1) indicadoresPaginaAtual = 1;
  const inicio = (indicadoresPaginaAtual - 1) * INDICADORES_POR_PAGINA;
  const pagina = data.slice(inicio, inicio + INDICADORES_POR_PAGINA);
  indicadoresPaginaIds = pagina.map(d => d.id);
  const todosPaginaSelecionados = pagina.length > 0 && pagina.every(d => indicadoresSelecionados.has(d.id));

  conteudo.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            ${isAdmin ? `<th style="width:4%;text-align:center;"><input type="checkbox" ${todosPaginaSelecionados ? 'checked' : ''} onchange="toggleTodosIndicadores(this.checked)" title="Selecionar todos desta página"></th>` : ''}
            <th style="width:14%;">Pilar</th>
            <th style="width:16%;">Responsável</th>
            <th onclick="ordenarIndicadores('nome')" style="cursor:pointer;width:28%;">Indicador <span id="sort-ind-nome">${indicadoresOrdenacao.coluna === 'nome' ? (indicadoresOrdenacao.direcao === 'asc' ? '▲' : '▼') : ''}</span></th>
            <th style="width:12%;">Tipo</th>
            <th style="width:14%;">Meta Mínima</th>
            <th style="width:12%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${pagina.length ? pagina.map(d => `<tr>
              ${isAdmin ? `<td style="text-align:center;"><input type="checkbox" class="chk-indicador" ${indicadoresSelecionados.has(d.id) ? 'checked' : ''} onchange="toggleIndicadorSelecionado('${d.id}', this.checked)"></td>` : ''}
              <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(d.pilar || '-')}</span></td>
              <td style="font-size:0.85em;color:#555;">${esc(d.responsavel || '-')}</td>
              <td style="font-weight:600;color:#222;">${esc(d.nome)}</td>
              <td style="font-size:0.85em;color:#555;">${esc(d.tipo || '-')}</td>
              <td>${_htmlCelulaMetaMinima(d.id, d.metaMinima, isAdmin)}</td>
              <td style="text-align:center;white-space:nowrap;">
                ${isAdmin ? `<button class="btn-icon" onclick="editarIndicador('${d.id}')" title="Editar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon" onclick="excluirIndicador('${d.id}')" title="Excluir">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : ''}
              </td>
            </tr>`).join('') : `<tr><td colspan="${isAdmin ? 6 : 5}" style="text-align:center;color:#999;padding:40px;">Nenhum indicador encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:0.85em;color:#666;">
      <span>${total ? `Mostrando ${inicio + 1}–${inicio + pagina.length} de ${total} indicador(es)` : ''}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="irParaPaginaIndicadores(-1)" ${indicadoresPaginaAtual <= 1 ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">‹ Anterior</button>
        <span style="padding:6px 4px;">Página ${indicadoresPaginaAtual} de ${totalPaginas}</span>
        <button class="btn btn-ghost" onclick="irParaPaginaIndicadores(1)" ${indicadoresPaginaAtual >= totalPaginas ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">Próxima ›</button>
      </div>
    </div>`;

  _atualizarBotaoExcluirSelecionados();
}

function _atualizarBotaoExcluirSelecionados() {
  const btn = document.getElementById('btnExcluirIndicadoresSelecionados');
  if (!btn) return;
  const isAdmin = window.USER_PERFIL === 'admin';
  const n = indicadoresSelecionados.size;
  btn.style.display = isAdmin && n > 0 ? 'inline-block' : 'none';
  btn.textContent = `🗑️ Excluir selecionados (${n})`;
}

window.toggleIndicadorSelecionado = (id, checked) => {
  if (checked) indicadoresSelecionados.add(id);
  else indicadoresSelecionados.delete(id);
  _atualizarBotaoExcluirSelecionados();
  // Atualiza só o checkbox "selecionar todos" do cabeçalho, sem redesenhar a tabela toda.
  const todosMarcados = indicadoresPaginaIds.length > 0 && indicadoresPaginaIds.every(pid => indicadoresSelecionados.has(pid));
  const checkTodos = document.querySelector('#indicadoresConteudoCadastro thead input[type="checkbox"]');
  if (checkTodos) checkTodos.checked = todosMarcados;
};

window.toggleTodosIndicadores = (checked) => {
  indicadoresPaginaIds.forEach(id => { checked ? indicadoresSelecionados.add(id) : indicadoresSelecionados.delete(id); });
  renderizarIndicadoresCadastro();
};

window.excluirIndicadoresSelecionados = async () => {
  const ids = [...indicadoresSelecionados];
  if (!ids.length) return;
  if (!confirm(`Excluir ${ids.length} indicador(es) selecionado(s)? O histórico de desempenho deles será perdido. Esta ação não pode ser desfeita.`)) return;
  try {
    for (const id of ids) {
      await API.excluirIndicadorSeguranca(id);
    }
    indicadoresData = indicadoresData.filter(x => !indicadoresSelecionados.has(x.id));
    indicadoresSelecionados = new Set();
    API.invalidate('getIndicadoresSeguranca');
    showToast(`✅ ${ids.length} indicador(es) excluído(s)!`, '#2e7d32');
    renderizarIndicadoresCadastro();
  } catch (e) { showToast('❌ Erro ao excluir: ' + e.message, '#c62828'); }
};

window.ordenarIndicadores = (coluna) => {
  if (indicadoresOrdenacao.coluna === coluna) {
    indicadoresOrdenacao.direcao = indicadoresOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    indicadoresOrdenacao.coluna = coluna;
    indicadoresOrdenacao.direcao = 'asc';
  }
  renderizarIndicadoresCadastro();
};

// ============================================================
// PÁGINA: INDICADORES — LANÇAMENTO MENSAL
// ============================================================
let indicadoresFiltrosLancamento = { pilar: '', responsavel: '', mes: '', busca: '' };
let indicadoresLancamentoPaginaAtual = 1;

async function indicadoresLancamento() {
  const isAdmin = window.USER_PERFIL === 'admin';
  indicadoresFiltrosLancamento = { pilar: '', responsavel: '', mes: '', busca: '' };
  indicadoresLancamentoPaginaAtual = 1;
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Lançamento Mensal</h2><p class="page-sub">Registre o resultado do mês de um indicador, manualmente ou por importação em lote</p></div>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div id="indicadoresLancamentoArea" style="display:none;">
      <div class="group-card" style="padding:20px;margin-bottom:20px;">
        <h3 style="font-size:1em;color:#1a237e;margin-bottom:14px;">Lançamento manual</h3>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px;align-items:end;">
          <div>
            <label style="${_estiloFiltroLabel}">Indicador</label>
            <select id="lancIndicador" style="${_estiloFiltroInput}width:100%;"></select>
          </div>
          <div>
            <label style="${_estiloFiltroLabel}">Mês</label>
            <input type="month" id="lancMes" style="${_estiloFiltroInput}width:100%;">
          </div>
          <div>
            <label style="${_estiloFiltroLabel}">Desempenho (%)</label>
            <input type="number" id="lancDesempenho" step="any" min="0" max="100" placeholder="Ex: 92" style="${_estiloFiltroInput}width:100%;">
          </div>
          <button class="btn btn-primary" onclick="lancarResultadoManual()" id="btnLancarResultado" style="display:none;">Lançar</button>
        </div>
      </div>
      <div class="group-card" style="padding:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h3 style="font-size:1em;color:#1a237e;margin-bottom:4px;">Importação em lote (CSV)</h3>
          <p style="font-size:0.85em;color:#888;">Para lançar vários indicadores e meses de uma vez, a partir de uma planilha.</p>
        </div>
        <button class="btn btn-ghost" onclick="abrirImportarIndicadoresCSV()" id="btnImportarIndicadores" style="color:#1a237e;border-color:#1a237e;display:none;">📥 Importar CSV</button>
      </div>
      <h3 style="font-size:1em;color:#1a237e;margin-bottom:10px;">Lançamentos</h3>
      <div id="indicadoresFiltrosLancamento" style="margin-bottom:16px;"></div>
      <div id="indicadoresGradeLancamentos"></div>
    </div>
    ${_htmlModalImportarIndicadoresCSV()}
  `;

  document.getElementById('btnLancarResultado').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('btnImportarIndicadores').style.display = isAdmin ? 'inline-block' : 'none';

  await _carregarIndicadoresData();
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('indicadoresLancamentoArea').style.display = 'block';

  _popularSelectIndicadorLancamento();
  document.getElementById('lancMes').value = new Date().toISOString().slice(0, 7);

  _renderFiltrosLancamento();
  renderizarGradeLancamentos();
}

function _popularSelectIndicadorLancamento() {
  const ativos = indicadoresData.filter(d => d.ativo !== false).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  document.getElementById('lancIndicador').innerHTML = ativos.length
    ? ativos.map(d => `<option value="${d.id}">${d.pilar ? d.pilar + ' — ' : ''}${esc(d.nome)}</option>`).join('')
    : '<option value="">Nenhum indicador ativo cadastrado</option>';
}

// Achata o historico[] de todos os indicadores em uma linha por (indicador, mês).
function _todosLancamentos() {
  const linhas = [];
  indicadoresData.forEach(d => (d.historico || []).forEach(h => linhas.push({
    indicadorId: d.id,
    indicadorNome: d.nome,
    pilar: d.pilar,
    responsavel: d.responsavel,
    mes: h.mes,
    desempenho: h.desempenho,
    importadoEm: h.importadoEm,
    arquivo: h.arquivo,
  })));
  return linhas;
}

function _filtrarLancamentos(linhas, filtros) { return _aplicarFiltrosIndicadores(linhas, filtros, 'indicadorNome'); }

function _renderFiltrosLancamento() {
  _renderBarraFiltrosIndicadores('indicadoresFiltrosLancamento', indicadoresFiltrosLancamento, 'atualizarFiltroLancamento', { comMes: true });
}

window.atualizarFiltroLancamento = (campo, valor) => {
  indicadoresFiltrosLancamento[campo] = valor;
  indicadoresLancamentoPaginaAtual = 1;
  renderizarGradeLancamentos();
};

window.irParaPaginaLancamentos = (delta) => {
  indicadoresLancamentoPaginaAtual += delta;
  renderizarGradeLancamentos();
};

function renderizarGradeLancamentos() {
  const el = document.getElementById('indicadoresGradeLancamentos');
  if (!el) return;
  const isAdmin = window.USER_PERFIL === 'admin';

  let data = _filtrarLancamentos(_todosLancamentos(), indicadoresFiltrosLancamento);
  // Sempre decrescente por mês, independente do filtro aplicado.
  data.sort((a, b) => String(b.mes).localeCompare(String(a.mes)) || (a.indicadorNome || '').localeCompare(b.indicadorNome || ''));

  const total = data.length;
  const totalPaginas = Math.max(1, Math.ceil(total / INDICADORES_POR_PAGINA));
  if (indicadoresLancamentoPaginaAtual > totalPaginas) indicadoresLancamentoPaginaAtual = totalPaginas;
  if (indicadoresLancamentoPaginaAtual < 1) indicadoresLancamentoPaginaAtual = 1;
  const inicio = (indicadoresLancamentoPaginaAtual - 1) * INDICADORES_POR_PAGINA;
  const pagina = data.slice(inicio, inicio + INDICADORES_POR_PAGINA);

  el.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:12%;">Pilar</th>
            <th style="width:26%;">Indicador</th>
            <th style="width:14%;">Responsável</th>
            <th style="width:10%;">Mês</th>
            <th style="width:12%;">Desempenho</th>
            <th style="width:18%;">Lançado em</th>
            ${isAdmin ? '<th style="width:8%;text-align:center;">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${pagina.length ? pagina.map(r => `<tr>
              <td><span style="display:inline-block;padding:3px 9px;border-radius:10px;font-size:0.8em;font-weight:600;background:#e8eaf6;color:#1a237e;">${esc(r.pilar || '-')}</span></td>
              <td style="font-weight:600;color:#222;">${esc(r.indicadorNome)}</td>
              <td style="font-size:0.85em;color:#555;">${esc(r.responsavel || '-')}</td>
              <td style="font-size:0.85em;color:#555;">${_formatMes(r.mes)}</td>
              <td>${_htmlCelulaDesempenho(r.indicadorId, r.mes, r.desempenho, isAdmin)}</td>
              <td style="font-size:0.8em;color:#888;">${r.importadoEm ? new Date(r.importadoEm).toLocaleString('pt-BR') : '-'}${r.arquivo ? ' · ' + r.arquivo : ''}</td>
              ${isAdmin ? `<td style="text-align:center;"><button class="btn-icon" onclick="excluirLancamento('${r.indicadorId}','${r.mes}')" title="Excluir lançamento">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button></td>` : ''}
            </tr>`).join('') : `<tr><td colspan="${isAdmin ? 7 : 6}" style="text-align:center;color:#999;padding:30px;">Nenhum lançamento encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:0.85em;color:#666;">
      <span>${total ? `Mostrando ${inicio + 1}–${inicio + pagina.length} de ${total} lançamento(s)` : ''}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="irParaPaginaLancamentos(-1)" ${indicadoresLancamentoPaginaAtual <= 1 ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">‹ Anterior</button>
        <span style="padding:6px 4px;">Página ${indicadoresLancamentoPaginaAtual} de ${totalPaginas}</span>
        <button class="btn btn-ghost" onclick="irParaPaginaLancamentos(1)" ${indicadoresLancamentoPaginaAtual >= totalPaginas ? 'disabled' : ''} style="padding:6px 14px;font-size:0.9em;">Próxima ›</button>
      </div>
    </div>`;
}

// Célula de Desempenho em modo exibição: texto com sinalização visual de que
// é clicável (sublinhado tracejado + ✎), em vez de um input sempre visível.
function _htmlCelulaDesempenho(indicadorId, mes, desempenho, isAdmin) {
  const texto = desempenho != null ? desempenho + '%' : '<span style="color:#999;">sem dado</span>';
  if (!isAdmin) return texto;
  return `<span onclick="iniciarEdicaoDesempenho(this,'${indicadorId}','${mes}')" style="cursor:pointer;border-bottom:1px dashed #999;padding-bottom:1px;" title="Clique para editar">${texto} <span style="font-size:0.85em;color:#bbb;">✎</span></span>`;
}

// Troca a célula pra modo edição (input + Salvar/Cancelar) só quando o admin
// clica — nada salva sozinho ao perder o foco, precisa confirmar explicitamente.
window.iniciarEdicaoDesempenho = (spanEl, indicadorId, mes) => {
  const indicador = indicadoresData.find(d => d.id === indicadorId);
  const entrada = indicador && (indicador.historico || []).find(h => h.mes === mes);
  const valorAtual = entrada && entrada.desempenho != null ? entrada.desempenho : '';
  const td = spanEl.closest('td');
  td.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">
      <input type="number" step="any" min="0" max="100" value="${valorAtual}" style="width:60px;padding:4px 6px;border:1.5px solid #1a237e;border-radius:5px;font-size:0.88em;">%
      <button class="btn-icon" title="Salvar (Enter)" style="color:#2e7d32;" onclick="salvarEdicaoDesempenho(this,'${indicadorId}','${mes}')">✔</button>
      <button class="btn-icon" title="Cancelar (Esc)" style="color:#c62828;" onclick="cancelarEdicaoDesempenho(this,'${indicadorId}','${mes}')">✕</button>
    </span>`;
  const input = td.querySelector('input');
  input.focus();
  input.select();
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') salvarEdicaoDesempenho(input, indicadorId, mes);
    if (ev.key === 'Escape') cancelarEdicaoDesempenho(input, indicadorId, mes);
  });
};

window.cancelarEdicaoDesempenho = (el, indicadorId, mes) => {
  const td = el.closest('td');
  const indicador = indicadoresData.find(d => d.id === indicadorId);
  const entrada = indicador && (indicador.historico || []).find(h => h.mes === mes);
  td.innerHTML = _htmlCelulaDesempenho(indicadorId, mes, entrada ? entrada.desempenho : null, true);
};

// Reaproveita o mesmo "lançar" de sempre (upsert por mês, sem duplicar,
// dispara risco automático se sair da meta) — só é chamado com confirmação explícita.
window.salvarEdicaoDesempenho = async (el, indicadorId, mes) => {
  const td = el.closest('td');
  const input = td.querySelector('input');
  const valorTexto = input.value;
  if (valorTexto === '' || isNaN(Number(valorTexto))) return showToast('Informe um desempenho válido.', '#e65100');
  const indicador = indicadoresData.find(d => d.id === indicadorId);
  if (!indicador) return;
  input.disabled = true;
  try {
    const { riscoGerado } = await _lancarResultadosIndicador(indicador, [{ mes, desempenho: Number(valorTexto) }], '');
    showToast(`✅ Desempenho atualizado!${riscoGerado ? ' Risco gerado automaticamente por desvio de meta.' : ''}`, '#2e7d32');
    renderizarGradeLancamentos();
  } catch (e) {
    showToast('❌ Erro ao atualizar: ' + e.message, '#c62828');
    input.disabled = false;
  }
};

// Remove só a entrada daquele mês do histórico do indicador (não o indicador
// inteiro), recalculando ultimoMes/ultimoDesempenho/foraDaMeta a partir do que sobrar.
async function _removerLancamentoIndicador(indicador, mes) {
  await API.removerLancamento(indicador.id, mes);
  const historico = (indicador.historico || []).filter(h => h.mes !== mes);
  const ultimoComDado = [...historico].reverse().find(h => h.desempenho != null);
  const foraDaMetaAgora = ultimoComDado ? _indicadorForaDaMeta(indicador, ultimoComDado.desempenho) : false;
  await API.salvarIndicadorSeguranca({
    id: indicador.id,
    ultimoDesempenho: ultimoComDado ? ultimoComDado.desempenho : null,
    ultimoMes: ultimoComDado ? ultimoComDado.mes : null,
    foraDaMeta: foraDaMetaAgora,
  });
  indicador.historico = historico;
  indicador.ultimoDesempenho = ultimoComDado ? ultimoComDado.desempenho : null;
  indicador.ultimoMes = ultimoComDado ? ultimoComDado.mes : null;
  indicador.foraDaMeta = foraDaMetaAgora;
  API.invalidate('getIndicadoresSeguranca');
}

window.excluirLancamento = async (indicadorId, mes) => {
  const indicador = indicadoresData.find(d => d.id === indicadorId);
  if (!indicador) return;
  if (!confirm(`Excluir o lançamento de ${_formatMes(mes)} de "${esc(indicador.nome)}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await _removerLancamentoIndicador(indicador, mes);
    showToast('✅ Lançamento excluído!', '#2e7d32');
    renderizarGradeLancamentos();
  } catch (e) { showToast('❌ Erro ao excluir: ' + e.message, '#c62828'); }
};

window.lancarResultadoManual = async () => {
  const indicadorId = document.getElementById('lancIndicador').value;
  const mes = document.getElementById('lancMes').value;
  const desempenhoTexto = document.getElementById('lancDesempenho').value;
  if (!indicadorId) return showToast('Selecione um indicador.', '#e65100');
  if (!mes) return showToast('Selecione o mês.', '#e65100');
  if (desempenhoTexto === '' || isNaN(Number(desempenhoTexto))) return showToast('Informe um desempenho válido.', '#e65100');
  const indicador = indicadoresData.find(d => d.id === indicadorId);
  if (!indicador) return showToast('Indicador não encontrado.', '#c62828');

  try {
    const { riscoGerado } = await _lancarResultadosIndicador(indicador, [{ mes, desempenho: Number(desempenhoTexto) }], '');
    document.getElementById('lancDesempenho').value = '';
    showToast(`✅ Resultado lançado!${riscoGerado ? ' Risco gerado automaticamente por desvio de meta.' : ''}`, '#2e7d32');
    _renderFiltrosLancamento();
    renderizarGradeLancamentos();
  } catch (e) { showToast('❌ Erro ao lançar: ' + e.message, '#c62828'); }
};

// ============================================================
// PÁGINA: INDICADORES — MATRIZ
// ============================================================
async function indicadoresMatriz() {
  indicadoresFiltrosMatriz = { pilar: '', responsavel: '', busca: '' };
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Matriz de Indicadores</h2><p class="page-sub">Histórico completo de desempenho, mês a mês, agrupado por pilar</p></div>
    </div>
    <div id="indicadoresFiltrosMatriz" style="margin-bottom:16px;"></div>
    <div class="loading">⏳ Carregando...</div>
    <div id="indicadoresConteudoMatriz" style="display:none;"></div>
    ${_htmlModalIndicador()}
  `;

  await _carregarIndicadoresData();
  document.querySelector('.loading').style.display = 'none';
  document.getElementById('indicadoresConteudoMatriz').style.display = 'block';

  _renderFiltrosIndicadoresMatriz();
  renderizarIndicadoresMatriz();
}

function _renderFiltrosIndicadoresMatriz() {
  _renderBarraFiltrosIndicadores('indicadoresFiltrosMatriz', indicadoresFiltrosMatriz, 'atualizarFiltroMatriz');
}

window.atualizarFiltroMatriz = (campo, valor) => {
  indicadoresFiltrosMatriz[campo] = valor;
  renderizarIndicadoresMatriz();
};

function renderizarIndicadoresMatriz() {
  const conteudo = document.getElementById('indicadoresConteudoMatriz');
  if (!conteudo) return;
  const dadosFiltrados = _filtrarIndicadores(indicadoresData, indicadoresFiltrosMatriz);
  const meses = _mesesDisponiveis().slice().sort();

  if (!dadosFiltrados.length) {
    conteudo.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">Nenhum indicador encontrado.</p>';
    return;
  }

  const porPilar = {};
  [...dadosFiltrados].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(d => {
    const p = d.pilar || 'Sem Pilar';
    if (!porPilar[p]) porPilar[p] = [];
    porPilar[p].push(d);
  });

  const minWidth = 520 + meses.length * 85;
  let html = '';
  Object.entries(porPilar).sort((a, b) => a[0].localeCompare(b[0])).forEach(([pilar, itens]) => {
    html += `<div style="margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:10px 18px;border-radius:8px 8px 0 0;font-weight:700;font-size:0.92em;">📁 ${pilar}</div>
      <div class="data-table" style="border-radius:0 0 8px 8px;overflow-x:auto;">
        <table style="table-layout:auto;min-width:${minWidth}px;">
          <thead>
            <tr>
              <th style="min-width:220px;">Indicador</th>
              <th style="min-width:90px;">Tipo</th>
              <th style="min-width:130px;">Responsável</th>
              <th style="min-width:90px;">Meta Mín.</th>
              ${meses.map(m => `<th style="min-width:78px;text-align:center;">${_formatMes(m)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${itens.map(d => `<tr>
                <td style="font-weight:600;color:#222;">${esc(d.nome)}</td>
                <td style="font-size:0.85em;color:#555;">${esc(d.tipo || '-')}</td>
                <td style="font-size:0.85em;color:#555;">${esc(d.responsavel || '-')}</td>
                <td style="font-size:0.85em;color:#555;">${d.metaMinima != null && d.metaMinima !== '' ? d.metaMinima + '%' : '<span style="color:#bbb;">-</span>'}</td>
                ${meses.map(m => {
                  const entrada = (d.historico || []).find(h => h.mes === m);
                  const valor = entrada ? entrada.desempenho : null;
                  if (valor == null) return '<td style="text-align:center;color:#ccc;">-</td>';
                  const foraMeta = _indicadorForaDaMeta(d, valor);
                  const semMeta = d.metaMinima == null || d.metaMinima === '';
                  const cor = semMeta ? '#555' : (foraMeta ? '#c62828' : '#2e7d32');
                  const bg = semMeta ? 'transparent' : (foraMeta ? '#ffebee' : '#e8f5e9');
                  return `<td style="text-align:center;font-weight:600;color:${cor};background:${bg};">${valor}%</td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  });

  conteudo.innerHTML = html;
}

// ============================================================
// Modal de cadastro de indicador (compartilhado pelas 4 telas)
// ============================================================
function _htmlModalIndicador() {
  return `
    <div class="modal-overlay" id="modalIndicador"><div class="modal" onclick="event.stopPropagation()" style="max-width:560px;">
      <h3 id="modalIndicadorTitulo">Novo Indicador</h3>
      <input type="hidden" id="indId">
      <label>Indicador</label>
      <input type="text" id="indNome" placeholder="Ex: % de patches aplicados no prazo">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
          <label>Pilar</label>
          <select id="indPilar">${INDICADOR_PILARES.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
        </div>
        <div>
          <label>Tipo</label>
          <select id="indTipo">${INDICADOR_TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
      </div>
      <label>Responsável</label>
      <input type="text" id="indResponsavel" placeholder="Nome da pessoa responsável">
      <label>Sentido da meta</label>
      <select id="indSentidoMeta">
        <option value="maiorMelhor">Quanto maior, melhor — ex: % de backups com sucesso</option>
        <option value="menorMelhor">Quanto menor, melhor — ex: vulnerabilidades críticas em aberto</option>
      </select>
      <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Define de que lado da meta o indicador está em desvio.</span>
      <label id="indMetaLabel" style="margin-top:14px;">Meta de Desempenho (%)</label>
      <input type="number" id="indMetaMinima" step="any" min="0" max="100" placeholder="Ex: 90">
      <span style="font-size:0.72em;color:#888;margin-top:3px;display:block;">Quando o desempenho do mês ficar abaixo desse percentual, um risco é criado automaticamente.</span>
      <label style="display:flex;align-items:center;gap:6px;margin-top:14px;cursor:pointer;">
        <input type="checkbox" id="indAtivo" checked style="width:auto;"> Indicador ativo
      </label>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalIndicador()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarIndicador()">Salvar</button>
      </div>
    </div></div>`;
}

window.abrirModalIndicador = (d) => {
  document.getElementById('indId').value = d ? d.id : '';
  document.getElementById('indNome').value = d ? d.nome : '';
  document.getElementById('indPilar').value = d ? (d.pilar || INDICADOR_PILARES[0]) : INDICADOR_PILARES[0];
  document.getElementById('indTipo').value = d ? (d.tipo || INDICADOR_TIPOS[0]) : INDICADOR_TIPOS[0];
  document.getElementById('indResponsavel').value = d ? (d.responsavel || '') : '';
  document.getElementById('indMetaMinima').value = d && d.metaMinima != null ? d.metaMinima : '';
  const sel = document.getElementById('indSentidoMeta');
  sel.value = (d && d.sentidoMeta) || SENTIDO_META.MAIOR_MELHOR;
  const ajustarRotulo = () => {
    document.getElementById('indMetaLabel').textContent =
      (sel.value === SENTIDO_META.MENOR_MELHOR ? 'Meta máxima' : 'Meta mínima') + ' de Desempenho (%)';
  };
  sel.onchange = ajustarRotulo;
  ajustarRotulo();
  document.getElementById('indAtivo').checked = d ? d.ativo !== false : true;
  document.getElementById('modalIndicadorTitulo').textContent = d ? 'Editar Indicador' : 'Novo Indicador';
  document.getElementById('modalIndicador').classList.add('open');
};

window.fecharModalIndicador = () => document.getElementById('modalIndicador').classList.remove('open');
window.editarIndicador = (id) => { const d = indicadoresData.find(x => x.id === id); if (d) abrirModalIndicador(d); };

window.excluirIndicador = async (id) => {
  if (!confirm('Excluir este indicador? O histórico de desempenho será perdido.')) return;
  try {
    await API.excluirIndicadorSeguranca(id);
    indicadoresData = indicadoresData.filter(x => x.id !== id);
    _atualizarTelaIndicadorAtual();
    showToast('✅ Excluído!', '#2e7d32');
    API.invalidate('getIndicadoresSeguranca');
  } catch (e) { showToast('Erro: ' + e.message, '#c62828'); }
};

window.salvarIndicador = async () => {
  const d = {
    id: document.getElementById('indId').value || null,
    pilar: document.getElementById('indPilar').value.trim(),
    tipo: document.getElementById('indTipo').value,
    nome: document.getElementById('indNome').value.trim(),
    responsavel: document.getElementById('indResponsavel').value.trim(),
    metaMinima: document.getElementById('indMetaMinima').value !== '' ? Number(document.getElementById('indMetaMinima').value) : null,
    sentidoMeta: document.getElementById('indSentidoMeta').value || SENTIDO_META.MAIOR_MELHOR,
    ativo: document.getElementById('indAtivo').checked,
  };
  if (!d.nome) return showToast('Informe o nome do indicador.', '#e65100');
  if (d.id) {
    const atual = indicadoresData.find(x => x.id === d.id);
    d.foraDaMeta = _indicadorForaDaMeta({ metaMinima: d.metaMinima }, atual ? atual.ultimoDesempenho : null);
  }
  try {
    const result = await API.salvarIndicadorSeguranca(d);
    fecharModalIndicador();
    showToast('✅ Salvo!', '#2e7d32');
    if (d.id) {
      const idx = indicadoresData.findIndex(x => x.id === d.id);
      if (idx !== -1) indicadoresData[idx] = { ...indicadoresData[idx], ...d };
    } else {
      d.id = result.id;
      d.historico = [];
      d.ultimoDesempenho = null;
      d.ultimoMes = null;
      d.foraDaMeta = false;
      indicadoresData.push(d);
    }
    _atualizarTelaIndicadorAtual();
    API.invalidate('getIndicadoresSeguranca');
  } catch (e) { showToast('Erro: ' + e.message, '#c62828'); }
};

// ------------------------------------------------------------
// Importação de desempenho por CSV + conversão automática de
// desvio de meta em risco (Registro de Riscos)
// ------------------------------------------------------------
function _htmlModalImportarIndicadoresCSV() {
  return `
    <div class="modal-overlay" id="modalImportarIndicadores"><div class="modal" onclick="event.stopPropagation()" style="max-width:960px;">
      <h3>Importar Desempenho de Indicadores (CSV)</h3>
      <p style="font-size:0.82em;color:#666;margin:10px 0;">O arquivo precisa ter cabeçalho com as colunas <strong>Indicador</strong>, <strong>Mês</strong> e <strong>Desempenho</strong>, em qualquer ordem (acentos não importam). O mês aceita os formatos AAAA-MM ou uma data como 15/01/2026. Se o indicador ainda não existir, ele é <strong>criado automaticamente</strong> — usando as colunas Pilar, Tipo e Responsável do arquivo, se existirem — mas sem Meta Mínima definida (você define depois na tela, editando o indicador).</p>
      <input type="file" id="importIndicadoresArquivo" accept=".csv,text/csv" onchange="processarArquivoIndicadoresCSV(this.files[0])">
      <div id="importIndicadoresResultado" style="margin-top:16px;max-height:360px;overflow:auto;"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharImportarIndicadoresCSV()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarImportarIndicadoresCSV()" id="btnConfirmarImportarIndicadores" style="display:none;">Confirmar Importação</button>
      </div>
    </div></div>`;
}

window.abrirImportarIndicadoresCSV = () => {
  document.getElementById('importIndicadoresArquivo').value = '';
  document.getElementById('importIndicadoresResultado').innerHTML = '';
  document.getElementById('btnConfirmarImportarIndicadores').style.display = 'none';
  window._importIndicadoresLinhas = [];
  document.getElementById('modalImportarIndicadores').classList.add('open');
};

window.fecharImportarIndicadoresCSV = () => document.getElementById('modalImportarIndicadores').classList.remove('open');

function _parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result.map(s => s.trim());
}

// Casa o Pilar vindo do arquivo com uma das 4 opções fixas, tolerando
// diferenças de acento/grafia (ex: "Crise e Continidade" -> "Crise e Continuidade").
// Se não bater com nenhuma, mantém o texto literal do arquivo.
function _casarPilar(valorArquivo) {
  const v = String(valorArquivo || '').trim();
  if (!v) return '';
  const alvo = _normalizarHeader(v);
  const opcao = INDICADOR_PILARES.find(p => _normalizarHeader(p) === alvo);
  return opcao || v;
}

// Remove acentos p/ comparar cabeçalhos (ex: "Mês" -> "mes").
function _normalizarHeader(h) {
  return String(h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Aceita "AAAA-MM", "AAAA-MM-DD" ou datas "DD/MM/AA(AA)" (ex: planilhas que usam
// o dia 15 de cada mês como referência) e normaliza para "AAAA-MM".
function _normalizarMes(valor) {
  const v = String(valor || '').trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  const iso = v.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const br = v.match(/^\d{1,2}\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const mes = br[1].padStart(2, '0');
    let ano = br[2];
    if (ano.length === 2) ano = (Number(ano) < 70 ? '20' : '19') + ano;
    return `${ano}-${mes}`;
  }
  return v;
}

window.processarArquivoIndicadoresCSV = (file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const linhas = String(e.target.result).split(/\r\n|\n|\r/).filter(l => l.trim());
    if (!linhas.length) { showToast('Arquivo vazio.', '#e65100'); return; }
    const header = _parseCSVLine(linhas[0]).map(_normalizarHeader);
    const idxIndicador = header.indexOf('indicador');
    const idxMes = header.indexOf('mes');
    const idxDesempenho = header.indexOf('desempenho');
    const idxPilar = header.indexOf('pilar');
    const idxTipo = header.indexOf('tipo');
    const idxResponsavel = header.indexOf('responsavel');
    const resultado = document.getElementById('importIndicadoresResultado');
    if (idxIndicador === -1 || idxMes === -1 || idxDesempenho === -1) {
      resultado.innerHTML = '<p style="color:#c62828;font-size:0.9em;">Cabeçalho inválido. O arquivo precisa das colunas: indicador, mês, desempenho.</p>';
      document.getElementById('btnConfirmarImportarIndicadores').style.display = 'none';
      return;
    }

    window._importIndicadoresLinhas = linhas.slice(1).map(linha => {
      const campos = _parseCSVLine(linha);
      const nomeIndicador = (campos[idxIndicador] || '').trim();
      const mes = _normalizarMes(campos[idxMes]);
      const desempenhoRaw = (campos[idxDesempenho] || '').trim();
      // Célula vazia = sem dado naquele mês (não é erro); só é inválido se
      // vier algo preenchido que não dá pra interpretar como número.
      const desempenho = desempenhoRaw === '' ? null : parseFloat(desempenhoRaw.replace('%', '').replace(',', '.'));
      const desempenhoInvalido = desempenhoRaw !== '' && isNaN(desempenho);
      const pilar = idxPilar >= 0 ? (campos[idxPilar] || '').trim() : '';
      const tipo = idxTipo >= 0 ? (campos[idxTipo] || '').trim() : '';
      const responsavel = idxResponsavel >= 0 ? (campos[idxResponsavel] || '').trim() : '';
      const indicador = indicadoresData.find(i => i.nome.trim().toLowerCase() === nomeIndicador.toLowerCase());
      const entradaExistente = indicador ? (indicador.historico || []).find(h => h.mes === mes) : null;
      const motivo = !nomeIndicador ? 'Sem nome de indicador'
        : desempenhoInvalido ? `Desempenho inválido ("${desempenhoRaw}")`
        : !mes ? 'Mês ausente' : '';
      return {
        nomeIndicador, mes, desempenho, pilar, tipo, responsavel,
        indicadorId: indicador ? indicador.id : null,
        novoIndicador: !indicador,
        atualizaExistente: !!entradaExistente,
        valorAnterior: entradaExistente ? entradaExistente.desempenho : null,
        valido: !motivo,
        motivo,
      };
    });

    renderPreviewImportIndicadores();
  };
  reader.readAsText(file, 'UTF-8');
};

function renderPreviewImportIndicadores() {
  const linhas = window._importIndicadoresLinhas || [];
  const validas = linhas.filter(l => l.valido);
  const novos = [...new Set(validas.filter(l => l.novoIndicador).map(l => l.nomeIndicador))];
  const resultado = document.getElementById('importIndicadoresResultado');
  resultado.innerHTML = `<p style="font-size:0.85em;color:#555;margin-bottom:8px;">${validas.length} de ${linhas.length} linha(s) válida(s).${novos.length ? ' ' + novos.length + ' indicador(es) novo(s) será(ão) criado(s): ' + novos.join(', ') + '.' : ''}</p>` +
    `<table class="data-table" style="box-shadow:none;"><thead><tr><th>Indicador</th><th>Pilar</th><th>Tipo</th><th>Responsável</th><th>Mês</th><th>Desempenho</th><th>Situação</th></tr></thead><tbody>` +
    linhas.map(l => `<tr>
        <td style="font-weight:600;">${esc(l.nomeIndicador)}</td>
        <td style="font-size:0.85em;color:#555;">${l.pilar || (l.novoIndicador ? '<span style="color:#e65100;">vazio</span>' : '<span style="color:#bbb;">-</span>')}</td>
        <td style="font-size:0.85em;color:#555;">${l.tipo || (l.novoIndicador ? '<span style="color:#e65100;">vazio</span>' : '<span style="color:#bbb;">-</span>')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(l.responsavel || '<span style="color:#bbb;">-</span>')}</td>
        <td>${l.mes}</td>
        <td>${l.desempenho == null ? '<span style="color:#999;">sem dado</span>' : l.desempenho + '%'}</td>
        <td>${!l.valido ? `<span style="color:#c62828;">✘ ${l.motivo}</span>`
          : l.novoIndicador ? '<span style="color:#1565c0;">🆕 Novo indicador</span>'
          : l.desempenho == null ? '<span style="color:#999;">⚪ Sem desempenho neste mês</span>'
          : l.atualizaExistente ? `<span style="color:#e65100;">🔄 Substitui ${l.valorAnterior != null ? l.valorAnterior + '%' : 'sem dado'}</span>`
          : '<span style="color:#2e7d32;">✔ OK</span>'}</td>
      </tr>`).join('') + `</tbody></table>`;
  document.getElementById('btnConfirmarImportarIndicadores').style.display = validas.length ? 'inline-block' : 'none';
}

window.confirmarImportarIndicadoresCSV = async () => {
  const linhas = (window._importIndicadoresLinhas || []).filter(l => l.valido);
  if (!linhas.length) return;
  const nomeArquivo = (document.getElementById('importIndicadoresArquivo').files[0] || {}).name || '';

  // Agrupa por nome (não por id) porque indicadores novos ainda não têm id.
  const porIndicador = {};
  linhas.forEach(l => {
    const chave = l.nomeIndicador.trim().toLowerCase();
    if (!porIndicador[chave]) porIndicador[chave] = [];
    porIndicador[chave].push(l);
  });

  let riscosGerados = 0;
  let indicadoresCriados = 0;
  try {
    const riscosAtuais = await API.getRiscos();
    for (const [chave, novasLinhas] of Object.entries(porIndicador)) {
      let indicador = indicadoresData.find(i => i.nome.trim().toLowerCase() === chave);

      // Indicador ainda não cadastrado: cria usando Pilar/Tipo/Responsável da
      // primeira linha do arquivo (sem Meta Mínima — definida depois na tela).
      if (!indicador) {
        const primeira = novasLinhas[0];
        const novo = {
          nome: primeira.nomeIndicador,
          pilar: _casarPilar(primeira.pilar) || INDICADOR_PILARES[0],
          tipo: primeira.tipo || INDICADOR_TIPOS[0],
          responsavel: primeira.responsavel || '',
          metaMinima: null,
          ativo: true,
        };
        const result = await API.salvarIndicadorSeguranca(novo);
        indicador = { ...novo, id: result.id, historico: [] };
        indicadoresData.push(indicador);
        indicadoresCriados++;
      }

      const entradas = novasLinhas.map(l => ({ mes: l.mes, desempenho: l.desempenho }));
      const { riscoGerado } = await _lancarResultadosIndicador(indicador, entradas, nomeArquivo, riscosAtuais);
      if (riscoGerado) riscosGerados++;
    }
    fecharImportarIndicadoresCSV();
    showToast(`✅ Importação concluída!${indicadoresCriados ? ' ' + indicadoresCriados + ' indicador(es) criado(s).' : ''}${riscosGerados ? ' ' + riscosGerados + ' risco(s) gerado(s) automaticamente.' : ''}`, '#2e7d32');
    indicadoresData = await API.getIndicadoresSeguranca();
    _atualizarTelaIndicadorAtual();
  } catch (e) { showToast('❌ Erro ao importar: ' + e.message, '#c62828'); }
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
      return `<span style="display:inline-flex;align-items:center;gap:3px;background:#1a237e;color:white;padding:4px 10px 4px 12px;border-radius:14px;font-size:0.85em;font-weight:500;white-space:nowrap;cursor:default;" title="${esc(tooltip)}">${esc(c.nome)}<button onclick="removerComponenteDrp('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:1.1em;color:rgba(255,255,255,0.7);line-height:1;padding:0 3px;" onmouseenter="this.style.color='white'" onmouseleave="this.style.color='rgba(255,255,255,0.7)'" title="Remover">&times;</button></span>`;
    }).join(' ');

    const chips = disponiveisNoTipo.map(d => {
      return `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.78em;font-weight:500;background:#f5f6fa;color:#1a237e;cursor:pointer;border:1px solid #e0e0e0;transition:all 0.15s;" onmouseenter="this.style.background='#c5cae9';this.style.borderColor='#1a237e'" onmouseleave="this.style.background='#f5f6fa';this.style.borderColor='#e0e0e0'" onclick="adicionarComponenteDrpById('${d.id}')" title="${d.descricao || d.nome}">${esc(d.nome)}</span>`;
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
              <input type="text" class="drp-type-input" data-tipo="${esc(tipo)}" placeholder="Digite para buscar ou criar..." autocomplete="off" style="border:none;border-bottom:1.5px solid #e8eaf6;outline:none;font-size:0.85em;padding:4px 2px;width:100%;background:transparent;transition:border-color 0.2s;" onfocus="this.style.borderColor='#1a237e';mostrarDropdownCompDrp(this,'${escJs(tipo)}')" oninput="mostrarDropdownCompDrp(this,'${escJs(tipo)}')" onblur="this.style.borderColor='#e8eaf6';setTimeout(()=>{const dd=this.parentElement.querySelector('.drp-type-dropdown');if(dd)dd.style.display='none';},200)">
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
    html += `<div class="drp-dd-option" onmousedown="adicionarComponenteDrpById('${d.id}')" style="padding:7px 12px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
      <div style="font-weight:500;color:#222;">${esc(d.nome)}</div>
      ${d.descricao ? `<div style="font-size:0.75em;color:#888;margin-top:1px;">${esc(d.descricao)}</div>` : ''}
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
      html += `<div class="drp-comp-option" onmousedown="adicionarComponenteDrpById('${d.id}')" style="padding:8px 12px 8px 20px;font-size:0.88em;cursor:pointer;transition:background 0.1s;">
        <div style="font-weight:600;color:#222;">${esc(d.nome)}</div>
        ${d.descricao ? `<div style="font-size:0.82em;color:#888;margin-top:2px;">${esc(d.descricao)}</div>` : ''}
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
    id: document.getElementById('compDrpId').value || null,
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
  const id = document.getElementById('fId').value || '';
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
  const id = document.getElementById('fId').value || '';
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
// LEVANTAMENTO PCN - Enviar, Copiar Link, Abrir
// ============================================================
window.enviarLinkLevantamento = async () => {
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes.', '#e65100');
  const areas = window.areasDisponiveis || [];
  const area = areas.find(a => a.nome === p.area);
  const emailPadrao = area ? area.email : '';
  const email = prompt('E-mail do dono do processo:', emailPadrao);
  if (!email) return;
  try {
    showToast('📧 Enviando...', '#1a237e');
    const result = await API.post('gerarTokenLevantamento', { area: p.area, processo: p.processo, email });
    if (result.error) throw new Error(result.error);
    showToast('✅ Formulário enviado para ' + email, '#2e7d32');
  } catch(e) { showToast('❌ ' + e.message, '#c62828'); }
};

window.copiarLinkLevantamento = async () => {
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes.', '#e65100');
  try {
    showToast('🔗 Gerando link...', '#1a237e');
    const result = await API.post('gerarTokenLevantamento', { area: p.area, processo: p.processo, email: '_link_only_' });
    if (result.error) throw new Error(result.error);
    await navigator.clipboard.writeText(result.link);
    showToast('✅ Link copiado!', '#2e7d32');
  } catch(e) { showToast('❌ ' + e.message, '#c62828'); }
};

window.abrirLevantamento = () => {
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p || !p.levantamentoPCN) return showToast('Nenhum levantamento preenchido.', '#e65100');
  // Abrir visualização (buscar dados do backend)
  showToast('📄 Carregando...', '#1a237e');
  API.get('getLevantamentoPCN', { area: p.area, processo: p.processo }).then(data => {
    if (data.error) return showToast('❌ ' + data.error, '#c62828');
    const win = window.open('', '_blank');
    if (!win) return showToast('Popup bloqueado.', '#e65100');
    win.document.write(_buildLevantamentoView(data, p));
    win.document.close();
  }).catch(e => showToast('❌ ' + e.message, '#c62828'));
};

function _buildLevantamentoView(lev, p) {
  const field = (label, val) => val ? '<tr><td style="padding:8px 12px;font-weight:600;color:#444;width:35%;border-bottom:1px solid #f0f0f0;">' + label + '</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">' + val + '</td></tr>' : '';
  const list = (val) => { try { return JSON.parse(val).join(', '); } catch(e) { return val; } };
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Levantamento PCN - ${esc(p.processo)}</title>
  <style>body{font-family:Segoe UI,Arial;max-width:800px;margin:0 auto;padding:40px 20px;color:#333;} h1{color:#1a237e;font-size:1.4em;} h2{color:#1a237e;font-size:1.1em;margin-top:28px;padding:8px 12px;background:#e8eaf6;border-left:4px solid #1a237e;border-radius:0 6px 6px 0;} table{width:100%;border-collapse:collapse;margin:12px 0;} @media print{h2{page-break-after:avoid;}}</style></head><body>
  <h1>📋 Levantamento PCN: ${esc(p.processo)}</h1>
  <p style="color:#666;">Área: ${esc(p.area)} • Preenchido em: ${lev.data ? new Date(lev.data).toLocaleDateString('pt-BR') : '-'}</p>
  <h2>1. Identificação</h2><table>${field('Gestor',lev.gestor)}${field('Substituto',lev.substituto)}</table>
  <h2>2. Escopo</h2><table>${field('Funcionamento',lev.escopo)}${field('Entrega Principal',lev.entrega)}</table>
  <h2>3. Ativação da Continuidade</h2><table>${field('Situações',list(lev.ativacao))}${field('Outro',lev.ativacaoOutro)}</table>
  <h2>4. Operação em Contingência</h2><table>${field('Pode operar sem sistemas?',lev.semSistema)}${field('Procedimentos alternativos',lev.contingencia)}${field('Controles manuais',lev.controlesManuais)}${field('Docs de contingência',lev.docsContingencia)}</table>
  <h2>5. Pessoas Necessárias</h2><table>${field('Funções',lev.funcoes)}${field('Substitutos treinados?',lev.substitutos)}${field('Doc para execução?',lev.docExecucao)}</table>
  <h2>6. Recursos</h2><table>${field('Sistemas',lev.sistemas)}${field('Bancos de dados',lev.bancos)}${field('Integrações',lev.integracoes)}${field('Infraestrutura',list(lev.infra))}${field('Outro',lev.infraOutro)}</table>
  <h2>7. Fornecedores</h2><table>${field('Fornecedores essenciais',lev.fornecedores)}</table>
  <h2>8. Comunicação</h2><table>${field('Comunicação',lev.comunicacao)}${field('Modelo definido?',lev.modeloComunicacao)}</table>
  <h2>9. Recuperação</h2><table>${field('Atividades de retorno',lev.recuperacao)}${field('Reconciliar dados?',lev.reconciliacao)}${field('Descrição',lev.reconciliacaoDesc)}${field('Pós-recuperação',lev.posRecuperacao)}</table>
  <h2>10. Documentação</h2><table>${field('Documentos',list(lev.docs))}${field('Local',lev.docsLocal)}</table>
  </body></html>`;
}

// ============================================================
// ENVIAR DRP COMPONENTES POR E-MAIL (formulário externo via token)
// ============================================================
window.abrirLevantamentoDireto = (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p || !p.levantamentoPCN) return showToast('Nenhum levantamento preenchido.', '#e65100');
  showToast('📄 Carregando...', '#1a237e');
  API.get('getLevantamentoPCN', { area: p.area, processo: p.processo }).then(data => {
    if (data.error) return showToast('❌ ' + data.error, '#c62828');
    const win = window.open('', '_blank');
    if (!win) return showToast('Popup bloqueado.', '#e65100');
    win.document.write(_buildLevantamentoView(data, p));
    win.document.close();
  }).catch(e => showToast('❌ ' + e.message, '#c62828'));
};
window.enviarDRPComponentes = async () => {
  const id = document.getElementById('fId').value || '';
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
  const id = document.getElementById('fId').value || '';
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
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p) return showToast('Salve o processo antes de gerar o dossiê.', '#e65100');
  const catalogo = window.dependenciasCatalogo || [];
  const componentesCat = window.componentesCatalogo || [];
  const area = window.areasDisponiveis ? window.areasDisponiveis.find(a => a.nome === p.area) : null;
  const responsavel = area ? area.responsavel : '';
  const score = p.score || 0;
  const tier = Criticidade.tierDoProcesso(p);
  const deps = (p.dependencia || '').split(',').map(s => s.trim()).filter(Boolean);
  const depGrupos = {};
  deps.forEach(nome => { const dep = catalogo.find(d => d.nome === nome); const cat = dep ? dep.categoria : 'Outros'; if (!depGrupos[cat]) depGrupos[cat] = []; depGrupos[cat].push(nome); });
  const contatos = (p.bcpContatos || []).map(cid => catalogo.find(d => d.id === cid)).filter(Boolean);
  const comps = (p.drpComponentes || []).map(cid => componentesCat.find(d => d.id === cid)).filter(Boolean);
  const pergs = window.processosPerguntas || [];
  const respostas = p.respostas || {};
  const win = window.open('', '_blank');
  if (!win) return showToast('Popup bloqueado.', '#e65100');
  win.document.write('<html><head><title>Dossiê - ' + p.processo + '</title><style>body{font-family:Arial;padding:40px;max-width:900px;margin:0 auto;font-size:11pt;line-height:1.6}h1{color:#1a237e}h2{color:#1a237e;border-bottom:2px solid #e8eaf6;padding-bottom:6px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:9.5pt}th{background:#1a237e;color:white;padding:8px 10px;text-align:left}td{padding:7px 10px;border:1px solid #e0e0e0}.badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:9pt;font-weight:700;color:white;background:' + Criticidade.corDoTier(tier) + '}</style></head><body>');
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
  // Apenas administradores podem gerar PCN
  if (window.USER_PERFIL !== 'admin') {
    return showToast('Apenas administradores podem gerar PCNs.', '#e65100');
  }

  const id = document.getElementById('fId').value || '';
  if (!id) return showToast('Salve o processo antes de gerar o PCN.', '#e65100');
  
  const p = window.processosData ? window.processosData.find(proc => proc.id === id) : null;
  
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
    
    // Auto-salvar como nova versão
    try {
      const area = p ? p.area : (result.area || '');
      const processo = p ? p.processo : (result.processo || '');
      await API.post('salvarPCN', { id: String(id), area, processo, pcnHtml: pcnContent });
      API.invalidate('getProcessos');
      // Atualizar dados locais
      if (p) {
        const versoes = p.pcnSalvo ? _parsePCNVersoes(p.pcnSalvo) : [];
        versoes.push({ versao: versoes.length + 1, data: new Date().toISOString(), autor: window.USER_EMAIL || 'sistema', html: pcnContent });
        p.pcnSalvo = JSON.stringify(versoes.slice(-3));
      }
    } catch(saveErr) { console.warn('Auto-save PCN falhou:', saveErr); }

    const pcnHtml = _buildPCNPage(pcnContent, result, id, null, await _tokenParaPCN());
    win.document.open();
    win.document.write(pcnHtml);
    win.document.close();
    showToast('✅ PCN gerado e salvo!', '#2e7d32');
  } catch(err) {
    console.error('Erro PCN:', err);
    showToast('❌ ' + err.message, '#c62828');
    if (win) win.close();
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; btn.style.opacity = '1'; } }
};

// ============================================================
// ABRIR PCN SALVO
// ============================================================
window.abrirPCNSalvo = async () => {
  const id = document.getElementById('fId').value || '';
  const p = id ? window.processosData.find(proc => proc.id === id) : null;
  if (!p || !p.pcnSalvo) return showToast('Nenhum PCN salvo.', '#e65100');
  const tier = Criticidade.tierDoProcesso(p);
  const versoes = _parsePCNVersoes(p.pcnSalvo);
  if (!versoes.length) return showToast('Nenhuma versão de PCN encontrada.', '#e65100');
  const ultimaVersao = versoes[versoes.length - 1];
  let pcnHtml;
  try {
    pcnHtml = _buildPCNPage(ultimaVersao.html, { processo: p.processo, area: p.area, tier, score: p.score }, id, versoes, await _tokenParaPCN());
  } catch (e) {
    return showToast('❌ ' + e.message, '#c62828');
  }
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
// Token de login para embutir na pagina do PCN, que roda fora do app e nao tem
// o SDK do Firebase para pedir um por conta propria.
async function _tokenParaPCN() {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  return user.getIdToken();
}

function _buildPCNPage(pcnContent, info, processId, versoes, idToken) {
  // O conteudo vem do Gemini a partir de campos que gestores preenchem, e era
  // inserido cru com document.write — executando na sessao de quem abrisse o
  // PCN. Limpa antes de qualquer coisa. Ver sanitizar-pcn.js.
  const _limpo = sanitizarPCN(pcnContent);
  if (_limpo.usouFallback) {
    console.warn('PCN: DOMPurify indisponível, usando limpeza básica.');
    showToast('Aviso: o PCN foi exibido com limpeza reduzida (biblioteca indisponível).', '#e65100');
  }
  pcnContent = _limpo.html;
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
<title>PCN - ${esc(info.processo || '')}</title>
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
    <p style="font-size:13pt;">${esc(info.processo || '')}</p>
    <p>Área: ${esc(info.area || '')}</p>
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
var PROCESS_ID = '${escScript(processId)}';
var PCN_API_URL = '` + APP_API_URL + `';
// Token de login embutido na abertura da pagina. A pagina do PCN nao carrega o
// SDK do Firebase, entao nao tem como pedir um novo: vale cerca de uma hora.
// Passado isso, salvar devolve 401 e a pagina manda reabrir o PCN.
var PCN_TOKEN = '` + (idToken || '') + `';
var PCN_AREA = '${escScript(info.area || '')}';
var PCN_PROCESSO = '${escScript(info.processo || '')}';
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
    var payload = JSON.stringify({action:'salvarPCN',area:PCN_AREA,processo:PCN_PROCESSO,html:conteudo});
    var res = await fetch(PCN_API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=UTF-8','Authorization':'Bearer '+PCN_TOKEN},
      body: payload
    });
    if(res.status===401){throw new Error('A sessão desta aba expirou. Feche esta aba, volte ao sistema e abra o PCN de novo — o conteúdo editado não foi salvo.');}
    var text = await res.text();
    var data = JSON.parse(text);
    if(data.error) throw new Error(data.error);
    alert('✅ Versão ' + (data.versao || '') + ' salva com sucesso! (' + (data.totalVersoes || '') + ' versões no total)');
  }catch(e){alert('❌ Erro: '+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='💾 Salvar versão';}}
}
</script>
<script src="https://bia-forte-2025.web.app/pcn-live.js?v=2"></script>
</body>
</html>`;
}


// ============================================================
// ABRIR PCN DIRETO DA TABELA DE PROCESSOS
// ============================================================
window.abrirPCNDireto = async (id) => {
  const p = window.processosData.find(proc => proc.id === id);
  if (!p || !p.pcnSalvo) return showToast('Nenhum PCN salvo para este processo.', '#e65100');
  const tier = Criticidade.tierDoProcesso(p);
  const versoes = _parsePCNVersoes(p.pcnSalvo);
  if (!versoes.length) return showToast('Nenhuma versão de PCN encontrada.', '#e65100');
  const ultimaVersao = versoes[versoes.length - 1];
  let pcnHtml;
  try {
    pcnHtml = _buildPCNPage(ultimaVersao.html, { processo: p.processo, area: p.area, tier, score: p.score }, id, versoes, await _tokenParaPCN());
  } catch (e) {
    return showToast('❌ ' + e.message, '#c62828');
  }
  const win = window.open('', '_blank');
  if (!win) return showToast('Popup bloqueado.', '#e65100');
  win.document.open();
  win.document.write(pcnHtml);
  win.document.close();
};


// ============================================================
// BCP - TABELA DE FORNECEDORES (com Plano B e SLA)
// ============================================================
/**
 * Coleta {nomeDoFornecedor: valor} dos campos da tabela da aba BCP.
 *
 * Devolve null quando a tabela nao esta no DOM — ou seja, quando a aba BCP nao
 * foi aberta nesta edicao. Isso e o que impede o salvamento de apagar o que ja
 * estava gravado: sem a tabela desenhada, o campo nem entra no payload.
 */
function _coletarMapaBcp(seletor) {
  const campos = document.querySelectorAll('#bcpFornecedoresTabela ' + seletor);
  if (!campos.length) return null;
  const mapa = {};
  campos.forEach((el) => {
    const nome = el.dataset.dep;
    const valor = (el.value || '').trim();
    if (nome && valor) mapa[nome] = valor;
  });
  return mapa;
}

/** Le um campo do processo que guarda um mapa JSON {nome: valor}. */
function _mapaDoProcesso(campo) {
  const id = document.getElementById('fId').value || '';
  const p = id ? (window.processosData || []).find(proc => proc.id === id) : null;
  if (!p || !p[campo]) return {};
  try {
    const m = typeof p[campo] === 'string' ? JSON.parse(p[campo]) : p[campo];
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  } catch { return {}; }
}

function renderFornecedoresBcp() {
  const container = document.getElementById('bcpFornecedoresTabela');
  if (!container) return;
  const catalogo = window.dependenciasCatalogo || [];
  const selecionadas = window._dependenciaSelecionadas || [];
  // Ate 20/09/2026 estes dois campos eram desenhados sempre vazios e ninguem os
  // lia de volta: o usuario digitava contingencia e SLA, salvava, e o conteudo
  // sumia — inclusive so de trocar de aba, porque a tabela e refeita do zero.
  const planoBSalvo = _mapaDoProcesso('bcpPlanoBProvedores');
  const slasSalvo = _mapaDoProcesso('bcpSlas');
  
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
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Empresa</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Contato</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Papel</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Telefone</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">Contingência / Plano B</th>
        <th style="padding:10px 14px;text-align:left;font-weight:700;color:#333;border-bottom:1.5px solid #e0e0e0;">SLA Contratado</th>
      </tr>
    </thead>
    <tbody>`;
  
  fornecedores.forEach(nome => {
    const dep = catalogo.find(d => d.nome === nome) || {};
    const contato = (dep.pessoas || [])[0];
    html += `<tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:10px 14px;font-weight:600;color:#222;">${nome}</td>
      <td style="padding:10px 14px;color:#555;">${esc(contato ? contato.nome : '-')}</td>
      <td style="padding:10px 14px;color:#555;">${esc(dep.detalhes || '-')}</td>
      <td style="padding:10px 14px;color:#555;">${esc(contato ? contato.telefone || '-' : '-')}</td>
      <td style="padding:6px 8px;"><input type="text" class="planoB-contingencia" data-dep="${esc(nome)}" value="${esc(planoBSalvo[nome] || '')}" placeholder="Ex: Provedor alternativo..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.9em;box-sizing:border-box;"></td>
      <td style="padding:6px 8px;"><input type="text" class="sla-valor" data-dep="${esc(nome)}" value="${esc(slasSalvo[nome] || '')}" placeholder="Ex: Suporte 24x7, 15min..." style="width:100%;padding:7px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:0.9em;box-sizing:border-box;"></td>
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
    <div id="pcns-resumo" style="display:none;margin-bottom:20px;"></div>
    <div style="margin-bottom:16px;">
      <input type="text" id="pcnBusca" placeholder="🔍 Buscar processo..." oninput="filtrarPCNs()" style="width:100%;max-width:400px;padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;">
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
    API.invalidate('getProcessos');
    const processos = await API.getProcessos();
    window.processosData = processos;
    document.getElementById('loading').style.display = 'none';

    let comPCN = processos.filter(p => p.pcnSalvo);

    if (window.USER_PERFIL !== 'admin' && window.USER_AREA) {
      comPCN = comPCN.filter(p => p.area === window.USER_AREA);
    } else if (window.USER_PERFIL !== 'admin' && !window.USER_AREA) {
      document.getElementById('pcns-lista').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:3em;margin-bottom:16px;">🔒</div>
          <h3 style="color:#666;margin-bottom:8px;">Acesso não configurado</h3>
          <p>Seu e-mail ainda não está vinculado a uma área.</p>
        </div>`;
      return;
    }

    window._pcnData = comPCN;

    if (!comPCN.length) {
      document.getElementById('pcns-lista').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:3em;margin-bottom:16px;">📄</div>
          <h3 style="color:#666;margin-bottom:8px;">Nenhum PCN gerado ainda</h3>
          <p>Gere PCNs na tela de Processos clicando em "🤖 Gerar PCN".</p>
        </div>`;
      return;
    }

    // Cards de resumo
    const tier1 = comPCN.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T1)).length;
    const tier2 = comPCN.filter(p => Criticidade.ehTier(p, Criticidade.TIER.T2)).length;
    const tier3 = comPCN.filter(p => p.score > 0 && p.score < 6).length;
    document.getElementById('pcns-resumo').style.display = 'flex';
    document.getElementById('pcns-resumo').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="background:white;border-radius:8px;padding:14px 20px;border-top:3px solid #1a237e;min-width:100px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:1.6em;font-weight:700;color:#1a237e;">${comPCN.length}</div>
          <div style="font-size:0.75em;color:#666;">Total PCNs</div>
        </div>
        <div style="background:white;border-radius:8px;padding:14px 20px;border-top:3px solid #c62828;min-width:100px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:1.6em;font-weight:700;color:#c62828;">${tier1}</div>
          <div style="font-size:0.75em;color:#666;">Tier 1</div>
        </div>
        <div style="background:white;border-radius:8px;padding:14px 20px;border-top:3px solid #f57c00;min-width:100px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:1.6em;font-weight:700;color:#f57c00;">${tier2}</div>
          <div style="font-size:0.75em;color:#666;">Tier 2</div>
        </div>
        <div style="background:white;border-radius:8px;padding:14px 20px;border-top:3px solid #1565c0;min-width:100px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:1.6em;font-weight:700;color:#1565c0;">${tier3}</div>
          <div style="font-size:0.75em;color:#666;">Tier 3</div>
        </div>
        <div style="background:white;border-radius:8px;padding:14px 20px;border-top:3px solid #2e7d32;min-width:100px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:1.6em;font-weight:700;color:#2e7d32;">${Object.keys(_agruparPorArea(comPCN)).length}</div>
          <div style="font-size:0.75em;color:#666;">Áreas</div>
        </div>
      </div>`;

    renderPCNLista(comPCN);
  } catch (err) {
    document.getElementById('loading').innerHTML = `
      <div style="color:#c62828;padding:20px;text-align:center;">
        <h3>❌ Erro ao carregar PCNs</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

function _agruparPorArea(lista) {
  const porArea = {};
  lista.forEach(p => { const area = p.area || 'Sem Área'; if (!porArea[area]) porArea[area] = []; porArea[area].push(p); });
  return porArea;
}

window.filtrarPCNs = () => {
  const busca = (document.getElementById('pcnBusca') || {}).value || '';
  const filtro = busca.toLowerCase();
  let data = window._pcnData || [];
  if (filtro) data = data.filter(p => p.processo.toLowerCase().includes(filtro) || p.area.toLowerCase().includes(filtro));
  renderPCNLista(data);
};

window.toggleAreaPCN = (areaId) => {
  const el = document.getElementById(areaId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

function renderPCNLista(comPCN) {
  const porArea = _agruparPorArea(comPCN);
  const tierColor = (p) => Criticidade.corDoTier(p);
  const tierLabel = (p) => Criticidade.tierCurto(p);

  let html = '';
  Object.entries(porArea).sort((a, b) => a[0].localeCompare(b[0])).forEach(([area, procs]) => {
    const areaId = 'pcn-area-' + area.replace(/[^a-zA-Z0-9]/g, '_');
    html += `<div style="margin-bottom:20px;">
      <div onclick="toggleAreaPCN('${areaId}')" style="background:linear-gradient(135deg,#1a237e,#283593);color:white;padding:12px 20px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;">
        <span style="font-weight:700;font-size:0.95em;">📁 ${area}</span>
        <span style="font-size:0.78em;opacity:0.8;">${procs.length} processo${procs.length > 1 ? 's' : ''} ▾</span>
      </div>
      <div id="${areaId}" style="border:1.5px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">`;

    procs.sort((a, b) => (b.score || 0) - (a.score || 0)).forEach(p => {
      const versoes = _parsePCNVersoes(p.pcnSalvo);
      const ultimaVersao = versoes[versoes.length - 1];
      const dataVersao = ultimaVersao && ultimaVersao.data ? new Date(ultimaVersao.data).toLocaleDateString('pt-BR') : '-';

      html += `<div style="display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #f0f0f0;transition:background 0.15s;" 
                    onmouseenter="this.style.background='#f8f9ff'" onmouseleave="this.style.background='white'">
        <div style="flex:1;cursor:pointer;" onclick="abrirPCNDireto('${p.id}')">
          <div style="font-weight:600;color:#222;font-size:0.92em;">${esc(p.processo)}</div>
          <div style="font-size:0.78em;color:#999;margin-top:2px;">Atualizado: ${dataVersao}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:${tierColor(p)};color:white;padding:2px 8px;border-radius:8px;font-size:0.72em;font-weight:700;">${tierLabel(p)} • ${p.score || 0}</span>
          <button onclick="abrirPCNDireto('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:1.1em;padding:4px;" title="Abrir PCN">📄</button>
          <button onclick="event.stopPropagation();excluirPCN('${p.id}','${escJs(p.area)}','${escJs(p.processo)}')" style="background:none;border:none;cursor:pointer;color:#bbb;font-size:1em;padding:4px;" onmouseenter="this.style.color='#c62828'" onmouseleave="this.style.color='#bbb'" title="Excluir PCN">🗑️</button>
        </div>
      </div>`;
    });

    html += `</div></div>`;
  });

  if (!html) html = '<p style="text-align:center;color:#999;padding:40px;">Nenhum PCN encontrado.</p>';
  document.getElementById('pcns-lista').innerHTML = html;
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

// ============================================================
// PÁGINA: FORNECEDORES — CRITÉRIOS DE AVALIAÇÃO
//
// O fornecedor NAO tem cadastro proprio: ele e uma linha de Dependencias com
// categoria Fornecedores. Aqui se cadastra so a REGUA com que ele e avaliado.
// ============================================================

let criteriosFornecedorData = [];
let configFornecedor = { limiarRisco: 70 };

async function fornecedoresCriterios() {
  // Permissao, nao perfil: o perfil de fornecedores tambem gerencia os criterios.
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Critérios de Avaliação de Fornecedores</h2><p class="page-sub">A régua com que todo fornecedor é avaliado — cada critério vale um peso</p></div>
      <button class="btn btn-primary" onclick="abrirModalCriterio()" id="btnNovoCriterio" style="display:none;">+ Novo Critério</button>
    </div>
    <div id="fornLimiarBox" style="border:1px solid #e0e0e0;border-radius:10px;padding:14px 16px;background:#fff;margin-bottom:18px;"></div>
    <div class="loading" id="loadingCriterios">⏳ Carregando...</div>
    <div id="listaCriterios"></div>
    <div class="modal-overlay" id="modalCriterio"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalCriterioTitulo">Novo Critério</h3>
      <input type="hidden" id="critId">
      <label>Critério</label>
      <input type="text" id="critNome" placeholder="Ex: Possui certificação ISO 27001 válida">
      <label>Descrição / o que conta como atendido</label>
      <input type="text" id="critDescricao" placeholder="Ex: Certificado vigente, emitido por organismo acreditado">
      <label>Peso</label>
      <input type="number" id="critPeso" min="1" max="10" step="1" value="1">
      <span style="font-size:0.75em;color:#888;display:block;margin-top:-6px;">Quanto este critério pesa na nota, de 1 a 10. Um critério de peso 3 vale o triplo de um de peso 1.</span>
      <label class="check-label"><input type="checkbox" id="critAtivo" checked> Critério ativo</label>
      <span style="font-size:0.75em;color:#888;display:block;">Desativar tira o critério das avaliações novas. As avaliações antigas continuam guardadas como foram feitas.</span>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalCriterio()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCriterio()">Salvar</button>
      </div>
    </div></div>`;

  document.getElementById('btnNovoCriterio').style.display = isAdmin ? 'inline-block' : 'none';

  try {
    const [crits, cfg] = await Promise.all([API.getCriteriosFornecedor(), API.getConfigFornecedor()]);
    criteriosFornecedorData = crits;
    configFornecedor = cfg;
  } catch (e) {
    // Nunca deixar a tela dizer "nenhum critério" quando o que houve foi falha
    // de leitura: e indistinguivel de cadastro vazio, e alguem recadastra tudo.
    console.error('Critérios de fornecedor: falha ao carregar', e);
    document.getElementById('loadingCriterios').style.display = 'none';
    document.getElementById('listaCriterios').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar os critérios.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="fornecedoresCriterios()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingCriterios').style.display = 'none';
  renderLimiarFornecedor();
  renderizarCriterios();
}

function renderLimiarFornecedor() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const box = document.getElementById('fornLimiarBox');
  if (!box) return;
  box.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;">
      <div>
        <label style="font-size:0.78em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Nota que abre risco</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:#666;font-size:0.9em;">abaixo de</span>
          <input type="number" id="fornLimiar" min="0" max="100" step="1" value="${configFornecedor.limiarRisco}" ${isAdmin ? '' : 'disabled'} style="width:80px;padding:7px 10px;border:1px solid #ddd;border-radius:7px;font-size:0.95em;font-weight:700;text-align:center;">
          <span style="color:#666;font-size:0.9em;">de 100</span>
          ${isAdmin ? '<button class="btn btn-ghost" onclick="salvarLimiarFornecedor()" style="padding:6px 14px;">Salvar</button>' : ''}
        </div>
      </div>
      <div style="font-size:0.76em;color:#888;max-width:520px;line-height:1.5;">
        Fornecedor que tirar menos que isso abre um risco automático, do mesmo jeito que um indicador fora da meta.
        A nota do fornecedor é de conformidade: <strong>quanto maior, melhor</strong> — 100 é quem atende todos os critérios.
      </div>
    </div>`;
}

window.salvarLimiarFornecedor = async () => {
  const valor = Number(document.getElementById('fornLimiar').value);
  try {
    await API.salvarConfigFornecedor({ limiarRisco: valor });
    configFornecedor.limiarRisco = valor;
    showToast('✅ Limiar salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

function renderizarCriterios() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const lista = document.getElementById('listaCriterios');
  if (!lista) return;

  if (!criteriosFornecedorData.length) {
    lista.innerHTML = `<div style="padding:28px;text-align:center;color:#888;border:1px dashed #ddd;border-radius:10px;">
      Nenhum critério cadastrado ainda.<br>
      <span style="font-size:0.9em;">Sem critério não existe nota: o fornecedor aparece como "Não avaliado".</span></div>`;
    return;
  }

  const ativos = criteriosFornecedorData.filter((c) => c.ativo);
  const pesoTotal = ativos.reduce((t, c) => t + c.peso, 0);

  lista.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:32%;">Critério</th>
            <th style="width:38%;">Descrição</th>
            <th style="width:8%;text-align:center;">Peso</th>
            <th style="width:12%;text-align:center;">Vale na nota</th>
            <th style="width:10%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${criteriosFornecedorData.map((c) => `
            <tr style="${c.ativo ? '' : 'opacity:0.5;'}">
              <td style="font-weight:600;">${esc(c.nome)}${c.ativo ? '' : ' <span style="font-size:0.78em;color:#888;font-weight:400;">(desativado)</span>'}</td>
              <td style="color:#666;font-size:0.9em;">${esc(c.descricao)}</td>
              <td style="text-align:center;font-weight:700;">${c.peso}</td>
              <td style="text-align:center;color:#666;font-size:0.9em;">${c.ativo && pesoTotal ? Math.round((c.peso / pesoTotal) * 100) + '%' : '–'}</td>
              <td style="text-align:center;">
                ${isAdmin ? `
                  <button class="btn-icon" onclick="abrirModalCriterio('${c.id}')" title="Editar">✏️</button>
                  <button class="btn-icon" onclick="excluirCriterio('${c.id}')" title="Excluir" style="color:#c62828;">🗑️</button>` : '–'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:0.76em;color:#999;margin-top:10px;line-height:1.5;">
      ${ativos.length} critério${ativos.length === 1 ? '' : 's'} ativo${ativos.length === 1 ? '' : 's'}, peso total ${pesoTotal}.
      A nota é o quanto o fornecedor aproveita desse peso: Sim vale o peso inteiro, Parcial vale a metade, Não vale zero.
      "Não se aplica" tira o critério da conta, sem dar nem tirar ponto.
      Mudar peso ou ativar critério sobe a versão da régua — as avaliações antigas guardam a versão que as pontuou e não mudam de nota sozinhas.
    </div>`;
}

window.abrirModalCriterio = (id) => {
  const c = id ? criteriosFornecedorData.find((x) => x.id === id) : null;
  document.getElementById('modalCriterioTitulo').textContent = c ? 'Editar Critério' : 'Novo Critério';
  document.getElementById('critId').value = c ? c.id : '';
  document.getElementById('critNome').value = c ? c.nome : '';
  document.getElementById('critDescricao').value = c ? c.descricao : '';
  document.getElementById('critPeso').value = c ? c.peso : 1;
  document.getElementById('critAtivo').checked = c ? c.ativo : true;
  document.getElementById('modalCriterio').classList.add('open');
};

window.fecharModalCriterio = () => document.getElementById('modalCriterio').classList.remove('open');

window.salvarCriterio = async () => {
  const nome = document.getElementById('critNome').value.trim();
  if (!nome) return showToast('Informe o critério.', '#e65100');
  const peso = Number(document.getElementById('critPeso').value);
  if (!Number.isFinite(peso) || peso < 1) return showToast('O peso tem que ser 1 ou mais.', '#e65100');

  try {
    await API.salvarCriterioFornecedor({
      id: document.getElementById('critId').value || null,
      nome,
      descricao: document.getElementById('critDescricao').value.trim(),
      peso,
      ativo: document.getElementById('critAtivo').checked,
    });
    fecharModalCriterio();
    criteriosFornecedorData = await API.getCriteriosFornecedor();
    renderizarCriterios();
    showToast('✅ Salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

window.excluirCriterio = async (id) => {
  const c = criteriosFornecedorData.find((x) => x.id === id);
  if (!confirm(`Excluir o critério "${c ? c.nome : id}"?\n\nAs avaliações já feitas continuam guardadas, mas este critério sai das avaliações novas. Se a ideia é só pará-lo de usar, é melhor desativar em vez de excluir.`)) return;
  try {
    await API.excluirCriterioFornecedor(id);
    criteriosFornecedorData = await API.getCriteriosFornecedor();
    renderizarCriterios();
    showToast('✅ Excluído.', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível excluir.'), '#c62828');
  }
};

// ============================================================
// PÁGINA: FORNECEDORES — CATEGORIAS
//
// Segmento de negócio do fornecedor (ex.: "Nuvem, Data Center e
// Cibersegurança"). Cadastrável/editável/excluível, ao contrário das 5 Ps do
// BIA (Fornecedores/Infraestrutura/Pessoas/Sistemas/Processos Internos, essas
// sim fixas). Mesmo molde de Critérios, sem peso nem versão — categoria não
// entra em cálculo nenhum.
// ============================================================

let categoriasFornecedorData = [];

async function fornecedoresCategorias() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Categorias de Fornecedores</h2><p class="page-sub">O segmento de negócio de cada fornecedor</p></div>
      <button class="btn btn-primary" onclick="abrirModalCategoriaFornecedor()" id="btnNovaCategoriaForn" style="display:none;">+ Nova Categoria</button>
    </div>
    <div class="loading" id="loadingCategoriasForn">⏳ Carregando...</div>
    <div id="listaCategoriasForn"></div>
    <div class="modal-overlay" id="modalCategoriaForn"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalCategoriaFornTitulo">Nova Categoria</h3>
      <input type="hidden" id="catFornId">
      <label>Categoria</label>
      <input type="text" id="catFornNome" placeholder="Ex: Nuvem, Data Center e Cibersegurança">
      <label class="check-label"><input type="checkbox" id="catFornAtivo" checked> Categoria ativa</label>
      <span style="font-size:0.75em;color:#888;display:block;">Desativar tira a categoria do cadastro de fornecedores novos. Fornecedores já classificados nela continuam mostrando o nome dela.</span>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalCategoriaFornecedor()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCategoriaFornecedor()">Salvar</button>
      </div>
    </div></div>`;

  document.getElementById('btnNovaCategoriaForn').style.display = isAdmin ? 'inline-block' : 'none';

  try {
    categoriasFornecedorData = await API.getCategoriasFornecedor();
  } catch (e) {
    console.error('Categorias de fornecedor: falha ao carregar', e);
    document.getElementById('loadingCategoriasForn').style.display = 'none';
    document.getElementById('listaCategoriasForn').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar as categorias.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="fornecedoresCategorias()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingCategoriasForn').style.display = 'none';
  renderizarCategoriasFornecedor();
}

function renderizarCategoriasFornecedor() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const lista = document.getElementById('listaCategoriasForn');
  if (!lista) return;

  if (!categoriasFornecedorData.length) {
    lista.innerHTML = `<div style="padding:28px;text-align:center;color:#888;border:1px dashed #ddd;border-radius:10px;">
      Nenhuma categoria cadastrada ainda.<br>
      <span style="font-size:0.9em;">Sem categoria, o cadastro de fornecedores fica sem essa opção pra escolher.</span></div>`;
    return;
  }

  lista.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:70%;">Categoria</th>
            <th style="width:15%;text-align:center;">Status</th>
            <th style="width:15%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${categoriasFornecedorData.map((c) => `
            <tr style="${c.ativo ? '' : 'opacity:0.5;'}">
              <td style="font-weight:600;">${esc(c.nome)}</td>
              <td style="text-align:center;">${c.ativo
                ? '<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;background:#e8f5e9;color:#2e7d32;">Ativa</span>'
                : '<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;background:#f5f5f5;color:#888;">Inativa</span>'}</td>
              <td style="text-align:center;">
                ${isAdmin ? `
                  <button class="btn-icon" onclick="abrirModalCategoriaFornecedor('${c.id}')" title="Editar">✏️</button>
                  <button class="btn-icon" onclick="excluirCategoriaFornecedor('${c.id}')" title="Excluir" style="color:#c62828;">🗑️</button>` : '–'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.abrirModalCategoriaFornecedor = (id) => {
  const c = id ? categoriasFornecedorData.find((x) => x.id === id) : null;
  document.getElementById('modalCategoriaFornTitulo').textContent = c ? 'Editar Categoria' : 'Nova Categoria';
  document.getElementById('catFornId').value = c ? c.id : '';
  document.getElementById('catFornNome').value = c ? c.nome : '';
  document.getElementById('catFornAtivo').checked = c ? c.ativo : true;
  document.getElementById('modalCategoriaForn').classList.add('open');
};

window.fecharModalCategoriaFornecedor = () => document.getElementById('modalCategoriaForn').classList.remove('open');

window.salvarCategoriaFornecedor = async () => {
  const nome = document.getElementById('catFornNome').value.trim();
  if (!nome) return showToast('Informe a categoria.', '#e65100');

  try {
    await API.salvarCategoriaFornecedor({
      id: document.getElementById('catFornId').value || null,
      nome,
      ativo: document.getElementById('catFornAtivo').checked,
    });
    fecharModalCategoriaFornecedor();
    categoriasFornecedorData = await API.getCategoriasFornecedor();
    renderizarCategoriasFornecedor();
    showToast('✅ Salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

window.excluirCategoriaFornecedor = async (id) => {
  const c = categoriasFornecedorData.find((x) => x.id === id);
  if (!confirm(`Excluir a categoria "${c ? c.nome : id}"?\n\nFornecedores que já usam esta categoria continuam mostrando o nome dela até serem editados. Se a ideia é só parar de oferecê-la em fornecedores novos, é melhor desativar em vez de excluir.`)) return;
  try {
    await API.excluirCategoriaFornecedor(id);
    categoriasFornecedorData = await API.getCategoriasFornecedor();
    renderizarCategoriasFornecedor();
    showToast('✅ Excluída.', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível excluir.'), '#c62828');
  }
};

// ============================================================
// PÁGINA: FORNECEDORES — AVALIAÇÃO
//
// A lista de fornecedores vem de Dependencias (categoria Fornecedores), que e o
// cadastro que ja existe e ao qual processo e risco ja apontam. Aqui se avalia,
// nao se cadastra.
// ============================================================

let fornecedoresData = [];
let avaliacoesFornecedorData = [];
// Cards de resumo funcionam como filtro da grade abaixo, mesmo padrao do
// dashboard de Indicadores. Clicar no card ja ativo limpa o filtro.
let fornecedoresFiltroResumo = 'todos'; // 'todos' | 'semAvaliacao' | 'vencida' | 'abaixoLimiar'
// Filtro independente do de resumo -- combina com E, nao substitui. Da pra
// ver "TIC" e "sem avaliacao" ativos ao mesmo tempo.
let fornecedoresFiltroTic = 'todos'; // 'todos' | 'tic' | 'naoTic'
let fornecedoresOrdenacao = { coluna: 'nome', direcao: 'asc' };

window.filtrarFornecedoresResumo = (modo) => {
  fornecedoresFiltroResumo = fornecedoresFiltroResumo === modo ? 'todos' : modo;
  renderizarFornecedores();
};

window.filtrarFornecedoresTic = (modo) => {
  fornecedoresFiltroTic = fornecedoresFiltroTic === modo ? 'todos' : modo;
  renderizarFornecedores();
};

window.ordenarFornecedores = (coluna) => {
  if (fornecedoresOrdenacao.coluna === coluna) {
    fornecedoresOrdenacao.direcao = fornecedoresOrdenacao.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    fornecedoresOrdenacao.coluna = coluna;
    fornecedoresOrdenacao.direcao = 'asc';
  }
  renderizarFornecedores();
};

function _avaliacaoDoFornecedor(id) {
  return avaliacoesFornecedorData.find((a) => a.fornecedorId === String(id)) || null;
}

/**
 * Situacao do fornecedor em uma frase, com cor.
 *
 * Sao quatro estados diferentes e a tela nao pode confundi-los:
 *   nunca avaliado / avaliado sem nota / avaliacao pela metade / vencida.
 * "Nao avaliado" nao e nota zero, e "vencida" nao e "nao avaliada".
 */
function _situacaoFornecedor(av) {
  if (!av) return { rotulo: 'Não avaliado', cor: '#999', fundo: '#f5f5f5', aviso: '' };
  if (av.nota === null) {
    return { rotulo: 'Sem nota', cor: '#999', fundo: '#f5f5f5', aviso: 'Nenhum critério respondido, ou todos marcados como "Não se aplica"' };
  }
  const faixa = FornecedorScore.faixaNota(av.nota);
  const venceu = FornecedorScore.vencida(av.avaliadoEm);
  if (venceu) return { rotulo: 'Vencida', cor: '#e65100', fundo: '#fff3e0', aviso: `A última avaliação é de ${_dataCurtaForn(av.avaliadoEm)} e passou de um ano` };
  if (!av.completa) return { rotulo: faixa.rotulo, cor: '#e65100', fundo: '#fff3e0', aviso: 'Avaliação incompleta: há critérios sem resposta ou sem evidência anexada, então a nota está provisória' };
  return { rotulo: faixa.rotulo, cor: faixa.cor, fundo: faixa.fundo, aviso: '' };
}

function _dataCurtaForn(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('pt-BR');
}

/** Badge de criticidade (aba nova da avaliação) para as tabelas de Fornecedores. */
function _badgeCriticidadeFornecedor(av) {
  const score = av && av.completaCriticidade ? av.scoreCriticidade : null;
  const faixa = FornecedorCriticidade.faixa(score);
  if (score === null) return '<span style="color:#999;font-weight:600;" title="Criticidade ainda não avaliada">–</span>';
  return `<span title="${esc(faixa.rotulo)} — ${score} de ${FornecedorCriticidade.SCORE_MAXIMO}" style="display:inline-block;min-width:30px;padding:3px 8px;border-radius:10px;font-size:0.84em;font-weight:700;background:${faixa.fundo};color:${faixa.cor};">${score}</span>`;
}

/** Resumo das pessoas da empresa: primeiro contato + quantos ficaram de fora. */
function _resumoPessoasFornecedor(f) {
  const pessoas = f.pessoas || [];
  if (!pessoas.length) return '<span style="color:#999;">Nenhuma pessoa cadastrada</span>';
  const extra = pessoas.length - 1;
  return `${esc(pessoas[0].nome)}${extra > 0 ? ` <span style="color:#999;">+${extra}</span>` : ''}`;
}

async function fornecedores() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Avaliação de Fornecedores</h2><p class="page-sub">Nota de conformidade de cada fornecedor — quanto maior, melhor</p></div>
      <a href="#fornecedores-criterios" class="btn btn-ghost" id="btnIrCriterios" style="display:none;">Critérios</a>
    </div>
    <div id="fornResumo" style="margin-bottom:18px;"></div>
    <div style="margin-bottom:16px;">
      <input type="text" id="buscaFornecedor" placeholder="🔍 Buscar fornecedor..." oninput="renderizarFornecedores()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:280px;">
    </div>
    <div class="loading" id="loadingFornecedores">⏳ Carregando...</div>
    <div id="listaFornecedores"></div>
    ${_htmlDrawerAvaliacaoFornecedor()}
    ${_htmlModalFornecedorCadastro()}`;

  document.getElementById('btnIrCriterios').style.display = isAdmin ? 'inline-block' : 'none';

  try {
    const [deps, crits, avals, cfg, cats, areasFornecedor] = await Promise.all([
      API.getDependencias(), API.getCriteriosFornecedor(), API.getAvaliacoesFornecedor(), API.getConfigFornecedor(),
      API.getCategoriasFornecedor(), API.getAreas(),
    ]);
    fornecedoresData = deps.filter((d) => ['Fornecedores', 'Fornecedor'].includes(d.categoria));
    // Gestor do Contrato (select) e Setor responsavel (select), no modal de
    // fornecedor -- mesmo catalogo que as telas de Pessoas e Areas usam.
    pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
    window.areasData = areasFornecedor;
    criteriosFornecedorData = crits;
    avaliacoesFornecedorData = avals;
    configFornecedor = cfg;
    categoriasFornecedorData = cats;
  } catch (e) {
    console.error('Fornecedores: falha ao carregar', e);
    document.getElementById('loadingFornecedores').style.display = 'none';
    document.getElementById('listaFornecedores').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar os fornecedores.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="fornecedores()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingFornecedores').style.display = 'none';
  renderizarFornecedores();
}

function renderizarFornecedores() {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const lista = document.getElementById('listaFornecedores');
  const resumo = document.getElementById('fornResumo');
  if (!lista) return;

  const ativos = criteriosFornecedorData.filter(FornecedorScore.criterioAtivo);

  const anelAtivo = 'outline:2.5px solid #1a237e;outline-offset:2px;';

  if (resumo) {
    const comNota = fornecedoresData.filter((f) => { const a = _avaliacaoDoFornecedor(f.id); return a && a.nota !== null; });
    const semAvaliacao = fornecedoresData.length - comNota.length;
    const vencidas = comNota.filter((f) => FornecedorScore.vencida(_avaliacaoDoFornecedor(f.id).avaliadoEm)).length;
    const abaixo = comNota.filter((f) => FornecedorScore.abreRisco(_avaliacaoDoFornecedor(f.id).nota, configFornecedor.limiarRisco)).length;
    const qtdTic = fornecedoresData.filter((f) => f.tic !== false).length;
    const qtdNaoTic = fornecedoresData.length - qtdTic;

    const card = (x) => `<div style="border-radius:10px;padding:12px 16px;background:#fff;min-width:130px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.08);${x.ativo ? anelAtivo : ''}" onclick="${x.onclick}" title="${esc(x.titulo)}">
                <div style="font-size:1.7em;font-weight:800;color:${x.c};line-height:1;">${x.n}</div>
                <div style="font-size:0.74em;color:#888;margin-top:4px;">${esc(x.t)}</div>
              </div>`;

    resumo.innerHTML = !ativos.length
      ? `<div style="border:1px solid #ffe0b2;background:#fff8e1;border-radius:10px;padding:14px 16px;color:#e65100;font-size:0.9em;">
           Nenhum critério ativo cadastrado. Sem critério não existe nota — todo fornecedor vai aparecer como "Não avaliado".
           ${isAdmin ? ' <a href="#fornecedores-criterios" style="color:#e65100;font-weight:700;">Cadastrar critérios</a>' : ''}
         </div>`
      : `<div style="display:flex;gap:12px;flex-wrap:wrap;">
           ${[
             { n: fornecedoresData.length, t: 'fornecedores no catálogo', c: '#1a237e', titulo: 'Ver todos', ativo: fornecedoresFiltroResumo === 'todos', onclick: "filtrarFornecedoresResumo('todos')" },
             { n: semAvaliacao, t: 'sem avaliação', c: semAvaliacao ? '#e65100' : '#999', titulo: 'Filtrar sem avaliação', ativo: fornecedoresFiltroResumo === 'semAvaliacao', onclick: "filtrarFornecedoresResumo('semAvaliacao')" },
             { n: vencidas, t: 'com avaliação vencida', c: vencidas ? '#e65100' : '#999', titulo: 'Filtrar avaliação vencida', ativo: fornecedoresFiltroResumo === 'vencida', onclick: "filtrarFornecedoresResumo('vencida')" },
             { n: abaixo, t: `abaixo de ${configFornecedor.limiarRisco}`, c: abaixo ? '#c62828' : '#2e7d32', titulo: `Filtrar nota abaixo de ${configFornecedor.limiarRisco}`, ativo: fornecedoresFiltroResumo === 'abaixoLimiar', onclick: "filtrarFornecedoresResumo('abaixoLimiar')" },
             { n: qtdTic, t: 'TIC', c: '#1a237e', titulo: 'Filtrar fornecedores de TIC', ativo: fornecedoresFiltroTic === 'tic', onclick: "filtrarFornecedoresTic('tic')" },
             { n: qtdNaoTic, t: 'Não TIC', c: '#555', titulo: 'Filtrar fornecedores que não são de TIC', ativo: fornecedoresFiltroTic === 'naoTic', onclick: "filtrarFornecedoresTic('naoTic')" },
           ].map(card).join('')}
         </div>`;
  }

  const busca = (document.getElementById('buscaFornecedor')?.value || '').toLowerCase();
  const porResumo = (f) => {
    const av = _avaliacaoDoFornecedor(f.id);
    if (fornecedoresFiltroResumo === 'semAvaliacao') return !av || av.nota === null;
    if (fornecedoresFiltroResumo === 'vencida') return !!(av && av.nota !== null && FornecedorScore.vencida(av.avaliadoEm));
    if (fornecedoresFiltroResumo === 'abaixoLimiar') return !!(av && FornecedorScore.abreRisco(av.nota, configFornecedor.limiarRisco));
    return true;
  };
  const porTic = (f) => {
    if (fornecedoresFiltroTic === 'tic') return f.tic !== false;
    if (fornecedoresFiltroTic === 'naoTic') return f.tic === false;
    return true;
  };
  const data = fornecedoresData.filter((f) => !busca
    || (f.nome || '').toLowerCase().includes(busca)
    || (f.pessoas || []).some((p) => (p.nome || '').toLowerCase().includes(busca)))
    .filter(porResumo)
    .filter(porTic);

  if (!fornecedoresData.length) {
    lista.innerHTML = `<div style="padding:28px;text-align:center;color:#888;border:1px dashed #ddd;border-radius:10px;">
      Nenhum fornecedor no catálogo de Dependências.<br>
      <span style="font-size:0.9em;">Cadastre em <a href="#fornecedores-cadastro" style="color:#1a237e;font-weight:700;">Fornecedores → Cadastro</a>.</span></div>`;
    return;
  }

  // Nulo sempre por ultimo, nas duas direcoes -- ausencia de avaliacao nao e
  // o pior nem o melhor caso, e "arrastar pro fim" nao deveria trocar de lado
  // so porque a pessoa inverteu a seta.
  const valorOrdenacao = (av) => {
    if (fornecedoresOrdenacao.coluna === 'nota') return av && av.nota !== null ? av.nota : null;
    if (fornecedoresOrdenacao.coluna === 'criticidade') return av && av.completaCriticidade ? av.scoreCriticidade : null;
    if (fornecedoresOrdenacao.coluna === 'avaliadoEm') return av && av.avaliadoEm ? av.avaliadoEm : null;
    return null;
  };
  data.sort((a, b) => {
    const dir = fornecedoresOrdenacao.direcao === 'asc' ? 1 : -1;
    if (fornecedoresOrdenacao.coluna === 'nome') return dir * (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    const vA = valorOrdenacao(_avaliacaoDoFornecedor(a.id));
    const vB = valorOrdenacao(_avaliacaoDoFornecedor(b.id));
    if (vA === null && vB === null) return 0;
    if (vA === null) return 1;
    if (vB === null) return -1;
    return dir * (vA > vB ? 1 : vA < vB ? -1 : 0);
  });

  const th = (coluna, rotulo, estilo) => `<th onclick="ordenarFornecedores('${coluna}')" style="cursor:pointer;${estilo || ''}">${rotulo} <span id="sort-forn-${coluna}"></span></th>`;

  lista.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            ${th('nome', 'Empresa', 'width:18%;')}
            <th style="width:14%;">Pessoas</th>
            ${th('nota', 'Nota de Conformidade', 'width:12%;text-align:center;')}
            ${th('criticidade', 'Criticidade', 'width:10%;text-align:center;')}
            <th style="width:13%;">Situação</th>
            ${th('avaliadoEm', 'Última avaliação', 'width:12%;')}
            <th style="width:17%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${data.length ? data.map((f) => {
            const av = _avaliacaoDoFornecedor(f.id);
            const sit = _situacaoFornecedor(av);
            return `
            <tr>
              <td style="font-weight:600;">${esc(f.nome)}</td>
              <td style="color:#666;font-size:0.88em;">${_resumoPessoasFornecedor(f)}</td>
              <td style="text-align:center;">
                ${av && av.nota !== null
                  ? `<span title="${esc(FornecedorScore.faixaNota(av.nota).rotulo)} — ${av.nota} de 100" style="display:inline-block;min-width:30px;padding:3px 8px;border-radius:10px;font-size:0.84em;font-weight:700;background:${FornecedorScore.faixaNota(av.nota).fundo};color:${FornecedorScore.faixaNota(av.nota).cor};">${av.nota}</span>`
                  : '<span style="color:#999;font-weight:600;" title="Sem nota — não é o mesmo que nota zero">–</span>'}
              </td>
              <td style="text-align:center;">${_badgeCriticidadeFornecedor(av)}</td>
              <td>
                <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;background:${sit.fundo};color:${sit.cor};">${esc(sit.rotulo)}</span>
                ${sit.aviso ? `<div style="font-size:0.72em;color:#e65100;margin-top:3px;">${esc(sit.aviso)}</div>` : ''}
              </td>
              <td style="color:#666;font-size:0.9em;">
                ${av ? `${_dataCurtaForn(av.avaliadoEm)}<div style="font-size:0.8em;color:#aaa;">${esc(av.avaliadoPor || '')}</div>` : '–'}
              </td>
              <td style="text-align:center;white-space:nowrap;">
                ${isAdmin
                  ? `<button class="btn btn-ghost" onclick="abrirAvaliacaoFornecedor('${f.id}')" style="padding:5px 12px;font-size:0.86em;">${av ? 'Reavaliar' : 'Avaliar'}</button>
                     <button class="btn-icon" onclick="abrirModalFornecedor('${esc(f.id)}')" title="Editar dados do fornecedor">✏️</button>`
                  : (av ? `<button class="btn btn-ghost" onclick="abrirAvaliacaoFornecedor('${f.id}')" style="padding:5px 12px;font-size:0.86em;">Ver</button>` : '–')}
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" style="padding:20px;text-align:center;color:#888;">Nenhum fornecedor encontrado com esses filtros.</td></tr>'}
        </tbody>
      </table>
    </div>`;

  ['nome', 'nota', 'criticidade', 'avaliadoEm'].forEach((col) => {
    const el = document.getElementById(`sort-forn-${col}`);
    if (el) el.textContent = col === fornecedoresOrdenacao.coluna ? (fornecedoresOrdenacao.direcao === 'asc' ? '▲' : '▼') : '';
  });
}

// ---- Drawer de avaliação do fornecedor ----

function _htmlDrawerAvaliacaoFornecedor() {
  return `
    <div class="drawer-overlay" id="drawerOverlayFornecedor" onclick="fecharAvaliacaoFornecedor()"></div>
    <div class="drawer" id="drawerFornecedor">
      <div class="drawer-header">
        <h3 id="fornDrawerTitulo">Avaliar Fornecedor</h3>
        <button onclick="fecharAvaliacaoFornecedor()" style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#999;line-height:1;">&times;</button>
      </div>
      <div class="drawer-body" style="padding:0;display:flex;flex-direction:column;">
        <input type="hidden" id="fornAvalId">
        <div style="display:flex;border-bottom:2px solid #e8eaf6;background:white;flex-shrink:0;">
          <button id="tab-avalForn-criticidade" onclick="trocarAbaAvaliacaoFornecedor('criticidade')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#1a237e;border-bottom:3px solid #1a237e;cursor:pointer;">Criticidade</button>
          <button id="tab-avalForn-conformidade" onclick="trocarAbaAvaliacaoFornecedor('conformidade')" style="flex:1;padding:10px 20px;border:none;background:none;font-size:0.88em;font-weight:700;color:#999;border-bottom:3px solid transparent;cursor:pointer;">Conformidade</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;">
          <div id="painel-avalForn-criticidade">
            <div id="fornCriticidadePreview" style="position:sticky;top:0;background:#fff;padding:0 0 14px;border-bottom:1px solid #eee;margin-bottom:16px;z-index:2;"></div>
            <div id="fornCriticidadeLista"></div>
          </div>
          <div id="painel-avalForn-conformidade" style="display:none;">
            <div id="fornNotaPreview" style="position:sticky;top:0;background:#fff;padding:0 0 14px;border-bottom:1px solid #eee;margin-bottom:16px;z-index:2;"></div>
            <div style="margin-bottom:18px;padding:14px 16px;border:1px solid #e3e6f5;background:#f7f8fd;border-radius:9px;">
              <label style="font-size:0.78em;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
                Controles aplicáveis a este fornecedor
              </label>
              <div id="fornControlesAplicaveisLista" style="display:flex;flex-wrap:wrap;gap:8px 18px;"></div>
              <div style="font-size:0.74em;color:#888;margin-top:8px;">Marque só os controles que fazem sentido para este fornecedor — só os marcados entram na avaliação e na nota.</div>
            </div>
            <div id="fornCriteriosLista"></div>
            <div style="margin-top:20px;">
              <label style="font-size:0.78em;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Observação geral (opcional)</label>
              <textarea id="fornObservacao" rows="3" placeholder="Contexto que ajuda quem for ler esta avaliação depois" style="width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.92em;font-family:inherit;"></textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost" onclick="fecharAvaliacaoFornecedor()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAvaliacaoFornecedor()" id="btnSalvarAvaliacaoForn">Salvar avaliação</button>
      </div>
    </div>`;
}

window.trocarAbaAvaliacaoFornecedor = (aba) => {
  ['conformidade', 'criticidade'].forEach((a) => {
    document.getElementById('painel-avalForn-' + a).style.display = a === aba ? 'block' : 'none';
    const btn = document.getElementById('tab-avalForn-' + a);
    btn.style.color = a === aba ? '#1a237e' : '#999';
    btn.style.borderBottom = a === aba ? '3px solid #1a237e' : '3px solid transparent';
  });
};

window.abrirAvaliacaoFornecedor = (fornecedorId) => {
  const isAdmin = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const f = fornecedoresData.find((x) => String(x.id) === String(fornecedorId));
  if (!f) return showToast('Fornecedor não encontrado.', '#c62828');

  const av = _avaliacaoDoFornecedor(f.id);
  const ativos = criteriosFornecedorData.filter(FornecedorScore.criterioAtivo)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

  document.getElementById('fornAvalId').value = f.id;
  const primeiraPessoa = (f.pessoas || [])[0];
  document.getElementById('fornDrawerTitulo').innerHTML = `${isAdmin ? (av ? 'Reavaliar' : 'Avaliar') : 'Avaliação de'} fornecedor
    <div style="font-size:0.75em;color:#555;font-weight:400;margin-top:4px;">${esc(f.nome)}${primeiraPessoa ? ' — ' + esc(primeiraPessoa.nome) : ''}</div>`;
  document.getElementById('fornObservacao').value = av ? (av.observacao || '') : '';

  const respostasAnteriores = av ? (av.respostas || {}) : {};

  // Ausencia (fornecedor nunca customizado) cai em nenhum marcado — decisao
  // explicita do usuario, nao herda "tudo aplicavel" so porque o catalogo
  // existe.
  const aplicaveisAtuais = new Set(Array.isArray(f.criteriosAplicaveis) ? f.criteriosAplicaveis : []);

  document.getElementById('fornControlesAplicaveisLista').innerHTML = ativos.length
    ? ativos.map((c) => `
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.86em;cursor:pointer;">
          <input type="checkbox" class="forn-aplicavel" value="${esc(c.id)}" ${aplicaveisAtuais.has(c.id) ? 'checked' : ''} onchange="_alternarControleAplicavelFornecedor(this)">
          ${esc(c.nome)}
        </label>`).join('')
    : '';

  document.getElementById('fornCriteriosLista').innerHTML = ativos.length
    ? ativos.map((c) => {
        const r = respostasAnteriores[c.id] || {};
        const opcoes = FornecedorScore.RESPOSTAS.map((op) => `
          <label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:0.88em;cursor:pointer;">
            <input type="radio" name="fornResp_${esc(c.id)}" value="${esc(op)}" ${String(r.resposta || '') === op ? 'checked' : ''} onchange="_atualizarEvidenciaFornecedor('${esc(c.id)}')">
            ${esc(op)}
          </label>`).join('');
        const semEvidenciaInicial = _semEvidenciaResposta(r);
        return `
          <div data-criterio="${esc(c.id)}" style="border:1px solid #eee;border-radius:9px;padding:13px 15px;margin-bottom:12px;${aplicaveisAtuais.has(c.id) ? '' : 'display:none;'}">
            <div style="font-weight:600;color:#333;">${esc(c.nome)}
              <span style="font-size:0.75em;color:#888;font-weight:400;margin-left:6px;">peso ${c.peso}</span>
            </div>
            ${c.descricao ? `<div style="font-size:0.8em;color:#888;margin-top:3px;">${esc(c.descricao)}</div>` : ''}
            <div style="margin-top:9px;">${opcoes}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="url" class="forn-link" value="${esc(r.link || '')}" placeholder="Link do documento (SharePoint, Drive, portal)" oninput="_atualizarEvidenciaFornecedor('${esc(c.id)}')" style="flex:1;padding:7px 10px;border:1px solid #e5e5e5;border-radius:6px;font-size:0.85em;">
                <a href="${esc(r.link || '')}" target="_blank" rel="noopener" class="forn-link-abrir" id="fornLinkAbrir_${esc(c.id)}" title="Abrir evidência" style="${r.link ? '' : 'display:none;'}">🔗</a>
              </div>
              <input type="text" class="forn-obs" value="${esc(r.observacao || '')}" placeholder="Observação deste critério" style="padding:7px 10px;border:1px solid #e5e5e5;border-radius:6px;font-size:0.85em;">
            </div>
            <div id="fornEvidAviso_${esc(c.id)}" style="display:${semEvidenciaInicial ? 'block' : 'none'};font-size:0.74em;color:#e65100;margin-top:6px;">⚠ Sem evidência anexada — esta resposta não conta na nota até um link ser informado</div>
          </div>`;
      }).join('')
    : `<div style="padding:24px;text-align:center;color:#e65100;background:#fff8e1;border-radius:9px;">
         Nenhum critério ativo cadastrado. Cadastre os critérios antes de avaliar.
       </div>`;

  const respostasCriticidadeAnteriores = av ? (av.respostasCriticidade || {}) : {};
  document.getElementById('fornCriticidadeLista').innerHTML = FornecedorCriticidade.PERGUNTAS.map((p) => {
    const opcoes = p.opcoes.map((op) => `
      <label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;font-size:0.88em;cursor:pointer;">
        <input type="radio" name="fornCrit_${p.chave}" value="${op.valor}" ${respostasCriticidadeAnteriores[p.chave] === op.valor ? 'checked' : ''} onchange="atualizarPreviewCriticidadeFornecedor()" style="margin-top:3px;">
        <span>${esc(op.rotulo)} <span style="color:#888;font-weight:600;">(${op.score})</span></span>
      </label>`).join('');
    return `
      <div style="border:1px solid #eee;border-radius:9px;padding:13px 15px;margin-bottom:12px;">
        <div style="font-weight:600;color:#333;margin-bottom:9px;">${esc(p.titulo)}</div>
        ${opcoes}
      </div>`;
  }).join('');

  document.querySelectorAll('#drawerFornecedor input, #drawerFornecedor textarea').forEach((el) => { el.disabled = !isAdmin; });
  document.getElementById('btnSalvarAvaliacaoForn').style.display = isAdmin && ativos.length ? 'inline-block' : 'none';

  atualizarPreviewNotaFornecedor();
  atualizarPreviewCriticidadeFornecedor();
  trocarAbaAvaliacaoFornecedor('criticidade');
  document.getElementById('drawerFornecedor').classList.add('open');
  document.getElementById('drawerOverlayFornecedor').classList.add('open');
};

window.fecharAvaliacaoFornecedor = () => {
  document.getElementById('drawerFornecedor').classList.remove('open');
  document.getElementById('drawerOverlayFornecedor').classList.remove('open');
};

/** Ids dos controles marcados como aplicáveis a este fornecedor, na tela. */
function _coletarCriteriosAplicaveisFornecedor() {
  return Array.from(document.querySelectorAll('#fornControlesAplicaveisLista .forn-aplicavel:checked')).map((el) => el.value);
}

/** Mostra/esconde o bloco de resposta do controle ao (des)marcar sua aplicabilidade. */
window._alternarControleAplicavelFornecedor = (checkbox) => {
  const bloco = document.querySelector(`#fornCriteriosLista [data-criterio="${checkbox.value}"]`);
  if (bloco) bloco.style.display = checkbox.checked ? '' : 'none';
  atualizarPreviewNotaFornecedor();
};

/** Sim/Parcial sem link: respondeu, mas nao provou -- mesma regra de FornecedorScore.calcular. */
function _semEvidenciaResposta(r) {
  const resposta = (r && r.resposta) || '';
  const temLink = !!((r && r.link) || '').trim();
  return (resposta === FornecedorScore.RESPOSTA.SIM || resposta === FornecedorScore.RESPOSTA.PARCIAL) && !temLink;
}

/**
 * Reage a cada mudanca de resposta ou de link de UM criterio: mostra/esconde
 * o aviso de evidencia faltando e o "abrir" do link, sem re-renderizar o
 * bloco inteiro (perderia o foco de quem esta digitando).
 */
window._atualizarEvidenciaFornecedor = (criterioId) => {
  const bloco = document.querySelector(`#fornCriteriosLista [data-criterio="${criterioId}"]`);
  if (bloco) {
    const marcado = bloco.querySelector(`input[name="fornResp_${criterioId}"]:checked`);
    const link = (bloco.querySelector('.forn-link')?.value || '').trim();
    const semEvidencia = _semEvidenciaResposta({ resposta: marcado ? marcado.value : '', link });

    const aviso = document.getElementById(`fornEvidAviso_${criterioId}`);
    if (aviso) aviso.style.display = semEvidencia ? 'block' : 'none';

    const abrir = document.getElementById(`fornLinkAbrir_${criterioId}`);
    if (abrir) {
      abrir.style.display = link ? '' : 'none';
      abrir.href = link;
    }
  }
  atualizarPreviewNotaFornecedor();
};

/**
 * Lê o formulário e devolve o mapa criterioId -> { resposta, link, observacao }.
 *
 * So entram os controles marcados como aplicaveis — um bloco desmarcado pode
 * ter resposta antiga guardada no DOM (de quando esteve marcado), mas ela nao
 * conta enquanto o controle nao estiver marcado de novo.
 */
function _coletarRespostasFornecedor() {
  const aplicaveis = new Set(_coletarCriteriosAplicaveisFornecedor());
  const mapa = {};
  document.querySelectorAll('#fornCriteriosLista [data-criterio]').forEach((bloco) => {
    const id = bloco.dataset.criterio;
    if (!aplicaveis.has(id)) return;
    const marcado = bloco.querySelector(`input[name="fornResp_${id}"]:checked`);
    mapa[id] = {
      resposta: marcado ? marcado.value : '',
      link: (bloco.querySelector('.forn-link')?.value || '').trim(),
      observacao: (bloco.querySelector('.forn-obs')?.value || '').trim(),
    };
  });
  return mapa;
}

/**
 * Nota ao vivo, enquanto a pessoa responde.
 *
 * E so previa: o que vale e o recalculo na gravacao, feito sobre os criterios
 * do banco — mesma razao pela qual o score do risco e recalculado no servidor.
 */
window.atualizarPreviewNotaFornecedor = () => {
  const box = document.getElementById('fornNotaPreview');
  if (!box) return;
  const idsAplicaveis = _coletarCriteriosAplicaveisFornecedor();
  if (!idsAplicaveis.length) {
    box.innerHTML = `<div style="font-size:0.85em;color:#e65100;">⚠ Nenhum controle marcado como aplicável ainda — marque ao menos um acima para avaliar este fornecedor.</div>`;
    return;
  }
  const setAplicaveis = new Set(idsAplicaveis);
  const calc = FornecedorScore.calcular(criteriosFornecedorData.filter((c) => setAplicaveis.has(c.id)), _coletarRespostasFornecedor());
  const limiar = configFornecedor.limiarRisco;
  const abre = FornecedorScore.abreRisco(calc.nota, limiar);

  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <span style="font-size:2em;font-weight:800;line-height:1;color:${calc.faixa.cor};">${calc.nota === null ? '–' : calc.nota}</span>
        ${calc.nota === null ? '' : '<span style="font-size:0.8em;color:#aaa;">de 100</span>'}
      </div>
      <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:700;background:${calc.faixa.fundo};color:${calc.faixa.cor};">${esc(calc.faixa.rotulo)}</span>
      <span style="font-size:0.78em;color:#777;">
        ${calc.respondidos} de ${calc.criteriosAtivos} critério${calc.criteriosAtivos === 1 ? '' : 's'} respondido${calc.respondidos === 1 ? '' : 's'}${calc.naoSeAplica ? ` · ${calc.naoSeAplica} fora da conta` : ''}
      </span>
    </div>
    ${calc.pendentes.length ? `<div style="font-size:0.75em;color:#e65100;margin-top:6px;">⚠ ${calc.pendentes.length} critério${calc.pendentes.length > 1 ? 's' : ''} sem resposta — a nota fica provisória até você responder tudo</div>` : ''}
    ${calc.semEvidencia.length ? `<div style="font-size:0.75em;color:#e65100;margin-top:6px;">⚠ ${calc.semEvidencia.length} critério${calc.semEvidencia.length > 1 ? 's' : ''} respondido${calc.semEvidencia.length > 1 ? 's' : ''} sem evidência — não conta${calc.semEvidencia.length > 1 ? 'm' : ''} na nota até anexar o link</div>` : ''}
    ${abre ? `<div style="font-size:0.75em;color:#c62828;margin-top:6px;">Abaixo de ${limiar}: salvar assim abre um risco automático para este fornecedor</div>` : ''}`;
};

/** Lê o formulário e devolve o mapa { dados, atividade, dependencia } -> valor da opção marcada. */
function _coletarRespostasCriticidadeFornecedor() {
  const mapa = {};
  FornecedorCriticidade.PERGUNTAS.forEach((p) => {
    const marcado = document.querySelector(`input[name="fornCrit_${p.chave}"]:checked`);
    if (marcado) mapa[p.chave] = marcado.value;
  });
  return mapa;
}

/**
 * Criticidade ao vivo, enquanto a pessoa responde. So previa: o que vale e o
 * recalculo na gravacao (mesma razao da nota de conformidade, do score do
 * risco e de tudo mais neste app que e recalculado no servidor).
 */
window.atualizarPreviewCriticidadeFornecedor = () => {
  const box = document.getElementById('fornCriticidadePreview');
  if (!box) return;
  const calc = FornecedorCriticidade.calcular(_coletarRespostasCriticidadeFornecedor());

  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <span style="font-size:2em;font-weight:800;line-height:1;color:${calc.faixa.cor};">${calc.score === null ? '–' : calc.score}</span>
        ${calc.score === null ? '' : `<span style="font-size:0.8em;color:#aaa;">de ${FornecedorCriticidade.SCORE_MAXIMO}</span>`}
      </div>
      <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:700;background:${calc.faixa.fundo};color:${calc.faixa.cor};">${esc(calc.faixa.rotulo)}</span>
    </div>
    ${calc.pendentes.length ? `<div style="font-size:0.75em;color:#e65100;margin-top:6px;">⚠ ${calc.pendentes.length} pergunta${calc.pendentes.length > 1 ? 's' : ''} sem resposta — a criticidade só existe quando as 3 forem respondidas</div>` : ''}
    ${calc.completa ? `<div style="font-size:0.72em;color:#888;margin-top:6px;">Usada como peso do risco automático deste fornecedor na carga de risco da empresa.</div>` : ''}`;
};

window.salvarAvaliacaoFornecedor = async () => {
  const fornecedorId = document.getElementById('fornAvalId').value;
  const f = fornecedoresData.find((x) => String(x.id) === String(fornecedorId));
  if (!f) return showToast('Fornecedor não encontrado.', '#c62828');

  const criteriosAplicaveis = _coletarCriteriosAplicaveisFornecedor();
  if (!criteriosAplicaveis.length) return showToast('Selecione ao menos um controle aplicável a este fornecedor.', '#c62828');

  const respostas = _coletarRespostasFornecedor();
  const calc = FornecedorScore.calcular(criteriosFornecedorData.filter((c) => criteriosAplicaveis.includes(c.id)), respostas);
  const respostasCriticidade = _coletarRespostasCriticidadeFornecedor();

  if (!calc.completa) {
    const partes = [];
    if (calc.pendentes.length) partes.push(`${calc.pendentes.length} critério(s) sem resposta`);
    if (calc.semEvidencia.length) partes.push(`${calc.semEvidencia.length} critério(s) sem evidência anexada`);
    if (!confirm(`Faltam ${partes.join(' e ')}.\n\nA avaliação vai ser gravada como incompleta e a nota fica provisória. Salvar assim mesmo?`)) return;
  }

  const btn = document.getElementById('btnSalvarAvaliacaoForn');
  btn.disabled = true;
  try {
    const r = await API.salvarAvaliacaoFornecedor({
      fornecedorId: f.id,
      fornecedorNome: f.nome,
      respostas,
      criteriosAplicaveis,
      respostasCriticidade,
      observacao: document.getElementById('fornObservacao').value.trim(),
    });
    f.criteriosAplicaveis = criteriosAplicaveis;

    // Ja sabemos exatamente o que foi gravado (r.dado) -- em vez de buscar a
    // colecao inteira de avaliacoes de novo (append-only, so cresce), so
    // atualiza este fornecedor no array ja carregado.
    const novaAvaliacao = { ...r.dado, id: r.id };
    const idx = avaliacoesFornecedorData.findIndex((av) => av.fornecedorId === novaAvaliacao.fornecedorId);
    if (idx >= 0) avaliacoesFornecedorData[idx] = novaAvaliacao; else avaliacoesFornecedorData.push(novaAvaliacao);
    fecharAvaliacaoFornecedor();
    renderizarFornecedores();

    const abre = FornecedorScore.abreRisco(r.nota, configFornecedor.limiarRisco);
    showToast(`✅ Avaliação salva!${abre ? ' Um risco será aberto para este fornecedor em alguns segundos.' : ''}`, '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  } finally {
    btn.disabled = false;
  }
};

/*
 * O risco automatico do fornecedor NAO e mais criado aqui.
 *
 * Ele e decidido e gravado no servidor, por um gatilho na propria gravacao da
 * avaliacao (functions/fornecedorRisco.js). Duas razoes: quem avalia fornecedor
 * deixou de precisar de acesso ao registro de riscos da empresa, e nao existe
 * mais caminho que grave a avaliacao e esqueca o risco.
 *
 * Como o servidor decide depois, a tela nao afirma o que aconteceu com o risco
 * — ela diz o que VAI acontecer, com base na nota, e avisa que pode levar alguns
 * segundos. Afirmar "risco gerado" antes de o servidor responder seria mentir
 * quando o gatilho falhasse.
 */

// ============================================================
// PÁGINA: PERFIS DE ACESSO
//
// Antes desta tela, cada pessoa nova era um documento digitado a mao no console
// do Firebase, e ninguem conseguia ver quem tinha qual acesso sem entrar la.
// Numa auditoria, "quem pode alterar o registro de riscos?" nao tinha resposta
// que se pudesse mostrar.
// ============================================================

let perfisData = [];
let perfisAreasCache = [];

async function perfis() {
  const podeGerenciar = Perfis.podeGerenciarPerfis(window.USER_PERFIL);
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Perfis de Acesso</h2><p class="page-sub">Quem tem qual acesso ao sistema</p></div>
      <button class="btn btn-primary" onclick="abrirModalPerfil()" id="btnNovoPerfil" style="display:none;">+ Dar acesso a alguém</button>
    </div>
    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px 16px;background:#fff;margin-bottom:18px;">
      <div style="font-size:0.72em;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">O que cada perfil pode</div>
      ${Perfis.CATALOGO.map((p) => `
        <div style="display:flex;gap:10px;margin-bottom:7px;font-size:0.86em;">
          <span style="font-weight:700;color:#1a237e;min-width:130px;">${esc(p.rotulo)}</span>
          <span style="color:#666;">${esc(p.descricao)}</span>
        </div>`).join('')}
      <div style="font-size:0.75em;color:#e65100;margin-top:10px;line-height:1.5;">
        Quem entra no sistema sem estar nesta lista recebe o menor acesso (Gestor de área) e, sem área definida, não altera nada.
        Somente administrador mexe nesta tela — se outro perfil pudesse, ele se promoveria a administrador.
      </div>
    </div>
    <div class="loading" id="loadingPerfis">⏳ Carregando...</div>
    <div id="listaPerfis"></div>
    <div class="modal-overlay" id="modalPerfil"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalPerfilTitulo">Dar acesso a alguém</h3>
      <input type="hidden" id="perfEmailOriginal">
      <label>E-mail corporativo</label>
      <input type="email" id="perfEmail" placeholder="nome@fortestecnologia.com.br">
      <label>Perfil</label>
      <select id="perfPerfil" onchange="ajustarCampoAreaPerfil()">
        ${Perfis.CATALOGO.map((p) => `<option value="${esc(p.valor)}">${esc(p.rotulo)}</option>`).join('')}
      </select>
      <span id="perfDescricao" style="font-size:0.75em;color:#888;display:block;margin-top:-6px;"></span>
      <div id="perfAreaBox">
        <label>Área</label>
        <select id="perfArea"></select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalPerfil()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPerfilAcesso()">Salvar</button>
      </div>
    </div></div>`;

  document.getElementById('btnNovoPerfil').style.display = podeGerenciar ? 'inline-block' : 'none';

  try {
    const [lista, areas] = await Promise.all([API.getPerfis(), API.getAreas()]);
    perfisData = lista;
    perfisAreasCache = areas;
  } catch (e) {
    console.error('Perfis: falha ao carregar', e);
    document.getElementById('loadingPerfis').style.display = 'none';
    document.getElementById('listaPerfis').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar os perfis.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="perfis()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingPerfis').style.display = 'none';
  renderizarPerfis();
}

function renderizarPerfis() {
  const podeGerenciar = Perfis.podeGerenciarPerfis(window.USER_PERFIL);
  const lista = document.getElementById('listaPerfis');
  if (!lista) return;

  const admins = perfisData.filter((p) => p.perfil === Perfis.PERFIL.ADMIN);
  const meuEmail = String(window.USER_EMAIL || '').toLowerCase();

  lista.innerHTML = `
    ${admins.length === 1 ? `<div style="border:1px solid #ffe0b2;background:#fff8e1;border-radius:9px;padding:12px 14px;color:#e65100;font-size:0.86em;margin-bottom:14px;">
      Existe um único administrador (${esc(admins[0].email)}). Se esse acesso for perdido, ninguém consegue dar acesso a mais ninguém sem entrar no console do Firebase.
    </div>` : ''}
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:34%;">E-mail</th>
            <th style="width:20%;">Perfil</th>
            <th style="width:20%;">Área</th>
            <th style="width:16%;">Alterado em</th>
            <th style="width:10%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${perfisData.length ? perfisData.map((p) => {
            const euMesmo = p.email === meuEmail;
            const desconhecido = p.perfilGravado && !Perfis.conhecido(p.perfilGravado);
            return `
            <tr>
              <td style="font-weight:600;">${esc(p.email)}${euMesmo ? ' <span style="font-size:0.75em;color:#888;font-weight:400;">(você)</span>' : ''}</td>
              <td>
                <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;background:${p.perfil === Perfis.PERFIL.ADMIN ? '#e8eaf6' : '#f5f5f5'};color:${p.perfil === Perfis.PERFIL.ADMIN ? '#1a237e' : '#555'};">${esc(Perfis.rotulo(p.perfil))}</span>
                ${desconhecido ? `<div style="font-size:0.72em;color:#e65100;margin-top:3px;">Gravado como "${esc(p.perfilGravado)}", que não existe — está valendo o menor acesso</div>` : ''}
              </td>
              <td style="color:#666;">${esc(p.area || (Perfis.exigeArea(p.perfil) ? '— sem área, não altera nada' : '–'))}</td>
              <td style="color:#666;font-size:0.88em;">${p.atualizadoEm ? new Date(p.atualizadoEm).toLocaleDateString('pt-BR') : '–'}</td>
              <td style="text-align:center;">
                ${podeGerenciar ? `
                  <button class="btn-icon" onclick="abrirModalPerfil('${esc(p.email)}')" title="Alterar">✏️</button>
                  ${euMesmo ? '' : `<button class="btn-icon" onclick="excluirPerfilAcesso('${esc(p.email)}')" title="Remover acesso" style="color:#c62828;">🗑️</button>`}` : '–'}
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#888;">Ninguém cadastrado. Todo mundo que entrar cai no menor acesso.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div style="font-size:0.75em;color:#999;margin-top:10px;line-height:1.5;">
      Remover alguém desta lista não bloqueia o acesso ao sistema: a pessoa volta ao menor acesso (Gestor de área) e,
      sem área, não consegue alterar nada. Para impedir a entrada, o acesso tem que ser retirado na conta Google dela.
    </div>`;
}

window.ajustarCampoAreaPerfil = () => {
  const perfil = document.getElementById('perfPerfil').value;
  const box = document.getElementById('perfAreaBox');
  const info = document.getElementById('perfDescricao');
  const cat = Perfis.CATALOGO.find((p) => p.valor === perfil);
  if (info) info.textContent = cat ? cat.descricao : '';
  if (box) box.style.display = Perfis.exigeArea(perfil) ? 'block' : 'none';
};

window.abrirModalPerfil = (email) => {
  const p = email ? perfisData.find((x) => x.email === email) : null;
  document.getElementById('modalPerfilTitulo').textContent = p ? 'Alterar acesso' : 'Dar acesso a alguém';
  document.getElementById('perfEmailOriginal').value = p ? p.email : '';
  document.getElementById('perfEmail').value = p ? p.email : '';
  document.getElementById('perfEmail').disabled = !!p;
  document.getElementById('perfPerfil').value = p ? p.perfil : Perfis.PERFIL.GESTOR;
  document.getElementById('perfArea').innerHTML = '<option value="">Selecione...</option>' +
    perfisAreasCache.map((a) => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('');
  document.getElementById('perfArea').value = p ? (p.area || '') : '';
  ajustarCampoAreaPerfil();
  document.getElementById('modalPerfil').classList.add('open');
};

window.fecharModalPerfil = () => document.getElementById('modalPerfil').classList.remove('open');

window.salvarPerfilAcesso = async () => {
  const email = document.getElementById('perfEmail').value.trim().toLowerCase();
  const perfil = document.getElementById('perfPerfil').value;
  const area = document.getElementById('perfArea').value;
  const meuEmail = String(window.USER_EMAIL || '').toLowerCase();

  // Tirar o proprio acesso de administrador deixa o sistema sem quem de acesso.
  if (email === meuEmail && !Perfis.ehAdmin(perfil)
    && !confirm('Você está retirando o seu próprio acesso de administrador.\n\nSe não houver outro administrador, ninguém mais consegue dar acesso a ninguém sem entrar no console do Firebase. Continuar?')) return;

  try {
    await API.salvarPerfilAcesso({ email, perfil, area });
    fecharModalPerfil();
    perfisData = await API.getPerfis();
    renderizarPerfis();
    showToast('✅ Acesso salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

window.excluirPerfilAcesso = async (email) => {
  if (!confirm(`Remover o acesso de ${email}?\n\nA pessoa volta ao menor acesso (Gestor de área) e, sem área, não altera nada. Isso não impede a entrada no sistema — para isso, o acesso tem que ser retirado na conta Google dela.`)) return;
  try {
    await API.excluirPerfilAcesso(email);
    perfisData = await API.getPerfis();
    renderizarPerfis();
    showToast('✅ Acesso removido.', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível remover.'), '#c62828');
  }
};

// ============================================================
// PÁGINA: FORNECEDORES — CADASTRO
//
// O fornecedor e uma linha de /dependencias com categoria Fornecedores. Esta
// tela existe para que o perfil de fornecedores cadastre, edite e apague
// fornecedor SEM ver (nem poder apagar) as outras categorias do catalogo, que
// sao do BIA: Infraestrutura, Pessoas, Sistemas e Processos Internos.
// ============================================================

const CATEGORIA_FORNECEDOR_PADRAO = 'Fornecedores';

async function fornecedoresCadastro() {
  const podeMexer = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Cadastro de Fornecedores</h2><p class="page-sub">Os fornecedores do catálogo de dependências da empresa</p></div>
      <button class="btn btn-primary" onclick="abrirModalFornecedor()" id="btnNovoFornecedor" style="display:none;">+ Novo Fornecedor</button>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end;">
      <input type="text" id="buscaFornecedorCadastro" placeholder="🔍 Buscar fornecedor..." oninput="renderizarFornecedoresCadastro()" style="padding:8px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:0.9em;min-width:280px;">
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Categoria</label>
        <select id="filtroFornCadastroCategoria" onchange="renderizarFornecedoresCadastro()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:200px;">
          <option value="">Todas as categorias</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Setor</label>
        <select id="filtroFornCadastroSetor" onchange="renderizarFornecedoresCadastro()" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:200px;">
          <option value="">Todos os setores</option>
        </select>
      </div>
    </div>
    <div class="loading" id="loadingFornCadastro">⏳ Carregando...</div>
    <div id="listaFornCadastro"></div>
    ${_htmlModalFornecedorCadastro()}`;

  document.getElementById('btnNovoFornecedor').style.display = podeMexer ? 'inline-block' : 'none';

  try {
    const [deps, avals, cats, areasFornecedor] = await Promise.all([
      API.getDependencias(), API.getAvaliacoesFornecedor(), API.getCategoriasFornecedor(), API.getAreas(),
    ]);
    fornecedoresData = deps.filter((d) => Perfis.categoriaDeFornecedor(d.categoria));
    pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
    window.areasData = areasFornecedor;
    avaliacoesFornecedorData = avals;
    categoriasFornecedorData = cats;
    // Montados uma vez so: renderizarFornecedoresCadastro() roda a cada tecla
    // da busca, e remontar as opcoes toda hora apagaria o filtro escolhido.
    document.getElementById('filtroFornCadastroCategoria').innerHTML = '<option value="">Todas as categorias</option>' +
      categoriasFornecedorData.filter((c) => c.ativo)
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
        .map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('');
    document.getElementById('filtroFornCadastroSetor').innerHTML = '<option value="">Todos os setores</option>' +
      [...window.areasData].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
        .map((a) => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('');
  } catch (e) {
    console.error('Cadastro de fornecedores: falha ao carregar', e);
    document.getElementById('loadingFornCadastro').style.display = 'none';
    document.getElementById('listaFornCadastro').innerHTML = `<div style="padding:24px;text-align:center;color:#c62828;">
      Não foi possível carregar os fornecedores.<br>
      <span style="color:#666;font-size:0.9em;">${esc(e.message || 'Erro desconhecido')}</span><br>
      <button class="btn btn-ghost" onclick="fornecedoresCadastro()" style="margin-top:12px;">Tentar de novo</button></div>`;
    return;
  }
  document.getElementById('loadingFornCadastro').style.display = 'none';
  renderizarFornecedoresCadastro();
}

function renderizarFornecedoresCadastro() {
  const podeMexer = Perfis.podeGerenciarFornecedores(window.USER_PERFIL);
  const lista = document.getElementById('listaFornCadastro');
  if (!lista) return;

  const busca = (document.getElementById('buscaFornecedorCadastro')?.value || '').toLowerCase();
  const filtroCategoria = document.getElementById('filtroFornCadastroCategoria')?.value || '';
  const filtroSetor = document.getElementById('filtroFornCadastroSetor')?.value || '';
  const data = fornecedoresData.filter((f) => !busca
    || (f.nome || '').toLowerCase().includes(busca)
    || (f.pessoas || []).some((p) => (p.nome || '').toLowerCase().includes(busca)))
    .filter((f) => !filtroCategoria || f.categoriaFornecedor === filtroCategoria)
    .filter((f) => !filtroSetor || f.setor === filtroSetor);

  lista.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width:20%;">Empresa</th>
            <th style="width:14%;">Categoria</th>
            <th style="width:18%;">Serviço prestado</th>
            <th style="width:9%;">Setor</th>
            <th style="width:16%;">Pessoas</th>
            <th style="width:9%;text-align:center;">Criticidade</th>
            <th style="width:14%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${data.length ? data.map((f) => { const av = _avaliacaoDoFornecedor(f.id); return `
            <tr>
              <td style="font-weight:600;">${esc(f.nome)}</td>
              <td style="color:#666;font-size:0.88em;">${esc(f.categoriaFornecedor || '–')}</td>
              <td style="color:#666;font-size:0.9em;">${esc(f.detalhes || '–')}</td>
              <td style="color:#666;font-size:0.88em;">${esc(f.setor || '–')}</td>
              <td style="color:#666;font-size:0.88em;">${_resumoPessoasFornecedor(f)}</td>
              <td style="text-align:center;">${_badgeCriticidadeFornecedor(av)}</td>
              <td style="text-align:center;">
                ${podeMexer ? `
                  <button class="btn-icon" onclick="abrirModalFornecedor('${esc(f.id)}')" title="Editar">✏️</button>
                  <button class="btn-icon" onclick="excluirFornecedorCadastro('${esc(f.id)}')" title="Excluir" style="color:#c62828;">🗑️</button>` : '–'}
              </td>
            </tr>`; }).join('')
            : `<tr><td colspan="7" style="padding:20px;text-align:center;color:#888;">${fornecedoresData.length ? 'Nenhum fornecedor encontrado com esses filtros.' : 'Nenhum fornecedor cadastrado ainda.'}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="font-size:0.75em;color:#999;margin-top:10px;line-height:1.5;">
      Os fornecedores daqui são os mesmos do catálogo de Dependências, categoria Fornecedores — é a lista que os processos usam
      para dizer de quem dependem. As outras categorias do catálogo (Infraestrutura, Pessoas, Sistemas, Processos Internos)
      pertencem ao BIA e não são alteradas por esta tela.
    </div>`;
}

/**
 * Modal de cadastro/edição de fornecedor.
 *
 * Compartilhado entre Cadastro (onde nasce) e Avaliação (onde também precisa
 * corrigir dado do fornecedor sem trocar de tela no meio da avaliação) — mesmo
 * HTML, mesmas funções de abrir/salvar/fechar.
 */
function _htmlModalFornecedorCadastro() {
  return `
    <div class="modal-overlay" id="modalFornecedor"><div class="modal" onclick="event.stopPropagation()" style="max-width:640px;">
      <h3 id="modalFornecedorTitulo">Novo Fornecedor</h3>
      <input type="hidden" id="fornCadId">

      <label style="font-size:0.78em;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;margin-top:4px;">Dados do fornecedor</label>
      <label>Nome da empresa</label>
      <input type="text" id="fornCadNome" placeholder="Ex: Alfa Tecnologia S.A.">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><label>CNPJ</label><input type="text" id="fornCadCnpj" placeholder="00.000.000/0000-00"></div>
        <div><label>Categoria</label><select id="fornCadCategoria"><option value="">Selecione...</option></select></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-weight:400;">
        <input type="checkbox" id="fornCadTic" checked>
        Fornecedor de TIC (Tecnologia da Informação e Comunicação)
      </label>
      <label>Serviço prestado / o que fornece</label>
      <input type="text" id="fornCadDetalhes" placeholder="Ex: hospedagem dos servidores de produção">
      <label>Endereço</label>
      <input type="text" id="fornCadEndereco" placeholder="Cidade ou endereço">

      <label style="margin-top:14px;display:block;">Pessoas associadas</label>
      <span style="font-size:0.75em;color:#888;display:block;margin-top:-6px;margin-bottom:8px;">Uma empresa pode ter mais de um contato.</span>
      <div id="pessoasFornecedorTabela"></div>
      <div style="background:#fafbff;border:1px solid #e8eaf6;border-radius:8px;padding:12px;margin-top:8px;">
        <div id="pessoaFornEdicaoAviso" style="display:none;font-size:0.8em;color:#1565c0;font-weight:600;margin-bottom:8px;">
          ✎ Editando pessoa — <a href="#" onclick="cancelarEdicaoPessoaFornecedor();return false;" style="color:#1565c0;">cancelar edição</a>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
          <input type="text" id="pessoaFornNome" placeholder="Nome da pessoa">
          <input type="text" id="pessoaFornCargo" placeholder="Cargo (ex: Comercial, Suporte)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center;">
          <input type="email" id="pessoaFornEmail" placeholder="E-mail">
          <input type="text" id="pessoaFornTelefone" placeholder="Telefone">
          <button class="btn btn-ghost" id="btnAdicionarPessoaForn" onclick="adicionarPessoaFornecedor()" style="padding:9px 14px;white-space:nowrap;">+ Adicionar</button>
        </div>
      </div>

      <label style="font-size:0.78em;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;margin-top:18px;border-top:1px solid #eee;padding-top:14px;">Dados do contratante</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label>Gestor do Contrato</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="fornCadGestorContrato" style="flex:1;"><option value="">Selecione...</option></select>
            <button type="button" class="btn-icon" onclick="_recarregarPessoasFornecedor()" title="Atualizar lista de pessoas">🔄</button>
          </div>
          <a href="#pessoas" target="_blank" style="font-size:0.74em;color:#1a237e;font-weight:600;">+ Cadastrar nova pessoa</a>
        </div>
        <div>
          <label>Setor responsável pelo contrato</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="fornCadSetor" style="flex:1;"><option value="">Selecione...</option></select>
            <button type="button" class="btn-icon" onclick="_recarregarAreasFornecedor()" title="Atualizar lista de áreas">🔄</button>
          </div>
          <a href="#areas" target="_blank" style="font-size:0.74em;color:#1a237e;font-weight:600;">+ Cadastrar nova área</a>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModalFornecedor()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarFornecedorCadastro()">Salvar</button>
      </div>
    </div></div>`;
}

window._fornecedorPessoas = [];
window._pessoaFornEditandoIndex = null;

function renderPessoasFornecedor() {
  const container = document.getElementById('pessoasFornecedorTabela');
  if (!container) return;
  const itens = window._fornecedorPessoas || [];
  if (!itens.length) { container.innerHTML = '<p style="font-size:0.85em;color:#999;">Nenhuma pessoa cadastrada.</p>'; return; }
  container.innerHTML = `<table class="data-table" style="box-shadow:none;"><tbody>` +
    itens.map((p, i) => `<tr>
        <td style="font-weight:600;color:#222;">${esc(p.nome)}</td>
        <td style="font-size:0.85em;color:#555;">${esc(p.cargo || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(p.email || '-')}</td>
        <td style="font-size:0.85em;color:#555;">${esc(p.telefone || '-')}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn-icon" onclick="editarPessoaFornecedor(${i})" title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" onclick="removerPessoaFornecedor(${i})" title="Remover" style="color:#c62828;font-weight:700;">&times;</button>
        </td>
      </tr>`).join('') + `</tbody></table>`;
}

function _limparFormularioPessoaFornecedor() {
  ['pessoaFornNome', 'pessoaFornCargo', 'pessoaFornEmail', 'pessoaFornTelefone'].forEach((id) => {
    document.getElementById(id).value = '';
  });
}

window.adicionarPessoaFornecedor = () => {
  const nome = document.getElementById('pessoaFornNome').value.trim();
  if (!nome) return showToast('Informe o nome da pessoa.', '#e65100');
  const item = {
    nome,
    cargo: document.getElementById('pessoaFornCargo').value.trim(),
    email: document.getElementById('pessoaFornEmail').value.trim(),
    telefone: document.getElementById('pessoaFornTelefone').value.trim(),
  };
  window._fornecedorPessoas = window._fornecedorPessoas || [];
  if (window._pessoaFornEditandoIndex != null) {
    window._fornecedorPessoas[window._pessoaFornEditandoIndex] = item;
    window._pessoaFornEditandoIndex = null;
    document.getElementById('pessoaFornEdicaoAviso').style.display = 'none';
    document.getElementById('btnAdicionarPessoaForn').textContent = '+ Adicionar';
  } else {
    window._fornecedorPessoas.push(item);
  }
  _limparFormularioPessoaFornecedor();
  renderPessoasFornecedor();
};

window.editarPessoaFornecedor = (idx) => {
  const p = window._fornecedorPessoas[idx];
  if (!p) return;
  window._pessoaFornEditandoIndex = idx;
  document.getElementById('pessoaFornNome').value = p.nome || '';
  document.getElementById('pessoaFornCargo').value = p.cargo || '';
  document.getElementById('pessoaFornEmail').value = p.email || '';
  document.getElementById('pessoaFornTelefone').value = p.telefone || '';
  document.getElementById('pessoaFornEdicaoAviso').style.display = 'block';
  document.getElementById('btnAdicionarPessoaForn').textContent = 'Salvar alteração';
};

window.cancelarEdicaoPessoaFornecedor = () => {
  window._pessoaFornEditandoIndex = null;
  document.getElementById('pessoaFornEdicaoAviso').style.display = 'none';
  document.getElementById('btnAdicionarPessoaForn').textContent = '+ Adicionar';
  _limparFormularioPessoaFornecedor();
};

window.removerPessoaFornecedor = (idx) => {
  window._fornecedorPessoas.splice(idx, 1);
  if (window._pessoaFornEditandoIndex === idx) window.cancelarEdicaoPessoaFornecedor();
  renderPessoasFornecedor();
};

/**
 * Popula o select de Gestor do Contrato a partir de pessoasData.
 *
 * Fornecedor antigo pode ter gestorContrato em texto livre que nao bate com
 * nenhuma pessoa cadastrada -- vira opcao extra selecionada, nunca some em
 * silencio so por abrir o modal (mesmo padrao ja usado pra Categoria).
 */
function _popularSelectPessoasFornecedor(valorAtual) {
  const sel = document.getElementById('fornCadGestorContrato');
  if (!sel) return;
  const temNaLista = pessoasData.some((p) => p.nome === valorAtual);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    pessoasData.map((p) => `<option value="${esc(p.nome)}">${esc(p.nome)}</option>`).join('') +
    (valorAtual && !temNaLista ? `<option value="${esc(valorAtual)}">${esc(valorAtual)} (não cadastrado como pessoa)</option>` : '');
  sel.value = valorAtual || '';
}

/** Mesma ideia de _popularSelectPessoasFornecedor, pro Setor responsavel (Area). */
function _popularSelectAreasFornecedor(valorAtual) {
  const sel = document.getElementById('fornCadSetor');
  if (!sel) return;
  const lista = window.areasData || [];
  const temNaLista = lista.some((a) => a.nome === valorAtual);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    lista.map((a) => `<option value="${esc(a.nome)}">${esc(a.nome)}</option>`).join('') +
    (valorAtual && !temNaLista ? `<option value="${esc(valorAtual)}">${esc(valorAtual)} (não cadastrada como área)</option>` : '');
  sel.value = valorAtual || '';
}

/**
 * Recarrega as listas de Pessoas/Areas sem fechar o modal de fornecedor.
 *
 * Existem porque "+ Cadastrar nova pessoa/área" abre em aba nova (pra nao
 * perder a edicao em andamento) -- criar o registro la nao atualiza sozinho
 * a lista desta aba.
 */
window._recarregarPessoasFornecedor = async () => {
  const atual = document.getElementById('fornCadGestorContrato').value;
  API.invalidate('getDependencias');
  const deps = await API.getDependencias();
  pessoasData = deps.filter((d) => d.categoria === 'Pessoas');
  _popularSelectPessoasFornecedor(atual);
  showToast('Lista de pessoas atualizada.', '#2e7d32');
};

window._recarregarAreasFornecedor = async () => {
  const atual = document.getElementById('fornCadSetor').value;
  API.invalidate('getAreas');
  window.areasData = await API.getAreas();
  _popularSelectAreasFornecedor(atual);
  showToast('Lista de áreas atualizada.', '#2e7d32');
};

window.abrirModalFornecedor = (id) => {
  const f = id ? fornecedoresData.find((x) => String(x.id) === String(id)) : null;
  document.getElementById('modalFornecedorTitulo').textContent = f ? 'Editar Fornecedor' : 'Novo Fornecedor';
  document.getElementById('fornCadId').value = f ? f.id : '';
  document.getElementById('fornCadNome').value = f ? (f.nome || '') : '';
  document.getElementById('fornCadCnpj').value = f ? (f.cnpj || '') : '';
  const categoriasAtivas = (categoriasFornecedorData || []).filter((c) => c.ativo);
  // Se o fornecedor ja tem uma categoria desativada/apagada, mantem ela como
  // opcao extra selecionada — senao editar o cadastro trocaria a categoria em
  // silencio so por causa da tela.
  const categoriaAtual = f && f.categoriaFornecedor;
  const temNaLista = categoriasAtivas.some((c) => c.nome === categoriaAtual);
  document.getElementById('fornCadCategoria').innerHTML = '<option value="">Selecione...</option>' +
    categoriasAtivas.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('') +
    (categoriaAtual && !temNaLista ? `<option value="${esc(categoriaAtual)}">${esc(categoriaAtual)} (inativa)</option>` : '');
  document.getElementById('fornCadCategoria').value = categoriaAtual || '';
  _popularSelectPessoasFornecedor(f ? (f.gestorContrato || '') : '');
  document.getElementById('fornCadTic').checked = f ? (f.tic !== false) : true;
  document.getElementById('fornCadDetalhes').value = f ? (f.detalhes || '') : '';
  _popularSelectAreasFornecedor(f ? (f.setor || '') : '');
  document.getElementById('fornCadEndereco').value = f ? (f.endereco || '') : '';
  window._fornecedorPessoas = f && Array.isArray(f.pessoas) ? [...f.pessoas] : [];
  window.cancelarEdicaoPessoaFornecedor();
  renderPessoasFornecedor();
  document.getElementById('modalFornecedor').classList.add('open');
};

window.fecharModalFornecedor = () => document.getElementById('modalFornecedor').classList.remove('open');

window.salvarFornecedorCadastro = async () => {
  const nome = document.getElementById('fornCadNome').value.trim();
  if (!nome) return showToast('Informe o nome do fornecedor.', '#e65100');
  const id = document.getElementById('fornCadId').value || null;

  try {
    const r = await API.salvarDependencia({
      id,
      // A categoria e sempre Fornecedores nesta tela. E o que mantem o
      // fornecedor no mesmo catalogo de que os processos dependem, e o que a
      // regra do banco exige para este perfil poder gravar.
      categoria: CATEGORIA_FORNECEDOR_PADRAO,
      nome,
      cnpj: document.getElementById('fornCadCnpj').value.trim(),
      categoriaFornecedor: document.getElementById('fornCadCategoria').value,
      gestorContrato: document.getElementById('fornCadGestorContrato').value.trim(),
      tic: document.getElementById('fornCadTic').checked,
      detalhes: document.getElementById('fornCadDetalhes').value.trim(),
      // Setor e endereco existem no catalogo e sao gravados por esta tela. Sem
      // eles no formulario, salvar aqui apagaria o que estava preenchido: a
      // gravacao regrava a linha inteira, e campo ausente vira vazio.
      setor: document.getElementById('fornCadSetor').value.trim(),
      endereco: document.getElementById('fornCadEndereco').value.trim(),
      // empresa/email/telefone soltos saem daqui: uma empresa agora pode ter
      // N pessoas, cada uma com seu proprio contato.
      pessoas: window._fornecedorPessoas || [],
    });
    fecharModalFornecedor();
    API.invalidate('getDependencias');
    // Ja sabemos exatamente o que foi gravado (r.dado) -- em vez de buscar o
    // catalogo de dependencias inteiro de novo, so atualiza este fornecedor
    // no array ja carregado. criteriosAplicaveis nao esta no que _salvarDependencia
    // grava (de proposito, para nao apagar a escolha feita na avaliacao) --
    // preserva o que ja estava em memoria.
    const existente = id ? fornecedoresData.find((x) => String(x.id) === String(id)) : null;
    const item = { ...r.dado, id: r.id, criteriosAplicaveis: existente ? existente.criteriosAplicaveis : null };
    const idx = fornecedoresData.findIndex((x) => String(x.id) === String(r.id));
    if (idx >= 0) fornecedoresData[idx] = item; else fornecedoresData.push(item);
    // O modal e compartilhado entre Cadastro e Avaliação — cada renderizador só
    // desenha se o próprio container estiver na página, então chamar os dois é
    // seguro e atualiza qualquer uma das telas de onde o modal foi aberto.
    renderizarFornecedoresCadastro();
    renderizarFornecedores();
    showToast('✅ Salvo!', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
  }
};

/**
 * Apaga o fornecedor, depois de dizer o que fica para tras.
 *
 * O fornecedor e referenciado pela avaliacao, pelo risco e pelos processos que
 * declaram depender dele. Apagar em silencio deixaria essas linhas apontando
 * para nada, e ninguem descobriria antes de precisar do dado. Entao o aviso
 * conta, com numero, o que sobra.
 */
window.excluirFornecedorCadastro = async (id) => {
  const f = fornecedoresData.find((x) => String(x.id) === String(id));
  if (!f) return;

  const temAvaliacao = avaliacoesFornecedorData.some((a) => String(a.fornecedorId) === String(id));
  const pendencias = [];
  if (temAvaliacao) pendencias.push('as avaliações já feitas continuam guardadas (elas são o histórico, e não são apagadas)');

  try {
    const riscos = await API.getRiscos();
    const n = riscos.filter((r) => String(r.fornecedor || '') === String(id)).length;
    if (n) pendencias.push(`${n} risco${n > 1 ? 's' : ''} aponta${n > 1 ? 'm' : ''} para este fornecedor e vai${n > 1 ? 'ão' : ''} ficar sem o nome dele`);
  } catch (e) {
    // Perfil de fornecedores nao le riscos. Nao poder conferir nao e motivo
    // para esconder o aviso: melhor dizer que nao foi possivel conferir.
    pendencias.push('não foi possível verificar se há riscos apontando para este fornecedor');
  }

  const aviso = `Excluir o fornecedor "${f.nome}"?\n\n${pendencias.length ? pendencias.map((p) => '• ' + p).join('\n') + '\n\n' : ''}Os processos que declaram depender dele também deixam de encontrá-lo. Continuar?`;
  if (!confirm(aviso)) return;

  try {
    await API.excluirDependencia(id);
    API.invalidate('getDependencias');
    const deps = await API.getDependencias();
    fornecedoresData = deps.filter((d) => Perfis.categoriaDeFornecedor(d.categoria));
    renderizarFornecedoresCadastro();
    showToast('✅ Fornecedor excluído.', '#2e7d32');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Não foi possível excluir.'), '#c62828');
  }
};
