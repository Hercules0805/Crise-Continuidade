import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { Processo } from '../../domain/entities';

export class ProcessoCrudUseCase {
  constructor(private readonly processoRepository: IProcessoRepository) {}

  async getProcessos(): Promise<Processo[]> {
    return this.processoRepository.findAll();
  }

  async getProcessosPorArea(areaName: string): Promise<Processo[]> {
    return this.processoRepository.findByArea(areaName);
  }

  async salvarProcesso(data: Partial<Processo>): Promise<{ success: true; id?: string }> {
    const saved = await this.processoRepository.save(data as Processo);
    return { success: true, id: saved.id };
  }

  async excluirProcesso(id: string): Promise<{ success: true }> {
    await this.processoRepository.delete(id);
    return { success: true };
  }
}
