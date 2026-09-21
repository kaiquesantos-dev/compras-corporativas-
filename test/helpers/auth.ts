import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '../../src/generated/prisma/client';

/** Matches API_KEY in `.env.test`. Every e2e request must send this as X-API-KEY. */
export const TEST_API_KEY = 'test-api-key';

export interface SeededUser {
  id: number;
  email: string;
  role: Role;
  departmentId: number;
  token: string;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function seedUserAndLogin(
  app: INestApplication,
  prisma: PrismaClient,
  role: Role,
  overrides: { email?: string; departmentId?: number } = {},
): Promise<SeededUser> {
  const email = overrides.email ?? `${role.toLowerCase()}-${uniqueSuffix()}@teste.com`;
  const password = 'senha123';
  const passwordHash = await bcrypt.hash(password, 10);

  let departmentId = overrides.departmentId;
  if (!departmentId) {
    const department = await prisma.department.create({
      data: { name: `Depto-${uniqueSuffix()}` },
    });
    departmentId = department.id;
  }

  const user = await prisma.user.create({
    data: { name: role, email, password: passwordHash, role, departmentId },
  });

  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .set('X-API-KEY', TEST_API_KEY)
    .send({ email, password })
    .expect(200);

  return { id: user.id, email, role, departmentId, token: response.body.access_token as string };
}

/** Convenience wrapper so every e2e spec attaches X-API-KEY without repeating it. */
export function apiRequest(app: INestApplication) {
  const agent = request(app.getHttpServer());
  const withKey = (req: request.Test) => req.set('X-API-KEY', TEST_API_KEY);
  return {
    get: (url: string) => withKey(agent.get(url)),
    post: (url: string) => withKey(agent.post(url)),
    patch: (url: string) => withKey(agent.patch(url)),
    delete: (url: string) => withKey(agent.delete(url)),
  };
}
