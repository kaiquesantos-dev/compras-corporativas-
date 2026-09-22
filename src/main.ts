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

  // Libera chamadas vindas de outra origem (ex: o frontend React rodando em
  // localhost:5173 durante o desenvolvimento). Sem isso, o navegador bloqueia
  // toda requisição do frontend para esta API por política de CORS. Como a
  // autenticação aqui é via token JWT no header (não cookie de sessão), não
  // há risco de CSRF em liberar qualquer origem — não usamos "credentials".
  app.enableCors();

  configureSwagger(app);

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}
bootstrap();
