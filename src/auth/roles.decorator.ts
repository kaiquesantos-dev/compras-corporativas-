import { SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/client';

// Decorator usado assim: @Roles('ADMIN', 'BUYER') em cima de um método de
// controller. Ele não faz nenhuma verificação sozinho — só "cola uma
// etiqueta" (metadata) no método, dizendo quais papéis podem acessá-lo.
// Quem realmente lê essa etiqueta e bloqueia o acesso é o RolesGuard.
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
