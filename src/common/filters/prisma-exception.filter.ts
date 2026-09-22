import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

// Cada código de erro conhecido do Prisma vira um status HTTP específico.
// P2002 = violação de campo único (ex: cadastrar email que já existe).
// P2003 = violação de chave estrangeira (ex: apagar um fornecedor que ainda
//         tem cotações vinculadas a ele).
// P2025 = tentou atualizar/apagar um registro que não existe.
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

// Filtro global (registrado no AppModule) que intercepta QUALQUER erro do
// Prisma em QUALQUER service da aplicação e o transforma numa resposta HTTP
// coerente, em vez de deixar vazar como um genérico "500 Internal Server
// Error". É essa peça que garante, por exemplo, que apagar um registro que
// ainda tem outros dados dependendo dele vire 409 (conflito) e não 500.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    // Se o código do erro não está na nossa tabela acima, tratamos como um
    // erro inesperado (500) — mas registramos os detalhes no log do servidor
    // para investigação, sem nunca expor isso na resposta para o cliente.
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
