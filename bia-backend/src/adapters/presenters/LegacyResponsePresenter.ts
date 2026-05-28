import { Processo, RespostaBia } from '../../domain/entities';

/**
 * LegacyResponsePresenter
 *
 * Transforms domain entities into the exact JSON format expected by the
 * existing Firebase-hosted frontend. This ensures backward compatibility
 * with the Google Apps Script response format.
 *
 * All string fields default to empty string ''.
 * All array/JSON fields default to empty arrays [] or empty objects {}.
 * Score defaults to 0, avaliado is a boolean, respostas defaults to {}.
 * Content-Type for all responses is application/json.
 */
export class LegacyResponsePresenter {
  /**
   * Transforms a Processo entity to match the Google Sheets row-based format.
   *
   * @param processo - The Processo domain entity
   * @param areaName - The area name to include in the response (resolves area_id to name)
   * @param latestResposta - Optional latest RespostaBia for score/avaliado/respostas fields
   */
  static formatProcesso(
    processo: Processo,
    areaName: string,
    latestResposta?: RespostaBia
  ): object {
    return {
      id: processo.id,
      area: areaName || '',
      processo: processo.processo || '',
      descricao: processo.descricao || '',
      dependencia: processo.dependencia || '',
      rto: processo.rto || '',
      rpo: processo.rpo || '',
      mtpd: processo.mtpd || '',
      biaHomologada: processo.biaHomologada || '',
      tier: processo.tier || '',
      bcpStatus: processo.bcpStatus || '',
      descricaoFuncional: processo.descricaoFuncional || '',
      impactoIndisponibilidade: processo.impactoIndisponibilidade || {},
      bcpObjetivo: processo.bcpObjetivo || '',
      bcpEscopo: processo.bcpEscopo || '',
      bcpContatos: processo.bcpContatos || [],
      bcpRiscos: processo.bcpRiscos || [],
      bcpPreventivas: processo.bcpPreventivas || [],
      drpStatus: processo.drpStatus || '',
      drpObjetivo: processo.drpObjetivo || '',
      drpEscopo: processo.drpEscopo || '',
      drpProcedimentos: processo.drpProcedimentos || '',
      drpCriterios: processo.drpCriterios || '',
      score: latestResposta?.score_total || 0,
      avaliado: !!latestResposta,
      respostas: latestResposta?.scores || {},
    };
  }

  /**
   * Formats a list of processos with their associated area names and latest responses.
   *
   * @param items - Array of objects containing processo, areaName, and optional latestResposta
   */
  static formatProcessos(
    items: Array<{
      processo: Processo;
      areaName: string;
      latestResposta?: RespostaBia;
    }>
  ): object[] {
    return items.map((item) =>
      this.formatProcesso(item.processo, item.areaName, item.latestResposta)
    );
  }

  /**
   * Wraps a successful response payload.
   * Sets the standard success format expected by the frontend.
   */
  static success(data?: object): object {
    return { success: true, ...data };
  }

  /**
   * Wraps an error response payload.
   * Sets the standard error format expected by the frontend.
   */
  static error(message: string): object {
    return { error: message };
  }

  /**
   * Returns the Content-Type header value for all API responses.
   */
  static get contentType(): string {
    return 'application/json';
  }
}
