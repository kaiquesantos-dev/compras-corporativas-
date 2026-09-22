import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  it('lets an ADMIN create a user (201) and never returns the password', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    const response = await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Novo Usuário',
        email: 'novo@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: admin.departmentId,
      })
      .expect(201);

    expect(response.body).not.toHaveProperty('password');
    expect(response.body.email).toBe('novo@teste.com');
  });

  it('rejects creation without a token with 401', async () => {
    await apiRequest(app)
      .post('/users')
      .send({
        name: 'XX',
        email: 'x@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
      })
      .expect(401);
  });

  it('rejects creation with an invalid token with 401', async () => {
    await apiRequest(app)
      .post('/users')
      .set('Authorization', 'Bearer token-invalido')
      .send({
        name: 'XX',
        email: 'x@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
      })
      .expect(401);
  });

  it('rejects creation from a non-ADMIN role with 403', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        name: 'XX',
        email: 'x@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
      })
      .expect(403);
  });

  it('rejects an invalid body with 400', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'XX',
        email: 'nao-e-email',
        password: '123',
        role: 'REQUESTER',
      })
      .expect(400);
  });

  it('returns 404 when departmentId does not exist', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'XX',
        email: 'x@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: 999999,
      })
      .expect(404);
  });

  it('returns 409 when the email is already registered', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN', {
      email: 'admin@teste.com',
    });

    await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Duplicado',
        email: 'admin@teste.com',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: admin.departmentId,
      })
      .expect(409);
  });

  it('returns 404 for GET /users/:id when the user does not exist', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    await apiRequest(app)
      .get('/users/999999')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);
  });

  it('lists users paginated for an ADMIN', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    const response = await apiRequest(app)
      .get('/users?page=1&pageSize=10')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
  });
});
