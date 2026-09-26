import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

// Módulo que agrupa tudo relacionado a login/JWT. Ele configura o JwtModule
// (que sabe assinar e conferir tokens) usando o segredo e o tempo de
// expiração que vêm do .env — nunca hardcoded no código.
@Module({
  imports: [
    PassportModule,
    // Limite de tentativas de login (usado só pelo LoginThrottlerGuard em
    // POST /auth/login — as demais rotas não passam por ele).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: config.get<number>('LOGIN_MAX_ATTEMPTS_PER_MINUTE') ?? 5,
          },
        ],
        errorMessage:
          'Muitas tentativas de login seguidas. Aguarde um minuto e tente novamente.',
      }),
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // JWT_EXPIRES_IN vem do .env como uma string comum (ex: "1d"), mas o
        // tipo esperado por signOptions.expiresIn é mais específico (vem da
        // lib "ms"). O TypeScript não consegue provar que a string bate com
        // esse formato, então usamos "as any" só nesse ponto pontual.
        signOptions: {
          expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
