# Requirements Document

## Introduction

This document specifies the requirements for migrating the BIA (Business Impact Analysis) application backend from Google Apps Script + Google Sheets to a Node.js/TypeScript API with PostgreSQL database. The migration follows Clean Architecture principles and maintains full compatibility with the existing Firebase-hosted frontend. This is Phase 1 of a multi-phase roadmap that includes AI integration, automatic document generation, runbook automation, and NIST SP 800-34 compliance.

## Glossary

- **API_Server**: The new Node.js/TypeScript RESTful backend application
- **Database**: The PostgreSQL relational database storing all BIA application data
- **Frontend**: The existing Firebase-hosted SPA (HTML/CSS/JS) at https://bia-forte-2025.web.app
- **Auth_Service**: The authentication service (Firebase Auth with Google OAuth)
- **Email_Service**: The service responsible for sending notification and evaluation emails
- **Token_Service**: The service responsible for generating and validating one-time evaluation tokens
- **Migration_Tool**: The utility responsible for transferring data from Google Sheets to PostgreSQL
- **Processo**: A business process subject to BIA evaluation (contains BIA, BCP, and DRP data)
- **Área**: A department or organizational unit that owns business processes
- **Pergunta**: An evaluation question used in BIA assessments, grouped by category
- **Dependência**: A dependency catalog entry (people, systems, suppliers) linked to processes
- **Resposta_BIA**: An evaluation response containing scores for each question per process
- **Config_Resposta**: Configuration of answer options (label, value, color) per question category
- **Config_Perfil**: User profile/permission configuration (email, name, area, admin flag)
- **Token**: A one-time-use, time-limited link for external stakeholder evaluations
- **Tier**: Classification of process criticality (Tier 1: Critical, Tier 2: Essential, Tier 3: Support)
- **Score**: Numeric result of a BIA evaluation (sum of question scores, max 24)
- **RTO**: Recovery Time Objective, automatically derived from Tier classification
- **Clean_Architecture**: Software design pattern with layers: Entities, Use Cases, Interface Adapters, Infrastructure

## Requirements

### Requirement 1: API Endpoint Compatibility

**User Story:** As a frontend developer, I want the new API to expose the same endpoints and response formats as the current Google Apps Script backend, so that the frontend requires only a URL change to connect.

#### Acceptance Criteria

1. THE API_Server SHALL expose GET endpoints routed via an `action` query parameter for the following actions: getPerguntas, getAreas, getProcessos, getProcessosPorArea, getResumoRespostas, getConfigRespostas, getPerfil, getDependencias, validarToken, validarTokenArea
2. THE API_Server SHALL expose POST endpoints routed via an `action` field in the JSON request body for the following actions: salvarPergunta, excluirPergunta, salvarArea, excluirArea, salvarProcesso, excluirProcesso, salvarRespostas, salvarRespostasToken, salvarRespostasArea, gerarToken, gerarTokenArea, gerarRelatorioArea, salvarConfigResposta, excluirConfigResposta, salvarDependencia, excluirDependencia
3. THE API_Server SHALL return JSON response bodies with field names and data types identical to those produced by the current Google Apps Script API
4. THE API_Server SHALL accept query string parameters for GET requests (e.g., `action`, `area`, `token`, `email`) and a JSON-encoded body with Content-Type `text/plain` or `application/json` for POST requests
5. WHEN a POST request succeeds, THE API_Server SHALL return a JSON object containing `{ success: true }` and, where applicable, additional fields (e.g., `id` for salvarProcesso, `token` and `link` for gerarToken)
6. IF a request fails, THEN THE API_Server SHALL return a JSON object containing `{ error: "<descriptive message>" }` with HTTP status 200
7. IF the `action` parameter is missing, THEN THE API_Server SHALL return `{ error: "Action não especificada" }`
8. IF the `action` does not match any known endpoint, THEN THE API_Server SHALL return `{ error: "Action não reconhecida: <action>" }`
9. THE API_Server SHALL set the response Content-Type to `application/json` for all responses

### Requirement 2: Clean Architecture Structure

**User Story:** As a developer, I want the backend organized in Clean Architecture layers, so that business logic is decoupled from infrastructure and the system is extensible for future phases.

#### Acceptance Criteria

1. THE API_Server SHALL organize code into four layers as distinct top-level directories: Entities (domain/entities), Use Cases (domain/use-cases), Interface Adapters (adapters), and Infrastructure (infrastructure)
2. THE API_Server SHALL define domain entities (Processo, Área, Pergunta, Dependência, Resposta_BIA, Config_Resposta, Config_Perfil, Token) in the Entities layer using plain TypeScript classes or interfaces with no imports from ORM, HTTP, database, or email libraries
3. THE API_Server SHALL implement business rules (score calculation, tier classification, token validation, RTO derivation) in the Use Cases layer, depending only on entity definitions and repository interfaces
4. THE API_Server SHALL define one repository interface per aggregate root in the Use Cases layer and provide corresponding implementations in the Infrastructure layer
5. THE API_Server SHALL enforce a unidirectional dependency rule: Entities → nothing, Use Cases → Entities only, Interface Adapters → Use Cases + Entities, Infrastructure → Use Cases + Entities
6. THE API_Server SHALL use constructor injection to provide infrastructure implementations to use case classes at application startup
7. THE API_Server SHALL place HTTP controllers, request/response DTOs, and route definitions in the Interface Adapters layer
8. IF a use case operation fails, THEN it SHALL communicate failure via typed result objects or domain-specific error classes defined in the Entities layer

### Requirement 3: PostgreSQL Database Schema

**User Story:** As a system administrator, I want all application data stored in PostgreSQL with proper relational modeling, so that data integrity is enforced and queries are performant.

#### Acceptance Criteria

1. THE Database SHALL define tables for: areas, processos, perguntas, respostas_bia, dependencias, config_respostas, config_perfis, tokens
2. THE Database SHALL enforce referential integrity between processos and areas via foreign keys
3. THE Database SHALL enforce referential integrity between respostas_bia and processos via foreign keys
4. THE Database SHALL use UUID as primary key type for all tables
5. THE Database SHALL include created_at and updated_at timestamp columns on all tables
6. THE Database SHALL store the Processo entity with all 22 columns currently in the Google Sheets schema (area, processo, descricao, dependencia, rto, rpo, mtpd, biaHomologada, tier, bcpStatus, descricaoFuncional, impactoIndisponibilidade, bcpObjetivo, bcpEscopo, bcpContatos, bcpRiscos, bcpPreventivas, drpStatus, drpObjetivo, drpEscopo, drpProcedimentos, drpCriterios)
7. THE Database SHALL store JSON fields (impactoIndisponibilidade, bcpContatos, bcpRiscos, bcpPreventivas) using PostgreSQL JSONB column type
8. THE Database SHALL support database migrations via a versioned migration tool

### Requirement 4: Authentication and Authorization

**User Story:** As a system administrator, I want the API to authenticate users and enforce access control, so that only authorized users from @fortestecnologia.com.br can access the system.

#### Acceptance Criteria

1. THE API_Server SHALL validate Firebase Auth ID tokens on all protected endpoints
2. THE API_Server SHALL reject requests with missing or invalid authentication tokens by returning HTTP 401
3. THE API_Server SHALL allow unauthenticated access only to token-based evaluation endpoints (validarToken, validarTokenArea, salvarRespostasToken, salvarRespostasArea)
4. WHEN a valid Firebase Auth token is provided, THE API_Server SHALL extract the user email and use it for audit and permission checks
5. THE API_Server SHALL verify that the authenticated user email belongs to the @fortestecnologia.com.br domain
6. WHEN a request includes an email not in the Config_Perfil table, THE API_Server SHALL deny access with HTTP 403
7. THE API_Server SHALL distinguish between admin and non-admin users based on the Config_Perfil admin flag

### Requirement 5: Score and Tier Calculation

**User Story:** As a BIA analyst, I want the system to calculate scores and tiers consistently, so that process criticality is classified accurately.

#### Acceptance Criteria

1. WHEN a BIA evaluation is submitted, THE API_Server SHALL calculate the score as the sum of all question response values
2. WHEN the score is greater than or equal to 12, THE API_Server SHALL classify the process as Tier 1 (Critical) with RTO less than 4 hours
3. WHEN the score is greater than or equal to 6 and less than 12, THE API_Server SHALL classify the process as Tier 2 (Essential) with RTO between 4 and 24 hours
4. WHEN the score is greater than 0 and less than 6, THE API_Server SHALL classify the process as Tier 3 (Support) with RTO greater than 24 hours
5. WHEN a BIA evaluation is saved, THE API_Server SHALL update the corresponding Processo record with the calculated Tier and RTO values

### Requirement 6: Token-Based External Evaluation

**User Story:** As a BIA coordinator, I want to send evaluation links to external stakeholders, so that they can assess processes without needing system credentials.

#### Acceptance Criteria

1. WHEN a token generation is requested, THE Token_Service SHALL create a UUID token with a 7-day expiration period
2. THE Token_Service SHALL store the token with its associated area, processo, email, creation date, expiration date, and usage status
3. WHEN a token is validated, THE Token_Service SHALL verify that the token exists, has not been used, and has not expired
4. IF a token has already been used, THEN THE API_Server SHALL return an error message "Este link já foi utilizado."
5. IF a token has expired, THEN THE API_Server SHALL return an error message "Este link expirou."
6. WHEN an area token is validated successfully, THE API_Server SHALL return the area name, all processes for that area, and all active questions
7. WHEN a token-based evaluation is submitted successfully, THE Token_Service SHALL mark the token as used

### Requirement 7: Email Notification Service

**User Story:** As a BIA coordinator, I want the system to send evaluation invitations and reports via email, so that stakeholders are notified and can participate in assessments.

#### Acceptance Criteria

1. WHEN a token is generated, THE Email_Service SHALL send an email to the specified recipient with the evaluation link
2. THE Email_Service SHALL include the area name, process name (when applicable), and a 7-day validity notice in the email body
3. WHEN an area report is requested, THE Email_Service SHALL send an HTML-formatted email with summary cards (total, evaluated, tiers) and a process score table
4. WHEN a BIA evaluation is completed, THE Email_Service SHALL send a notification to the configured notification email address with the area, process, respondent, score, and tier
5. THE Email_Service SHALL use a configurable SMTP provider or transactional email service (not tied to Gmail/Google APIs)

### Requirement 8: Data Migration

**User Story:** As a system administrator, I want to migrate all existing data from Google Sheets to PostgreSQL, so that no data is lost during the transition.

#### Acceptance Criteria

1. THE Migration_Tool SHALL extract all records from Google Sheets tabs: Perguntas, Áreas, Processos, Respostas BIA, Dependências, Config Respostas, Config Perfis, Tokens
2. THE Migration_Tool SHALL transform row-based spreadsheet data into properly typed relational records
3. THE Migration_Tool SHALL preserve all existing relationships between entities (area-processo, processo-respostas)
4. THE Migration_Tool SHALL generate a migration report listing total records per table, successful inserts, and any errors
5. IF a record fails to migrate, THEN THE Migration_Tool SHALL log the error with the source row number and continue processing remaining records
6. THE Migration_Tool SHALL be idempotent, allowing re-execution without creating duplicate records

### Requirement 9: CORS and Frontend Integration

**User Story:** As a frontend developer, I want the API to handle cross-origin requests from the Firebase Hosting domain, so that the frontend can communicate with the new backend without browser restrictions.

#### Acceptance Criteria

1. THE API_Server SHALL include CORS headers allowing requests from https://bia-forte-2025.web.app
2. THE API_Server SHALL support CORS preflight (OPTIONS) requests
3. THE API_Server SHALL allow Content-Type headers including application/json and text/plain (for backward compatibility with the current frontend POST format)
4. THE API_Server SHALL expose a health check endpoint at GET /health that returns HTTP 200 without authentication

### Requirement 10: Deployment and Infrastructure

**User Story:** As a DevOps engineer, I want the application deployable to a cloud provider with containerization, so that it can be reliably operated and scaled.

#### Acceptance Criteria

1. THE API_Server SHALL include a Dockerfile for containerized deployment
2. THE API_Server SHALL read all configuration (database URL, Firebase project ID, email credentials, CORS origins) from environment variables
3. THE API_Server SHALL include a docker-compose.yml for local development with PostgreSQL
4. THE API_Server SHALL provide database migration scripts that run automatically on application startup
5. THE API_Server SHALL implement structured JSON logging for all requests and errors
6. THE API_Server SHALL expose a readiness endpoint that verifies database connectivity

### Requirement 11: Dependências (Dependencies Catalog) Management

**User Story:** As a BIA analyst, I want to manage a catalog of dependencies (people, systems, suppliers), so that I can document what each process depends on.

#### Acceptance Criteria

1. THE API_Server SHALL support CRUD operations for Dependência entities with fields: categoria, nome, papel, setor, empresa, telefone, email, endereco
2. WHEN a new Dependência is saved without an ID, THE API_Server SHALL create a new record and return its generated ID
3. WHEN a Dependência is saved with an existing ID, THE API_Server SHALL update the existing record
4. WHEN a Dependência is deleted, THE API_Server SHALL remove the record from the Database

### Requirement 12: Configuration Management (Respostas and Perfis)

**User Story:** As an administrator, I want to manage answer option configurations and user profiles, so that the evaluation system is customizable and access is controlled.

#### Acceptance Criteria

1. THE API_Server SHALL support CRUD operations for Config_Resposta entities with fields: categoria, valor, label, cor, background
2. WHEN no Config_Resposta exists for a given category, THE API_Server SHALL fall back to the "_default" category configuration
3. THE API_Server SHALL return Config_Resposta records grouped by category
4. THE API_Server SHALL support retrieval of Config_Perfil by email address, returning: email, nome, area, admin flag
5. WHEN a Config_Perfil is requested for an email that does not exist, THE API_Server SHALL return an appropriate error response

### Requirement 13: Extensibility for Future Phases

**User Story:** As an architect, I want the system designed for extensibility, so that future phases (AI agent, document generation, runbooks, governance) can be integrated without major refactoring.

#### Acceptance Criteria

1. THE API_Server SHALL define use case interfaces that allow new use cases to be added without modifying existing ones
2. THE API_Server SHALL expose domain events (evaluation completed, process created, tier changed) through an internal event system
3. THE API_Server SHALL structure the database schema to accommodate future tables (documents, runbooks, audit_logs) without breaking existing migrations
4. THE API_Server SHALL provide a modular routing system where new endpoint groups can be registered independently
5. THE API_Server SHALL include an OpenAPI/Swagger specification documenting all endpoints for future AI agent integration
