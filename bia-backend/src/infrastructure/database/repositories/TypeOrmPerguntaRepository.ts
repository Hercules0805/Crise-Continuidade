import { Repository } from 'typeorm';
import { IPerguntaRepository } from '../../../use-cases/interfaces/IPerguntaRepository';
import { Pergunta } from '../../../domain/entities/Pergunta';
import { PerguntaEntity } from '../entities/PerguntaEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmPerguntaRepository implements IPerguntaRepository {
  private repository: Repository<PerguntaEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(PerguntaEntity);
  }

  async findAll(): Promise<Pergunta[]> {
    return this.repository.find({ order: { ordem: 'ASC' } });
  }

  async findActive(): Promise<Pergunta[]> {
    return this.repository.find({
      where: { ativa: true },
      order: { ordem: 'ASC' },
    });
  }

  async save(pergunta: Pergunta): Promise<Pergunta> {
    return this.repository.save(pergunta);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
