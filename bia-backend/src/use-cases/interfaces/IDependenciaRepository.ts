import { Dependencia } from '../../domain/entities';

export interface IDependenciaRepository {
  findAll(): Promise<Dependencia[]>;
  save(dependencia: Dependencia): Promise<Dependencia>;
  delete(id: string): Promise<void>;
}
