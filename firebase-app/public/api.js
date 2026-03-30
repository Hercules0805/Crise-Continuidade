// ============================================================
// API CLIENT - Comunicação com Google Apps Script
// ============================================================

const API = {
  async get(action, params = {}) {
    try {
      const url = new URL(API_URL);
      url.searchParams.append('action', action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      
      console.log('API GET:', url.toString());
      const res = await fetch(url);
      console.log('Response status:', res.status);
      const text = await res.text();
      console.log('Response text:', text);
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      console.error('API GET Error:', err);
      throw err;
    }
  },

  async post(action, body) {
    try {
      const url = API_URL;
      console.log('API POST:', url);
      console.log('Action:', action);
      console.log('Body:', body);
      
      // Usar FormData nativo para multipart/form-data
      const formData = new FormData();
      formData.append('action', action);
      
      // Adicionar todos os campos do body
      Object.entries(body).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });
      
      console.log('Enviando FormData com action:', action);
      
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      
      console.log('Response status:', res.status);
      const text = await res.text();
      console.log('Response text:', text);
      
      const data = JSON.parse(text);
      console.log('Response data:', data);
      
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
