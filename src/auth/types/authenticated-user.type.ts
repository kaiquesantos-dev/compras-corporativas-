import { Role } from '../../generated/prisma/client';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}
