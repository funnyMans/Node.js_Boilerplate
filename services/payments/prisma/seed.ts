import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/payments';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const products = [
  { id: 'sku-coffee', name: 'Coffee', amountCents: 1299 },
  { id: 'sku-filter', name: 'Coffee filter', amountCents: 599 },
  { id: 'sku-tea', name: 'Tea', amountCents: 899 },
  { id: 'sku-live-export', name: 'Live export', amountCents: 1999 },
];

async function main() {
  for (const product of products) {
    await prisma.catalogProduct.upsert({
      where: { id: product.id },
      create: { ...product, currency: 'usd' },
      update: {
        name: product.name,
        amountCents: product.amountCents,
        currency: 'usd',
        active: true,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
