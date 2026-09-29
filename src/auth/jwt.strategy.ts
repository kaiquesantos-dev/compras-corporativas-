import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Só é chamado depois que o token JÁ foi validado (assinatura correta,
  // não expirado). Antes, isso apenas confiava cegamente no id/email/role
  // que estavam dentro do payload — como o token vive até JWT_EXPIRES_IN
  // (1 dia por padrão) sem nenhuma lista de revogação, um usuário rebaixado
  // ou excluído continuava autenticado com o papel antigo até o token
  // expirar sozinho. Agora buscamos o usuário atual no banco a cada
  // requisição e usamos o papel de LÁ, não o do token — um usuário
  // excluído cai aqui com 401 imediatamente, e um usuário rebaixado passa
  // a valer com o novo papel na próxima requisição, não só quando o token
  // expira.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload?.email || !payload?.role) {
      throw new UnauthorizedException('Token inválido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isAdminDelegate: true,
        isActive: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado ou removido.');
    }
    // Desativado pelo admin: a sessão cai na próxima requisição, sem esperar
    // o token vencer — é o que torna a desativação efetiva de imediato.
    if (!user.isActive) {
      throw new UnauthorizedException('Esta conta está desativada.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isAdminDelegate: user.isAdminDelegate,
    };
  }
}
