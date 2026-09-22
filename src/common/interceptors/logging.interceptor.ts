import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

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

    // next.handle() é o restante da requisição (guards, controller, service
    // etc.). O código dentro do "tap" só roda DEPOIS que tudo isso terminou,
    // por isso já temos o status da resposta e conseguimos calcular a
    // duração total.
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            method: request.method,
            url: request.originalUrl,
            userId: request.user?.id ?? null,
            role: request.user?.role ?? null,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        );
      }),
    );
  }
}
