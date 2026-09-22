import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // ValidationPipe, PrismaExceptionFilter and LoggingInterceptor are all
    // registered via APP_PIPE/APP_FILTER/APP_INTERCEPTOR in AppModule, so
    // every TestingModule that imports AppModule gets them automatically —
    // no need (and no risk of drifting from main.ts) to register them here.
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with valid credentials and returns an access_token', async () => {
    const user = await seedUserAndLogin(app, prisma, 'ADMIN');
    expect(user.token).toEqual(expect.any(String));
  });

  it('rejects login with the wrong password with 401', async () => {
    const department = await prisma.department.create({
      data: { name: 'Depto X' },
    });
    await prisma.user.create({
      data: {
        name: 'Teste',
        email: 'teste@teste.com',
        password: await bcrypt.hash('senha-certa', 10),
        role: 'ADMIN',
        departmentId: department.id,
      },
    });

    await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'teste@teste.com', password: 'senha-errada' })
      .expect(401);
  });

  it('rejects an invalid body (bad email format) with 400', async () => {
    await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'nao-e-email', password: '123456' })
      .expect(400);
  });

  it('rejects any request missing the X-API-KEY header with 401, even with a valid body', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@compras.com', password: 'senha123' })
      .expect(401);
  });

  it('rejects any request with a wrong X-API-KEY value with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-API-KEY', 'chave-errada')
      .send({ email: 'admin@compras.com', password: 'senha123' })
      .expect(401);
  });
});
