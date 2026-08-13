import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { LOG_LEVELS, type LogLevel } from '../../config/configuration';
import { getRequestContext } from './request-context';

/**
 * Structured JSON logger.
 *
 * One JSON object per line so pilot hosting (Railway) and any future log
 * shipper can parse operational logs without a custom format.
 *
 * Never log: passwords, tokens, JWT secrets, full report content, audio
 * payloads, HBYS or object-storage credentials (CLAUDE.md section 42).
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLogger implements LoggerService {
  private readonly threshold: number;

  constructor(
    private readonly level: LogLevel = 'info',
    private readonly context?: string,
  ) {
    this.threshold = LOG_LEVELS.indexOf(level);
  }

  /** Returns a logger bound to a class/module name. */
  child(context: string): AppLogger {
    return new AppLogger(this.level, context);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  info(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  private write(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    if (LOG_LEVELS.indexOf(level) < this.threshold) {
      return;
    }

    const requestContext = getRequestContext();
    const { text, extra } = normalizeMessage(message);

    const entry: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      context: context ?? this.context,
      message: text,
      ...extra,
    };

    if (requestContext?.requestId) entry.requestId = requestContext.requestId;
    if (requestContext?.userId) entry.userId = requestContext.userId;
    if (stack) entry.stack = stack;

    const line = safeStringify(entry);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

function normalizeMessage(message: unknown): {
  text: string;
  extra: Record<string, unknown>;
} {
  if (typeof message === 'string') {
    return { text: message, extra: {} };
  }
  if (message instanceof Error) {
    return { text: message.message, extra: { errorName: message.name } };
  }
  if (typeof message === 'object' && message !== null) {
    const { message: text, ...rest } = message as Record<string, unknown>;
    return {
      text: typeof text === 'string' ? text : '',
      extra: rest,
    };
  }
  return { text: String(message), extra: {} };
}

/** Stringify that cannot throw on circular structures and crash the process. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (typeof val === 'bigint') return val.toString();
      return val;
    });
  } catch {
    return JSON.stringify({ level: 'error', message: 'Log serialization failed' });
  }
}
