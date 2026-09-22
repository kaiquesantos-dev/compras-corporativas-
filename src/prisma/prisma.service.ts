import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Ponto único de acesso ao banco de dados. Em vez de cada service criar seu
// próprio PrismaClient, todos injetam este PrismaService (registrado como
// @Global() no PrismaModule) e usam, por exemplo, `this.prisma.user.findMany()`.
//
// No Prisma 7, para conectar no PostgreSQL é preciso passar um "driver
// adapter" (PrismaPg) — é ele quem realmente sabe conversar com o Postgres
// usando a DATABASE_URL do .env.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    super({ adapter });
  }

  // Conecta no banco assim que o Nest termina de montar este módulo.
  async onModuleInit() {
    await this.$connect();
  }

  // Fecha a conexão de forma organizada quando a aplicação é encerrada.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
