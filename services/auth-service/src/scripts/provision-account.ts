import 'dotenv/config';
import { authRoles, companyAreas } from '@app/contracts';
import type { AuthRoleGrant, CompanyArea } from '@app/contracts';
import { z } from 'zod';
import { ProvisionAccountUseCase } from '../app/use-cases/provision-account/provision-account.use-case';
import prisma from '../infrastructure/database/prisma';
import { config } from '../infrastructure/config';
import { HttpUsersClient } from '../infrastructure/clients/http-users.client';
import { PrismaAuthRepository } from '../infrastructure/repositories/prisma-auth.repository';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher';

const accountInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  grants: z.string().trim().min(1),
});

async function main() {
  const parsed = accountInputSchema.safeParse({
    email: process.env.AUTH_PROVISION_EMAIL,
    password: process.env.AUTH_PROVISION_PASSWORD,
    grants: process.env.AUTH_PROVISION_ROLE_GRANTS,
  });
  if (!parsed.success) {
    throw new Error(
      'Set AUTH_PROVISION_EMAIL, AUTH_PROVISION_PASSWORD, and AUTH_PROVISION_ROLE_GRANTS'
    );
  }

  const roleGrants = parseRoleGrants(parsed.data.grants);
  const provision = new ProvisionAccountUseCase(
    new PrismaAuthRepository(prisma),
    new ScryptPasswordHasher(),
    new HttpUsersClient(config.USERS_SERVICE_URL)
  );
  const credential = await provision.execute({
    email: parsed.data.email,
    password: parsed.data.password,
    roleGrants,
  });

  console.info(
    `Provisioned TMS account ${credential.email} (${credential.userId}) with ${credential.roleGrants.length} role grant(s).`
  );
}

function parseRoleGrants(value: string): AuthRoleGrant[] {
  return value.split(',').map((entry) => {
    const [roleName, areaName, extra] = entry.trim().split(':');
    const role = authRoles.find((candidate) => candidate === roleName);
    if (!role || extra !== undefined) throw new Error(`Invalid TMS role grant: ${entry}`);
    if (areaName === undefined) return { role };

    const area: CompanyArea | undefined = companyAreas.find((candidate) => candidate === areaName);
    if (!area) throw new Error(`Invalid TMS area scope: ${areaName}`);
    return { role, area };
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
