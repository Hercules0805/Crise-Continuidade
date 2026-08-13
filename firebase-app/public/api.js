// ============================================================
// API CLIENT - Comunicação com Google Apps Script
// ============================================================

const _cache = {};

// ============================================================
// FETCH RESILIENTE
// O Apps Script responde /exec com um 302 para
// script.googleusercontent.com/macros/echo. Esse segundo request falha de
// forma intermitente (404 / 302 sem Location), o que derrubava a leitura de
// perfil e o carregamento das telas. A correção é tentar novamente com backoff.
// Só use em requisições de LEITURA: repetir um POST duplicaria a escrita,
// porque o script já executou antes do 404 no redirect.
// ============================================================
const API_MAX_TENTATIVAS = 5;

function _apiEsperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiGetJSON(url, tentativas = API_MAX_TENTATIVAS) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    // URL nova a cada tentativa. Repetir a URL idêntica tende a reproduzir a
    // mesma falha, porque o Google reaproveita o mapeamento do redirect.
    const alvo = new URL(url);
    alvo.searchParams.set('_t', Date.now() + '-' + Math.random().toString(36).slice(2, 8));

    try {
      const res = await fetch(alvo, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const text = await res.text();
      if (!text || text.startsWith('<!') || text.startsWith('<html')) {
        throw new Error('Resposta HTML em vez de JSON');
      }
      const json = JSON.parse(text);
      if (tentativa > 1) console.info('API: recuperado na tentativa ' + tentativa + '/' + tentativas + '.');
      return json;
    } catch (err) {
      ultimoErro = err;
      if (tentativa < tentativas) {
        const espera = Math.min(300 * Math.pow(2, tentativa - 1), 2400); // 300, 600, 1200, 2400
        console.warn('API: tentativa ' + tentativa + '/' + tentativas + ' falhou (' + err.message + '). Nova tentativa em ' + espera + 'ms.');
        await _apiEsperar(espera);
      }
    }
  }

  throw new Error('Falha ao comunicar com a API após ' + tentativas + ' tentativas: ' + ultimoErro.message);
}

// Disponível para o index.html, que busca o perfil antes de carregar o app
window.apiGetJSON = apiGetJSON;

const API = {
  async get(action, params = {}) {
    try {
      const cacheKey = action + JSON.stringify(params);
      if (_cache[cacheKey]) return _cache[cacheKey];

      const url = new URL(API_URL);
      url.searchParams.append('action', action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

      const data = await apiGetJSON(url); // apiGetJSON já adiciona o cache-buster
      if (data.error) throw new Error(data.error);
      _cache[cacheKey] = data;
      return data;
    } catch (err) {
      console.error('API GET Error:', err);
      throw err;
    }
  },

  invalidate(...actions) {
    actions.forEach(a => { Object.keys(_cache).filter(k => k.startsWith(a)).forEach(k => delete _cache[k]); });
  },

  async post(action, body, options = {}) {
    try {
      const payload = { action };
      // Adicionar campos do body, serializando objetos e arrays como JSON string
      Object.entries(body).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'object') {
          payload[key] = JSON.stringify(value);
        } else {
          payload[key] = value;
        }
      });

      // Timeout configurável (padrão 120s, ações pesadas como gerarPCN usam 300s)
      const timeoutMs = options.timeout || (action === 'gerarPCN' ? 300000 : 120000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const text = await res.text();

      // O redirect do Apps Script pode falhar depois de a gravação já ter
      // ocorrido. Não repetimos automaticamente para não duplicar o registro.
      if (!res.ok || !text || text.startsWith('<!') || text.startsWith('<html')) {
        throw new Error('O servidor não retornou a confirmação (HTTP ' + res.status + '). ' +
          'A operação pode ter sido gravada. Recarregue a página e confira antes de repetir.');
      }

      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Timeout: a requisição demorou demais. Tente novamente.');
      }
      console.error('API POST Error:', err);
      throw err;
    }
  },

  // Endpoints
  getUsuarioLogado: () => API.get('getUsuarioLogado'),
  getPerguntas: () => API.get('getPerguntas'),
  getAreas: () => API.get('getAreas'),
  getProcessos: () => API.get('getProcessos'),
  getProcessosPorArea: (area) => API.get('getProcessosPorArea', { area }),
  getResumoRespostas: () => API.get('getResumoRespostas'),

  getConfigRespostas: () => API.get('getConfigRespostas'),

  salvarPergunta: (p) => API.post('salvarPergunta', p),
  excluirPergunta: (id) => API.post('excluirPergunta', { id }),
  salvarArea: (a) => API.post('salvarArea', a),
  excluirArea: (id) => API.post('excluirArea', { id }),
  salvarProcesso: (p) => API.post('salvarProcesso', p),
  excluirProcesso: (id) => API.post('excluirProcesso', { id }),
  salvarRespostas: (respostas) => API.post('salvarRespostas', { respostas }),
  salvarConfigResposta: (d) => API.post('salvarConfigResposta', d),
  excluirConfigResposta: (d) => API.post('excluirConfigResposta', d),
  getDependencias: () => API.get('getDependencias'),
  salvarDependencia: (d) => API.post('salvarDependencia', d),
  excluirDependencia: (id) => API.post('excluirDependencia', { id }),
  getComponentes: () => API.get('getComponentes'),
  salvarComponente: (d) => API.post('salvarComponente', d),
  excluirComponente: (id) => API.post('excluirComponente', { id }),
};
