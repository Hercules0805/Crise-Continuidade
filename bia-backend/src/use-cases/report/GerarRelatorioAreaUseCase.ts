import { IProcessoRepository } from '../interfaces/IProcessoRepository';
import { IRespostaBiaRepository } from '../interfaces/IRespostaBiaRepository';
import { IEmailService } from '../interfaces/IEmailService';
import { areaReportTemplate } from '../../infrastructure/email/templates/areaReportTemplate';

export class GerarRelatorioAreaUseCase {
  constructor(
    private readonly processoRepository: IProcessoRepository,
    private readonly respostaBiaRepository: IRespostaBiaRepository,
    private readonly emailService: IEmailService
  ) {}

  async execute(data: { areaName: string; email: string }): Promise<{ success: true }> {
    const processos = await this.processoRepository.findByArea(data.areaName);

    const total = processos.length;
    let evaluated = 0;
    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;
    const processData: Array<{ nome: string; score: number; tier: string }> = [];

    for (const processo of processos) {
      const latestResposta = await this.respostaBiaRepository.findLatestByProcesso(processo.id);
      if (latestResposta) {
        evaluated++;
        if (latestResposta.score_total >= 12) tier1++;
        else if (latestResposta.score_total >= 6) tier2++;
        else if (latestResposta.score_total > 0) tier3++;
        processData.push({ nome: processo.processo, score: latestResposta.score_total, tier: latestResposta.tier });
      } else {
        processData.push({ nome: processo.processo, score: 0, tier: 'Não avaliado' });
      }
    }

    const html = areaReportTemplate({
      areaName: data.areaName,
      summary: { total, evaluated, tier1, tier2, tier3 },
      processes: processData,
    });

    await this.emailService.sendHtmlReport(
      data.email,
      `Relatório BIA - ${data.areaName}`,
      html
    );

    return { success: true };
  }
}
