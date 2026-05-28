import { Request, Response, NextFunction } from 'express';
import { StructuredLogger } from '../../infrastructure/logging/StructuredLogger';

const logger = new StructuredLogger();

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    action: (req.query.action as string) || req.body?.action,
  });

  res.status(200).json({ error: 'Erro interno do servidor.' });
}
