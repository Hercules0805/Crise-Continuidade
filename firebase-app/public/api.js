// ============================================================
// API CLIENT - Comunicação com Google Apps Script
// ============================================================

const _cache = {};

const API = {
  async get(action, params = {}) {
    try {
      const cacheKey = action + JSON.stringify(params);
      if (_cache[cacheKey]) return _cache[cacheKey];

      const url = new URL(API_URL);
      url.searchParams.append('action', action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      const res = await fetch(url);
      const text = await res.text();
      const data = JSON.parse(text);
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

  async post(action, body) {
    try {
      const formData = new FormData();
      formData.append('action', action);
      Object.entries(body).forEach(([key, value]) => {
        if (value !== null && value !== undefined) formData.append(key, String(value));
      });
      const res = await fetch(API_URL, { method: 'POST', body: formData });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
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

  salvarPergunta: (p) => API.post('salvarPergunta', p),
  excluirPergunta: (id) => API.post('excluirPergunta', { id }),
  salvarArea: (a) => API.post('salvarArea', a),
  excluirArea: (id) => API.post('excluirArea', { id }),
  salvarProcesso: (p) => API.post('salvarProcesso', p),
  excluirProcesso: (id) => API.post('excluirProcesso', { id }),
  salvarRespostas: (respostas) => API.post('salvarRespostas', { respostas }),
};
