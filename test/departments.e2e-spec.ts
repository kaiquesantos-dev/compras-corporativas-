import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

describe('Departments (e2e)', () => {
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

  it('lets an ADMIN create a department (201)', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
    const response = await apiRequest(app)
      .post('/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Financeiro' })
      .expect(201);
    expect(response.body.name).toBe('Financeiro');
  });

  it('rejects creation from a non-ADMIN role with 403', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    await apiRequest(app)
      .post('/departments')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ name: 'Financeiro' })
      .expect(403);
  });

  it('rejects creation without a token with 401', async () => {
    await apiRequest(app).post('/departments').send({ name: 'Financeiro' }).expect(401);
  });

  it('lets any authenticated role list departments', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    await apiRequest(app)
      .get('/departments')
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);
  });

  it('returns 404 for a department that does not exist', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
    await apiRequest(app)
      .get('/departments/999999')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);
  });

  it('returns 409 when creating a department with a duplicate name', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
    await apiRequest(app)
      .post('/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Financeiro' })
      .expect(201);

    await apiRequest(app)
      .post('/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Financeiro' })
      .expect(409);
  });

  it('lets deleting a department with only users linked succeed (User.departmentId is optional, ON DELETE SET NULL)', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
    await apiRequest(app)
      .delete(`/departments/${admin.departmentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
  });

  it('returns 409 (not 500) when deleting a department that still has a purchase request linked (PurchaseRequest.departmentId is required, ON DELETE RESTRICT)', async () => {
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
    // PurchaseRequests module doesn't exist yet at this point in the build,
    // so we create the blocking row directly via Prisma to exercise the
    // real RESTRICT constraint and prove the global filter maps it to 409.
    await prisma.purchaseRequest.create({
      data: {
        requesterId: admin.id,
        departmentId: admin.departmentId,
        title: 'Solicitação de teste',
        justification: 'Usada apenas para forçar o vínculo de FK neste teste.',
      },
    });

    await apiRequest(app)
      .delete(`/departments/${admin.departmentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(409);
  });
});
