import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureSwagger } from '../src/swagger.config';

describe('Swagger docs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI at /docs without requiring X-API-KEY', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('exposes the OpenAPI JSON document listing the auth login path in Portuguese', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.paths).toHaveProperty('/auth/login');
    expect(response.body.info.title).toBe('API de Compras Corporativas');
  });
});
