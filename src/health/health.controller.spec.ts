import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let healthController: HealthController;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaService }],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  it('returns ok when the database responds', async () => {
    await expect(healthController.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('throws ServiceUnavailableException when the database query fails', async () => {
    prismaService.$queryRaw.mockRejectedValueOnce(new Error('down'));
    await expect(healthController.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
