import { ConfigPerfil } from '../../domain/entities';

export interface IConfigPerfilRepository {
  findByEmail(email: string): Promise<ConfigPerfil | null>;
}
