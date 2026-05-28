import { Request, Response, NextFunction } from 'express';
import { env } from '../../infrastructure/config/env';

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = env.corsOrigin;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
