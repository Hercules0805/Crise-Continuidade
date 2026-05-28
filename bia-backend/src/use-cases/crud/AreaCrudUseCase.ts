import { IAreaRepository } from '../interfaces/IAreaRepository';
import { Area } from '../../domain/entities';

export class AreaCrudUseCase {
  constructor(private readonly areaRepository: IAreaRepository) {}

  async getAreas(): Promise<Area[]> {
    return this.areaRepository.findAll();
  }

  async salvarArea(data: Partial<Area>): Promise<{ success: true; id?: string }> {
    const saved = await this.areaRepository.save(data as Area);
    return { success: true, id: saved.id };
  }

  async excluirArea(id: string): Promise<{ success: true }> {
    await this.areaRepository.delete(id);
    return { success: true };
  }
}
