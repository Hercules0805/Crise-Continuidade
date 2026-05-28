/**
 * Email template for area-level token invitations.
 * Validates: Requirements 7.1, 7.2
 */
export function areaTokenInvitationTemplate(data: {
  areaName: string;
  link: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333; margin-bottom: 16px;">Avaliação BIA</h2>
      <p style="color: #444; line-height: 1.6;">
        Você foi convidado para avaliar todos os processos da área <strong>${data.areaName}</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${data.link}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Acessar Avaliação
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Este link é válido por 7 dias.</p>
    </div>
  `;
}
