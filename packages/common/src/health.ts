export type HealthStatus = 'ok' | 'degraded' | 'down';
export type DependencyStatus = HealthState[string];

export type HealthState = Record<string, 'ok' | 'degraded' | 'down' | 'unknown' | 'error'>;

export async function checkDependencyHealth(check: () => Promise<unknown>): Promise<'ok' | 'down'> {
  try {
    await check();
    return 'ok';
  } catch {
    return 'down';
  }
}

export async function getHttpDependencyHealth(serviceUrl: string): Promise<DependencyStatus> {
  try {
    const response = await fetch(`${serviceUrl}/health`);
    if (!response.ok) return 'down';

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || !('status' in payload)) {
      return 'unknown';
    }
    if (payload.status === 'ok' || payload.status === 'degraded') return payload.status;
    return 'unknown';
  } catch {
    return 'down';
  }
}

export async function getHttpDependencyReadiness(serviceUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serviceUrl}/ready`);
    if (!response.ok) return false;

    const payload: unknown = await response.json();
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'ready' in payload &&
      payload.ready === true
    );
  } catch {
    return false;
  }
}

export function buildHealthReport(service: string, dependencies: HealthState = {}) {
  const states = Object.values(dependencies);
  const hasDownDependency = states.some((state) => state === 'down');
  const hasDegradedDependency = states.some(
    (state) => state === 'degraded' || state === 'unknown' || state === 'error'
  );

  const status: HealthStatus = hasDownDependency
    ? 'down'
    : hasDegradedDependency
      ? 'degraded'
      : 'ok';

  return {
    service,
    status,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}

export function registerShutdownHandlers(handlers: Array<() => Promise<unknown> | unknown>) {
  let shutdownPromise: Promise<void> | undefined;

  return function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const errors: unknown[] = [];

      for (const handler of handlers) {
        try {
          await handler();
        } catch (error) {
          errors.push(error);
        }
      }

      if (errors.length > 0) {
        throw new AggregateError(errors, 'One or more shutdown tasks failed');
      }
    })();

    return shutdownPromise;
  };
}
