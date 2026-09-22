import { Role } from '../../generated/prisma/client';

// Formato do usuário logado que circula pela aplicação depois do login
// (é o que @CurrentUser() devolve). Só tem o essencial — nunca a senha.
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}
