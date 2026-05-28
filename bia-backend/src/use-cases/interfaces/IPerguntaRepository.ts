import { Pergunta } from '../../domain/entities';

export interface IPerguntaRepository {
  findAll(): Promise<Pergunta[]>;
  findActive(): Promise<Pergunta[]>;
  save(pergunta: Pergunta): Promise<Pergunta>;
  delete(id: string): Promise<void>;
}
