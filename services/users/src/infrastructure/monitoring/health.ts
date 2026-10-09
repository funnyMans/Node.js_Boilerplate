import { checkDependencyHealth } from '@app/common';

export type DatabaseHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

type DatabaseHealthClient = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function checkDatabaseHealth(
  prisma: DatabaseHealthClient
): Promise<DatabaseHealthStatus> {
  return checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`);
}
