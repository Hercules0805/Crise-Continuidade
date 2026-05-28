import { ValidarTokenAreaUseCase } from '../../../../src/use-cases/token/ValidarTokenAreaUseCase';
import { ITokenRepository } from '../../../../src/use-cases/interfaces/ITokenRepository';
import { IAreaRepository } from '../../../../src/use-cases/interfaces/IAreaRepository';
import { IProcessoRepository } from '../../../../src/use-cases/interfaces/IProcessoRepository';
import { IPerguntaRepository } from '../../../../src/use-cases/interfaces/IPerguntaRepository';
import { Token, Area, Processo, Pergunta } from '../../../../src/domain/entities';

describe('ValidarTokenAreaUseCase', () => {
  let tokenRepository: jest.Mocked<ITokenRepository>;
  let areaRepository: jest.Mocked<IAreaRepository>;
  let processoRepository: jest.Mocked<IProcessoRepository>;
  let perguntaRepository: jest.Mocked<IPerguntaRepository>;
  let useCase: ValidarTokenAreaUseCase;

  beforeEach(() => {
    tokenRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      markAsUsed: jest.fn(),
    };
    areaRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByNome: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    processoRepository = {
      findAll: jest.fn(),
      findByArea: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      updateTierAndRto: jest.fn(),
    };
    perguntaRepository = {
      findAll: jest.fn(),
      findActive: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ValidarTokenAreaUseCase(
      tokenRepository,
      areaRepository,
      processoRepository,
      perguntaRepository
    );
  });

  function makeToken(overrides: Partial<Token> = {}): Token {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    return {
      id: 'token-area-1',
      area_id: 'area-1',
      processo_id: null,
      email: 'user@example.com',
      tipo: 'area',
      usado: false,
      expires_at: future,
      created_at: new Date(),
      ...overrides,
    };
  }

  const mockArea: Area = {
    id: 'area-1',
    nome: 'TI',
    responsavel: 'João',
    email: 'ti@example.com',
    solucao: 'Infraestrutura',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockProcessos: Processo[] = [
    {
      id: 'proc-1',
      area_id: 'area-1',
      processo: 'Backup',
      descricao: 'Backup diário',
      dependencia: 'Storage',
      rto: '< 4 horas',
      rpo: '1 hora',
      mtpd: '24 horas',
      biaHomologada: 'Sim',
      tier: 'Tier 1',
      bcpStatus: 'Ativo',
      descricaoFuncional: '',
      impactoIndisponibilidade: {},
      bcpObjetivo: '',
      bcpEscopo: '',
      bcpContatos: [],
      bcpRiscos: [],
      bcpPreventivas: [],
      drpStatus: '',
      drpObjetivo: '',
      drpEscopo: '',
      drpProcedimentos: '',
      drpCriterios: '',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const mockPerguntas: Pergunta[] = [
    {
      id: 'perg-1',
      categoria: 'Impacto',
      pergunta: 'Qual o impacto financeiro?',
      descricao: 'Descreva o impacto',
      ativa: true,
      ordem: 1,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  it('should return area name, processos, and perguntas for a valid token', async () => {
    tokenRepository.findByToken.mockResolvedValue(makeToken());
    areaRepository.findById.mockResolvedValue(mockArea);
    processoRepository.findByArea.mockResolvedValue(mockProcessos);
    perguntaRepository.findActive.mockResolvedValue(mockPerguntas);

    const result = await useCase.execute('token-area-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.area).toBe('TI');
      expect(result.processos).toEqual(mockProcessos);
      expect(result.perguntas).toEqual(mockPerguntas);
    }
  });

  it('should return TokenInvalidError when token does not exist', async () => {
    tokenRepository.findByToken.mockResolvedValue(null);

    const result = await useCase.execute('nonexistent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_INVALID');
    }
  });

  it('should return TokenUsedError when token has been used', async () => {
    tokenRepository.findByToken.mockResolvedValue(makeToken({ usado: true }));

    const result = await useCase.execute('token-area-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_USED');
    }
  });

  it('should return TokenExpiredError when token has expired', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    tokenRepository.findByToken.mockResolvedValue(makeToken({ expires_at: past }));

    const result = await useCase.execute('token-area-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_EXPIRED');
    }
  });

  it('should return TokenInvalidError when area is not found', async () => {
    tokenRepository.findByToken.mockResolvedValue(makeToken());
    areaRepository.findById.mockResolvedValue(null);

    const result = await useCase.execute('token-area-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOKEN_INVALID');
    }
  });
});
