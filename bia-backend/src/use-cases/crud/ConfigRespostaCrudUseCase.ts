import { IConfigRespostaRepository } from '../interfaces/IConfigRespostaRepository';
import { ConfigResposta } from '../../domain/entities';

export class ConfigRespostaCrudUseCase {
  constructor(private readonly configRespostaRepository: IConfigRespostaRepository) {}

  async getConfigRespostas(categoria?: string): Promise<Record<string, ConfigResposta[]>> {
    if (categoria) {
      let respostas = await this.configRespostaRepository.findByCategoria(categoria);

      if (respostas.length === 0) {
        respostas = await this.configRespostaRepository.findByCategoria('_default');
      }

      return { [categoria]: respostas };
    }

    const todas = await this.configRespostaRepository.findAll();
    const grouped: Record<string, ConfigResposta[]> = Object.create(null);

    for (const config of todas) {
      if (!grouped[config.categoria]) {
        grouped[config.categoria] = [];
      }
      grouped[config.categoria].push(config);
    }

    return grouped;
  }

  async salvarConfigResposta(data: Partial<ConfigResposta>): Promise<{ success: true; id?: string }> {
    const saved = await this.configRespostaRepository.save(data as ConfigResposta);
    return { success: true, id: saved.id };
  }

  async excluirConfigResposta(id: string): Promise<{ success: true }> {
    await this.configRespostaRepository.delete(id);
    return { success: true };
  }
}
