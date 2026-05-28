import { GerarTokenUseCase } from '../../use-cases/token/GerarTokenUseCase';
import { GerarTokenAreaUseCase } from '../../use-cases/token/GerarTokenAreaUseCase';
import { ValidarTokenUseCase } from '../../use-cases/token/ValidarTokenUseCase';
import { ValidarTokenAreaUseCase } from '../../use-cases/token/ValidarTokenAreaUseCase';

export class TokenController {
  constructor(
    private readonly gerarToken: GerarTokenUseCase,
    private readonly gerarTokenArea: GerarTokenAreaUseCase,
    private readonly validarToken: ValidarTokenUseCase,
    private readonly validarTokenArea: ValidarTokenAreaUseCase
  ) {}

  async handleGerarToken(data: any): Promise<any> {
    return this.gerarToken.execute(data);
  }

  async handleGerarTokenArea(data: any): Promise<any> {
    return this.gerarTokenArea.execute(data);
  }

  async handleValidarToken(params: Record<string, string>): Promise<any> {
    const result = await this.validarToken.execute(params.token);
    if (!result.success) {
      return { error: result.error.message };
    }
    return result;
  }

  async handleValidarTokenArea(params: Record<string, string>): Promise<any> {
    const result = await this.validarTokenArea.execute(params.token);
    if (!result.success) {
      return { error: result.error.message };
    }
    return result;
  }
}
