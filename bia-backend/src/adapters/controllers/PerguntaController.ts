import { PerguntaCrudUseCase } from '../../use-cases/crud/PerguntaCrudUseCase';

export class PerguntaController {
  constructor(private readonly perguntaCrud: PerguntaCrudUseCase) {}

  async getPerguntas(): Promise<any> {
    return this.perguntaCrud.getPerguntas();
  }

  async salvarPergunta(data: any): Promise<any> {
    return this.perguntaCrud.salvarPergunta(data);
  }

  async excluirPergunta(data: any): Promise<any> {
    return this.perguntaCrud.excluirPergunta(data.id);
  }
}
