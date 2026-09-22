import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { configureSwagger } from './swagger.config';

// Ponto de entrada da aplicação. ValidationPipe, filtro de exceções e
// interceptor de log já são registrados via injeção de dependência dentro
// do AppModule — aqui só ficam as preocupações que são, de fato, middleware
// bruto do Express (Helmet, Compression) e a configuração do Swagger.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Helmet adiciona cabeçalhos de segurança padrão. A Content-Security-Policy
  // precisa ser afrouxada para script/style "inline", senão a própria UI do
  // Swagger (que usa <script> inline) fica bloqueada e a página some em branco.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(compression());

  configureSwagger(app);

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}
bootstrap();
