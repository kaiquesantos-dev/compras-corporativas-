import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function buildHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/test' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('PrismaExceptionFilter', () => {
  it('maps P2002 (unique violation) to 409', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = buildHost();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('maps P2003 (foreign key violation) to 409', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = buildHost();
    const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '7.10.0',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('maps P2025 (record not found) to 404', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status } = buildHost();
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '7.10.0',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(404);
  });

  it('maps an unmapped code to 500 without leaking internal details', () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = buildHost();
    const error = new Prisma.PrismaClientKnownRequestError('Something internal', {
      code: 'P9999',
      clientVersion: '7.10.0',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Erro interno inesperado.' }),
    );
  });
});
