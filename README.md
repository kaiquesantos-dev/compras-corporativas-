# API de Compras Corporativas

API backend para gestão de **compras corporativas**, cobrindo o fluxo completo **solicitação → cotação → aprovação**, com autenticação JWT, autorização por papel, upload de arquivos, integração externa via CNPJ e testes automatizados end-to-end.

Projeto desenvolvido como avaliação prática de backend (NestJS + Prisma + PostgreSQL).

---

## Antes de começar

### Versões exatas utilizadas neste projeto

| Ferramenta | Versão |
|---|---|
| Node.js | `v24.18.0` |
| NestJS (`@nestjs/core`) | `11.2.5` |
| TypeScript | `5.9.3` |
| Prisma / `@prisma/client` | `7.10.0` (fixado no `package.json`) |
| PostgreSQL | `16` (imagem `postgres:16-alpine` no Docker Compose) |
| Docker / Docker Compose | Testado com Docker Desktop mais recente (qualquer versão com suporte a `docker compose` v2) |

### Pré-requisitos

- Node.js 20+ instalado (recomendado: a versão acima ou compatível).
- Docker Desktop instalado e em execução (para o PostgreSQL de desenvolvimento e de teste — não é necessário instalar PostgreSQL manualmente).
- Portas livres: `5434` (Postgres dev), `5433` (Postgres teste), `3000` (API). O Postgres de desenvolvimento usa a porta `5434` (em vez da `5432` padrão) de propósito, para não colidir com uma instalação nativa de PostgreSQL que porventura já exista na máquina.

### O que este projeto usa (stack obrigatória do enunciado)

NestJS + TypeScript, PostgreSQL, Prisma 7.10.0 (`prisma.config.ts` + driver adapter `@prisma/adapter-pg`), DTOs com `class-validator` + `ValidationPipe`, JWT + `@CurrentUser()`, autorização por papel/permissão, relacionamentos Prisma, upload de arquivo, `HttpService`, um interceptor (log estruturado + tempo de execução), `.env`/`ConfigService`, Helmet, Compression, tratamento coerente de `400/401/403/404/409`, build de produção.

---

## Instalação

```bash
git clone https://github.com/kaiquesantos-dev/compras-corporativas-.git
cd compras-corporativas-
npm install
```

## Configuração do `.env`

Copie `.env.example` para `.env` e ajuste se necessário:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `NODE_ENV` | `development`, `production` ou `test`. Controla, entre outras coisas, o idioma da documentação Swagger (`/docs`). |
| `DATABASE_URL` | String de conexão do PostgreSQL de desenvolvimento (porta `5434`). |
| `JWT_SECRET` | Segredo usado para assinar/validar os tokens JWT. Nunca reutilize o valor de exemplo em produção. |
| `JWT_EXPIRES_IN` | Tempo de expiração do token (ex: `1d`). |
| `API_KEY` | Chave exigida no header `X-API-KEY` em **todas** as rotas, incluindo `/auth/login`. |
| `PORT` | Porta em que a API sobe (padrão `3000`). |
| `CNPJ_API_BASE_URL` | URL base da BrasilAPI usada para consultar CNPJ de fornecedores. |
| `CNPJ_API_TIMEOUT_MS` | Timeout (em ms) para a consulta de CNPJ antes de considerar a integração externa indisponível. |

Para os testes automatizados, copie também `.env.test.example` para `.env.test` (já aponta para o banco de teste na porta `5433`).

## Banco de dados

Suba os bancos de desenvolvimento e de teste via Docker:

```bash
docker compose up -d db db-test
```

Rode as migrations e gere o Prisma Client:

```bash
npx prisma migrate dev
npx prisma generate
```

Popule com dados de demonstração (opcional, mas recomendado):

```bash
npx prisma db seed
```

## Execução

### Localmente (Node direto na máquina)

```bash
npm run start:dev
```

A API sobe em `http://localhost:3000`. Documentação interativa em `http://localhost:3000/docs`.

### Via Docker (API + banco, tudo containerizado)

```bash
docker compose up --build
```

Isso builda a imagem da API, sobe o Postgres e roda as migrations automaticamente ao iniciar o container. Para popular com dados de demonstração dentro do container:

```bash
docker compose exec api npx prisma db seed
```

## Testes

Testes unitários (services isolados, sem banco):

```bash
npm test
```

Testes end-to-end (batem nos endpoints reais, contra o banco de teste em `db-test`, porta `5433`):

```bash
npm run test:e2e
```

Os testes e2e cobrem, entre outros, os 10 cenários obrigatórios do enunciado: fluxo principal com sucesso, `400` (body inválido), `401` (sem token/token inválido), `403` (sem permissão e acesso a recurso de terceiro), `404` (recurso inexistente), `409` (conflito de regra de negócio, incluindo violação de FK mapeada e não um `500`), upload válido/inválido, integração externa funcionando/falhando de forma controlada, e o fluxo completo de mudança de estado.

## Build de produção

```bash
npm run build
node dist/main.js
```

## Usuários de teste (criados pelo seed)

Todos com senha `senha123`.

| Papel | Email |
|---|---|
| ADMIN | `admin@compras.com` |
| BUYER | `comprador@compras.com` |
| APPROVER | `aprovador@compras.com` |
| REQUESTER | `solicitante@compras.com` |
| REQUESTER (2º) | `solicitante2@compras.com` |

O seed também cria 2 fornecedores e 3 solicitações de compra de demonstração, em estágios diferentes do fluxo (`COMPLETED`, `PENDING_APPROVAL`, `DRAFT`) — prontas para uma apresentação ao vivo.

## Autenticação e segurança

- Autorização por papel: `REQUESTER`, `BUYER`, `APPROVER`, `ADMIN` — ver a matriz de permissões na tabela de endpoints abaixo.
- Senhas nunca são retornadas em nenhuma resposta (nem nas relações aninhadas, como `requester` dentro de uma solicitação de compra).
- `.env`/`.env.test` nunca são versionados (estão no `.gitignore`); apenas `.env.example`/`.env.test.example`, com placeholders.

### Exemplo de requisição de login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: <valor de API_KEY no seu .env>" \
  -d "{\"email\":\"admin@compras.com\",\"password\":\"senha123\"}"
```

Resposta (`200`):

```json
{ "access_token": "eyJhbGciOi..." }
```

## Fluxo de estados da solicitação de compra

```text
DRAFT --submit(requester)--> SUBMITTED
SUBMITTED --buyer registra 1ª cotação--> IN_QUOTATION
IN_QUOTATION --buyer seleciona cotação vencedora--> PENDING_APPROVAL
PENDING_APPROVAL --approver aprova--> APPROVED
PENDING_APPROVAL --approver rejeita--> REJECTED (terminal)
APPROVED --buyer/admin completa--> COMPLETED (terminal)
DRAFT | SUBMITTED | IN_QUOTATION --requester/admin cancela--> CANCELLED (terminal)
```

`REJECTED`, `COMPLETED` e `CANCELLED` são terminais: nenhuma ação (cotar, aprovar, cancelar, completar) é permitida a partir deles — qualquer tentativa retorna `409`.

## Endpoints

Todas as rotas exigem `X-API-KEY`. "Auth" indica o papel exigido além do JWT válido; "-" significa qualquer usuário autenticado.

### Autenticação

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/auth/login` | público | `{ email, password }` | `200` token · `400` inválido · `401` credenciais erradas |

### Usuários (`/users`) — somente ADMIN

| Método | URL | Body | Respostas |
|---|---|---|---|
| POST | `/users` | `{ name, email, password, role, departmentId? }` | `201` · `400` · `401` · `403` · `404` depto inexistente · `409` email duplicado |
| GET | `/users?page=&pageSize=&sortBy=&sortOrder=` | — | `200` |
| GET | `/users/:id` | — | `200` · `404` |
| PATCH | `/users/:id` | campos acima, todos opcionais | `200` · `400` · `404` |
| DELETE | `/users/:id` | — | `200` · `404` · `409` se houver vínculos |

### Departamentos (`/departments`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/departments` | ADMIN | `{ name }` | `201` · `403` · `409` nome duplicado |
| GET | `/departments` | - | — | `200` |
| GET | `/departments/:id` | - | — | `200` · `404` |
| PATCH | `/departments/:id` | ADMIN | `{ name }` | `200` · `404` |
| DELETE | `/departments/:id` | ADMIN | — | `200` · `404` · `409` se houver solicitações vinculadas (usuários apenas são desvinculados, não bloqueiam a exclusão) |

### Fornecedores (`/suppliers`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/suppliers` | BUYER, ADMIN | `{ document, legalName?, tradeName?, email?, phone?, zipCode?, street?, city?, state? }` — `legalName`/endereço preenchidos automaticamente via CNPJ quando omitidos | `201` · `400` CNPJ inválido/serviço indisponível sem dados manuais · `403` · `409` CNPJ duplicado |
| GET | `/suppliers?page=&pageSize=&sortBy=&sortOrder=&isActive=` | - | — | `200` |
| GET | `/suppliers/:id` | - | — | `200` · `404` |
| PATCH | `/suppliers/:id` | BUYER, ADMIN | campos acima, opcionais | `200` · `404` |
| DELETE | `/suppliers/:id` | ADMIN | — | `200` · `404` · `409` se houver cotações vinculadas |

### Solicitações de compra (`/purchase-requests`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests` | REQUESTER | `{ title, justification, items: [{ description, quantity, unit, estimatedUnitPrice? }] }` | `201` · `400` sem itens · `403` |
| GET | `/purchase-requests?page=&pageSize=&sortBy=&sortOrder=&status=` | - | — | `200` (REQUESTER vê só as próprias) |
| GET | `/purchase-requests/metrics` | BUYER, APPROVER, ADMIN | — | `200` · `403` |
| GET | `/purchase-requests/:id` | - | — | `200` · `403` recurso de terceiro · `404` |
| PATCH | `/purchase-requests/:id` | REQUESTER dono | `{ title?, justification? }` | `200` · `403` · `404` · `409` fora de DRAFT |
| POST | `/purchase-requests/:id/submit` | REQUESTER dono | — | `200` · `403` · `409` fora de DRAFT |
| POST | `/purchase-requests/:id/cancel` | REQUESTER dono, ADMIN | — | `200` · `403` · `409` estado não cancelável |
| POST | `/purchase-requests/:id/complete` | BUYER, ADMIN | — | `200` · `409` fora de APPROVED |
| GET | `/purchase-requests/:id/history` | - | — | `200` · `403` · `404` |

### Cotações (`/purchase-requests/:id/quotes`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests/:id/quotes` | BUYER, ADMIN | `{ supplierId, totalValue, validUntil?, notes? }` | `201` · `404` solicitação/fornecedor · `409` fora de SUBMITTED/IN_QUOTATION |
| GET | `/purchase-requests/:id/quotes` | - | — | `200` |
| POST | `/purchase-requests/:id/quotes/:quoteId/proposal` | BUYER, ADMIN | `multipart/form-data`, campo `file` (PDF/PNG/JPEG, até 5MB) | `201` · `400` arquivo ausente/inválido/grande · `409` fora de SUBMITTED/IN_QUOTATION |
| GET | `/purchase-requests/:id/quotes/:quoteId/proposal` | - | — | `200` binário · `404` sem arquivo |
| POST | `/purchase-requests/:id/quotes/:quoteId/select` | BUYER, ADMIN | — | `200` · `409` fora de IN_QUOTATION |

### Aprovações (`/purchase-requests/:id/approval`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests/:id/approval` | APPROVER, ADMIN | `{ decision: "APPROVED" \| "REJECTED", comment? }` | `200` · `403` · `409` fora de PENDING_APPROVAL |
| GET | `/purchase-requests/:id/approval` | - | — | `200` · `404` sem decisão ainda |

### Documentação

| Método | URL | Auth | Descrição |
|---|---|---|---|
| GET | `/docs` | público (sem `X-API-KEY`) | Swagger UI interativo, em português |

## Arquitetura e decisões de design

- **Camadas**: Controller (HTTP) → Service (regra de negócio) → PrismaService (acesso a dados), com Guards para autenticação/autorização e um filtro global para erros do Prisma.
- **Máquina de estados centralizada**: `PurchaseRequestStatusService` é a única fonte de verdade sobre quais transições são válidas, reutilizada pelos módulos de Solicitações, Cotações e Aprovações — evita que a regra de negócio mais importante do sistema fique duplicada em três lugares.
- **Filtro global de exceções Prisma**: qualquer violação de unicidade (`P2002`) ou de chave estrangeira (`P2003`) em qualquer service vira `409` automaticamente, sem tratamento caso a caso.
- **Upload em banco**: o arquivo de proposta é armazenado como `Bytes` diretamente no Postgres (não em disco nem em storage externo) — simplificação deliberada para o escopo da avaliação, evitando infraestrutura extra sem abrir mão de nenhum requisito.
- **Integração externa via CNPJ (BrasilAPI)**, em vez de CEP: mais alinhado ao domínio de fornecedores, e a resposta já traz o endereço completo. Falha da integração externa nunca gera `500` — cai para dados manuais informados no body, ou `400` controlado.
- **`X-API-KEY` global**: camada adicional de autenticação de aplicação, exigida antes até do JWT, em toda rota (exceto `/docs`).

## Bônus implementados

- Paginação, filtro e ordenação em todos os endpoints de listagem.
- Documentação Swagger completa, em português, com exemplos realistas (`/docs`).
- Seed com dados de demonstração cobrindo todo o ciclo de vida.
- Containerização completa (API + banco) via Docker Compose, com migrations automáticas no startup.
- Indicador de domínio: `GET /purchase-requests/metrics` (contagem por status, valor total aprovado, tempo médio de aprovação).
- Suíte de testes end-to-end cobrindo os 10 cenários obrigatórios do enunciado.
