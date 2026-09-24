import { Role } from '../../generated/prisma/client';

// Formato do usuário logado que circula pela aplicação depois do login
// (é o que @CurrentUser() devolve). Só tem o essencial — nunca a senha.
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
  // Delegação temporária de acesso ADMIN (ex: admin de férias passa o
  // acesso pra um APPROVER cobrir) — ver RolesGuard, que trata isso como
  // equivalente a role === 'ADMIN' em qualquer rota que exija esse papel,
  // sem alterar o "role" real do usuário.
  isAdminDelegate: boolean;
}
