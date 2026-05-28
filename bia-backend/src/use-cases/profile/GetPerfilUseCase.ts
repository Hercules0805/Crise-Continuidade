import { IConfigPerfilRepository } from '../interfaces/IConfigPerfilRepository';
import { ConfigPerfil } from '../../domain/entities/ConfigPerfil';

export class GetPerfilUseCase {
  constructor(private readonly configPerfilRepository: IConfigPerfilRepository) {}

  async execute(email: string): Promise<{ success: true; perfil: ConfigPerfil } | { error: string }> {
    const perfil = await this.configPerfilRepository.findByEmail(email);
    if (!perfil) {
      return { error: 'Perfil não encontrado.' };
    }
    return { success: true, perfil };
  }
}
