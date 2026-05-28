import { Token } from '../../domain/entities';

export interface ITokenRepository {
  findByToken(token: string): Promise<Token | null>;
  save(token: Token): Promise<Token>;
  markAsUsed(id: string): Promise<void>;
}
