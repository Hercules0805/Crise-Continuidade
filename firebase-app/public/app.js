// ============================================================
// SPA - ROTEAMENTO E PÁGINAS
// ============================================================

const app = document.getElementById('app');
const pages = { processos, perguntas, areas, admin };

// Roteamento
window.addEventListener('hashchange', route);
window.addEventListener('load', route);

function route() {
  const hash = window.location.hash.slice(1) || 'processos';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === hash));
  const page = pages[hash] || pages.questionario;
  page();
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
      <div><h2>Perguntas do Questionário</h2><p class="page-sub">Gerencie as perguntas exibidas no formulário BIA</p></div>
      <button class="btn btn-primary" onclick="abrirModalPergunta()">+ Nova Pergunta</button>
    </div>
    <div class="loading" id="loading">⏳ Carregando...</div>
    <div id="lista"></div>
    <div class="modal-overlay" id="modal"><div class="modal" onclick="event.stopPropagation()">
      <h3 id="modalTitulo">Nova Pergunta</h3>
      <input type="hidden" id="fId">
      <label>Categoria</label>
      <select id="fCategoria">
        <option>Impacto na Operação e Missão</option>
        <option>Impacto Financeiro</option>
        <option>Impacto Jurídico e Regulatório</option>
        <option>Impacto Reputacional</option>
      </select>
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
window.fecharModal = () => document.getElementById('modal').classList.remove('open');

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
let processosOrdenacao = { coluna: 'area', direcao: 'asc' };
let processosFiltroArea = '';

async function processos() {
  app.innerHTML = `
    <div class="page-header">
      <div><h2>Processos de Negócio</h2><p class="page-sub">Cadastre os processos críticos de cada área</p></div>
      <button class="btn btn-primary" onclick="abrirModalProcesso()">+ Novo Processo</button>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:0.9em;font-weight:600;color:#555;margin-bottom:6px;display:block;">Filtrar por Área:</label>
      <select id="filtroArea" onchange="filtrarPorArea(this.value)" style="padding:8px 12px;border:1px solid #ddd;border-radius:7px;font-size:0.9em;min-width:250px;">
        <option value="">Todas as áreas</option>
      </select>
    </div>
    <div class="loading">⏳ Carregando...</div>
    <div class="data-table" id="lista" style="display:none;">
      <table>
        <thead>
          <tr>
            <th onclick="ordenarProcessos('area')" style="cursor:pointer;width:10%;">Área <span id="sort-area"></span></th>
            <th onclick="ordenarProcessos('processo')" style="cursor:pointer;width:14%;">Processo de Negócio <span id="sort-processo"></span></th>
            <th onclick="ordenarProcessos('status')" style="cursor:pointer;width:8%;">Status <span id="sort-status"></span></th>
            <th onclick="ordenarProcessos('responsavel')" style="cursor:pointer;width:9%;">Responsável <span id="sort-responsavel"></span></th>
            <th onclick="ordenarProcessos('solucao')" style="cursor:pointer;width:8%;">Solução <span id="sort-solucao"></span></th>
            <th style="width:6%;text-align:center;">Ações</th>
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
    <div class="modal-overlay" id="modalAvaliar"><div class="modal" onclick="event.stopPropagation()" style="max-width:700px;max-height:90vh;overflow-y:auto;">
      <h3>Avaliar Processo</h3>
      <p id="modalAvaliarNome" style="color:#666;margin-bottom:20px;font-size:0.95em;"></p>
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
        <button class="btn btn-ghost" onclick="fecharModalAvaliar()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAvaliacaoProcesso()">Salvar Avaliação</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="modal"><div class="modal" onclick="event.stopPropagation()" style="max-width:620px;">
      <h3 id="modalTitulo" style="font-size:1.15em;font-weight:700;color:#1a237e;border-bottom:2px solid #e8eaf6;padding-bottom:12px;margin-bottom:20px;">Novo Processo</h3>
      <input type="hidden" id="fId">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Área</label>
          <select id="fArea" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;"></select>
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">BIA Homologada</label>
          <select id="fBiaHomologada" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;">
            <option value="">Selecione...</option>
            <option>Sim</option>
            <option>Não</option>
            <option>Em homologação</option>
            <option>Não necessário</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Processo de Negócio</label>
        <input type="text" id="fProcesso" placeholder="Ex: Gestão de Identidades e Acessos" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Descrição do Impacto para Indisponibilidade</label>
        <textarea id="fDescricao" rows="3" placeholder="Descreva o impacto caso o processo fique indisponível" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;resize:vertical;box-sizing:border-box;"></textarea>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">Dependência Crítica</label>
        <input type="text" id="fDependencia" placeholder="Ex: Servidores de Diretório, Active Directory" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;">
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RTO</label>
          <input type="text" id="fRTO" placeholder="Ex: 4 horas" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <span style="font-size:0.75em;color:#888;margin-top:3px;display:block;">Tempo de Recuperação</span>
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">RPO</label>
          <input type="text" id="fRPO" placeholder="Ex: 24 horas" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <span style="font-size:0.75em;color:#888;margin-top:3px;display:block;">Ponto de Recuperação</span>
        </div>
        <div>
          <label style="display:block;font-size:0.78em;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px;">MTPD</label>
          <input type="text" id="fMTPD" placeholder="Ex: 30 minutos" style="width:100%;padding:9px 12px;border:1.5px solid #e0e0e0;border-radius:7px;font-size:0.93em;box-sizing:border-box;">
          <span style="font-size:0.75em;color:#888;margin-top:3px;display:block;">Máx. Indisponibilidade</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarProcesso()">Salvar</button>
      </div>
    </div></div>`;

  const [processos, areas, perguntas] = await Promise.all([API.getProcessos(), API.getAreas(), API.getPerguntas()]);
  window.processosPerguntas = perguntas.filter(p => p.ativa);
  
  // Preencher filtro de áreas
  const filtroArea = document.getElementById('filtroArea');
  const areasUnicas = [...new Set(areas.map(a => a.nome))].sort();
  filtroArea.innerHTML = '<option value="">Todas as áreas</option>' + 
    areasUnicas.map(a => `<option value="${a}">${a}</option>`).join('');
  
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
  
  // Ordenar
  data.sort((a, b) => {
    const valA = (a[processosOrdenacao.coluna] || '').toString().toLowerCase();
    const valB = (b[processosOrdenacao.coluna] || '').toString().toLowerCase();
    const comparacao = valA.localeCompare(valB);
    return processosOrdenacao.direcao === 'asc' ? comparacao : -comparacao;
  });
  
  // Atualizar indicadores de ordenação
  ['area', 'processo', 'status', 'responsavel', 'solucao', 'biaHomologada'].forEach(col => {
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
        const status = p.score >= 12 ? 'Tier 1 (Crítico)' : p.score >= 6 ? 'Tier 2 (Essencial)' : p.score > 0 ? 'Tier 3 (Suporte)' : 'Pendente';
        const statusColor = p.score >= 12 ? '#c62828' : p.score >= 6 ? '#f57c00' : p.score > 0 ? '#1565c0' : '#999';
        return `<tr style="cursor:pointer;" onclick="verDetalhesProcesso(${p.id})">
        <td>${p.area}</td>
        <td><strong>${p.processo}</strong></td>
        <td><span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:0.8em;font-weight:600;color:white;background:${statusColor};">${status}</span></td>
        <td>${p.responsavelArea || p.responsavel || ''}</td>
        <td>${p.solucao || ''}</td>
        <td style="text-align:center;" onclick="event.stopPropagation();">
          <button class="btn-icon" onclick="avaliarProcesso(${p.id})" title="Avaliar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a237e" stroke-width="2">
              <path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="editarProcesso(${p.id})" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" onclick="excluirProcesso(${p.id})" title="Excluir">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#999;padding:40px;">${processosFiltroArea ? 'Nenhum processo encontrado para esta área.' : 'Nenhum processo cadastrado.'}</td></tr>`;
}

window.filtrarPorArea = (area) => {
  processosFiltroArea = area;
  renderizarProcessos();
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

window.abrirModalProcesso = (p) => {
  // Preencher dropdown de áreas
  const selectArea = document.getElementById('fArea');
  selectArea.innerHTML = '<option value="">Selecione...</option>' + 
    window.areasDisponiveis.map(a => `<option value="${a.nome}">${a.nome}</option>`).join('');
  
  document.getElementById('fId').value = p ? p.id : '';
  document.getElementById('fArea').value = p ? p.area : '';
  document.getElementById('fProcesso').value = p ? p.processo : '';
  document.getElementById('fDescricao').value = p ? p.descricao : '';
  document.getElementById('fDependencia').value = p ? p.dependencia : '';
  document.getElementById('fRTO').value = p ? p.rto : '';
  document.getElementById('fRPO').value = p ? p.rpo : '';
  document.getElementById('fMTPD').value = p ? p.mtpd : '';
  document.getElementById('fBiaHomologada').value = p ? p.biaHomologada : '';
  document.getElementById('modalTitulo').textContent = p ? 'Editar Processo' : 'Novo Processo';
  document.getElementById('modal').classList.add('open');
};

window.editarProcesso = (id) => abrirModalProcesso(window.processosData.find(p => p.id === id));

window.salvarProcesso = async () => {
  const p = {
    id: document.getElementById('fId').value ? Number(document.getElementById('fId').value) : null,
    area: document.getElementById('fArea').value.trim(),
    processo: document.getElementById('fProcesso').value.trim(),
    responsavel: '',
    descricao: document.getElementById('fDescricao').value.trim(),
    dependencia: document.getElementById('fDependencia').value.trim(),
    rto: document.getElementById('fRTO').value.trim(),
    rpo: document.getElementById('fRPO').value.trim(),
    mtpd: document.getElementById('fMTPD').value.trim(),
    biaHomologada: document.getElementById('fBiaHomologada').value.trim(),
  };
  
  console.log('Dados do processo a salvar:', p);
  
  if (!p.area) return showToast('Selecione a área.', '#e65100');
  if (!p.processo) return showToast('Informe o processo.', '#e65100');
  
  try {
    console.log('Chamando API.salvarProcesso...');
    const result = await API.salvarProcesso(p);
    console.log('Resultado:', result);
    fecharModal();
    showToast('✅ Salvo!', '#2e7d32');
    processos();
  } catch (err) {
    console.error('Erro ao salvar processo:', err);
    showToast('❌ Erro ao salvar: ' + err.message, '#c62828');
  }
};

window.excluirProcesso = async (id) => {
  if (!confirm('Excluir este processo?')) return;
  await API.excluirProcesso(id);
  showToast('🗑️ Excluído.', '#555');
  processos();
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
  document.getElementById('modalAvaliarNome').textContent = `${p.area} > ${p.processo}`;
  const container = document.getElementById('perguntas-container');
  container.innerHTML = window.processosPerguntas.map((perg, i) => `
    <div style="margin-bottom:32px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #1a237e;">
      <div style="font-weight:600;color:#1a237e;margin-bottom:6px;font-size:0.95em;">${perg.pergunta}</div>
      <div style="font-size:0.85em;color:#666;margin-bottom:16px;line-height:1.5;">${perg.descricao || ''}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;" onmouseover="this.style.borderColor='#c62828'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="3" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#c62828';this.parentElement.style.background='#ffebee';" style="margin-right:8px;width:18px;height:18px;"><span style="color:#c62828;font-weight:600;font-size:0.9em;">Alto (3)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;" onmouseover="this.style.borderColor='#f57c00'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="2" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#f57c00';this.parentElement.style.background='#fff3e0';" style="margin-right:8px;width:18px;height:18px;"><span style="color:#f57c00;font-weight:600;font-size:0.9em;">Médio (2)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;" onmouseover="this.style.borderColor='#2e7d32'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="1" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#2e7d32';this.parentElement.style.background='#e8f5e9';" style="margin-right:8px;width:18px;height:18px;"><span style="color:#2e7d32;font-weight:600;font-size:0.9em;">Baixo (1)</span>
        </label>
        <label style="display:flex;align-items:center;padding:12px;background:white;border:2px solid #e0e0e0;border-radius:6px;cursor:pointer;" onmouseover="this.style.borderColor='#757575'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='#e0e0e0'">
          <input type="radio" name="pergunta${i}" value="0" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#757575';this.parentElement.style.background='#f5f5f5';" style="margin-right:8px;width:18px;height:18px;"><span style="color:#757575;font-weight:600;font-size:0.9em;">N/A (0)</span>
        </label>
      </div>
    </div>
  `).join('');
  calcularScore();
  // Pré-selecionar respostas anteriores
  if (p.respostas && p.respostas.length > 0) {
    window.processosPerguntas.forEach((perg, i) => {
      const val = p.respostas[i];
      if (val !== undefined) {
        const radio = document.querySelector(`input[name="pergunta${i}"][value="${val}"]`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
      }
    });
    calcularScore();
  }
  document.getElementById('modalAvaliar').classList.add('open');
};

window.fecharModalAvaliar = () => document.getElementById('modalAvaliar').classList.remove('open');

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

  document.getElementById('loading').style.display = 'none';
  document.getElementById('painel').style.display = 'block';

  const total = processos.length;
  const avaliados = processos.filter(p => p.score > 0).length;
  const pendentes = total - avaliados;
  const tier1 = processos.filter(p => p.score >= 12).length;
  const tier2 = processos.filter(p => p.score >= 6 && p.score < 12).length;
  const tier3 = processos.filter(p => p.score > 0 && p.score < 6).length;
  const pct = total > 0 ? Math.round((avaliados / total) * 100) : 0;

  // Resumo por área
  const porArea = areas.map(a => {
    const procs = processos.filter(p => p.area === a.nome);
    const aval = procs.filter(p => p.score > 0).length;
    const t1 = procs.filter(p => p.score >= 12).length;
    const t2 = procs.filter(p => p.score >= 6 && p.score < 12).length;
    const t3 = procs.filter(p => p.score > 0 && p.score < 6).length;
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
    <div class="loading" id="loading">⏳ Carregando...</div>
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
          <input type="radio" name="pergunta${i}" value="3" onchange="calcularScore();this.parentElement.parentElement.querySelectorAll('label').forEach(l=>{l.style.borderColor='#e0e0e0';l.style.background='white';});this.parentElement.style.borderColor='#c62828';this.parentElement.style.background='#ffebee';" style="margin-right:8px;width:18px;height:18px;">
          <span style="color:#c62828;font-weight:600;font-size:0.9em;">Alto (3)</span>
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
  } else if (total > 0) {
    tier = 'Tier 3 (Suporte)';
    tierColor = '#bbdefb';
  } else {
    tier = '-';
    tierColor = 'rgba(255,255,255,0.2)';
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
  try {
    const formData = new FormData();
    formData.append('action', 'salvarRespostas');
    formData.append('area', area);
    formData.append('processo', processo);
    formData.append('scores', JSON.stringify(scores));
    const res = await fetch(API_URL, { method: 'POST', body: formData });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    if (window.processosPerguntas) {
      fecharModalAvaliar();
      showToast('✅ Avaliação salva com sucesso!', '#2e7d32');
      processos();
    } else {
      fecharModalQuestionario();
      showToast('✅ Avaliação salva com sucesso!', '#2e7d32');
    }
  } catch (err) {
    showToast('❌ Erro ao salvar: ' + err.message, '#c62828');
  }
};
