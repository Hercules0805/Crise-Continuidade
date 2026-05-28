import { Repository } from 'typeorm';
import { IConfigRespostaRepository } from '../../../use-cases/interfaces/IConfigRespostaRepository';
import { ConfigResposta } from '../../../domain/entities/ConfigResposta';
import { ConfigRespostaEntity } from '../entities/ConfigRespostaEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmConfigRespostaRepository implements IConfigRespostaRepository {
  private repository: Repository<ConfigRespostaEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(ConfigRespostaEntity);
  }

  async findAll(): Promise<ConfigResposta[]> {
    return this.repository.find();
  }

  async findByCategoria(categoria: string): Promise<ConfigResposta[]> {
    return this.repository.find({ where: { categoria } });
  }

  async save(configResposta: ConfigResposta): Promise<ConfigResposta> {
    return this.repository.save(configResposta);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
