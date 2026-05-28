import { Repository } from 'typeorm';
import { IConfigPerfilRepository } from '../../../use-cases/interfaces/IConfigPerfilRepository';
import { ConfigPerfil } from '../../../domain/entities/ConfigPerfil';
import { ConfigPerfilEntity } from '../entities/ConfigPerfilEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmConfigPerfilRepository implements IConfigPerfilRepository {
  private repository: Repository<ConfigPerfilEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(ConfigPerfilEntity);
  }

  async findByEmail(email: string): Promise<ConfigPerfil | null> {
    return this.repository.findOneBy({ email });
  }
}
