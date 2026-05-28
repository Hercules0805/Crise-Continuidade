import { SalvarRespostasUseCase } from '../../use-cases/evaluation/SalvarRespostasUseCase';
import { SalvarRespostasTokenUseCase } from '../../use-cases/evaluation/SalvarRespostasTokenUseCase';
import { SalvarRespostasAreaUseCase } from '../../use-cases/evaluation/SalvarRespostasAreaUseCase';
import { GetResumoRespostasUseCase } from '../../use-cases/evaluation/GetResumoRespostasUseCase';
import { DomainError } from '../../domain/errors/DomainError';

export class EvaluationController {
  constructor(
    private readonly salvarRespostas: SalvarRespostasUseCase,
    private readonly salvarRespostasToken: SalvarRespostasTokenUseCase,
    private readonly salvarRespostasArea: SalvarRespostasAreaUseCase,
    private readonly getResumoRespostas: GetResumoRespostasUseCase
  ) {}

  async handleSalvarRespostas(data: any): Promise<any> {
    return this.salvarRespostas.execute(data);
  }

  async handleSalvarRespostasToken(data: any): Promise<any> {
    const result = await this.salvarRespostasToken.execute(data);
    if (result instanceof DomainError) {
      return { error: result.message };
    }
    return result;
  }

  async handleSalvarRespostasArea(data: any): Promise<any> {
    const result = await this.salvarRespostasArea.execute(data);
    if (result instanceof DomainError) {
      return { error: result.message };
    }
    return result;
  }

  async handleGetResumoRespostas(): Promise<any> {
    return this.getResumoRespostas.execute();
  }
}
