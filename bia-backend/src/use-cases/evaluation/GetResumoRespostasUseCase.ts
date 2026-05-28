import { IRespostaBiaRepository } from '../interfaces/IRespostaBiaRepository';
import { RespostaBia } from '../../domain/entities/RespostaBia';

/**
 * Use Case: GetResumoRespostas
 * Returns a summary of all BIA evaluation responses.
 *
 * Validates: Requirements 5.1
 */
export class GetResumoRespostasUseCase {
  constructor(
    private readonly respostaBiaRepository: IRespostaBiaRepository
  ) {}

  async execute(): Promise<RespostaBia[]> {
    return this.respostaBiaRepository.findAll();
  }
}
