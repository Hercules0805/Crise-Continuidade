import { Request, Response } from 'express';

type GetHandler = (params: Record<string, string>, userEmail?: string) => Promise<any>;
type PostHandler = (data: any, userEmail?: string) => Promise<any>;

/**
 * ActionRouter
 *
 * Central dispatcher that maintains backward compatibility with the frontend's
 * action-based routing pattern. GET requests use the `action` query parameter,
 * POST requests use the `action` field in the JSON body.
 *
 * Supports both application/json and text/plain Content-Type for POST requests
 * (legacy compatibility with the Google Apps Script frontend).
 */
export class ActionRouter {
  private getHandlers: Map<string, GetHandler> = new Map();
  private postHandlers: Map<string, PostHandler> = new Map();

  registerGet(action: string, handler: GetHandler): void {
    this.getHandlers.set(action, handler);
  }

  registerPost(action: string, handler: PostHandler): void {
    this.postHandlers.set(action, handler);
  }

  getRegisteredGetActions(): string[] {
    return Array.from(this.getHandlers.keys());
  }

  getRegisteredPostActions(): string[] {
    return Array.from(this.postHandlers.keys());
  }

  async handleGet(req: Request, res: Response): Promise<void> {
    const action = req.query.action as string;

    if (!action) {
      res.json({ error: 'Action não especificada' });
      return;
    }

    const handler = this.getHandlers.get(action);
    if (!handler) {
      res.json({ error: `Action não reconhecida: ${action}` });
      return;
    }

    try {
      const params = req.query as Record<string, string>;
      const userEmail = (req as any).userEmail;
      const result = await handler(params, userEmail);
      res.json(result);
    } catch (error) {
      res.json({ error: 'Erro interno do servidor.' });
    }
  }

  async handlePost(req: Request, res: Response): Promise<void> {
    // Parse body - support both application/json and text/plain (legacy)
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const action = body?.action;

    if (!action) {
      res.json({ error: 'Action não especificada' });
      return;
    }

    const handler = this.postHandlers.get(action);
    if (!handler) {
      res.json({ error: `Action não reconhecida: ${action}` });
      return;
    }

    try {
      const userEmail = (req as any).userEmail;
      const result = await handler(body, userEmail);
      res.json(result);
    } catch (error) {
      res.json({ error: 'Erro interno do servidor.' });
    }
  }
}
