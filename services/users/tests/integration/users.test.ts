import { beforeEach, describe, expect, it } from 'vitest';
import server from '../../src/server';
import prisma from '../../src/infrastructure/database/prisma';

describe('users service API', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('creates a user', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'alice@example.com' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      email: 'alice@example.com',
    });
  });

  it('lists users and returns a count', async () => {
    await prisma.user.create({ data: { email: 'alice@example.com' } });

    const listResponse = await server.inject({
      method: 'GET',
      url: '/users',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      users: [
        {
          email: 'alice@example.com',
        },
      ],
    });

    const countResponse = await server.inject({
      method: 'GET',
      url: '/users/count',
    });

    expect(countResponse.statusCode).toBe(200);
    expect(countResponse.json()).toEqual({ count: 1 });
  });

  it('filters users by status and email', async () => {
    await prisma.user.createMany({
      data: [
        { email: 'active@example.com', isActive: true },
        { email: 'inactive@example.com', isActive: false },
        { email: 'another-active@example.com', isActive: true },
      ],
    });

    const activeResponse = await server.inject({
      method: 'GET',
      url: '/users?isActive=true',
    });

    expect(activeResponse.statusCode).toBe(200);
    expect(activeResponse.json().users.map((user: { email: string }) => user.email)).toEqual(
      expect.arrayContaining(['active@example.com', 'another-active@example.com'])
    );
    expect(activeResponse.json().users.map((user: { email: string }) => user.email)).not.toContain(
      'inactive@example.com'
    );

    const emailResponse = await server.inject({
      method: 'GET',
      url: '/users?email=active@example.com',
    });

    expect(emailResponse.statusCode).toBe(200);
    expect(emailResponse.json().users).toHaveLength(1);
    expect(emailResponse.json().users[0]).toMatchObject({
      email: 'active@example.com',
    });
  });

  it('supports deactivating a user account through the status lifecycle', async () => {
    const created = await prisma.user.create({
      data: { email: 'status@example.com', isActive: true },
    });

    const response = await server.inject({
      method: 'PATCH',
      url: `/users/${created.id}`,
      payload: { isActive: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: created.id,
      email: 'status@example.com',
      isActive: false,
    });
  });

  it('supports explicit blocked and deleted lifecycle states', async () => {
    const created = await prisma.user.create({
      data: { email: 'status-lifecycle@example.com', isActive: true },
    });

    const blockedResponse = await server.inject({
      method: 'PATCH',
      url: `/users/${created.id}`,
      payload: { status: 'blocked' },
    });

    expect(blockedResponse.statusCode).toBe(200);
    expect(blockedResponse.json()).toMatchObject({
      id: created.id,
      status: 'blocked',
      isActive: false,
    });

    const filteredResponse = await server.inject({
      method: 'GET',
      url: '/users?status=blocked',
    });

    expect(filteredResponse.statusCode).toBe(200);
    expect(filteredResponse.json().users).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: 'status-lifecycle@example.com' })])
    );

    const deletedResponse = await server.inject({
      method: 'PATCH',
      url: `/users/${created.id}`,
      payload: { status: 'deleted' },
    });

    expect(deletedResponse.statusCode).toBe(200);
    expect(deletedResponse.json()).toMatchObject({
      id: created.id,
      status: 'deleted',
      isActive: false,
    });
    expect(deletedResponse.json().deletedAt).toBeTruthy();
  });
});
