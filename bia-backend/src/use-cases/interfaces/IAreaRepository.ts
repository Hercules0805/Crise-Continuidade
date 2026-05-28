import { Area } from '../../domain/entities';

export interface IAreaRepository {
  findAll(): Promise<Area[]>;
  findById(id: string): Promise<Area | null>;
  findByNome(nome: string): Promise<Area | null>;
  save(area: Area): Promise<Area>;
  delete(id: string): Promise<void>;
}
