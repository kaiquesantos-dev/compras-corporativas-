import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

interface RequestWithUser {
  method: string;
  originalUrl: string;
  user?: { id: number; role: string };
}

// Interceptor global (registrado no AppModule): roda em volta de TODA
// requisição, antes e depois do controller executar. Aqui usamos só para
// registrar um log estruturado (em formato JSON) de cada requisição —
// método, URL, quem fez, status da resposta e quanto tempo levou.
// Importante: este interceptor não decide nada sobre regra de negócio,
// ele só observa e loga (por isso usamos o operador "tap", que "espia" o
// resultado sem alterá-lo).
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();

    const baseLog = () => ({
      method: request.method,
      url: request.originalUrl,
      userId: request.user?.id ?? null,
      role: request.user?.role ?? null,
      durationMs: Date.now() - startedAt,
    });

    // next.handle() é o restante da requisição (guards, controller, service
    // etc.). O código dentro do "tap" só roda DEPOIS que tudo isso terminou,
    // por isso já temos o status da resposta e conseguimos calcular a
    // duração total. Sem o "catchError", uma requisição que termina em erro
    // (400/401/403/404/409/500) nunca passaria pelo "tap" e ficaria de fora
    // do log — exatamente os casos mais importantes de rastrear.
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({ ...baseLog(), statusCode: response.statusCode }),
        );
      }),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        this.logger.error(
          JSON.stringify({ ...baseLog(), statusCode }),
        );
        throw error;
      }),
    );
  }
}
