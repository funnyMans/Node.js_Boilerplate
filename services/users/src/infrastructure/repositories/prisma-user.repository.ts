import type { PrismaClient } from '../../../generated/prisma/client';
import { User, type UserFilters, type UserStatus } from '../../domain/models/user.entity';
import type {
  CreateUserPayload,
  UpdateUserPayload,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.interface';

export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  private mapUser(user: Awaited<ReturnType<PrismaClient['user']['findUnique']>>): User | null {
    if (!user) return null;

    return User.create({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      status: user.status as UserStatus,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async create(input: CreateUserPayload): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        status: input.status ?? 'active',
      },
    });

    return this.mapUser(user) as User;
  }

  async list(filters?: UserFilters): Promise<User[]> {
    const where: Record<string, unknown> = {};

    if (filters?.email) {
      where.email = {
        equals: filters.email.trim(),
        mode: 'insensitive',
      };
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const users = await this.prisma.user.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.mapUser(user) as User);
  }

  async getById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return this.mapUser(user);
  }

  async update(id: string, input: UpdateUserPayload): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data: input,
    });

    return this.mapUser(user) as User;
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }
}
