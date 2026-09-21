import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CnpjLookupService } from '../src/suppliers/cnpj/cnpj-lookup.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

describe('Suppliers (e2e)', () => {
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

  it('creates a supplier auto-filling data from a successful CNPJ lookup (201)', async () => {
    cnpjLookupService.lookup.mockResolvedValue({
      legalName: 'Fornecedor Real LTDA',
      tradeName: 'Fornecedor Real',
      zipCode: '01311902',
      street: 'Paulista, 37',
      city: 'São Paulo',
      state: 'SP',
      federalRegistrationStatus: 'ATIVA',
    });
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    const response = await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '19131243000197' })
      .expect(201);

    expect(response.body.legalName).toBe('Fornecedor Real LTDA');
    expect(response.body.city).toBe('São Paulo');
  });

  it('returns 400 (not 500) when the CNPJ lookup fails and no manual legalName is given', async () => {
    cnpjLookupService.lookup.mockResolvedValue(null);
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '19131243000197' })
      .expect(400);
  });

  it('creates a supplier from manual data when the lookup fails but legalName is provided', async () => {
    cnpjLookupService.lookup.mockResolvedValue(null);
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    const response = await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '19131243000197', legalName: 'Fornecedor Informado Manualmente LTDA' })
      .expect(201);

    expect(response.body.legalName).toBe('Fornecedor Informado Manualmente LTDA');
  });

  it('rejects an invalid CNPJ format with 400', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '123' })
      .expect(400);
  });

  it('rejects creation from a REQUESTER with 403', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({ document: '19131243000197', legalName: 'X' })
      .expect(403);
  });

  it('returns 409 when the CNPJ is already registered', async () => {
    cnpjLookupService.lookup.mockResolvedValue({
      legalName: 'Fornecedor Real LTDA',
      tradeName: null,
      zipCode: null,
      street: null,
      city: null,
      state: null,
      federalRegistrationStatus: null,
    });
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '19131243000197' })
      .expect(201);

    await apiRequest(app)
      .post('/suppliers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ document: '19131243000197' })
      .expect(409);
  });

  it('returns 404 for a supplier that does not exist', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    await apiRequest(app)
      .get('/suppliers/999999')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(404);
  });
});
