import type { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';

export function registerAuthRoutes(server: FastifyInstance, controller: AuthController) {
  server.post('/auth/login', (request, reply) => controller.loginUser(request, reply));
  server.post('/auth/refresh', (request, reply) => controller.refreshToken(request, reply));
  server.post('/auth/logout', (request, reply) => controller.logout(request, reply));
  server.get('/auth/session', (request, reply) => controller.session(request, reply));
}
