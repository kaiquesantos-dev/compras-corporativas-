import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-db';
import { apiRequest, seedUserAndLogin } from './helpers/auth';

describe('Purchase requests metrics (e2e)', () => {
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

  it('returns aggregated metrics for a BUYER', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    const response = await apiRequest(app)
      .get('/purchase-requests/metrics')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(response.body).toHaveProperty('countByStatus');
    expect(response.body).toHaveProperty('totalApprovedValue');
    expect(response.body).toHaveProperty('averageApprovalTimeHours');
  });

  it('rejects a REQUESTER with 403', async () => {
    const requester = await seedUserAndLogin(app, prisma, 'REQUESTER');

    await apiRequest(app)
      .get('/purchase-requests/metrics')
      .set('Authorization', `Bearer ${requester.token}`)
      .expect(403);
  });

  it('does not confuse /purchase-requests/metrics with /purchase-requests/:id', async () => {
    const buyer = await seedUserAndLogin(app, prisma, 'BUYER');

    const response = await apiRequest(app)
      .get('/purchase-requests/metrics')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(response.body).not.toHaveProperty('statusCode');
  });
});
