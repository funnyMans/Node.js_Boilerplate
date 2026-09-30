import { describe, expect, it } from 'vitest';
import { AppError, fail, isAppError, ok } from '../../src/errors';

describe('common errors', () => {
  it('returns successful result payloads', () => {
    const result = ok({ id: '123' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('123');
    }
  });

  it('reports app errors consistently', () => {
    const result = fail(
      new AppError('bad request', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'validation',
        details: { field: 'email' },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isAppError(result.error)).toBe(true);
      expect(result.error.statusCode).toBe(400);
      expect(result.error.category).toBe('validation');
      expect(result.error.toResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        category: 'validation',
        retryable: false,
      });
    }
  });

  it('marks downstream failures as retryable', () => {
    const error = new AppError('database unavailable', {
      code: 'DEPENDENCY_ERROR',
      statusCode: 503,
      category: 'dependency',
      retryable: true,
    });

    expect(error.retryable).toBe(true);
    expect(error.toResponse().retryable).toBe(true);
  });
});
