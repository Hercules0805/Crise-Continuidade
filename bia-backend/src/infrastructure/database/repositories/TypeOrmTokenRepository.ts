import { Repository } from 'typeorm';
import { ITokenRepository } from '../../../use-cases/interfaces/ITokenRepository';
import { Token } from '../../../domain/entities/Token';
import { TokenEntity } from '../entities/TokenEntity';
import { AppDataSource } from '../data-source';

export class TypeOrmTokenRepository implements ITokenRepository {
  private repository: Repository<TokenEntity>;

  constructor() {
    this.repository = AppDataSource.getRepository(TokenEntity);
  }

  async findByToken(token: string): Promise<Token | null> {
    return this.repository.findOneBy({ id: token });
  }

  async save(token: Token): Promise<Token> {
    return this.repository.save(token);
  }

  async markAsUsed(id: string): Promise<void> {
    await this.repository.update(id, { usado: true });
  }
}
