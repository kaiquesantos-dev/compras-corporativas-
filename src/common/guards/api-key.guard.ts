import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.configService.getOrThrow<string>('API_KEY');

    if (typeof providedKey !== 'string' || !this.matches(providedKey, expectedKey)) {
      // Mensagem genérica de propósito ("Não autorizado", sem citar o nome
      // do header): quem integra com a API já sabe pelo Swagger que
      // X-API-KEY é exigido, e não faz sentido nenhum detalhe de
      // infraestrutura vazar pra tela de um usuário final (ex: login) — o
      // padrão de mercado pra qualquer 401 de autenticação é uma mensagem
      // curta e genérica, sem expor qual credencial especificamente falhou.
      throw new UnauthorizedException('Não autorizado.');
    }

    return true;
  }

  // Comparação em tempo constante: "!==" numa string comum compara byte a
  // byte e retorna assim que encontra a primeira diferença, o que vaza (via
  // timing) quantos bytes iniciais bateram — em teoria, dá pra reconstruir
  // a API_KEY certa byte a byte medindo a latência de muitas tentativas.
  // timingSafeEqual não tem esse atalho. Ele exige buffers do MESMO
  // tamanho (lança RangeError se não forem), então comparamos o
  // comprimento antes — isso ainda vaza o comprimento da chave, mas não o
  // conteúdo, que é o que importa aqui.
  private matches(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
