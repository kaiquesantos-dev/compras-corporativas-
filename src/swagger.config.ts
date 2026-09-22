import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API de Compras Corporativas')
    .setDescription(
      `API para gestão de compras corporativas, cobrindo o fluxo completo solicitação → cotação → aprovação.

## Papéis
- **REQUESTER**: cria e submete solicitações de compra próprias.
- **BUYER**: cadastra fornecedores, registra cotações, anexa propostas e seleciona a cotação vencedora.
- **APPROVER**: aprova ou rejeita solicitações pendentes.
- **ADMIN**: gestão administrativa completa (usuários, departamentos) e acesso irrestrito.

## Fluxo de estados
DRAFT → SUBMITTED → IN_QUOTATION → PENDING_APPROVAL → APPROVED → COMPLETED, com REJECTED e CANCELLED como estados terminais (nenhuma ação futura é permitida a partir deles).

## Autenticação
Toda rota exige o header \`X-API-KEY\`. A maioria das rotas também exige um token JWT (\`Authorization: Bearer <token>\`), obtido via \`POST /auth/login\`.`,
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
