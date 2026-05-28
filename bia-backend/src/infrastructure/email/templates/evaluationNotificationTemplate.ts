/**
 * Email template for evaluation completion notifications.
 * Validates: Requirements 7.4
 */
export function evaluationNotificationTemplate(data: {
  areaName: string;
  processoName: string;
  respondente: string;
  score: number;
  tier: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333; margin-bottom: 16px;">Nova Avaliação BIA Concluída</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666; width: 140px;">Área</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${data.areaName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Processo</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${data.processoName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Respondente</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333;">${data.respondente}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Score</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${data.score}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; color: #666;">Tier</td>
          <td style="padding: 8px 12px; color: #333; font-weight: bold;">${data.tier}</td>
        </tr>
      </table>
    </div>
  `;
}
