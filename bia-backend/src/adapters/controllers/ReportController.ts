import { GerarRelatorioAreaUseCase } from '../../use-cases/report/GerarRelatorioAreaUseCase';

export class ReportController {
  constructor(private readonly gerarRelatorioArea: GerarRelatorioAreaUseCase) {}

  async handleGerarRelatorioArea(data: any): Promise<any> {
    return this.gerarRelatorioArea.execute(data);
  }
}
