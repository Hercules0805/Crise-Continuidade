import * as fc from 'fast-check';
import { ValidarTokenUseCase, ValidarTokenResult } from '../../src/use-cases/token/ValidarTokenUseCase';
import { SalvarRespostasTokenUseCase } from '../../src/use-cases/evaluation/SalvarRespostasTokenUseCase';
import { Token } from '../../src/domain/entities/Token';
import { RespostaBia } from '../../src/domain/entities/RespostaBia';
import { ITokenRepository } from '../../src/use-cases/interfaces/ITokenRepository';
import { IRespostaBiaRepository } from '../../src/use-cases/interfaces/IRespostaBiaRepository';
import { IProcessoRepository } from '../../src/use-cases/interfaces/IProcessoRepository';
import { IEventBus } from '../../src/use-cases/interfaces/IEventBus';
import { DomainEvent } from '../../src/domain/events/DomainEvent';
import { Processo } from '../../src/domain/entities/Processo';

// --- In-Memory Implementations ---

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

  addToken(token: Token): void {
    this.tokens.set(token.id, token);
  }

  getToken(id: string): Token | undefined {
    return this.tokens.get(id);
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
    this.respostas.push(resposta);
    return resposta;
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

class InMemoryEventBus implements IEventBus {
  public publishedEvents: DomainEvent[] = [];

  publish(event: DomainEvent): void {
    this.publishedEvents.push(event);
  }

  subscribe(_eventType: string, _handler: (event: DomainEvent) => void): void {
    // No-op for testing
  }
}

// --- Property Tests ---

/**
 * Validates: Requirements 6.3, 6.4, 6.5
 */
describe('Property 8: Token Validation State Machine', () => {
  it('returns TOKEN_INVALID error for non-existent tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (tokenId) => {
          const repo = new InMemoryTokenRepository();
          const useCase = new ValidarTokenUseCase(repo);
          const result = await useCase.execute(tokenId);
          return result.success === false && result.error.code === 'TOKEN_INVALID';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns TOKEN_USED error for used tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (tokenId) => {
          const repo = new InMemoryTokenRepository();
          repo.addToken({
            id: tokenId,
            area_id: 'area-1',
            processo_id: 'proc-1',
            email: 'test@test.com',
            tipo: 'processo',
            usado: true,
            expires_at: new Date(Date.now() + 86400000), // future (not expired)
            created_at: new Date(),
          });
          const useCase = new ValidarTokenUseCase(repo);
          const result = await useCase.execute(tokenId);
          return result.success === false && result.error.code === 'TOKEN_USED';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns TOKEN_EXPIRED error for expired tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (tokenId) => {
          const repo = new InMemoryTokenRepository();
          repo.addToken({
            id: tokenId,
            area_id: 'area-1',
            processo_id: 'proc-1',
            email: 'test@test.com',
            tipo: 'processo',
            usado: false,
            expires_at: new Date(Date.now() - 1000), // past (expired)
            created_at: new Date(),
          });
          const useCase = new ValidarTokenUseCase(repo);
          const result = await useCase.execute(tokenId);
          return result.success === false && result.error.code === 'TOKEN_EXPIRED';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns success for valid (existing, unused, not expired) tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (tokenId) => {
          const repo = new InMemoryTokenRepository();
          repo.addToken({
            id: tokenId,
            area_id: 'area-1',
            processo_id: 'proc-1',
            email: 'test@test.com',
            tipo: 'processo',
            usado: false,
            expires_at: new Date(Date.now() + 86400000), // future
            created_at: new Date(),
          });
          const useCase = new ValidarTokenUseCase(repo);
          const result = await useCase.execute(tokenId);
          return result.success === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('states are mutually exclusive and deterministic', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.boolean(), // usado
        fc.boolean(), // expired
        fc.boolean(), // exists
        async (tokenId, usado, expired, exists) => {
          const repo = new InMemoryTokenRepository();

          if (exists) {
            repo.addToken({
              id: tokenId,
              area_id: 'area-1',
              processo_id: 'proc-1',
              email: 'test@test.com',
              tipo: 'processo',
              usado,
              expires_at: expired
                ? new Date(Date.now() - 1000)
                : new Date(Date.now() + 86400000),
              created_at: new Date(),
            });
          }

          const useCase = new ValidarTokenUseCase(repo);
          const result = await useCase.execute(tokenId);

          if (!exists) {
            return result.success === false && result.error.code === 'TOKEN_INVALID';
          }
          if (usado) {
            return result.success === false && result.error.code === 'TOKEN_USED';
          }
          if (expired) {
            return result.success === false && result.error.code === 'TOKEN_EXPIRED';
          }
          return result.success === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 6.7
 */
describe('Property 9: Token Marked Used After Submission', () => {
  it('token becomes used after successful submission', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 4 }),
          { minKeys: 1, maxKeys: 6 }
        ),
        async (tokenId, processoId, respondente, cargo, scores) => {
          const tokenRepo = new InMemoryTokenRepository();
          const respostaRepo = new InMemoryRespostaBiaRepository();
          const processoRepo = new InMemoryProcessoRepository();
          const eventBus = new InMemoryEventBus();

          // Set up a valid token
          tokenRepo.addToken({
            id: tokenId,
            area_id: 'area-1',
            processo_id: processoId,
            email: 'test@test.com',
            tipo: 'processo',
            usado: false,
            expires_at: new Date(Date.now() + 86400000),
            created_at: new Date(),
          });

          const useCase = new SalvarRespostasTokenUseCase(
            tokenRepo,
            respostaRepo,
            processoRepo,
            eventBus
          );

          const result = await useCase.execute({
            token: tokenId,
            processo_id: processoId,
            respondente,
            cargo,
            scores,
          });

          // Submission should succeed
          if (!('success' in result) || result.success !== true) {
            return false;
          }

          // Token should now be marked as used
          const updatedToken = tokenRepo.getToken(tokenId);
          if (!updatedToken || !updatedToken.usado) {
            return false;
          }

          // Subsequent validation should return TOKEN_USED
          const validarUseCase = new ValidarTokenUseCase(tokenRepo);
          const validationResult = await validarUseCase.execute(tokenId);
          return validationResult.success === false && validationResult.error.code === 'TOKEN_USED';
        }
      ),
      { numRuns: 100 }
    );
  });
});
