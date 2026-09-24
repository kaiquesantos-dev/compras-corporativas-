import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CnpjLookupService } from '../src/suppliers/cnpj/cnpj-lookup.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

const validItem = { description: 'Item', quantity: 1, unit: 'unidade' };
// Both are real, checksum-valid CNPJs (verified against the algorithm from Task 10).
const CNPJ_A = '19131243000197';
const CNPJ_B = '11222333000181';

describe('Quotes (e2e)', () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  async function createSubmittedPurchaseRequest(): Promise<number> {
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

    return created.body.id as number;
  }

  async function createSupplier(
    buyerToken: string,
    document: string,
  ): Promise<number> {
    cnpjLookupService.lookup.mockResolvedValue({
      legalName: 'Fornecedor Real LTDA',
      tradeName: null,
      zipCode: null,
      street: null,
      city: null,
      state: null,
      federalRegistrationStatus: null,
    });
    const response = await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ document })
      .expect(201);
    return response.body.id as number;
  }

  it('lets a BUYER register a quote, moving the request from SUBMITTED to IN_QUOTATION', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    const pr = await apiRequest(app)
      .get(`/purchase-requests/${purchaseRequestId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(pr.body.status).toBe('IN_QUOTATION');
  });

  it('rejects quote creation from a REQUESTER with 403', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ supplierId: 1, totalValue: 100 })
      .expect(403);
  });

  it('returns 404 when the supplier does not exist', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId: 999999, totalValue: 100 })
      .expect(404);
  });

  it('returns 409 when trying to quote a request still in DRAFT', async () => {
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

    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    await apiRequest(app)
      .post(`/purchase-requests/${created.body.id}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 100 })
      .expect(409);
  });

  it('accepts a valid PDF proposal upload (201) and rejects an invalid file type (400)', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .attach('file', Buffer.from('%PDF-1.4 conteudo de teste'), 'proposta.pdf')
      .expect(201);

    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .attach('file', Buffer.from('conteudo qualquer'), 'proposta.exe')
      .expect(400);
  });

  it('creates a quote with the proposal attached in the same request (multipart)', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const created = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .field('supplierId', String(supplierId))
      .field('totalValue', '13500.00')
      .attach('file', Buffer.from('%PDF-1.4 conteudo de teste'), 'proposta.pdf')
      .expect(201);

    expect(created.body.proposalFileName).toBe('proposta.pdf');

    const download = await apiRequest(app)
      .get(
        `/purchase-requests/${purchaseRequestId}/quotes/${created.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(download.headers['content-type']).toContain('application/pdf');
  });

  it('creates a quote via multipart with an empty file field, as some HTTP clients send when no file is chosen', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    // Regression: Swagger UI's "Try it out" (and some other HTTP clients)
    // sends the optional file field as an empty plain text part instead of
    // omitting it when nothing is chosen. Multer only routes a part into
    // req.file when it has a filename, so this landed as req.body.file, and
    // ValidationPipe's forbidNonWhitelisted rejected the whole request with
    // "property file should not exist" — a 400 that made the optional
    // attachment look mandatory.
    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .field('supplierId', String(supplierId))
      .field('totalValue', '13500.00')
      .field('file', '')
      .expect(201);
  });

  it('rejects an invalid file type when attached at quote creation (400)', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .field('supplierId', String(supplierId))
      .field('totalValue', '13500.00')
      .attach('file', Buffer.from('conteudo qualquer'), 'proposta.exe')
      .expect(400);
  });

  it('rejects a proposal upload larger than 5MB with 413', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    const oversized = Buffer.alloc(6 * 1024 * 1024, 0);

    // 413 (não 400): o multer agora corta o upload durante o parsing, ao
    // atingir limits.fileSize, antes de bufferizar o arquivo inteiro em
    // memória (era isso que permitia o DoS por upload gigante) — e o Nest
    // converte esse estouro automaticamente em PayloadTooLargeException.
    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .attach('file', oversized, 'proposta.pdf')
      .expect(413);
  });

  it('rejects a file whose content does not match its claimed type (magic-byte check)', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    // Content-Type mentindo que é PDF, mas o conteúdo real não começa com
    // a assinatura "%PDF" — deve ser rejeitado mesmo passando pelo
    // FileTypeValidator (que só olha o Content-Type declarado).
    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .attach(
        'file',
        Buffer.from('<html><script>alert(1)</script></html>'),
        { filename: 'proposta.pdf', contentType: 'application/pdf' },
      )
      .expect(400);
  });

  it('downloads the uploaded proposal with the correct content type', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .attach('file', Buffer.from('%PDF-1.4 conteudo de teste'), 'proposta.pdf')
      .expect(201);

    const download = await apiRequest(app)
      .get(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(download.headers['content-type']).toContain('application/pdf');
  });

  it('returns 404 when downloading a proposal that was never uploaded', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierId = await createSupplier(buyer.token, CNPJ_A);

    const quote = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId, totalValue: 13500.0 })
      .expect(201);

    await apiRequest(app)
      .get(
        `/purchase-requests/${purchaseRequestId}/quotes/${quote.body.id}/proposal`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(404);
  });

  it('selects a quote as winner, discards the others, and moves the request to PENDING_APPROVAL', async () => {
    const purchaseRequestId = await createSubmittedPurchaseRequest();
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');
    const supplierA = await createSupplier(buyer.token, CNPJ_A);
    const supplierB = await createSupplier(buyer.token, CNPJ_B);

    const quoteA = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId: supplierA, totalValue: 13500.0 })
      .expect(201);

    const quoteB = await apiRequest(app)
      .post(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ supplierId: supplierB, totalValue: 12800.0 })
      .expect(201);

    const selected = await apiRequest(app)
      .post(
        `/purchase-requests/${purchaseRequestId}/quotes/${quoteB.body.id}/select`,
      )
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(selected.body.status).toBe('PENDING_APPROVAL');
    expect(selected.body.selectedQuoteId).toBe(quoteB.body.id);

    const quotes = await apiRequest(app)
      .get(`/purchase-requests/${purchaseRequestId}/quotes`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    const quoteAFinal = quotes.body.find((q: any) => q.id === quoteA.body.id);
    const quoteBFinal = quotes.body.find((q: any) => q.id === quoteB.body.id);
    expect(quoteAFinal.status).toBe('DISCARDED');
    expect(quoteBFinal.status).toBe('SELECTED');
  });
});
