import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Guard global (registrado no AppModule via APP_GUARD), aplicado em TODA
// rota da API, inclusive o login — só a documentação (/docs, pois é servida
// fora do pipeline de rotas do Nest) e rotas marcadas com @Public() (hoje,
// só o health check) escapam disso. É uma camada extra de proteção "de
// aplicação", separada do JWT: mesmo sem estar logado, quem chama a API
// precisa provar que é um cliente autorizado enviando o header X-API-KEY
// com o valor certo (configurado em API_KEY no .env).
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.configService.getOrThrow<string>('API_KEY');

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException(
        'Chave de API ausente ou inválida (header X-API-KEY).',
      );
    }

    return true;
  }
}
