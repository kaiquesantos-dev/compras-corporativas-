import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('returns ok when the database responds', async () => {
      await expect(appController.health()).resolves.toEqual({
        status: 'ok',
        database: 'up',
      });
    });

    it('throws ServiceUnavailableException when the database query fails', async () => {
      prismaService.$queryRaw.mockRejectedValueOnce(new Error('down'));
      await expect(appController.health()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
