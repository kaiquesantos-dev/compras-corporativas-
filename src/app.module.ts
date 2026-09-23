import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './common/config/env.validation';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseRequestsModule } from './purchase-requests/purchase-requests.module';
import { QuotesModule } from './purchase-requests/quotes/quotes.module';
import { ApprovalsModule } from './purchase-requests/approvals/approvals.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';

// Módulo raiz da aplicação. Reúne todos os módulos de domínio e registra,
// via injeção de dependência (APP_GUARD/APP_PIPE/APP_FILTER/APP_INTERCEPTOR),
// as peças que precisam valer para TODA a aplicação:
// - ApiKeyGuard: exige o header X-API-KEY em toda rota;
// - ValidationPipe: valida e sanitiza o body de toda requisição;
// - PrismaExceptionFilter: converte erros do Prisma (ex: violação de FK/unique)
//   em respostas HTTP coerentes (409/404), em vez de vazar como 500;
// - LoggingInterceptor: loga cada requisição de forma estruturada.
//
// Registrar essas peças aqui (e não só no main.ts) garante que qualquer
// TestingModule que importe o AppModule nos testes e2e tenha exatamente o
// mesmo comportamento do servidor real.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    SuppliersModule,
    PurchaseRequestsModule,
    QuotesModule,
    ApprovalsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
