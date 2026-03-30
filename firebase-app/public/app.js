// ============================================================
// SPA - ROTEAMENTO E PÁGINAS
// ============================================================

const app = document.getElementById('app');
const pages = { questionario, perguntas, areas, processos, admin };

// Roteamento
window.addEventListener('hashchange', route);
window.addEventListener('load', route);

function route() {
  const hash = window.location.hash.slice(1) || 'questionario';
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
            <th onclick="ordenarProcessos('responsavel')" style="cursor:pointer;width:9%;">Responsável <span id="sort-responsavel"></span></th>
            <th onclick="ordenarProcessos('solucao')" style="cursor:pointer;width:8%;">Solução <span id="sort-solucao"></span></th>
            <th style="width:18%;">Descrição do Impacto</th>
            <th style="width:13%;">Dependência Crítica</th>
            <th style="width:6%;">RTO</th>
            <th style="width:6%;">RPO</th>
            <th style="width:6%;">MTPD</th>
            <th onclick="ordenarProcessos('biaHomologada')" style="cursor:pointer;width:8%;">BIA Homologada <span id="sort-biaHomologada"></span></th>
            <th style="width:6%;text-align:center;">Ações</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modal"><div class="modal" onclick="event.stopPropagation()" style="max-width:600px;">
      <h3 id="modalTitulo">Novo Processo</h3>
      <input type="hidden" id="fId">
      <label>Área</label>
      <select id="fArea"></select>
      <label>Processo de Negócio</label>
      <input type="text" id="fProcesso" placeholder="Ex: Gestão de Identidades e Acessos">
      <label>Descrição do Impacto para Indisponibilidade</label>
      <textarea id="fDescricao" rows="3" placeholder="Descreva o impacto caso o processo fique indisponível"></textarea>
      <label>Dependência Crítica</label>
      <input type="text" id="fDependencia" placeholder="Ex: Servidores de Diretório">
      <label>RTO (Tempo de Recuperação)</label>
      <input type="text" id="fRTO" placeholder="Ex: 4 horas">
      <label>RPO (Ponto de Recuperação)</label>
      <input type="text" id="fRPO" placeholder="Ex: 24 horas">
      <label>MTPD (Tempo máximo para indisponibilidade)</label>
      <input type="text" id="fMTPD" placeholder="Ex: 30 minutos">
      <label>BIA Homologada</label>
      <select id="fBiaHomologada">
        <option value="">Selecione...</option>
        <option>Sim</option>
        <option>Não</option>
        <option>Em homologação</option>
      </select>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarProcesso()">Salvar</button>
      </div>
    </div></div>`;

  const [processos, areas] = await Promise.all([API.getProcessos(), API.getAreas()]);
  
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
  ['area', 'processo', 'responsavel', 'solucao', 'biaHomologada'].forEach(col => {
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
    ? data.map(p => `<tr>
        <td>${p.area}</td>
        <td><strong>${p.processo}</strong></td>
        <td>${p.responsavelArea || p.responsavel || ''}</td>
        <td>${p.solucao || ''}</td>
        <td>${p.descricao || ''}</td>
        <td>${p.dependencia || ''}</td>
        <td>${p.rto || ''}</td>
        <td>${p.rpo || ''}</td>
        <td>${p.mtpd || ''}</td>
        <td>${p.biaHomologada || ''}</td>
        <td style="text-align:center;">
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
      </tr>`).join('')
    : `<tr><td colspan="11" style="text-align:center;color:#999;padding:40px;">${processosFiltroArea ? 'Nenhum processo encontrado para esta área.' : 'Nenhum processo cadastrado.'}</td></tr>`;
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

// ============================================================
// PÁGINA: ADMIN (simplificada - você pode expandir)
// ============================================================
async function admin() {
  app.innerHTML = '<div class="page-header"><div><h2>Painel Administrativo</h2><p class="page-sub">Em desenvolvimento...</p></div></div>';
}

// ============================================================
// PÁGINA: QUESTIONÁRIO (simplificada - você pode expandir)
// ============================================================
async function questionario() {
  app.innerHTML = '<div class="page-header"><div><h2>Questionário BIA</h2><p class="page-sub">Em desenvolvimento...</p></div></div>';
}
