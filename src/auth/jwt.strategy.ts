import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './types/authenticated-user.type';

// Formato exato dos dados que colocamos dentro do token JWT lá no login
// (veja AuthService.login). "sub" é o padrão do JWT para "subject" (quem é
// o dono do token) — aqui usamos o id do usuário.
interface JwtPayload {
  sub: number;
  email: string;
  role: AuthenticatedUser['role'];
}

// É essa classe que faz a "mágica" de autenticação acontecer:
// 1. pega o token do header "Authorization: Bearer <token>";
// 2. confere a assinatura do token usando o JWT_SECRET;
// 3. se for válido, chama validate() com os dados que estavam dentro do token.
// O resultado de validate() vira automaticamente "request.user", que depois
// é lido pelo decorator @CurrentUser().
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Só é chamado depois que o token JÁ foi validado (assinatura correta,
  // não expirado). Aqui só garantimos que o payload tem o formato esperado.
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email || !payload?.role) {
      throw new UnauthorizedException('Token inválido.');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
