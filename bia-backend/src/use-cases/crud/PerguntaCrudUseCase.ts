import { IPerguntaRepository } from '../interfaces/IPerguntaRepository';
import { Pergunta } from '../../domain/entities';

export class PerguntaCrudUseCase {
  constructor(private readonly perguntaRepository: IPerguntaRepository) {}

  async getPerguntas(): Promise<Pergunta[]> {
    return this.perguntaRepository.findAll();
  }

  async salvarPergunta(data: Partial<Pergunta>): Promise<{ success: true; id?: string }> {
    const saved = await this.perguntaRepository.save(data as Pergunta);
    return { success: true, id: saved.id };
  }

  async excluirPergunta(id: string): Promise<{ success: true }> {
    await this.perguntaRepository.delete(id);
    return { success: true };
  }
}
