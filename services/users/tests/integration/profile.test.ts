import { beforeEach, describe, expect, it } from 'vitest';
import server from '../../src/server';
import prisma from '../../src/infrastructure/database/prisma';

describe('users profile API', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('returns a user profile by id', async () => {
    const created = await prisma.user.create({
      data: {
        email: 'nora@example.com',
        firstName: 'Nora',
        lastName: 'Lopez',
        isActive: true,
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/users/${created.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      email: 'nora@example.com',
      firstName: 'Nora',
      lastName: 'Lopez',
      isActive: true,
    });
  });

  it('updates a user profile', async () => {
    const created = await prisma.user.create({
      data: {
        email: 'milo@example.com',
        firstName: 'Milo',
        lastName: 'Stone',
        isActive: true,
      },
    });

    const response = await server.inject({
      method: 'PATCH',
      url: `/users/${created.id}`,
      payload: {
        firstName: 'Milo',
        lastName: 'Rivers',
        isActive: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      email: 'milo@example.com',
      firstName: 'Milo',
      lastName: 'Rivers',
      isActive: false,
    });
  });
});
