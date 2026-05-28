import 'reflect-metadata';
import express from 'express';
import { AppDataSource } from './infrastructure/database/data-source';
import { env } from './infrastructure/config/env';
import { corsMiddleware } from './adapters/middleware/corsMiddleware';
import { createAuthMiddleware } from './adapters/middleware/authMiddleware';
import { errorHandler } from './adapters/middleware/errorHandler';
import { ActionRouter } from './adapters/controllers/ActionRouter';
import { StructuredLogger } from './infrastructure/logging/StructuredLogger';

// Infrastructure
import { FirebaseAuthProvider } from './infrastructure/auth/FirebaseAuthProvider';
import { NodemailerEmailService } from './infrastructure/email/NodemailerEmailService';
import { InMemoryEventBus } from './infrastructure/events/InMemoryEventBus';

// Repositories
import { TypeOrmAreaRepository } from './infrastructure/database/repositories/TypeOrmAreaRepository';
import { TypeOrmProcessoRepository } from './infrastructure/database/repositories/TypeOrmProcessoRepository';
import { TypeOrmPerguntaRepository } from './infrastructure/database/repositories/TypeOrmPerguntaRepository';
import { TypeOrmRespostaBiaRepository } from './infrastructure/database/repositories/TypeOrmRespostaBiaRepository';
import { TypeOrmTokenRepository } from './infrastructure/database/repositories/TypeOrmTokenRepository';
import { TypeOrmDependenciaRepository } from './infrastructure/database/repositories/TypeOrmDependenciaRepository';
import { TypeOrmConfigRespostaRepository } from './infrastructure/database/repositories/TypeOrmConfigRespostaRepository';
import { TypeOrmConfigPerfilRepository } from './infrastructure/database/repositories/TypeOrmConfigPerfilRepository';

// Use Cases - CRUD
import { PerguntaCrudUseCase } from './use-cases/crud/PerguntaCrudUseCase';
import { AreaCrudUseCase } from './use-cases/crud/AreaCrudUseCase';
import { ProcessoCrudUseCase } from './use-cases/crud/ProcessoCrudUseCase';
import { DependenciaCrudUseCase } from './use-cases/crud/DependenciaCrudUseCase';
import { ConfigRespostaCrudUseCase } from './use-cases/crud/ConfigRespostaCrudUseCase';

// Use Cases - Evaluation
import { SalvarRespostasUseCase } from './use-cases/evaluation/SalvarRespostasUseCase';
import { SalvarRespostasTokenUseCase } from './use-cases/evaluation/SalvarRespostasTokenUseCase';
import { SalvarRespostasAreaUseCase } from './use-cases/evaluation/SalvarRespostasAreaUseCase';
import { GetResumoRespostasUseCase } from './use-cases/evaluation/GetResumoRespostasUseCase';

// Use Cases - Token
import { GerarTokenUseCase } from './use-cases/token/GerarTokenUseCase';
import { GerarTokenAreaUseCase } from './use-cases/token/GerarTokenAreaUseCase';
import { ValidarTokenUseCase } from './use-cases/token/ValidarTokenUseCase';
import { ValidarTokenAreaUseCase } from './use-cases/token/ValidarTokenAreaUseCase';

// Use Cases - Report
import { GerarRelatorioAreaUseCase } from './use-cases/report/GerarRelatorioAreaUseCase';

// Use Cases - Profile
import { GetPerfilUseCase } from './use-cases/profile/GetPerfilUseCase';

// Controllers
import { PerguntaController } from './adapters/controllers/PerguntaController';
import { AreaController } from './adapters/controllers/AreaController';
import { ProcessoController } from './adapters/controllers/ProcessoController';
import { EvaluationController } from './adapters/controllers/EvaluationController';
import { TokenController } from './adapters/controllers/TokenController';
import { ReportController } from './adapters/controllers/ReportController';
import { ConfigController } from './adapters/controllers/ConfigController';
import { DependenciaController } from './adapters/controllers/DependenciaController';

const logger = new StructuredLogger();

async function bootstrap(): Promise<void> {
  // 1. Initialize database
  await AppDataSource.initialize();
  logger.info('Database connected');

  // 2. Run migrations
  await AppDataSource.runMigrations();
  logger.info('Migrations executed');

  // 3. Create infrastructure instances
  const authProvider = new FirebaseAuthProvider();
  const emailService = new NodemailerEmailService();
  const eventBus = new InMemoryEventBus();

  // 4. Create repositories
  const areaRepository = new TypeOrmAreaRepository();
  const processoRepository = new TypeOrmProcessoRepository();
  const perguntaRepository = new TypeOrmPerguntaRepository();
  const respostaBiaRepository = new TypeOrmRespostaBiaRepository();
  const tokenRepository = new TypeOrmTokenRepository();
  const dependenciaRepository = new TypeOrmDependenciaRepository();
  const configRespostaRepository = new TypeOrmConfigRespostaRepository();
  const configPerfilRepository = new TypeOrmConfigPerfilRepository();

  // 5. Create use cases
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
    env.notificationEmail
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

  const gerarToken = new GerarTokenUseCase(tokenRepository, emailService, env.tokenBaseUrl);
  const gerarTokenArea = new GerarTokenAreaUseCase(tokenRepository, emailService, env.tokenBaseUrl);
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

  // 6. Create controllers
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

  // 7. Create and configure ActionRouter
  const router = new ActionRouter();

  // Register GET actions (10 total)
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

  // Register POST actions (16 total)
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

  // 8. Create Express app
  const app = express();

  // Middleware
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(express.text({ type: 'text/plain' }));

  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness endpoint (no auth required, verifies database connectivity)
  app.get('/ready', async (_req, res) => {
    try {
      await AppDataSource.query('SELECT 1');
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // Auth middleware (applied after health/ready, before /exec)
  app.use(createAuthMiddleware(authProvider, configPerfilRepository));

  // Action routes
  app.get('/exec', (req, res) => router.handleGet(req, res));
  app.post('/exec', (req, res) => router.handlePost(req, res));

  // Error handler (must be last)
  app.use(errorHandler);

  // Start server
  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});
