import { google, sheets_v4 } from 'googleapis';

/**
 * Cliente de leitura da planilha (somente leitura).
 */
export class SheetsClient {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(spreadsheetId: string, credentialsPath: string) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
  }

  async readTab(tabName: string): Promise<any[][]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: tabName,
    });
    return (res.data.values as any[][]) || [];
  }
}
