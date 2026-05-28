import { Repository } from 'typeorm';
import { IProcessoRepository } from '../../../use-cases/interfaces/IProcessoRepository';
import { Processo } from '../../../domain/entities/Processo';
import { ProcessoEntity } from '../entities/ProcessoEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmProcessoRepository implements IProcessoRepository {
  private repository: Repository<ProcessoEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(ProcessoEntity);
  }

  async findAll(): Promise<Processo[]> {
    return this.repository.find();
  }

  async findByArea(areaName: string): Promise<Processo[]> {
    return this.repository.find({
      where: {
        area: { nome: areaName },
      },
      relations: ['area'],
    });
  }

  async findById(id: string): Promise<Processo | null> {
    return this.repository.findOneBy({ id });
  }

  async save(processo: Processo): Promise<Processo> {
    return this.repository.save(processo);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async updateTierAndRto(id: string, tier: string, rto: string): Promise<void> {
    await this.repository.update(id, { tier, rto });
  }
}
