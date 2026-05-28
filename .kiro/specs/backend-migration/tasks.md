# Implementation Plan: Backend Migration

## Overview

Migrate the BIA application backend from Google Apps Script + Google Sheets to a Node.js/TypeScript API with PostgreSQL. The implementation follows Clean Architecture, uses Firebase Admin SDK for auth, Nodemailer for email, TypeORM for database access, and tsyringe for dependency injection. A single `/exec` endpoint with action-based routing maintains full backward compatibility with the existing frontend.

## Tasks

- [ ] 1. Set up project structure, tooling, and core interfaces
  - [x] 1.1 Initialize Node.js/TypeScript project with dependencies
    - Create `bia-backend/` directory with `package.json`, `tsconfig.json`
    - Install dependencies: express, typeorm, pg, firebase-admin, nodemailer, tsyringe, uuid, cors, dotenv, pino, reflect-metadata
    - Install dev dependencies: jest, ts-jest, fast-check, supertest, testcontainers, @types/*, typescript, ts-node-dev
    - Configure `tsconfig.json` with strict mode, decorators, ES2020 target
    - Configure `jest.config.ts` with ts-jest preset and 30s timeout
    - Create `.env.example` with all required environment variables
    - _Requirements: 2.1, 10.2_

  - [x] 1.2 Create Clean Architecture directory structure
    - Create `src/domain/entities/`, `src/domain/value-objects/`, `src/domain/events/`, `src/domain/errors/`
    - Create `src/use-cases/interfaces/`, `src/use-cases/evaluation/`, `src/use-cases/token/`, `src/use-cases/crud/`, `src/use-cases/report/`, `src/use-cases/profile/`
    - Create `src/adapters/controllers/`, `src/adapters/middleware/`, `src/adapters/dtos/`, `src/adapters/presenters/`
    - Create `src/infrastructure/database/repositories/`, `src/infrastructure/database/migrations/`, `src/infrastructure/email/`, `src/infrastructure/auth/`, `src/infrastructure/events/`, `src/infrastructure/logging/`, `src/infrastructure/config/`
    - Create `tests/unit/`, `tests/property/`, `tests/integration/`
    - _Requirements: 2.1_

  - [x] 1.3 Define domain entities and value objects
    - Implement `Area.ts`, `Processo.ts`, `Pergunta.ts`, `RespostaBia.ts`, `Token.ts`, `Dependencia.ts`, `ConfigResposta.ts`, `ConfigPerfil.ts` as plain TypeScript interfaces/classes with no infrastructure imports
    - Implement value objects: `Score.ts` (with calculate method), `Tier.ts` (with fromScore and rto getter), `RTO.ts`
    - _Requirements: 2.2, 5.1, 5.2, 5.3, 5.4_

  - [x] 1.4 Define domain errors and events
    - Implement `DomainError.ts` abstract class with code and message
    - Implement error subclasses: `TokenExpiredError`, `TokenUsedError`, `TokenInvalidError`, `ActionNotFoundError`, `UnauthorizedError`, `ForbiddenError`
    - Implement domain events: `DomainEvent.ts` base, `EvaluationCompleted.ts`, `ProcessCreated.ts`, `TierChanged.ts`
    - _Requirements: 2.8, 13.2_

  - [x] 1.5 Define repository interfaces and service interfaces
    - Implement `IAreaRepository.ts`, `IProcessoRepository.ts`, `IPerguntaRepository.ts`, `IRespostaBiaRepository.ts`, `ITokenRepository.ts`, `IDependenciaRepository.ts`, `IConfigRespostaRepository.ts`, `IConfigPerfilRepository.ts`
    - Implement `IEmailService.ts` and `IEventBus.ts` interfaces
    - _Requirements: 2.4_

  - [x]* 1.6 Write property tests for Score and Tier value objects
    - **Property 6: Score Calculation Correctness** — verify Score.calculate returns arithmetic sum of all values
    - **Property 7: Tier and RTO Classification** — verify Tier.fromScore classifies correctly at boundaries
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement infrastructure layer (database, auth, email)
  - [x] 3.1 Configure TypeORM data source and environment config
    - Implement `src/infrastructure/config/env.ts` reading all config from environment variables
    - Implement `src/infrastructure/database/data-source.ts` with TypeORM DataSource configuration
    - Configure entity decorators on domain entities for TypeORM mapping (separate ORM entity files in infrastructure layer)
    - _Requirements: 10.2, 3.8_

  - [x] 3.2 Create database migration scripts
    - Create initial migration with all 8 tables: areas, processos, perguntas, respostas_bia, tokens, dependencias, config_respostas, config_perfis
    - Define UUID primary keys, foreign keys (processos→areas, respostas_bia→processos, tokens→areas, tokens→processos)
    - Add JSONB columns for impactoIndisponibilidade, bcpContatos, bcpRiscos, bcpPreventivas, scores
    - Add created_at and updated_at timestamp columns on all tables
    - Add unique constraint on areas.nome and config_perfis.email
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.3 Implement TypeORM repository classes
    - Implement `TypeOrmAreaRepository.ts` with findAll, findById, findByNome, save, delete
    - Implement `TypeOrmProcessoRepository.ts` with findAll, findByArea, findById, save, delete, updateTierAndRto
    - Implement `TypeOrmPerguntaRepository.ts` with findAll, findActive, save, delete
    - Implement `TypeOrmRespostaBiaRepository.ts` with findByProcesso, findLatestByProcesso, findAll, save
    - Implement `TypeOrmTokenRepository.ts` with findByToken, save, markAsUsed
    - Implement `TypeOrmDependenciaRepository.ts` with findAll, save, delete
    - Implement `TypeOrmConfigRespostaRepository.ts` with findAll, findByCategoria, save, delete
    - Implement `TypeOrmConfigPerfilRepository.ts` with findByEmail
    - _Requirements: 2.4, 3.1_

  - [x] 3.4 Implement Firebase Auth provider
    - Implement `FirebaseAuthProvider.ts` that initializes Firebase Admin SDK
    - Expose `verifyIdToken(token: string)` method returning decoded token with email
    - Read Firebase service account from environment variable or JSON file
    - _Requirements: 4.1_

  - [x] 3.5 Implement Nodemailer email service
    - Implement `NodemailerEmailService.ts` implementing `IEmailService`
    - Configure SMTP transport from environment variables (host, port, user, pass)
    - Implement `sendTokenEmail`, `sendHtmlReport`, `sendNotification` methods
    - _Requirements: 7.5_

  - [x] 3.6 Implement InMemoryEventBus and StructuredLogger
    - Implement `InMemoryEventBus.ts` with publish/subscribe pattern
    - Implement `StructuredLogger.ts` using pino for JSON-formatted logging
    - _Requirements: 13.2, 10.5_

- [ ] 4. Implement use cases layer
  - [x] 4.1 Implement CRUD use cases
    - Implement `PerguntaCrudUseCase.ts` (getPerguntas, salvarPergunta, excluirPergunta)
    - Implement `AreaCrudUseCase.ts` (getAreas, salvarArea, excluirArea)
    - Implement `ProcessoCrudUseCase.ts` (getProcessos, getProcessosPorArea, salvarProcesso, excluirProcesso)
    - Implement `DependenciaCrudUseCase.ts` (getDependencias, salvarDependencia, excluirDependencia)
    - Implement `ConfigRespostaCrudUseCase.ts` (getConfigRespostas with category grouping and _default fallback, salvarConfigResposta, excluirConfigResposta)
    - All use cases return typed Result objects on failure
    - _Requirements: 1.1, 1.2, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3_

  - [x] 4.2 Implement evaluation use cases
    - Implement `SalvarRespostasUseCase.ts` — save responses, calculate score via Score value object, derive tier/RTO, update Processo, publish EvaluationCompleted event, send notification email
    - Implement `SalvarRespostasTokenUseCase.ts` — validate token, save responses, mark token used
    - Implement `SalvarRespostasAreaUseCase.ts` — validate area token, save responses for multiple processes
    - Implement `GetResumoRespostasUseCase.ts` — return summary of all evaluations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.7_

  - [x] 4.3 Implement token use cases
    - Implement `GerarTokenUseCase.ts` — create UUID token with 7-day expiry, store, send email, return token+link
    - Implement `GerarTokenAreaUseCase.ts` — create area-level token with 7-day expiry, store, send email
    - Implement `ValidarTokenUseCase.ts` — check exists/used/expired states, return appropriate error or success data
    - Implement `ValidarTokenAreaUseCase.ts` — validate area token, return area name, processes, and active questions
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.4 Implement report and profile use cases
    - Implement `GerarRelatorioAreaUseCase.ts` — generate HTML report with summary cards (total, evaluated, tiers) and process score table, send via email
    - Implement `GetPerfilUseCase.ts` — retrieve Config_Perfil by email, return error if not found
    - _Requirements: 7.3, 12.4, 12.5_

  - [x]* 4.5 Write property tests for token validation use case
    - **Property 8: Token Validation State Machine** — verify correct error messages for used/expired/invalid tokens
    - **Property 9: Token Marked Used After Submission** — verify token becomes used after successful submission
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.7**

  - [x]* 4.6 Write property tests for CRUD and config use cases
    - **Property 14: CRUD Round Trip for Entities** — verify create then retrieve preserves all fields
    - **Property 15: Config Category Fallback** — verify _default fallback behavior
    - **Property 16: Config Grouped by Category** — verify all records appear in exactly one category group
    - **Validates: Requirements 11.1, 12.1, 12.2, 12.3**

  - [x]* 4.7 Write property test for domain events
    - **Property 17: Domain Events Published on Evaluation** — verify EvaluationCompleted event is published with correct data
    - **Validates: Requirements 13.2**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement interface adapters layer (controllers, middleware, routing)
  - [x] 6.1 Implement authentication and CORS middleware
    - Implement `authMiddleware.ts` — validate Firebase token, extract email, check domain, check Config_Perfil, set req.userEmail
    - Define PUBLIC_ACTIONS array for unauthenticated endpoints
    - Implement `corsMiddleware.ts` — allow origin from env var (default https://bia-forte-2025.web.app), support OPTIONS preflight, allow Content-Type text/plain and application/json
    - Implement `errorHandler.ts` — global error handler logging with pino, returning generic error for unhandled exceptions
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.1, 9.2, 9.3_

  - [x] 6.2 Implement ActionRouter and controller wiring
    - Implement `ActionRouter.ts` with GET/POST handler maps, dispatch logic, action validation
    - Return `{ error: "Action não especificada" }` for missing action
    - Return `{ error: "Action não reconhecida: <action>" }` for unknown actions
    - Register all 10 GET actions and 16 POST actions
    - _Requirements: 1.1, 1.2, 1.7, 1.8_

  - [x] 6.3 Implement controllers for each domain area
    - Implement `PerguntaController.ts` — handle getPerguntas, salvarPergunta, excluirPergunta
    - Implement `AreaController.ts` — handle getAreas, salvarArea, excluirArea
    - Implement `ProcessoController.ts` — handle getProcessos, getProcessosPorArea, salvarProcesso, excluirProcesso
    - Implement `EvaluationController.ts` — handle salvarRespostas, salvarRespostasToken, salvarRespostasArea, getResumoRespostas
    - Implement `TokenController.ts` — handle gerarToken, gerarTokenArea, validarToken, validarTokenArea
    - Implement `ReportController.ts` — handle gerarRelatorioArea
    - Implement `ConfigController.ts` — handle getConfigRespostas, salvarConfigResposta, excluirConfigResposta
    - Implement `DependenciaController.ts` — handle getDependencias, salvarDependencia, excluirDependencia
    - _Requirements: 1.1, 1.2_

  - [x] 6.4 Implement LegacyResponsePresenter
    - Implement `LegacyResponsePresenter.ts` — transform domain entities to match exact Google Apps Script response format
    - Format Processo with all 22 fields plus score, avaliado, respostas
    - Ensure JSON fields default to empty arrays, text fields default to empty strings
    - Set Content-Type to application/json for all responses
    - _Requirements: 1.3, 1.9_

  - [x]* 6.5 Write property tests for response format and API contract
    - **Property 1: Response Format Preservation** — verify LegacyResponsePresenter outputs all 22 fields with correct types
    - **Property 2: API Response Contract** — verify responses contain either success or error, never both
    - **Property 3: Use Case Typed Error Results** — verify invalid inputs produce DomainError subclasses
    - **Validates: Requirements 1.3, 1.5, 1.6, 2.8**

  - [x]* 6.6 Write property tests for authentication middleware
    - **Property 4: Public Actions Bypass Authentication** — verify public actions don't require auth
    - **Property 5: Domain Email Validation** — verify only @fortestecnologia.com.br emails pass
    - **Validates: Requirements 4.3, 4.5**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement application bootstrap and Express server
  - [x] 8.1 Implement DI container setup and application entry point
    - Configure tsyringe container with all repository and service bindings
    - Implement `src/main.ts` — initialize TypeORM DataSource, run migrations, register DI, start Express server
    - Wire Express app with CORS middleware, auth middleware, body parser (json + text), ActionRouter on `/exec`, health check on `/health`, readiness check on `/ready`
    - Implement health endpoint returning HTTP 200 without auth
    - Implement readiness endpoint verifying database connectivity
    - _Requirements: 2.6, 9.4, 10.4, 10.6, 13.4_

  - [x] 8.2 Create Dockerfile and docker-compose.yml
    - Create multi-stage `Dockerfile` (build + production stages)
    - Create `docker-compose.yml` with PostgreSQL service and API service
    - Configure volume mounts for local development
    - Set environment variables for database URL, Firebase config, SMTP credentials, CORS origins
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 8.3 Create OpenAPI/Swagger specification
    - Create `openapi.yaml` documenting all GET and POST actions
    - Document request parameters, response schemas, and error formats
    - Integrate swagger-ui-express at `/docs` endpoint
    - _Requirements: 13.5_

- [ ] 9. Implement data migration tool
  - [x] 9.1 Implement Google Sheets migration tool
    - Create `tools/migration/SheetsMigrator.ts`
    - Implement extraction from Google Sheets API for all 8 tabs (Perguntas, Áreas, Processos, Respostas BIA, Dependências, Config Respostas, Config Perfis, Tokens)
    - Implement transformation: row index → UUID, area name → area_id FK, JSON strings → parsed objects, empty strings → null
    - Implement loading into PostgreSQL via TypeORM repositories
    - Generate migration report (total records, successful inserts, errors per table)
    - Log errors with source row number and continue processing
    - Implement idempotence via upsert logic (match on natural keys)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.2 Write property tests for migration transformation
    - **Property 12: Migration Data Transformation Round Trip** — verify transformation produces equivalent values when serialized back
    - **Property 13: Migration Idempotence** — verify running migration twice produces same state as once
    - **Validates: Requirements 8.2, 8.6**

- [ ] 10. Implement email templates and notification logic
  - [x] 10.1 Implement email templates and sending logic
    - Create token invitation email template with area name, process name, evaluation link, 7-day validity notice
    - Create area report HTML template with summary cards (total, evaluated, tier counts) and process score table
    - Create evaluation notification template with area, process, respondent, score, tier
    - Wire email sending into GerarTokenUseCase, GerarTokenAreaUseCase, GerarRelatorioAreaUseCase, and SalvarRespostasUseCase
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 10.2 Write property tests for email content and report HTML
    - **Property 10: Email Content Contains Required Fields** — verify email body contains area name, link, and 7-day validity
    - **Property 11: Report HTML Contains Correct Summary** — verify report has correct counts and process scores
    - **Validates: Requirements 7.2, 7.3**

- [ ] 11. Integration testing and final wiring
  - [x] 11.1 Wire all components end-to-end and verify full request lifecycle
    - Verify GET /exec?action=getProcessos returns correct format
    - Verify POST /exec with action=salvarProcesso creates and returns ID
    - Verify token generation → validation → submission → mark used flow
    - Verify score calculation → tier update → event publish flow
    - Verify CORS headers present on all responses
    - Verify unauthenticated access to public actions works
    - Verify authenticated access with valid Firebase token works
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1, 9.2, 9.3_

  - [ ]* 11.2 Write integration tests with testcontainers
    - Set up testcontainers PostgreSQL for integration test suite
    - Test each API action with at least one happy path and one error case
    - Mock Firebase Admin SDK for controlled token verification
    - Mock Nodemailer to capture sent emails
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1-17)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all code examples and implementations use Node.js/TypeScript
- The single `/exec` endpoint pattern maintains backward compatibility with the existing frontend
- Domain entities in the entities layer must remain free of infrastructure imports (TypeORM entities are separate files in infrastructure)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5"] },
    { "id": 3, "tasks": ["1.6", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.4", "3.5", "3.6"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["4.5", "4.6", "4.7"] },
    { "id": 8, "tasks": ["6.1", "6.4"] },
    { "id": 9, "tasks": ["6.2", "6.5", "6.6"] },
    { "id": 10, "tasks": ["6.3"] },
    { "id": 11, "tasks": ["8.1", "8.3"] },
    { "id": 12, "tasks": ["8.2", "9.1", "10.1"] },
    { "id": 13, "tasks": ["9.2", "10.2"] },
    { "id": 14, "tasks": ["11.1"] },
    { "id": 15, "tasks": ["11.2"] }
  ]
}
```
