import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { configureSwagger } from './swagger.config';

// Tamanho máximo aceito para o corpo de uma requisição JSON/form comum
// (não afeta o upload de proposta, que usa multipart/form-data e tem seu
// próprio limite de 5MB, tratado à parte pelo multer). Sem este limite,
// alguém poderia mandar um body de vários MB só de texto e derrubar a
// aplicação por consumo de memória.
const MAX_BODY_SIZE = '1mb';

// Ponto de entrada da aplicação. ValidationPipe, filtro de exceções e
// interceptor de log já são registrados via injeção de dependência dentro
// do AppModule — aqui só ficam as preocupações que são, de fato, middleware
// bruto do Express (Helmet, Compression) e a configuração do Swagger.
async function bootstrap() {
  // "bodyParser: false" desliga o parser padrão do Nest para que possamos
  // registrar o nosso, abaixo, já com o limite de tamanho aplicado.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: MAX_BODY_SIZE }));
  app.use(urlencoded({ extended: true, limit: MAX_BODY_SIZE }));

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
  // localhost:5173 durante o desenvolvimento) — sem isso, o navegador
  // bloqueia toda requisição do frontend pra esta API. A autenticação aqui é
  // via token JWT no header (não cookie de sessão), então não há risco de
  // CSRF — mas "liberar qualquer origem" (app.enableCors() sem opções, como
  // era antes) é um problema diferente: qualquer site que consiga obter um
  // token válido de alguma forma (ex: colado manualmente, ou uma falha de
  // XSS em outro lugar) conseguiria fazer fetch() autenticado pra esta API
  // a partir de QUALQUER origem e ler a resposta. Restringimos à lista de
  // origens configurada em CORS_ORIGIN (o próprio frontend, e mais nada).
  const corsOrigins = (
    configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  // Faz o Nest escutar os sinais de encerramento do sistema operacional
  // (SIGTERM, enviado por "docker stop"; SIGINT, do Ctrl+C) e chamar os
  // hooks de ciclo de vida de cada provider antes de matar o processo — é
  // isso que faz o `onModuleDestroy` do PrismaService (que fecha a conexão
  // com o Postgres) realmente ser executado, em vez do processo simplesmente
  // morrer com a conexão ainda aberta.
  app.enableShutdownHooks();

  configureSwagger(app);

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}
bootstrap();
