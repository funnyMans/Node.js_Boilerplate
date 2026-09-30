import type { DependencyStatus } from '@app/common';

export function isGatewayReady(params: {
  users: boolean | 'unknown';
  orders: boolean | 'unknown';
  auth: boolean | 'unknown';
  payments: boolean | 'unknown';
  redis: DependencyStatus;
  nats: DependencyStatus;
  temporal: DependencyStatus;
}): boolean {
  return (
    params.users === true &&
    params.orders === true &&
    params.auth === true &&
    params.payments === true &&
    params.redis === 'ok' &&
    params.nats === 'ok' &&
    params.temporal === 'ok'
  );
}
