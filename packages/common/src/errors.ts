export type AppErrorCategory =
  'validation' | 'auth' | 'authorization' | 'business' | 'dependency' | 'unknown';

export type AppErrorOptions = {
  code?: string;
  statusCode?: number;
  category?: AppErrorCategory;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly category: AppErrorCategory;
  public readonly retryable: boolean;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  constructor(message: string, options?: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = options?.code ?? 'APP_ERROR';
    this.statusCode = options?.statusCode ?? 500;
    this.category = options?.category ?? 'unknown';
    this.retryable = options?.retryable ?? this.statusCode >= 500;
    this.details = options?.details;
    this.cause = options?.cause;
  }

  toResponse() {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      retryable: this.retryable,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
