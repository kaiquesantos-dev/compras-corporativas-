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
      const created = await apiRequest(app)
        .post('/purchase-requests')
        .set('Authorization', `Bearer ${req.token}`)
        .send({
          title: 'Pedido',
          justification: 'Justificativa qualquer aqui.',
          items: [validItem],
        })
        .expect(201);
      // Submetidas: rascunhos de outras pessoas não aparecem pro comprador.
      await apiRequest(app)
        .post(`/purchase-requests/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${req.token}`)
        .expect(200);
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

  // Rascunho é privado até ser submetido: comprador/aprovador não veem os
  // rascunhos de outras pessoas (nem na lista, nem no detalhe); o admin vê.
  it('keeps DRAFT requests private to their owner (and admins) until submitted', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const approver = await seedUserAndLogin(app, prisma, 'APPROVER');
    const admin = await seedUserAndLogin(app, prisma, 'ADMIN');

    const draft = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Rascunho privado',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
      .expect(201);

    const buyerList = await apiRequest(app)
      .get('/purchase-requests')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(buyerList.body.total).toBe(0);

    for (const outsider of [buyer, approver]) {
      await apiRequest(app)
        .get(`/purchase-requests/${draft.body.id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .expect(403);
    }

    await apiRequest(app)
      .get(`/purchase-requests/${draft.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    // Depois de submetido, o comprador passa a enxergar normalmente.
    await apiRequest(app)
      .post(`/purchase-requests/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);
    await apiRequest(app)
      .get(`/purchase-requests/${draft.body.id}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
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

  it('lets the owner edit their own DRAFT request', async () => {
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

    const updated = await apiRequest(app)
      .patch(`/purchase-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido revisado' })
      .expect(200);

    expect(updated.body.title).toBe('Pedido revisado');
  });

  it("returns 403 when a different requester tries to edit someone else's DRAFT", async () => {
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
      .patch(`/purchase-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${requesterB.token}`)
      .send({ title: 'Tentativa de invasão' })
      .expect(403);
  });

  // Regressão: um usuário promovido de REQUESTER para outro papel (ex:
  // BUYER) depois de já ter uma solicitação em DRAFT continua podendo
  // editar/submeter o que já era dele — a autorização aqui é "é o dono",
  // não "tem o papel REQUESTER agora". Sem isso, o rascunho ficava travado
  // para sempre (nem o dono, nem ninguém mais, conseguia mexer nele).
  it('lets the owner submit/edit their old DRAFT even after being promoted away from REQUESTER', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Pedido antes da promoção',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
      .expect(201);

    await prisma.user.update({
      where: { id: requester.id },
      data: { role: 'BUYER' },
    });

    await apiRequest(app)
      .patch(`/purchase-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ title: 'Pedido revisado após promoção' })
      .expect(200);

    const submitted = await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    expect(submitted.body.status).toBe('SUBMITTED');
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

    // Estado que não permite mais cancelar é 409 pra todos que enxergam a
    // solicitação — antes o comprador recebia um 403 falso ("não tem acesso").
    it('returns 409 (not a misleading 403) when a BUYER tries to cancel a request already past IN_QUOTATION', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const id = await createInQuotationPurchaseRequest(requester.token, buyer.token);
      const quotes = await apiRequest(app)
        .get(`/purchase-requests/${id}/quotes`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);
      await apiRequest(app)
        .post(`/purchase-requests/${id}/quotes/${quotes.body[0].id}/select`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(200);

      const response = await apiRequest(app)
        .post(`/purchase-requests/${id}/cancel`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .expect(409);
      expect(response.body.message).toContain('Aguardando aprovação');
    });

    // Um APPROVER com acesso ADMIN delegado cobre o admin por completo —
    // antes ele levava 403 aqui mesmo sendo admin por delegação.
    it('lets an APPROVER with delegated ADMIN access cancel like an ADMIN', async () => {
      const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
      const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
      const delegate = await seedUserAndLogin(app, prisma, 'APPROVER');
      await prisma.user.update({
        where: { id: delegate.id },
        data: { isAdminDelegate: true },
      });
      const id = await createInQuotationPurchaseRequest(requester.token, buyer.token);

      await apiRequest(app)
        .post(`/purchase-requests/${id}/cancel`)
        .set('Authorization', `Bearer ${delegate.token}`)
        .expect(200);
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
