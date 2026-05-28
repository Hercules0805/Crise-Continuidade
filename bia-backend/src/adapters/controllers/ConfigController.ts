import { ConfigRespostaCrudUseCase } from '../../use-cases/crud/ConfigRespostaCrudUseCase';

export class ConfigController {
  constructor(private readonly configRespostaCrud: ConfigRespostaCrudUseCase) {}

  async getConfigRespostas(params: Record<string, string>): Promise<any> {
    return this.configRespostaCrud.getConfigRespostas(params.categoria);
  }

  async salvarConfigResposta(data: any): Promise<any> {
    return this.configRespostaCrud.salvarConfigResposta(data);
  }

  async excluirConfigResposta(data: any): Promise<any> {
    return this.configRespostaCrud.excluirConfigResposta(data.id);
  }
}
