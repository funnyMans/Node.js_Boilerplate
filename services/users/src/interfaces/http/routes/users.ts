import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../../../generated/prisma/client';
import { RegisterUserUseCase } from '../../../app/use-cases/register-user/register-user.use-case';
import { ListUsersUseCase } from '../../../app/use-cases/list-users/list-users.use-case';
import { GetUserUseCase } from '../../../app/use-cases/get-user/get-user.use-case';
import { CountUsersUseCase } from '../../../app/use-cases/count-users/count-users.use-case';
import { UpdateUserUseCase } from '../../../app/use-cases/update-user/update-user.use-case';
import { BanUserUseCase } from '../../../app/use-cases/ban-user/ban-user.use-case';
import { PrismaUserRepository } from '../../../infrastructure/repositories/prisma-user.repository';
import { UserController } from '../controllers/user.controller';

export function registerUserRoutes(server: FastifyInstance, prisma: PrismaClient) {
  const userRepository = new PrismaUserRepository(prisma);
  const registerUserUseCase = new RegisterUserUseCase(userRepository);
  const listUsersUseCase = new ListUsersUseCase(userRepository);
  const getUserUseCase = new GetUserUseCase(userRepository);
  const countUsersUseCase = new CountUsersUseCase(userRepository);
  const updateUserUseCase = new UpdateUserUseCase(userRepository);
  const banUserUseCase = new BanUserUseCase(userRepository);
  const userController = new UserController(
    registerUserUseCase,
    listUsersUseCase,
    getUserUseCase,
    countUsersUseCase,
    updateUserUseCase,
    banUserUseCase
  );

  server.post('/users', (request, reply) => userController.create(request, reply));
  server.get('/users', (request, reply) => userController.list(request, reply));
  server.get('/users/:id', (request, reply) => userController.getById(request, reply));
  server.patch('/users/:id', (request, reply) => userController.update(request, reply));
  server.get('/users/count', (request, reply) => userController.count(request, reply));
}
