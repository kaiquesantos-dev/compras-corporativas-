import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

const STATUS_BY_CODE: Record<string, number> = {
  P2002: 409,
  P2003: 409,
  P2025: 404,
};

const MESSAGE_BY_CODE: Record<string, string> = {
  P2002: 'Já existe um registro com esse valor único.',
  P2003:
    'Operação viola um relacionamento existente (registro referenciado por outro).',
  P2025: 'Registro não encontrado.',
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    const status = STATUS_BY_CODE[exception.code] ?? 500;
    const message =
      MESSAGE_BY_CODE[exception.code] ?? 'Erro interno inesperado.';

    if (status === 500) {
      this.logger.error(
        `Erro Prisma não mapeado (${exception.code}) em ${request.url}: ${exception.message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
