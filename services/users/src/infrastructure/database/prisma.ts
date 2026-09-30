import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { config } from '../config';

declare global {
  var __prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });
const prisma = global.__prisma ?? new PrismaClient({ adapter });
if (config.NODE_ENV !== 'production') global.__prisma = prisma;

export default prisma;
