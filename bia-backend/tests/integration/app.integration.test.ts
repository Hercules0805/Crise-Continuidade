import express from 'express';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { ActionRouter } from '../../src/adapters/controllers/ActionRouter';
import { corsMiddleware } from '../../src/adapters/middleware/corsMiddleware';
import { createAuthMiddleware } from '../../src/adapters/middleware/authMiddleware';
import { errorHandler } from '../../src/adapters/middleware/errorHandler';

// Controllers
import { PerguntaController } from '../../src/adapters/controllers/PerguntaController';
import { AreaController } from '../../src/adapters/controllers/AreaController';
import { ProcessoController } from '../../src/adapters/controllers/ProcessoController';
import { EvaluationController } from '../../src/adapters/controllers/EvaluationController';
import { TokenController } from '../../src/adapters/controllers/TokenController';
import { ReportController } from '../../src/adapters/controllers/ReportController';
import { ConfigController } from '../../src/adapters/controllers/ConfigController';
import { DependenciaController } from '../../src/adapters/controllers/DependenciaController';

// Use Cases
import { PerguntaCrudUseCase } from '../../src/use-cases/crud/PerguntaCrudUseCase';
import { AreaCrudUseCase } from '../../src/use-cases/crud/AreaCrudUseCase';
import { ProcessoCrudUseCase } from '../../src/use-cases/crud/ProcessoCrudUseCase';
import { DependenciaCrudUseCase } from '../../src/use-cases/crud/DependenciaCrudUseCase';
import { ConfigRespostaCrudUseCase } from '../../src/use-cases/crud/ConfigRespostaCrudUseCase';
import { SalvarRespostasUseCase } from '../../src/use-cases/evaluation/SalvarRespostasUseCase';
import { SalvarRespostasTokenUseCase } from '../../src/use-cases/evaluation/SalvarRespostasTokenUseCase';
import { SalvarRespostasAreaUseCase } from '../../src/use-cases/evaluation/SalvarRespostasAreaUseCase';
import { GetResumoRespostasUseCase } from '../../src/use-cases/evaluation/GetResumoRespostasUseCase';
import { GerarTokenUseCase } from '../../src/use-cases/token/GerarTokenUseCase';
import { GerarTokenAreaUseCase } from '../../src/use-cases/token/GerarTokenAreaUseCase';
import { ValidarTokenUseCase } from '../../src/use-cases/token/ValidarTokenUseCase';
import { ValidarTokenAreaUseCase } from '../../src/use-cases/token/ValidarTokenAreaUseCase';
import { GerarRelatorioAreaUseCase } from '../../src/use-cases/report/GerarRelatorioAreaUseCase';
import { GetPerfilUseCase } from '../../src/use-cases/profile/GetPerfilUseCase';

// Domain types
import { Area, Processo, Pergunta, Token, RespostaBia, Dependencia, ConfigResposta, ConfigPerfil } from '../../src/domain/entities';
import { DomainEvent } from '../../src/domain/events/DomainEvent';

// Interfaces
import { IAreaRepository } from '../../src/use-cases/interfaces/IAreaRepository';
import { IProcessoRepository } from '../../src/use-cases/interfaces/IProcessoRepository';
import { IPerguntaRepository } from '../../src/use-cases/interfaces/IPerguntaRepository';
import { ITokenRepository } from '../../src/use-cases/interfaces/ITokenRepository';
import { IRespostaBiaRepository } from '../../src/use-cases/interfaces/IRespostaBiaRepository';
import { IDependenciaRepository } from '../../src/use-cases/interfaces/IDependenciaRepository';
import { IConfigRespostaRepository } from '../../src/use-cases/interfaces/IConfigRespostaRepository';
import { IConfigPerfilRepository } from '../../src/use-cases/interfaces/IConfigPerfilRepository';
import { IEmailService } from '../../src/use-cases/interfaces/IEmailService';
import { IEventBus } from '../../src/use-cases/interfaces/IEventBus';

// --- In-Memory Repository Implementations ---

class InMemoryAreaRepository implements IAreaRepository {
  private areas: Map<string, Area> = new Map();

  async findAll(): Promise<Area[]> {
    return Array.from(this.areas.values());
  }

  async findById(id: string): Promise<Area | null> {
    return this.areas.get(id) || null;
  }

  async findByNome(nome: string): Promise<Area | null> {
    return Array.from(this.areas.values()).find(a => a.nome === nome) || null;
  }

  async save(area: Area): Promise<Area> {
    if (!area.id) {
      area.id = uuidv4();
      area.created_at = new Date();
      area.updated_at = new Date();
    } else {
      area.updated_at = new Date();
    }
    this.areas.set(area.id, area);
    return area;
  }

  async delete(id: string): Promise<void> {
    this.areas.delete(id);
  }
}

class InMemoryProcessoRepository implements IProcessoRepository {
  private processos: Map<string, Processo> = new Map();

  async findAll(): Promise<Processo[]> {
    return Array.from(this.processos.values());
  }

  async findByArea(areaName: string): Promise<Processo[]> {
    return Array.from(this.processos.values()).filter(p => p.area_id === areaName);
  }

  async findById(id: string): Promise<Processo | null> {
    return this.processos.get(id) || null;
  }

  async save(processo: Processo): Promise<Processo> {
    if (!processo.id) {
      processo.id = uuidv4();
      processo.created_at = new Date();
      processo.updated_at = new Date();
    } else {
      processo.updated_at = new Date();
    }
    this.processos.set(processo.id, processo);
    return processo;
  }

  async delete(id: string): Promise<void> {
    this.processos.delete(id);
  }

  async updateTierAndRto(id: string, tier: string, rto: string): Promise<void> {
    const processo = this.processos.get(id);
    if (processo) {
      processo.tier = tier;
      processo.rto = rto;
    }
  }
}

class InMemoryPerguntaRepository implements IPerguntaRepository {
  private perguntas: Map<string, Pergunta> = new Map();

  async findAll(): Promise<Pergunta[]> {
    return Array.from(this.perguntas.values());
  }

  async findActive(): Promise<Pergunta[]> {
    return Array.from(this.perguntas.values()).filter(p => p.ativa);
  }

  async save(pergunta: Pergunta): Promise<Pergunta> {
    if (!pergunta.id) {
      pergunta.id = uuidv4();
      pergunta.created_at = new Date();
      pergunta.updated_at = new Date();
    } else {
      pergunta.updated_at = new Date();
    }
    this.perguntas.set(pergunta.id, pergunta);
    return pergunta;
  }

  async delete(id: string): Promise<void> {
    this.perguntas.delete(id);
  }
}

class InMemoryTokenRepository implements ITokenRepository {
  private tokens: Map<string, Token> = new Map();

  async findByToken(token: string): Promise<Token | null> {
    return this.tokens.get(token) || null;
  }

  async save(token: Token): Promise<Token> {
    this.tokens.set(token.id, token);
    return token;
  }

  async markAsUsed(id: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) {
      token.usado = true;
    }
  }
}

class InMemoryRespostaBiaRepository implements IRespostaBiaRepository {
  private respostas: RespostaBia[] = [];

  async findByProcesso(processoId: string): Promise<RespostaBia[]> {
    return this.respostas.filter(r => r.processo_id === processoId);
  }

  async findLatestByProcesso(processoId: string): Promise<RespostaBia | null> {
    const filtered = this.respostas.filter(r => r.processo_id === processoId);
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  async findAll(): Promise<RespostaBia[]> {
    return [...this.respostas];
  }

  async save(resposta: RespostaBia): Promise<RespostaBia> {
    if (!resposta.id) {
      resposta.id = uuidv4();
      resposta.created_at = new Date();
    }
    this.respostas.push(resposta);
    return resposta;
  }
}

class InMemoryDependenciaRepository implements IDependenciaRepository {
  private dependencias: Map<string, Dependencia> = new Map();

  async findAll(): Promise<Dependencia[]> {
    return Array.from(this.dependencias.values());
  }

  async save(dependencia: Dependencia): Promise<Dependencia> {
    if (!dependencia.id) {
      dependencia.id = uuidv4();
      dependencia.created_at = new Date();
      dependencia.updated_at = new Date();
    } else {
      dependencia.updated_at = new Date();
    }
    this.dependencias.set(dependencia.id, dependencia);
    return dependencia;
  }

  async delete(id: string): Promise<void> {
    this.dependencias.delete(id);
  }
}

class InMemoryConfigRespostaRepository implements IConfigRespostaRepository {
  private configs: Map<string, ConfigResposta> = new Map();

  async findAll(): Promise<ConfigResposta[]> {
    return Array.from(this.configs.values());
  }

  async findByCategoria(categoria: string): Promise<ConfigResposta[]> {
    return Array.from(this.configs.values()).filter(c => c.categoria === categoria);
  }

  async save(configResposta: ConfigResposta): Promise<ConfigResposta> {
    if (!configResposta.id) {
      configResposta.id = uuidv4();
      configResposta.created_at = new Date();
      configResposta.updated_at = new Date();
    } else {
      configResposta.updated_at = new Date();
    }
    this.configs.set(configResposta.id, configResposta);
    return configResposta;
  }

  async delete(id: string): Promise<void> {
    this.configs.delete(id);
  }
}

class InMemoryConfigPerfilRepository implements IConfigPerfilRepository {
  private perfis: Map<string, ConfigPerfil> = new Map();

  constructor() {
    // Pre-seed with a test user profile
    this.perfis.set('test@fortestecnologia.com.br', {
      id: uuidv4(),
      email: 'test@fortestecnologia.com.br',
      nome: 'Test User',
      area: 'TI',
      admin: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  async findByEmail(email: string): Promise<ConfigPerfil | null> {
    return this.perfis.get(email) || null;
  }
}

class MockEmailService implements IEmailService {
  public sentEmails: Array<{ to: string; subject: string; body: string }> = [];

  async sendTokenEmail(to: string, subject: string, body: string): Promise<void> {
    this.sentEmails.push({ to, subject, body });
  }

  async sendHtmlReport(to: string, subject: string, html: string): Promise<void> {
    this.sentEmails.push({ to, subject, body: html });
  }

  async sendNotification(to: string, subject: string, html: string): Promise<void> {
    this.sentEmails.push({ to, subject, body: html });
  }
}

class InMemoryEventBus implements IEventBus {
  public publishedEvents: DomainEvent[] = [];

  publish(event: DomainEvent): void {
    this.publishedEvents.push(event);
  }

  subscribe(_eventType: string, _handler: (event: DomainEvent) => void): void {
    // No-op for testing
  }
}

// --- Mock Firebase Auth Provider ---

class MockFirebaseAuthProvider {
  async verifyIdToken(idToken: string): Promise<{ email: string; uid: string }> {
    if (idToken === 'test-token') {
      return { email: 'test@fortestecnologia.com.br', uid: 'test-uid' };
    }
    throw new Error('Invalid token');
  }
}

// --- Test App Factory ---

function createTestApp() {
  // Create in-memory repositories
  const areaRepository = new InMemoryAreaRepository();
  const processoRepository = new InMemoryProcessoRepository();
  const perguntaRepository = new InMemoryPerguntaRepository();
  const respostaBiaRepository = new InMemoryRespostaBiaRepository();
  const tokenRepository = new InMemoryTokenRepository();
  const dependenciaRepository = new InMemoryDependenciaRepository();
  const configRespostaRepository = new InMemoryConfigRespostaRepository();
  const configPerfilRepository = new InMemoryConfigPerfilRepository();

  // Create infrastructure mocks
  const authProvider = new MockFirebaseAuthProvider();
  const emailService = new MockEmailService();
  const eventBus = new InMemoryEventBus();

  // Create use cases
  const perguntaCrud = new PerguntaCrudUseCase(perguntaRepository);
  const areaCrud = new AreaCrudUseCase(areaRepository);
  const processoCrud = new ProcessoCrudUseCase(processoRepository);
  const dependenciaCrud = new DependenciaCrudUseCase(dependenciaRepository);
  const configRespostaCrud = new ConfigRespostaCrudUseCase(configRespostaRepository);

  const salvarRespostas = new SalvarRespostasUseCase(
    respostaBiaRepository,
    processoRepository,
    emailService,
    eventBus,
    'notification@test.com'
  );
  const salvarRespostasToken = new SalvarRespostasTokenUseCase(
    tokenRepository,
    respostaBiaRepository,
    processoRepository,
    eventBus
  );
  const salvarRespostasArea = new SalvarRespostasAreaUseCase(
    tokenRepository,
    respostaBiaRepository,
    processoRepository,
    eventBus
  );
  const getResumoRespostas = new GetResumoRespostasUseCase(respostaBiaRepository);

  const gerarToken = new GerarTokenUseCase(tokenRepository, emailService, 'http://localhost:3000');
  const gerarTokenArea = new GerarTokenAreaUseCase(tokenRepository, emailService, 'http://localhost:3000');
  const validarToken = new ValidarTokenUseCase(tokenRepository);
  const validarTokenArea = new ValidarTokenAreaUseCase(
    tokenRepository,
    areaRepository,
    processoRepository,
    perguntaRepository
  );

  const gerarRelatorioArea = new GerarRelatorioAreaUseCase(
    processoRepository,
    respostaBiaRepository,
    emailService
  );

  const getPerfil = new GetPerfilUseCase(configPerfilRepository);

  // Create controllers
  const perguntaController = new PerguntaController(perguntaCrud);
  const areaController = new AreaController(areaCrud);
  const processoController = new ProcessoController(processoCrud);
  const evaluationController = new EvaluationController(
    salvarRespostas,
    salvarRespostasToken,
    salvarRespostasArea,
    getResumoRespostas
  );
  const tokenController = new TokenController(
    gerarToken,
    gerarTokenArea,
    validarToken,
    validarTokenArea
  );
  const reportController = new ReportController(gerarRelatorioArea);
  const configController = new ConfigController(configRespostaCrud);
  const dependenciaController = new DependenciaController(dependenciaCrud);

  // Create and configure ActionRouter
  const router = new ActionRouter();

  // Register GET actions
  router.registerGet('getPerguntas', async () => perguntaController.getPerguntas());
  router.registerGet('getAreas', async () => areaController.getAreas());
  router.registerGet('getProcessos', async () => processoController.getProcessos());
  router.registerGet('getProcessosPorArea', async (params) => processoController.getProcessosPorArea(params));
  router.registerGet('getResumoRespostas', async () => evaluationController.handleGetResumoRespostas());
  router.registerGet('getConfigRespostas', async (params) => configController.getConfigRespostas(params));
  router.registerGet('getPerfil', async (_params, userEmail) => getPerfil.execute(userEmail || ''));
  router.registerGet('getDependencias', async () => dependenciaController.getDependencias());
  router.registerGet('validarToken', async (params) => tokenController.handleValidarToken(params));
  router.registerGet('validarTokenArea', async (params) => tokenController.handleValidarTokenArea(params));

  // Register POST actions
  router.registerPost('salvarPergunta', async (data) => perguntaController.salvarPergunta(data));
  router.registerPost('excluirPergunta', async (data) => perguntaController.excluirPergunta(data));
  router.registerPost('salvarArea', async (data) => areaController.salvarArea(data));
  router.registerPost('excluirArea', async (data) => areaController.excluirArea(data));
  router.registerPost('salvarProcesso', async (data) => processoController.salvarProcesso(data));
  router.registerPost('excluirProcesso', async (data) => processoController.excluirProcesso(data));
  router.registerPost('salvarRespostas', async (data) => evaluationController.handleSalvarRespostas(data));
  router.registerPost('salvarRespostasToken', async (data) => evaluationController.handleSalvarRespostasToken(data));
  router.registerPost('salvarRespostasArea', async (data) => evaluationController.handleSalvarRespostasArea(data));
  router.registerPost('gerarToken', async (data) => tokenController.handleGerarToken(data));
  router.registerPost('gerarTokenArea', async (data) => tokenController.handleGerarTokenArea(data));
  router.registerPost('gerarRelatorioArea', async (data) => reportController.handleGerarRelatorioArea(data));
  router.registerPost('salvarConfigResposta', async (data) => configController.salvarConfigResposta(data));
  router.registerPost('excluirConfigResposta', async (data) => configController.excluirConfigResposta(data));
  router.registerPost('salvarDependencia', async (data) => dependenciaController.salvarDependencia(data));
  router.registerPost('excluirDependencia', async (data) => dependenciaController.excluirDependencia(data));

  // Create Express app
  const app = express();

  // Middleware
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(express.text({ type: 'text/plain' }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Auth middleware
  app.use(createAuthMiddleware(authProvider as any, configPerfilRepository));

  // Action routes
  app.get('/exec', (req, res) => router.handleGet(req, res));
  app.post('/exec', (req, res) => router.handlePost(req, res));

  // Error handler
  app.use(errorHandler);

  return { app, eventBus, emailService };
}

// --- Integration Tests ---

describe('End-to-end request lifecycle', () => {
  let app: express.Express;
  let eventBus: InMemoryEventBus;
  let emailService: MockEmailService;

  beforeAll(() => {
    const testApp = createTestApp();
    app = testApp.app;
    eventBus = testApp.eventBus;
    emailService = testApp.emailService;
  });

  describe('Health and basic routing', () => {
    it('GET /health returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /exec without action returns error (with auth)', async () => {
      const res = await request(app)
        .get('/exec')
        .set('Authorization', 'Bearer test-token');
      expect(res.body.error).toBe('Action não especificada');
    });

    it('GET /exec with unknown action returns error (with auth)', async () => {
      const res = await request(app)
        .get('/exec?action=unknown')
        .set('Authorization', 'Bearer test-token');
      expect(res.body.error).toBe('Action não reconhecida: unknown');
    });

    it('POST /exec without action returns error', async () => {
      const res = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({});
      expect(res.body.error).toBe('Action não especificada');
    });

    it('POST /exec with unknown action returns error', async () => {
      const res = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({ action: 'unknownAction' });
      expect(res.body.error).toBe('Action não reconhecida: unknownAction');
    });
  });

  describe('CORS headers', () => {
    it('CORS headers are present on GET responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
      expect(res.headers['access-control-allow-methods']).toContain('GET');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('OPTIONS preflight returns 204', async () => {
      const res = await request(app).options('/exec');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });

    it('CORS headers are present on /exec responses', async () => {
      const res = await request(app)
        .get('/exec?action=getPerguntas')
        .set('Authorization', 'Bearer test-token');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Authentication and authorization', () => {
    it('public actions work without auth (validarToken)', async () => {
      const res = await request(app).get('/exec?action=validarToken&token=non-existent-uuid');
      expect(res.status).toBe(200);
      expect(res.body.error).toBeDefined();
    });

    it('protected actions require auth - returns 401 without token', async () => {
      const res = await request(app).get('/exec?action=getPerguntas');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token não fornecido');
    });

    it('protected actions reject invalid token - returns 401', async () => {
      const res = await request(app)
        .get('/exec?action=getPerguntas')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token inválido');
    });

    it('authenticated GET returns data with valid token', async () => {
      const res = await request(app)
        .get('/exec?action=getPerguntas')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /exec?action=getProcessos returns correct format', () => {
    it('returns an array (empty initially)', async () => {
      const res = await request(app)
        .get('/exec?action=getProcessos')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /exec salvarProcesso creates and returns ID', () => {
    it('creates an area then a processo and returns IDs', async () => {
      // First create an area
      const areaRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarArea',
          nome: 'TI',
          responsavel: 'João',
          email: 'joao@test.com',
          solucao: 'ERP',
        });
      expect(areaRes.body.success).toBe(true);
      expect(areaRes.body.id).toBeDefined();

      // Then create a processo
      const res = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarProcesso',
          area_id: areaRes.body.id,
          processo: 'Pagamentos',
        });
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();

      // Verify it appears in getProcessos
      const listRes = await request(app)
        .get('/exec?action=getProcessos')
        .set('Authorization', 'Bearer test-token');
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].processo).toBe('Pagamentos');
    });
  });

  describe('Token generation → validation → submission → mark used flow', () => {
    it('full token lifecycle works end-to-end', async () => {
      // 1. Create an area
      const areaRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarArea',
          nome: 'Financeiro',
          responsavel: 'Maria',
          email: 'maria@test.com',
          solucao: 'SAP',
        });
      expect(areaRes.body.success).toBe(true);
      const areaId = areaRes.body.id;

      // 2. Create a processo
      const procRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarProcesso',
          area_id: areaId,
          processo: 'Contas a Pagar',
        });
      expect(procRes.body.success).toBe(true);
      const processoId = procRes.body.id;

      // 3. Generate a token
      const tokenRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'gerarToken',
          area_id: areaId,
          processo_id: processoId,
          email: 'avaliador@external.com',
          areaName: 'Financeiro',
          processoName: 'Contas a Pagar',
        });
      expect(tokenRes.body.success).toBe(true);
      expect(tokenRes.body.token).toBeDefined();
      expect(tokenRes.body.link).toContain(tokenRes.body.token);
      const tokenId = tokenRes.body.token;

      // 4. Validate the token (public action, no auth needed)
      const validateRes = await request(app)
        .get(`/exec?action=validarToken&token=${tokenId}`);
      expect(validateRes.body.success).toBe(true);
      expect(validateRes.body.token).toBeDefined();

      // 5. Submit responses using the token (public action)
      const submitRes = await request(app)
        .post('/exec')
        .send({
          action: 'salvarRespostasToken',
          token: tokenId,
          processo_id: processoId,
          respondente: 'avaliador@external.com',
          cargo: 'Analista',
          scores: { q1: 3, q2: 4, q3: 2 },
        });
      expect(submitRes.body.success).toBe(true);

      // 6. Verify token is now marked as used
      const revalidateRes = await request(app)
        .get(`/exec?action=validarToken&token=${tokenId}`);
      expect(revalidateRes.body.error).toBeDefined();
      expect(revalidateRes.body.error).toContain('utilizado');
    });
  });

  describe('Score calculation → tier update → event publish flow', () => {
    it('evaluation calculates score, updates tier, and publishes event', async () => {
      // Create area and processo
      const areaRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarArea',
          nome: 'Operações',
          responsavel: 'Carlos',
          email: 'carlos@test.com',
          solucao: 'CRM',
        });
      const areaId = areaRes.body.id;

      const procRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarProcesso',
          area_id: areaId,
          processo: 'Atendimento',
        });
      const processoId = procRes.body.id;

      // Clear previous events
      eventBus.publishedEvents.length = 0;

      // Submit evaluation (authenticated)
      const evalRes = await request(app)
        .post('/exec')
        .set('Authorization', 'Bearer test-token')
        .send({
          action: 'salvarRespostas',
          processo_id: processoId,
          respondente: 'test@fortestecnologia.com.br',
          cargo: 'Gerente',
          scores: { q1: 4, q2: 4, q3: 4 }, // total = 12 → Tier 1
        });
      expect(evalRes.body.success).toBe(true);

      // Verify event was published
      expect(eventBus.publishedEvents.length).toBeGreaterThan(0);
      const lastEvent = eventBus.publishedEvents[eventBus.publishedEvents.length - 1];
      expect(lastEvent.eventType).toBe('EVALUATION_COMPLETED');
      expect((lastEvent as any).processoId).toBe(processoId);
      expect((lastEvent as any).score).toBe(12);
      expect((lastEvent as any).tier).toContain('Tier 1');
    });
  });

  describe('Unauthenticated access to public actions', () => {
    it('validarToken works without auth', async () => {
      const res = await request(app).get('/exec?action=validarToken&token=fake-token');
      expect(res.status).toBe(200);
      // Should return an error about invalid token, not 401
      expect(res.body.error).toBe('Token inválido.');
    });

    it('salvarRespostasToken works without auth', async () => {
      const res = await request(app)
        .post('/exec')
        .send({
          action: 'salvarRespostasToken',
          token: 'non-existent-token',
          processo_id: 'some-id',
          respondente: 'user@test.com',
          cargo: 'Analista',
          scores: { q1: 1 },
        });
      expect(res.status).toBe(200);
      // Should return domain error, not 401
      expect(res.body.error).toBeDefined();
    });

    it('salvarRespostasArea works without auth', async () => {
      const res = await request(app)
        .post('/exec')
        .send({
          action: 'salvarRespostasArea',
          token: 'non-existent-token',
          respondente: 'user@test.com',
          cargo: 'Analista',
          respostas: [{ processo_id: 'p1', scores: { q1: 2 } }],
        });
      expect(res.status).toBe(200);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('Authenticated access with valid Firebase token', () => {
    it('getAreas returns data', async () => {
      const res = await request(app)
        .get('/exec?action=getAreas')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('getDependencias returns data', async () => {
      const res = await request(app)
        .get('/exec?action=getDependencias')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('getConfigRespostas returns object', async () => {
      const res = await request(app)
        .get('/exec?action=getConfigRespostas')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('object');
    });

    it('getPerfil returns profile for authenticated user', async () => {
      const res = await request(app)
        .get('/exec?action=getPerfil')
        .set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.perfil.email).toBe('test@fortestecnologia.com.br');
    });
  });
});
