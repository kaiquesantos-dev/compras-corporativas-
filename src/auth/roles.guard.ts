import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './types/authenticated-user.type';

// Guard de AUTORIZAÇÃO: diferente do JwtAuthGuard (que só confere "quem é
// você"), este confere "você tem permissão pra isso". Ele sempre roda DEPOIS
// do JwtAuthGuard, porque precisa saber quem é o usuário logado.
// Funciona lendo a "etiqueta" (metadata) que o decorator @Roles(...) deixou
// no método/controller e comparando com o papel do usuário autenticado.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Procura a lista de papéis exigida por @Roles(...) — primeiro no
    // método, depois no controller inteiro (getAllAndOverride combina os dois).
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Se ninguém usou @Roles() nessa rota, não há restrição de papel — só
    // precisa estar autenticado (o que o JwtAuthGuard já garantiu).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // isAdminDelegate: usuário APPROVER com acesso ADMIN delegado (ex: para
    // cobrir as férias do admin) passa em qualquer rota que exija ADMIN,
    // sem que o "role" real dele mude — continua sendo um APPROVER normal
    // em tudo que exigir especificamente esse papel.
    const hasAccess =
      !!user &&
      (requiredRoles.includes(user.role) ||
        (user.isAdminDelegate && requiredRoles.includes('ADMIN')));

    if (!hasAccess) {
      throw new ForbiddenException(
        'Você não tem permissão para executar esta ação.',
      );
    }

    return true;
  }
}
