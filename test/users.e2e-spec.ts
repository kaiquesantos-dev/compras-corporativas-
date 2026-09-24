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

  describe('admin delegation ("férias do admin")', () => {
    it('grants an APPROVER admin access, which takes effect on the next request without re-login', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

      // Antes de delegar, o approver não consegue acessar uma rota ADMIN.
      await apiRequest(app)
        .get('/users')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(403);

      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      // Mesmo token de antes — sem novo login — já deve funcionar, porque
      // o JwtStrategy revalida o usuário no banco a cada requisição.
      const listResponse = await apiRequest(app)
        .get('/users')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);
      expect(listResponse.body).toHaveProperty('data');

      const created = await apiRequest(app)
        .post('/departments')
        .set('Authorization', `Bearer ${approver.token}`)
        .send({ name: `Depto delegado ${Date.now()}` })
        .expect(201);
      expect(created.body).toHaveProperty('id');
    });

    it('revokes admin access and the delegate loses access immediately', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);
      await apiRequest(app)
        .get('/users')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(200);

      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: false })
        .expect(200);

      await apiRequest(app)
        .get('/users')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(403);
    });

    it('rejects delegating admin access to a non-APPROVER with 400', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

      await apiRequest(app)
        .patch(`/users/${buyer.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(400);
    });

    it('rejects a non-ADMIN trying to grant delegation with 403', async () => {
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');
      const otherApprover = await seedUserAndLogin(app, prisma, 'APPROVER');

      await apiRequest(app)
        .patch(`/users/${otherApprover.id}/admin-delegate`)
        .set('Authorization', `Bearer ${approver.token}`)
        .send({ granted: true })
        .expect(403);
    });

    it('does not grant the delegated APPROVER general ADMIN-role checks beyond what @Roles(ADMIN) covers — they still cannot act on routes requiring a different specific role than ADMIN', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');
      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      // Criar solicitação de compra é restrito a REQUESTER — isAdminDelegate
      // não deve dar passe livre pra papéis que não sejam especificamente
      // ADMIN na lista de @Roles(...).
      await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${approver.token}`)
        .send({
          title: 'Teste',
          justification: 'Justificativa qualquer aqui.',
          items: [{ description: 'Item', quantity: 1, unit: 'unidade' }],
        })
        .expect(403);
    });

    it('auto-clears the delegation when the admin changes the delegate role away from APPROVER', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const approver = await seedUserAndLogin(app, prisma, 'APPROVER');
      await apiRequest(app)
        .patch(`/users/${approver.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      await apiRequest(app)
        .patch(`/users/${approver.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'REQUESTER' })
        .expect(200);

      await apiRequest(app)
        .get('/users')
        .set('Authorization', `Bearer ${approver.token}`)
        .expect(403);
    });
  });
});
