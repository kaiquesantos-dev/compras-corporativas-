import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Limita tentativas de login por CONTA + ORIGEM (IP + e-mail), não só por IP:
// barra quem tenta adivinhar a senha de uma conta, sem travar todos os
// usuários que compartilham o mesmo IP (ex: a rede da empresa atrás de um
// único IP público) — cada um entra com o próprio e-mail e tem a própria cota.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: {
    ip?: string;
    body?: { email?: unknown };
  }): Promise<string> {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    return `${req.ip ?? 'desconhecido'}:${email}`;
  }
}
