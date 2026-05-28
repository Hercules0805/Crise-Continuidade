/**
 * Email template for area BIA reports with summary cards and process score table.
 * Validates: Requirements 7.3
 */
export function areaReportTemplate(data: {
  areaName: string;
  summary: {
    total: number;
    evaluated: number;
    tier1: number;
    tier2: number;
    tier3: number;
  };
  processes: Array<{ nome: string; score: number; tier: string }>;
}): string {
  const { areaName, summary, processes } = data;

  const summaryCards = `
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin: 20px 0;">
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; min-width: 100px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #333;">${summary.total}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Total</div>
      </div>
      <div style="background: #e8f5e9; border-radius: 8px; padding: 16px 20px; min-width: 100px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">${summary.evaluated}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Avaliados</div>
      </div>
      <div style="background: #ffebee; border-radius: 8px; padding: 16px 20px; min-width: 100px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #c62828;">${summary.tier1}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Tier 1</div>
      </div>
      <div style="background: #fff3e0; border-radius: 8px; padding: 16px 20px; min-width: 100px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #e65100;">${summary.tier2}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Tier 2</div>
      </div>
      <div style="background: #e3f2fd; border-radius: 8px; padding: 16px 20px; min-width: 100px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #1565c0;">${summary.tier3}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Tier 3</div>
      </div>
    </div>
  `;

  const processRows = processes
    .map(
      (p) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${p.nome}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: center;">${p.score}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: center;">${p.tier}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #333; margin-bottom: 8px;">Relatório BIA</h1>
      <h2 style="color: #555; font-weight: normal; margin-top: 0;">${areaName}</h2>
      ${summaryCards}
      <table style="width: 100%; border-collapse: collapse; margin-top: 24px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #ddd;">Processo</th>
            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #ddd;">Score</th>
            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #ddd;">Tier</th>
          </tr>
        </thead>
        <tbody>
          ${processRows}
        </tbody>
      </table>
    </div>
  `;
}
