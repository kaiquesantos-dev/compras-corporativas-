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

  // Proteção contra adivinhar senha: depois de 5 tentativas por minuto para
  // o mesmo e-mail (a partir da mesma origem), a 6ª é barrada com 429 — mesmo
  // com a senha certa. Outra conta, na mesma origem, continua entrando.
  it('blocks the 6th login attempt within a minute for the same e-mail with 429', async () => {
    const department = await prisma.department.create({
      data: { name: 'Depto Limite' },
    });
    for (const email of ['alvo@teste.com', 'outra@teste.com']) {
      await prisma.user.create({
        data: {
          name: 'Teste',
          email,
          password: await bcrypt.hash('senha-certa', 10),
          role: 'REQUESTER',
          departmentId: department.id,
        },
      });
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'alvo@teste.com', password: `errada-${attempt}` })
        .expect(401);
    }

    const blocked = await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'alvo@teste.com', password: 'senha-certa' })
      .expect(429);
    expect(blocked.body.message).toContain('Aguarde um minuto');

    await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'outra@teste.com', password: 'senha-certa' })
      .expect(200);
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

  describe('GET /auth/me', () => {
    it('returns the current id/email/role/isAdminDelegate for the logged-in user', async () => {
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

      const response = await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);

      expect(response.body).toEqual({
        id: buyer.id,
        email: buyer.email,
        role: 'BUYER',
        isAdminDelegate: false,
      });
    });

    it('reflects a role/delegation change made after the token was issued, without a new login', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

      const before = await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);
      expect(before.body.isAdminDelegate).toBe(false);

      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      const after = await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);
      expect(after.body.isAdminDelegate).toBe(true);
    });

    it('rejects without a valid token with 401', async () => {
      await apiRequest(app).get('/auth/me').expect(401);
    });
  });
});
