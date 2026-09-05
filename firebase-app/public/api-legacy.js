// ============================================================
// LEGACY API CLIENT - Google Apps Script
//
// Mantido apenas para as ações RESIDUAIS que continuam no Apps Script:
// geração/salvamento/exclusão de PCN (Drive), envio de e-mail, integração
// Gemini e tokens de avaliação externa (até a Task 8 movê-los).
//
// Expõe o objeto LegacyAPI (get/post) usado pelo api.js como fallback.
// A migração dos dados para o Firestore está em api.js.
// ============================================================

const _legacyCache = {};

const API_MAX_TENTATIVAS = 5;

function _apiEsperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGetJSON(url, tentativas = API_MAX_TENTATIVAS) {
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
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
        const espera = Math.min(300 * Math.pow(2, tentativa - 1), 2400);
        console.warn('API: tentativa ' + tentativa + '/' + tentativas + ' falhou (' + err.message + '). Nova tentativa em ' + espera + 'ms.');
        await _apiEsperar(espera);
      }
    }
  }

  throw new Error('Falha ao comunicar com a API após ' + tentativas + ' tentativas: ' + ultimoErro.message);
}

// Ainda usado por algumas telas que buscam dados residuais diretamente.
window.apiGetJSON = apiGetJSON;

const LegacyAPI = {
  async get(action, params = {}) {
    try {
      const cacheKey = action + JSON.stringify(params);
      if (_legacyCache[cacheKey]) return _legacyCache[cacheKey];

      const url = new URL(API_URL);
      url.searchParams.append('action', action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

      const data = await apiGetJSON(url);
      if (data.error) throw new Error(data.error);
      _legacyCache[cacheKey] = data;
      return data;
    } catch (err) {
      console.error('LegacyAPI GET Error:', err);
      throw err;
    }
  },

  invalidate(...actions) {
    actions.forEach((a) => {
      Object.keys(_legacyCache)
        .filter((k) => k.startsWith(a))
        .forEach((k) => delete _legacyCache[k]);
    });
  },

  async post(action, body, options = {}) {
    try {
      const payload = { action };
      Object.entries(body).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'object') {
          payload[key] = JSON.stringify(value);
        } else {
          payload[key] = value;
        }
      });

      const timeoutMs = options.timeout || (action === 'gerarPCN' ? 300000 : 120000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await res.text();

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
      console.error('LegacyAPI POST Error:', err);
      throw err;
    }
  },
};

window.LegacyAPI = LegacyAPI;
