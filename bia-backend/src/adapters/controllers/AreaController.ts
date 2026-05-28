import { AreaCrudUseCase } from '../../use-cases/crud/AreaCrudUseCase';

export class AreaController {
  constructor(private readonly areaCrud: AreaCrudUseCase) {}

  async getAreas(): Promise<any> {
    return this.areaCrud.getAreas();
  }

  async salvarArea(data: any): Promise<any> {
    return this.areaCrud.salvarArea(data);
  }

  async excluirArea(data: any): Promise<any> {
    return this.areaCrud.excluirArea(data.id);
  }
}
