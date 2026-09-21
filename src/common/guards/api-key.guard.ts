import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = this.configService.getOrThrow<string>('API_KEY');

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Chave de API ausente ou inválida (header X-API-KEY).');
    }

    return true;
  }
}
