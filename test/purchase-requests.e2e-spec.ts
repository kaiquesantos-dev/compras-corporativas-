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
      .send({
        title: 'Sem itens',
        justification: 'Justificativa qualquer aqui.',
        items: [],
      })
      .expect(400);
  });

  it('rejects creation from a non-REQUESTER role with 403', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        title: 'X',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
        .send({
          title: 'Pedido',
          justification: 'Justificativa qualquer aqui.',
          items: [validItem],
        })
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
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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
    expect(history.body[0]).toMatchObject({
      fromStatus: 'DRAFT',
      toStatus: 'SUBMITTED',
      // Sem isso, o frontend não tinha como mostrar QUEM fez cada mudança
      // de status pra ninguém além do próprio usuário logado.
      changedBy: { id: requester.id, name: 'REQUESTER' },
    });
  });

  it('lets the owner cancel, but blocks cancelling from a terminal state', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
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

  describe('cancel authorization once IN_QUOTATION', () => {
    // Cria uma solicitação, submete, e registra uma cotação (via BUYER) pra
    // levá-la até IN_QUOTATION — sem depender do CnpjLookupService real,
    // criamos o fornecedor direto no banco.
    async function createInQuotationPurchaseRequest(requesterToken: string, buyerToken: string) {
      const created = await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          title: 'Pedido em cotação',
          justification: 'Justificativa qualquer aqui.',
          items: [validItem],
        })
        .expect(201);

      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(200);

      const supplier = await prisma.supplier.create({
        data: {
          document: `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 14).padStart(14, '0'),
          legalName: 'Fornecedor Teste',
        },
      });

      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/quotes`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ supplierId: supplier.id, totalValue: 100 })
        .expect(201);

      return created.body.id as number;
    }

    it('rejects the owner REQUESTER cancelling once the request is IN_QUOTATION', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const id = await createInQuotationPurchaseRequest(requester.token, buyer.token);

      await apiRequest(app)
        .post(`/purchase-requests/${id}/cancel`)
        .set('Authorization', `Bearer ${requester.token}`)
        .expect(403);
    });

    it('lets a BUYER cancel once the request is IN_QUOTATION', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const id = await createInQuotationPurchaseRequest(requester.token, buyer.token);

      const cancelled = await apiRequest(app)
        .post(`/purchase-requests/${id}/cancel`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('rejects a BUYER cancelling a request that has not reached IN_QUOTATION yet (still SUBMITTED)', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

      const created = await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${requester.token}`)
        .send({
          title: 'Pedido submetido',
          justification: 'Justificativa qualquer aqui.',
          items: [validItem],
        })
        .expect(201);
      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${requester.token}`)
        .expect(200);

      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(403);
    });

    it('lets an ADMIN cancel a request that is IN_QUOTATION, regardless of ownership', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const admin = await seedUserAndLogin(app, prisma, 'ADMIN');
      const id = await createInQuotationPurchaseRequest(requester.token, buyer.token);

      const cancelled = await apiRequest(app)
        .post(`/purchase-requests/${id}/cancel`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('still lets the owner REQUESTER cancel while the request is only SUBMITTED (not yet IN_QUOTATION)', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

      const created = await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${requester.token}`)
        .send({
          title: 'Pedido submetido',
          justification: 'Justificativa qualquer aqui.',
          items: [validItem],
        })
        .expect(201);
      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${requester.token}`)
        .expect(200);

      const cancelled = await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${requester.token}`)
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
    });
  });
});
