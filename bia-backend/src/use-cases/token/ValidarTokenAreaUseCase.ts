import { ITokenRepository } from '../interfaces/ITokenRepository';
import { IAreaRepository } from '../interfaces/IAreaRepository';
import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { IPerguntaRepository } from '../interfaces/IPerguntaRepository';
import { DomainError } from '../../domain/errors/DomainError';
import { TokenExpiredError } from '../../domain/errors/TokenExpiredError';
import { TokenUsedError } from '../../domain/errors/TokenUsedError';
import { TokenInvalidError } from '../../domain/errors/TokenInvalidError';
import { Processo, Pergunta } from '../../domain/entities';

export type ValidarTokenAreaResult =
  | { success: true; area: string; processos: Processo[]; perguntas: Pergunta[] }
  | { success: false; error: DomainError };

export class ValidarTokenAreaUseCase {
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly areaRepository: IAreaRepository,
    private readonly processoRepository: IProcessoRepository,
    private readonly perguntaRepository: IPerguntaRepository
  ) {}

  async execute(tokenId: string): Promise<ValidarTokenAreaResult> {
    const token = await this.tokenRepository.findByToken(tokenId);

    if (!token) {
      return { success: false, error: new TokenInvalidError() };
    }

    if (token.usado) {
      return { success: false, error: new TokenUsedError() };
    }

    if (new Date() > token.expires_at) {
      return { success: false, error: new TokenExpiredError() };
    }

    const area = await this.areaRepository.findById(token.area_id);
    if (!area) {
      return { success: false, error: new TokenInvalidError() };
    }

    const processos = await this.processoRepository.findByArea(area.nome);
    const perguntas = await this.perguntaRepository.findActive();

    return {
      success: true,
      area: area.nome,
      processos,
      perguntas,
    };
  }
}
