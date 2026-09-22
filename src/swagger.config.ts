import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Monta a página de documentação interativa da API (Swagger UI), disponível
// em /docs. Ela lê automaticamente os decorators @ApiTags/@ApiOperation/
// @ApiProperty espalhados pelos controllers e DTOs — aqui só definimos o
// "cabeçalho" da documentação (título, descrição, versão) e os dois tipos
// de autenticação que o usuário pode informar no botão "Authorize" da UI:
// o token JWT (bearer) e a chave de API (x-api-key).
export function configureSwagger(app: INestApplication): void {
  // Descrições e exemplos variam por ambiente: dev = inglês + exemplos genéricos,
  // prod = português + exemplos reais (sem credenciais verdadeiras).
  const isDev = process.env.NODE_ENV !== 'production';

  const descriptionDev = `Corporate Purchases API — complete workflow from purchase request to quotation to approval.

## Roles
- **REQUESTER**: creates and submits own purchase requests.
- **BUYER**: registers suppliers, records quotations, attaches proposals, selects winning quote.
- **APPROVER**: approves or rejects pending requests.
- **ADMIN**: full administrative access (users, departments) and unrestricted access.

## State flow
DRAFT → SUBMITTED → IN_QUOTATION → PENDING_APPROVAL → APPROVED → COMPLETED, with REJECTED and CANCELLED as terminal states (no future actions allowed).`;

  const descriptionProd = `API para gestão de compras corporativas, cobrindo o fluxo completo solicitação → cotação → aprovação.

## Papéis
- **REQUESTER**: cria e submete solicitações de compra próprias.
- **BUYER**: cadastra fornecedores, registra cotações, anexa propostas e seleciona a cotação vencedora.
- **APPROVER**: aprova ou rejeita solicitações pendentes.
- **ADMIN**: gestão administrativa completa (usuários, departamentos) e acesso irrestrito.

## Fluxo de estados
DRAFT → SUBMITTED → IN_QUOTATION → PENDING_APPROVAL → APPROVED → COMPLETED, com REJECTED e CANCELLED como estados terminais (nenhuma ação futura é permitida a partir deles).`;

  const config = new DocumentBuilder()
    .setTitle('API de Compras Corporativas')
    .setDescription(isDev ? descriptionDev : descriptionProd)
    .setVersion('1.0.0')
    .setContact(
      isDev ? 'Support' : 'Suporte',
      'https://github.com/kaiquesantos-dev/compras-corporativas-',
      isDev ? 'support@example.com' : 'suporte@compras.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', isDev ? 'Development' : 'Desenvolvimento')
    .addServer('https://api.compras.com', isDev ? 'Production' : 'Produção')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // O ApiKeyGuard é global no backend (toda rota exige X-API-KEY), mas o
  // Swagger só anexa automaticamente a chave nas requisições de "Try it
  // out" para rotas que declaram o requisito de segurança explicitamente.
  // Em vez de decorar cada controller com @ApiSecurity('x-api-key') (fácil
  // de esquecer em um novo endpoint), aplicamos aqui de uma vez para todo
  // o documento — assim a documentação nunca fica dessincronizada da regra
  // real do backend.
  document.security = [{ 'x-api-key': [] }];

  SwaggerModule.setup('docs', app, document);
}
