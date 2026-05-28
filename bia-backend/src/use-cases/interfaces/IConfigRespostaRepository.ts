import { ConfigResposta } from '../../domain/entities';

export interface IConfigRespostaRepository {
  findAll(): Promise<ConfigResposta[]>;
  findByCategoria(categoria: string): Promise<ConfigResposta[]>;
  save(configResposta: ConfigResposta): Promise<ConfigResposta>;
  delete(id: string): Promise<void>;
}
