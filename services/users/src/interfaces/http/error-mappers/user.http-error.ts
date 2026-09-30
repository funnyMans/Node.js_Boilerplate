import type { AppErrorShape } from '@app/contracts';
import { UserMapper } from '../mappers/user.mapper';

export function sendValidationError(
  reply: {
    status: (code: number) => {
      send: (payload: AppErrorShape & { details?: Record<string, unknown> }) => unknown;
    };
  },
  error: unknown
) {
  const normalizedDetails =
    error && typeof error === 'object' && 'flatten' in error
      ? (error as { flatten: () => Record<string, unknown> }).flatten()
      : typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : { value: error };

  return reply.status(400).send({
    code: 'VALIDATION_ERROR',
    message: 'invalid payload',
    details: normalizedDetails,
  });
}

export function sendNotFoundError(reply: {
  status: (code: number) => { send: (payload: AppErrorShape) => unknown };
}) {
  return reply.status(404).send(UserMapper.toNotFoundError());
}
