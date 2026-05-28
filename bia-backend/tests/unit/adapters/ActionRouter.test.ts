import { ActionRouter } from '@adapters/controllers/ActionRouter';
import { Request, Response } from 'express';

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response & { jsonData: any } {
  const res = {
    jsonData: undefined as any,
    json(data: any) {
      res.jsonData = data;
      return res;
    },
  } as unknown as Response & { jsonData: any };
  return res;
}

describe('ActionRouter', () => {
  let router: ActionRouter;

  beforeEach(() => {
    router = new ActionRouter();
  });

  describe('registerGet / registerPost', () => {
    it('should register GET handlers', () => {
      router.registerGet('getPerguntas', async () => ({ perguntas: [] }));
      expect(router.getRegisteredGetActions()).toContain('getPerguntas');
    });

    it('should register POST handlers', () => {
      router.registerPost('salvarPergunta', async () => ({ success: true }));
      expect(router.getRegisteredPostActions()).toContain('salvarPergunta');
    });
  });

  describe('handleGet', () => {
    it('should return error when action is missing', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(res.jsonData).toEqual({ error: 'Action não especificada' });
    });

    it('should return error when action is not recognized', async () => {
      const req = mockRequest({ query: { action: 'unknownAction' } });
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(res.jsonData).toEqual({ error: 'Action não reconhecida: unknownAction' });
    });

    it('should dispatch to registered GET handler', async () => {
      router.registerGet('getAreas', async () => ({ areas: ['TI', 'RH'] }));

      const req = mockRequest({ query: { action: 'getAreas' } });
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(res.jsonData).toEqual({ areas: ['TI', 'RH'] });
    });

    it('should pass query params to handler', async () => {
      let receivedParams: Record<string, string> = {};
      router.registerGet('getProcessosPorArea', async (params) => {
        receivedParams = params;
        return { processos: [] };
      });

      const req = mockRequest({ query: { action: 'getProcessosPorArea', area: 'TI' } });
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(receivedParams.area).toBe('TI');
    });

    it('should pass userEmail to handler', async () => {
      let receivedEmail: string | undefined;
      router.registerGet('getPerfil', async (_params, userEmail) => {
        receivedEmail = userEmail;
        return { perfil: {} };
      });

      const req = mockRequest({ query: { action: 'getPerfil' } });
      (req as any).userEmail = 'user@fortestecnologia.com.br';
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(receivedEmail).toBe('user@fortestecnologia.com.br');
    });

    it('should return internal error when handler throws', async () => {
      router.registerGet('getPerguntas', async () => {
        throw new Error('Database connection failed');
      });

      const req = mockRequest({ query: { action: 'getPerguntas' } });
      const res = mockResponse();

      await router.handleGet(req, res);

      expect(res.jsonData).toEqual({ error: 'Erro interno do servidor.' });
    });
  });

  describe('handlePost', () => {
    it('should return error when action is missing from body', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ error: 'Action não especificada' });
    });

    it('should return error when action is not recognized', async () => {
      const req = mockRequest({ body: { action: 'unknownPost' } });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ error: 'Action não reconhecida: unknownPost' });
    });

    it('should dispatch to registered POST handler', async () => {
      router.registerPost('salvarArea', async (data) => ({ success: true, id: 'new-id' }));

      const req = mockRequest({ body: { action: 'salvarArea', nome: 'TI' } });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ success: true, id: 'new-id' });
    });

    it('should pass body data to handler', async () => {
      let receivedData: any;
      router.registerPost('salvarPergunta', async (data) => {
        receivedData = data;
        return { success: true };
      });

      const req = mockRequest({ body: { action: 'salvarPergunta', pergunta: 'Test?', categoria: 'cat1' } });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(receivedData.pergunta).toBe('Test?');
      expect(receivedData.categoria).toBe('cat1');
    });

    it('should pass userEmail to handler', async () => {
      let receivedEmail: string | undefined;
      router.registerPost('salvarProcesso', async (_data, userEmail) => {
        receivedEmail = userEmail;
        return { success: true };
      });

      const req = mockRequest({ body: { action: 'salvarProcesso' } });
      (req as any).userEmail = 'admin@fortestecnologia.com.br';
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(receivedEmail).toBe('admin@fortestecnologia.com.br');
    });

    it('should parse string body as JSON (legacy text/plain support)', async () => {
      router.registerPost('salvarArea', async (data) => ({ success: true, nome: data.nome }));

      const req = mockRequest({ body: JSON.stringify({ action: 'salvarArea', nome: 'Financeiro' }) });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ success: true, nome: 'Financeiro' });
    });

    it('should handle invalid JSON string body gracefully', async () => {
      const req = mockRequest({ body: 'not valid json{' });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ error: 'Action não especificada' });
    });

    it('should return internal error when handler throws', async () => {
      router.registerPost('excluirArea', async () => {
        throw new Error('Constraint violation');
      });

      const req = mockRequest({ body: { action: 'excluirArea', id: 'some-id' } });
      const res = mockResponse();

      await router.handlePost(req, res);

      expect(res.jsonData).toEqual({ error: 'Erro interno do servidor.' });
    });
  });

  describe('action registration lists', () => {
    it('should track all 10 registered GET actions', () => {
      const getActions = [
        'getPerguntas', 'getAreas', 'getProcessos', 'getProcessosPorArea',
        'getResumoRespostas', 'getConfigRespostas', 'getPerfil',
        'getDependencias', 'validarToken', 'validarTokenArea'
      ];

      getActions.forEach(action => {
        router.registerGet(action, async () => ({}));
      });

      expect(router.getRegisteredGetActions()).toHaveLength(10);
      getActions.forEach(action => {
        expect(router.getRegisteredGetActions()).toContain(action);
      });
    });

    it('should track all 16 registered POST actions', () => {
      const postActions = [
        'salvarPergunta', 'excluirPergunta', 'salvarArea', 'excluirArea',
        'salvarProcesso', 'excluirProcesso', 'salvarRespostas',
        'salvarRespostasToken', 'salvarRespostasArea', 'gerarToken',
        'gerarTokenArea', 'gerarRelatorioArea', 'salvarConfigResposta',
        'excluirConfigResposta', 'salvarDependencia', 'excluirDependencia'
      ];

      postActions.forEach(action => {
        router.registerPost(action, async () => ({}));
      });

      expect(router.getRegisteredPostActions()).toHaveLength(16);
      postActions.forEach(action => {
        expect(router.getRegisteredPostActions()).toContain(action);
      });
    });
  });
});
