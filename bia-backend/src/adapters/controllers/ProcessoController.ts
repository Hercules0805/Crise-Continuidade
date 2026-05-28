import { ProcessoCrudUseCase } from '../../use-cases/crud/ProcessoCrudUseCase';

export class ProcessoController {
  constructor(private readonly processoCrud: ProcessoCrudUseCase) {}

  async getProcessos(): Promise<any> {
    return this.processoCrud.getProcessos();
  }

  async getProcessosPorArea(params: Record<string, string>): Promise<any> {
    return this.processoCrud.getProcessosPorArea(params.area);
  }

  async salvarProcesso(data: any): Promise<any> {
    return this.processoCrud.salvarProcesso(data);
  }

  async excluirProcesso(data: any): Promise<any> {
    return this.processoCrud.excluirProcesso(data.id);
  }
}
