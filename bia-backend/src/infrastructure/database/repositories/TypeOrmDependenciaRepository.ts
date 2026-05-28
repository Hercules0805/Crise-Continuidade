import { Repository } from 'typeorm';
import { IDependenciaRepository } from '../../../use-cases/interfaces/IDependenciaRepository';
import { Dependencia } from '../../../domain/entities/Dependencia';
import { DependenciaEntity } from '../entities/DependenciaEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmDependenciaRepository implements IDependenciaRepository {
  private repository: Repository<DependenciaEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(DependenciaEntity);
  }

  async findAll(): Promise<Dependencia[]> {
    return this.repository.find();
  }

  async save(dependencia: Dependencia): Promise<Dependencia> {
    return this.repository.save(dependencia);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
