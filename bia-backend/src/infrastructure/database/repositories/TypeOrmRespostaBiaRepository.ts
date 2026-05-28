import { Repository } from 'typeorm';
import { IRespostaBiaRepository } from '../../../use-cases/interfaces/IRespostaBiaRepository';
import { RespostaBia } from '../../../domain/entities/RespostaBia';
import { RespostaBiaEntity } from '../entities/RespostaBiaEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmRespostaBiaRepository implements IRespostaBiaRepository {
  private repository: Repository<RespostaBiaEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(RespostaBiaEntity);
  }

  async findByProcesso(processoId: string): Promise<RespostaBia[]> {
    return this.repository.find({
      where: { processo_id: processoId },
      order: { created_at: 'DESC' },
    });
  }

  async findLatestByProcesso(processoId: string): Promise<RespostaBia | null> {
    return this.repository.findOne({
      where: { processo_id: processoId },
      order: { created_at: 'DESC' },
    });
  }

  async findAll(): Promise<RespostaBia[]> {
    return this.repository.find({ order: { created_at: 'DESC' } });
  }

  async save(resposta: RespostaBia): Promise<RespostaBia> {
    return this.repository.save(resposta);
  }
}
