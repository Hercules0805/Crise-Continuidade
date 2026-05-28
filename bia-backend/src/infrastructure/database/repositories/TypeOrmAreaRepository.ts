import { Repository } from 'typeorm';
import { IAreaRepository } from '../../../use-cases/interfaces/IAreaRepository';
import { Area } from '../../../domain/entities/Area';
import { AreaEntity } from '../entities/AreaEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmAreaRepository implements IAreaRepository {
  private repository: Repository<AreaEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(AreaEntity);
  }

  async findAll(): Promise<Area[]> {
    return this.repository.find();
  }

  async findById(id: string): Promise<Area | null> {
    return this.repository.findOneBy({ id });
  }

  async findByNome(nome: string): Promise<Area | null> {
    return this.repository.findOneBy({ nome });
  }

  async save(area: Area): Promise<Area> {
    return this.repository.save(area);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
