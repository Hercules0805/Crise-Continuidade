import pino from 'pino';
import { env } from '../config/env';

function resolvePrettyTransport(): pino.TransportSingleOptions | undefined {
  if (env.nodeEnv !== 'development') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true } };
  } catch {
    return undefined;
  }
}

export class StructuredLogger {
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: env.nodeEnv === 'production' ? 'info' : 'debug',
      transport: resolvePrettyTransport(),
    });
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.info(data, message);
    } else {
      this.logger.info(message);
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.error(data, message);
    } else {
      this.logger.error(message);
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.warn(data, message);
    } else {
      this.logger.warn(message);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.debug(data, message);
    } else {
      this.logger.debug(message);
    }
  }
}
