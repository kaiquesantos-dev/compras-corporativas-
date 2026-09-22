import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() faz o PrismaService ficar disponível para injeção em QUALQUER
// módulo da aplicação, sem precisar importar o PrismaModule toda vez —
// é uma exceção proposital, já que quase todo service do sistema precisa
// falar com o banco.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
