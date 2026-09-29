import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Responsável por autenticar o usuário (login) e gerar o token JWT que ele
// vai usar nas próximas requisições. Não trata autorização (o que o usuário
// PODE fazer) — isso é papel dos Guards (RolesGuard).
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Fluxo do login:
  // 1. busca o usuário pelo email;
  // 2. compara a senha enviada com o hash salvo no banco (bcrypt);
  // 3. se tudo bater, gera um token JWT com os dados mínimos do usuário.
  // Em ambos os casos de falha (email não existe ou senha errada) devolvemos
  // a MESMA mensagem genérica, para não dar dica a quem está tentando
  // adivinhar se um email está cadastrado ou não.
  async login(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Conta desativada (soft delete): checada só DEPOIS da senha, para não
    // revelar a quem chuta e-mails quais contas existem. Quem sabe a senha
    // recebe o motivo real, em vez de achar que digitou errado.
    if (!user.isActive) {
      throw new ForbiddenException(
        'Esta conta está desativada. Procure o administrador do sistema.',
      );
    }

    // O payload do token guarda só o essencial (id, email, papel) — nunca a
    // senha. É esse payload que o JwtStrategy vai decodificar mais tarde
    // para identificar quem está fazendo cada requisição.
    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { access_token };
  }
}
