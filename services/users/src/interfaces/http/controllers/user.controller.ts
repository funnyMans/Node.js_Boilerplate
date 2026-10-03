import type { FastifyReply, FastifyRequest } from 'fastify';
import { RegisterUserUseCase } from '../../../app/use-cases/register-user/register-user.use-case';
import { ListUsersUseCase } from '../../../app/use-cases/list-users/list-users.use-case';
import { GetUserUseCase } from '../../../app/use-cases/get-user/get-user.use-case';
import { CountUsersUseCase } from '../../../app/use-cases/count-users/count-users.use-case';
import { UpdateUserUseCase } from '../../../app/use-cases/update-user/update-user.use-case';
import { BanUserUseCase } from '../../../app/use-cases/ban-user/ban-user.use-case';
import { UserMapper } from '../mappers/user.mapper';
import {
  parseCreateUserRequest,
  parseListUsersQuery,
  parseUpdateUserRequest,
} from '../request-parsers/user.request';
import { sendNotFoundError, sendValidationError } from '../error-mappers/user.http-error';
import { UserNotFoundError } from '../../../app/errors/user-not-found.error';

export class UserController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserUseCase: GetUserUseCase,
    private readonly countUsersUseCase: CountUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly banUserUseCase: BanUserUseCase
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = parseCreateUserRequest(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const user = await this.registerUserUseCase.execute(parsed.data);
    return reply.status(201).send(UserMapper.toDto(user));
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const filters = parseListUsersQuery(request.query);
    const users = await this.listUsersUseCase.execute(filters);
    return reply.send(UserMapper.toListResponse(users));
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const user = await this.getUserUseCase.execute(id);

    if (!user) {
      return sendNotFoundError(reply);
    }

    return reply.send(UserMapper.toDto(user));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const parsed = parseUpdateUserRequest(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const user = await this.updateUserUseCase.execute(id, parsed.data);
      return reply.send(UserMapper.toDto(user));
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return sendNotFoundError(reply);
      }
      throw error;
    }
  }

  async count(_request: FastifyRequest, reply: FastifyReply) {
    const count = await this.countUsersUseCase.execute();
    return reply.send(UserMapper.toCountResponse(count));
  }
}
