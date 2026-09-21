import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

const validItem = { description: 'Item', quantity: 1, unit: 'unidade' };

describe('PurchaseRequests (e2e)', () => {
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

  it('lets a REQUESTER create a purchase request with items (201, status DRAFT)', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const response = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Notebooks novos',
        justification: 'Equipamentos antigos com falhas recorrentes.',
        items: [validItem],
      })
      .expect(201);

    expect(response.body.status).toBe('DRAFT');
    expect(response.body.items).toHaveLength(1);
  });

  it('rejects a request with no items with 400', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Sem itens', justification: 'Justificativa qualquer aqui.', items: [] })
      .expect(400);
  });

  it('rejects creation from a non-REQUESTER role with 403', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ title: 'X', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(403);
  });

  it("only lists the requester's own purchase requests for a REQUESTER, but all for a BUYER", async () => {
    const requesterA = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const requesterB = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    for (const req of [requesterA, requesterB]) {
      await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${req.token}`)
        .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
        .expect(201);
    }

    const asRequesterA = await apiRequest(app)
      .get('/purchase-requests')
      .set('Authorization', `Bearer ${requesterA.token}`)
      .expect(200);
    expect(asRequesterA.body.total).toBe(1);

    const asBuyer = await apiRequest(app)
      .get('/purchase-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(asBuyer.body.total).toBe(2);
  });

  it("returns 403 when a REQUESTER tries to view another requester's purchase request", async () => {
    const requesterA = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const requesterB = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requesterA.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    await apiRequest(app)
      .get(`/purchase-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${requesterB.token}`)
      .expect(403);
  });

  it('returns 404 for a purchase request that does not exist', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .get('/purchase-requests/999999')
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(404);
  });

  it('lets the owner submit a DRAFT request, moving it to SUBMITTED (200)', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    const submitted = await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    expect(submitted.body.status).toBe('SUBMITTED');
  });

  it('returns 409 when trying to submit a request that is already SUBMITTED', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(409);
  });

  it("returns 403 when a different requester tries to submit someone else's request", async () => {
    const requesterA = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const requesterB = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requesterA.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requesterB.token}`)
      .expect(403);
  });

  it('records a status history entry after submitting', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    const history = await apiRequest(app)
      .get(`/purchase-requests/${created.body.id}/history`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ fromStatus: 'DRAFT', toStatus: 'SUBMITTED' });
  });

  it('lets the owner cancel, but blocks cancelling from a terminal state', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido', justification: 'Justificativa qualquer aqui.', items: [validItem] })
      .expect(201);

    const cancelled = await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(409);
  });
});
