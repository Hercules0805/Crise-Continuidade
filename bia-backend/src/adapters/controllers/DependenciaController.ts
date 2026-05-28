import { DependenciaCrudUseCase } from '../../use-cases/crud/DependenciaCrudUseCase';

export class DependenciaController {
  constructor(private readonly dependenciaCrud: DependenciaCrudUseCase) {}

  async getDependencias(): Promise<any> {
    return this.dependenciaCrud.getDependencias();
  }

  async salvarDependencia(data: any): Promise<any> {
    return this.dependenciaCrud.salvarDependencia(data);
  }

  async excluirDependencia(data: any): Promise<any> {
    return this.dependenciaCrud.excluirDependencia(data.id);
  }
}
