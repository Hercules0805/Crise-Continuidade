import { RespostaBia } from '../../domain/entities';

export interface IRespostaBiaRepository {
  findByProcesso(processoId: string): Promise<RespostaBia[]>;
  findLatestByProcesso(processoId: string): Promise<RespostaBia | null>;
  findAll(): Promise<RespostaBia[]>;
  save(resposta: RespostaBia): Promise<RespostaBia>;
}
