import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function upsertUser(email: string, name: string, role: Role, departmentId: number) {
  const password = await bcrypt.hash('senha123', 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, password, departmentId },
  });
}

async function main() {
  const department = await prisma.department.upsert({
    where: { name: 'Tecnologia' },
    update: {},
    create: { name: 'Tecnologia' },
  });

  await upsertUser('admin@compras.com', 'Administrador', 'ADMIN', department.id);
  await upsertUser('comprador@compras.com', 'Comprador', 'BUYER', department.id);
  await upsertUser('aprovador@compras.com', 'Aprovador', 'APPROVER', department.id);
  await upsertUser('solicitante@compras.com', 'Solicitante', 'REQUESTER', department.id);

  console.log('Seed mínimo aplicado (1 departamento + 4 usuários, senha "senha123").');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
