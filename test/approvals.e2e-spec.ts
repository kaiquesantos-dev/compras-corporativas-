import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CnpjLookupService } from '../src/suppliers/cnpj/cnpj-lookup.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

const validItem = { description: 'Item', quantity: 1, unit: 'unidade' };
const CNPJ_A = '19131243000197';

describe('Approvals (e2e) and full lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cnpjLookupService: { lookup: jest.Mock };

  beforeAll(async () => {
    cnpjLookupService = { lookup: jest.fn() };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CnpjLookupService)
      .useValue(cnpjLookupService)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    cnpjLookupService.lookup.mockReset();
    cnpjLookupService.lookup.mockResolvedValue({
      legalName: 'Fornecedor Real LTDA',
      tradeName: null,
      zipCode: null,
      street: null,
      city: null,
      state: null,
      federalRegistrationStatus: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the full purchase flow end to end: draft -> submit -> quote -> select -> approve -> complete', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
      .expect(201);
    const purchaseRequestId = created.body.id;

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    const supplier = await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: CNPJ_A })
      .expect(201);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId: supplier.body.id, totalValue: 9000.0 })
      .expect(201);

    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/select`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    const approved = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/approval`)
      .set('Authorization', `Bearer ${approver.token}`)
      .send({ decision: 'APPROVED', comment: 'Dentro do orçamento.' })
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');

    const completed = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/complete`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');

    const history = await apiRequest(app)
      .get(`/purchase-requests/${purchaseRequestId}/history`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);
    const transitions = history.body.map(
      (h: any) => `${h.fromStatus}->${h.toStatus}`,
    );
    expect(transitions).toEqual([
      'DRAFT->SUBMITTED',
      'SUBMITTED->IN_QUOTATION',
      'IN_QUOTATION->PENDING_APPROVAL',
      'PENDING_APPROVAL->APPROVED',
      'APPROVED->COMPLETED',
    ]);
  });

  it('rejects a decision from a non-APPROVER role with 403', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

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
      .post(`/purchase-requests/${created.body.id}/approval`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ decision: 'APPROVED' })
      .expect(403);
  });

  it('returns 409 when trying to decide a request that is not PENDING_APPROVAL', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

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
      .post(`/purchase-requests/${created.body.id}/approval`)
      .set('Authorization', `Bearer ${approver.token}`)
      .send({ decision: 'APPROVED' })
      .expect(409);
  });

  it('blocks actions on a REJECTED request (terminal state)', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const approver = await seedUserAndLogin(app, prisma, 'APPROVER');

    const created = await apiRequest(app)
      .post('/purchase-requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        title: 'Pedido',
        justification: 'Justificativa qualquer aqui.',
        items: [validItem],
      })
      .expect(201);
    const purchaseRequestId = created.body.id;

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/submit`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(200);

    const supplier = await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: CNPJ_A })
      .expect(201);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId: supplier.body.id, totalValue: 9000.0 })
      .expect(201);

    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/select`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/approval`)
      .set('Authorization', `Bearer ${approver.token}`)
      .send({ decision: 'REJECTED', comment: 'Fora do orçamento.' })
      .expect(200);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/cancel`)
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(409);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/complete`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(409);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/approval`)
      .set('Authorization', `Bearer ${approver.token}`)
      .send({ decision: 'APPROVED' })
      .expect(409);
  });
});
