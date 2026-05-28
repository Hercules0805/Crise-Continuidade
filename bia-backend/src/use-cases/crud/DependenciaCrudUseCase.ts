import { IDependenciaRepository } from '../interfaces/IDependenciaRepository';
import { Dependencia } from '../../domain/entities';

export class DependenciaCrudUseCase {
  constructor(private readonly dependenciaRepository: IDependenciaRepository) {}

  async getDependencias(): Promise<Dependencia[]> {
    return this.dependenciaRepository.findAll();
  }

  async salvarDependencia(data: Partial<Dependencia>): Promise<{ success: true; id?: string }> {
    const saved = await this.dependenciaRepository.save(data as Dependencia);
    return { success: true, id: saved.id };
  }

  async excluirDependencia(id: string): Promise<{ success: true }> {
    await this.dependenciaRepository.delete(id);
    return { success: true };
  }
}
