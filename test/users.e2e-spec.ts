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

  // E-mail não diferencia maiúsculas: antes, "ADMIN@Teste.com" passava como
  // um usuário NOVO porque o índice único do Postgres diferencia caixa.
  it('returns 409 for the same e-mail in another letter case, and stores e-mails in lowercase', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN', {
      email: 'admin@teste.com',
    });

    const duplicate = await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Duplicado',
        email: '  ADMIN@Teste.COM ',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: admin.departmentId,
      })
      .expect(409);
    expect(duplicate.body.message).toBe('Este e-mail já está cadastrado.');

    const created = await apiRequest(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Maria',
        email: 'Maria.Silva@Empresa.com',
        password: 'senha123',
        role: 'REQUESTER',
        departmentId: admin.departmentId,
      })
      .expect(201);
    expect(created.body.email).toBe('maria.silva@empresa.com');

    // O login funciona do jeito que a pessoa digitar.
    await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'MARIA.SILVA@empresa.com', password: 'senha123' })
      .expect(200);
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

    it('rejects a delegated APPROVER (not a real ADMIN) trying to grant delegation to another APPROVER — prevents an uncontrolled escalation chain', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      const target = await seedUserAndLogin(app, prisma, 'APPROVER');
      await apiRequest(app)
        .patch(`/users/${delegate.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      // O delegado passa pelo @Roles('ADMIN') do controller (RolesGuard
      // trata isAdminDelegate como equivalente a ADMIN), mas a checagem
      // extra dentro do service deve barrá-lo aqui mesmo assim.
      await apiRequest(app)
        .patch(`/users/${target.id}/admin-delegate`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .send({ granted: true })
        .expect(403);

      const check = await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${target.token}`)
        .expect(200);
      expect(check.body.isAdminDelegate).toBe(false);
    });

    it('rejects a delegated APPROVER (not a real ADMIN) deleting the real ADMIN account', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      await apiRequest(app)
        .patch(`/users/${delegate.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      await apiRequest(app)
        .delete(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .expect(403);

      // O admin real continua existindo e conseguindo logar normalmente.
      await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('rejects a delegated APPROVER (not a real ADMIN) editing the real ADMIN account', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      await apiRequest(app)
        .patch(`/users/${delegate.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      await apiRequest(app)
        .patch(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .send({ name: 'Hackeado' })
        .expect(403);
    });

    it('still allows a delegated APPROVER to manage a normal (non-ADMIN) user, and a real ADMIN can still manage other ADMINs', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const otherAdmin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      await apiRequest(app)
        .patch(`/users/${delegate.id}/admin-delegate`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ granted: true })
        .expect(200);

      await apiRequest(app)
        .patch(`/users/${requester.id}`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .send({ name: 'Editado pelo delegado' })
        .expect(200);

      await apiRequest(app)
        .patch(`/users/${otherAdmin.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Editado por admin real' })
        .expect(200);
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

  describe('regras que protegem o próprio sistema', () => {
    it('blocks an admin from changing their own role (403)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .patch(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'REQUESTER' })
        .expect(403);
    });

    it('still lets an admin edit their own name (200)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .patch(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Novo nome do admin' })
        .expect(200);
    });

    it('blocks an admin from deleting their own account (403)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .delete(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(403);
    });

    it('blocks an admin from deactivating their own account (403)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .patch(`/users/${admin.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false })
        .expect(403);
    });

    // Soft delete de usuário: quem sai da empresa é desativado em vez de
    // excluído — perde o acesso na hora, mas continua como autor do histórico.
    it('deactivates: login is refused (403), the open session drops (401), history is kept; reactivating restores access', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

      // Sessão do comprador funcionando antes da desativação.
      await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);

      const deactivated = await apiRequest(app)
        .patch(`/users/${buyer.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: false })
        .expect(200);
      expect(deactivated.body.isActive).toBe(false);

      // O token ainda não venceu, mas a sessão cai na próxima requisição.
      await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(401);

      // Senha certa: recusa com o motivo (403), sem emitir token.
      const refused = await apiRequest(app)
        .post('/auth/login')
        .send({ email: buyer.email, password: 'senha123' })
        .expect(403);
      expect(refused.body.message).toContain('desativada');
      expect(refused.body.access_token).toBeUndefined();

      // O registro continua no banco (não foi excluído).
      const stored = await prisma.user.findUnique({ where: { id: buyer.id } });
      expect(stored).not.toBeNull();

      // Reativar devolve o acesso.
      await apiRequest(app)
        .patch(`/users/${buyer.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: true })
        .expect(200);
      await apiRequest(app)
        .post('/auth/login')
        .send({ email: buyer.email, password: 'senha123' })
        .expect(200);
    });

    it('rejects a non-boolean isActive with 400', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      await apiRequest(app)
        .patch(`/users/${buyer.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isActive: 'nao' })
        .expect(400);
    });

    it('rejects creating a REQUESTER without a department (400)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .post('/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Sem Depto',
          email: 'semdepto@teste.com',
          password: 'senha123',
          role: 'REQUESTER',
        })
        .expect(400);
    });

    it('blocks an admin-delegate from creating an ADMIN account (403)', async () => {
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      await prisma.user.update({
        where: { id: delegate.id },
        data: { isAdminDelegate: true },
      });
      await apiRequest(app)
        .post('/users')
        .set('Authorization', `Bearer ${delegate.token}`)
        .send({
          name: 'Admin Clandestino',
          email: 'clandestino@teste.com',
          password: 'senha123',
          role: 'ADMIN',
        })
        .expect(403);
    });

    it('blocks an admin-delegate from promoting a user to ADMIN (403)', async () => {
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      await prisma.user.update({
        where: { id: delegate.id },
        data: { isAdminDelegate: true },
      });
      await apiRequest(app)
        .patch(`/users/${buyer.id}`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('clears the department of a non-REQUESTER when departmentId is null', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const response = await apiRequest(app)
        .patch(`/users/${buyer.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ departmentId: null })
        .expect(200);
      expect(response.body.departmentId).toBeNull();
    });

    it('rejects clearing the department of a REQUESTER (400)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      await apiRequest(app)
        .patch(`/users/${requester.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ departmentId: null })
        .expect(400);
    });

    it('still lets creating a BUYER without a department (201)', async () => {
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      await apiRequest(app)
        .post('/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: 'Comprador Sem Depto',
          email: 'buyer-semdepto@teste.com',
          password: 'senha123',
          role: 'BUYER',
        })
        .expect(201);
    });
  });
});
