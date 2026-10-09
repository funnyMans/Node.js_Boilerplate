import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { BanUserUseCase } from '../../../../../src/app/use-cases/ban-user/ban-user.use-case';
import { CountUsersUseCase } from '../../../../../src/app/use-cases/count-users/count-users.use-case';
import { GetUserUseCase } from '../../../../../src/app/use-cases/get-user/get-user.use-case';
import { ListUsersUseCase } from '../../../../../src/app/use-cases/list-users/list-users.use-case';
import { RegisterUserUseCase } from '../../../../../src/app/use-cases/register-user/register-user.use-case';
import { UpdateUserUseCase } from '../../../../../src/app/use-cases/update-user/update-user.use-case';
import type { UserRepositoryPort } from '../../../../../src/domain/repositories/user.repository.interface';
import { UserController } from '../../../../../src/interfaces/http/controllers/user.controller';
import { User } from '../../../../../src/domain/models/user.entity';

function createController(repository: UserRepositoryPort) {
  return new UserController(
    new RegisterUserUseCase(repository),
    new ListUsersUseCase(repository),
    new GetUserUseCase(repository),
    new CountUsersUseCase(repository),
    new UpdateUserUseCase(repository),
    new BanUserUseCase(repository)
  );
}

function createReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as FastifyReply;
}

describe('UserController.update', () => {
  it('returns 404 when the requested user does not exist', async () => {
    const repository: UserRepositoryPort = {
      create: async () => User.create({ email: 'person@example.com' }),
      list: async () => [],
      getById: async () => null,
      update: async () => User.create({ email: 'person@example.com' }),
      count: async () => 0,
    };
    const reply = createReply();

    await createController(repository).update(
      { params: { id: 'missing' }, body: { firstName: 'Nora' } } as FastifyRequest,
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it('does not turn repository failures into not-found responses', async () => {
    const currentUser = User.create({ id: 'user-1', email: 'person@example.com' });
    const databaseError = new Error('database unavailable');
    const repository: UserRepositoryPort = {
      create: async () => currentUser,
      list: async () => [],
      getById: async () => currentUser,
      update: async () => {
        throw databaseError;
      },
      count: async () => 0,
    };
    const reply = createReply();

    await expect(
      createController(repository).update(
        { params: { id: 'user-1' }, body: { firstName: 'Nora' } } as FastifyRequest,
        reply
      )
    ).rejects.toBe(databaseError);
    expect(reply.status).not.toHaveBeenCalled();
  });
});
