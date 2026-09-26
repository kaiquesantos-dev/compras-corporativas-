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
| `JWT_SECRET` | Segredo usado para assinar/validar os tokens JWT. **Mínimo de 32 caracteres** (a aplicação recusa subir com um valor mais curto) — nunca reutilize o valor de exemplo em produção. |
| `JWT_EXPIRES_IN` | Tempo de expiração do token (ex: `1d`). |
| `API_KEY` | Chave exigida no header `X-API-KEY` em **todas** as rotas, incluindo `/auth/login`. Mínimo de 32 caracteres, mesma regra do `JWT_SECRET`. |
| `PORT` | Porta em que a API sobe (padrão `3000`). |
| `CNPJ_API_BASE_URL` | URL base da BrasilAPI usada para consultar CNPJ de fornecedores. |
| `CNPJ_API_TIMEOUT_MS` | Timeout (em ms) para a consulta de CNPJ antes de considerar a integração externa indisponível. |
| `CORS_ORIGIN` | Origens (separadas por vírgula) autorizadas a chamar a API via CORS. Opcional — sem ela, cai no default `http://localhost:5173` (o frontend em dev). Em produção, aponte pro domínio real do frontend; a API nunca libera "qualquer origem". |

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

Antes de rodar os testes, o script `pretest:e2e` aplica as migrations no banco de teste automaticamente (ele é isolado do banco de desenvolvimento — `npx prisma migrate dev` nunca toca nele). Não é preciso rodar nenhum comando de migration manualmente antes: basta ter os containers `db` e `db-test` no ar (`docker compose up -d db db-test`) e chamar `npm run test:e2e` diretamente.

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
| BUYER | `comprador@compras.com` / `comprador2@compras.com` |
| APPROVER | `aprovador@compras.com` / `aprovador2@compras.com` |
| REQUESTER | `solicitante@compras.com` / `solicitante2@compras.com` / `solicitante3@compras.com` / `solicitante4@compras.com` |

O seed também cria 5 departamentos, 6 fornecedores e 15 solicitações de compra cobrindo **todos os 8 status** do ciclo de vida (3 `DRAFT`, 2 `SUBMITTED`, 2 `IN_QUOTATION`, 2 `PENDING_APPROVAL`, 1 `APPROVED`, 1 `REJECTED`, 2 `COMPLETED`, 2 `CANCELLED`), com datas espalhadas ao longo de ~40 dias para o histórico de status parecer real — prontas para uma apresentação ao vivo.

## Autenticação e segurança

- Autorização por papel: `REQUESTER`, `BUYER`, `APPROVER`, `ADMIN` — ver a matriz de permissões na tabela de endpoints abaixo.
- Senhas nunca são retornadas em nenhuma resposta (nem nas relações aninhadas, como `requester` dentro de uma solicitação de compra).
- `.env`/`.env.test` nunca são versionados (estão no `.gitignore`); apenas `.env.example`/`.env.test.example`, com placeholders.
- CORS restrito às origens de `CORS_ORIGIN` (nunca "qualquer origem") — ver seção de configuração do `.env`.
- `JWT_SECRET`/`API_KEY` exigem no mínimo 32 caracteres; a aplicação recusa subir com um valor mais curto.
- Delegação de acesso ADMIN (`isAdminDelegate`) tem proteções próprias contra escalonamento de privilégio — ver a nota na tabela de endpoints de Usuários.

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
DRAFT | SUBMITTED --requester dono/admin cancela--> CANCELLED (terminal)
IN_QUOTATION --buyer/admin cancela--> CANCELLED (terminal)
```

`REJECTED`, `COMPLETED` e `CANCELLED` são terminais: nenhuma ação (cotar, aprovar, cancelar, completar) é permitida a partir deles — qualquer tentativa retorna `409`.

**Quem pode cancelar muda conforme o estado:** em `DRAFT`/`SUBMITTED` é o REQUESTER dono (ou ADMIN) — a solicitação ainda não envolveu nenhum comprador. A partir de `IN_QUOTATION`, o comprador já está negociando com fornecedores de verdade, então o REQUESTER dono deixa de poder cancelar sozinho: só um BUYER ou ADMIN decidem a partir daí, para que quem está conduzindo a cotação tenha voz nessa decisão.

**Editar e submeter (`PATCH`/`submit`) checam posse, não o papel atual.** A autorização aqui é "é o dono desta solicitação?", não "o papel do usuário agora é REQUESTER?". Isso importa quando alguém é promovido/transferido depois de criar uma solicitação (ex: de REQUESTER para BUYER): sem essa distinção, o rascunho ficaria travado para sempre — nem o dono (que não é mais REQUESTER) nem ninguém mais (não é dono) conseguiria editá-lo ou submetê-lo, sem que a solicitação apareça como cancelada nem haja qualquer sinalização do problema.

**Outras regras de negócio que protegem o fluxo:**

- **Segregação de funções:** quem criou uma solicitação nunca aprova nem rejeita essa solicitação, mesmo que depois seja promovido a APPROVER (`403`).
- **Cotação vencida:** não é possível registrar uma cotação com `validUntil` no passado (`400`) nem selecionar como vencedora uma cotação que venceu depois de registrada (`409`). A validade vale até o fim do dia informado.
- **Fornecedor inativo** não recebe cotação nova nem pode ter cotação selecionada como vencedora (`409`). O CNPJ não é editável depois do cadastro. Se foi cadastrado errado, desative o fornecedor e cadastre outro.
- **Sistema nunca fica sem administrador:** ninguém altera o próprio papel nem exclui a própria conta (`403`). Acesso ADMIN delegado não cria contas ADMIN nem promove ninguém a ADMIN (`403`). Assim a delegação continua sendo temporária.
- **REQUESTER sempre tem departamento:** é exigido na criação e na edição (`400`), e um departamento com usuários não pode ser excluído (`409`), para que nenhum solicitante fique sem conseguir criar solicitações.

## Endpoints

Todas as rotas exigem `X-API-KEY`. "Auth" indica o papel exigido além do JWT válido; "-" significa qualquer usuário autenticado.

### Autenticação

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/auth/login` | público | `{ email, password }` | `200` token · `400` inválido · `401` credenciais erradas |
| GET | `/auth/me` | - | — | `200` `{ id, email, role, isAdminDelegate }` do usuário autenticado, revalidado no banco a cada chamada (útil pro frontend perceber uma delegação de acesso concedida/revogada sem precisar de novo login) · `401` |

### Usuários (`/users`) — somente ADMIN

| Método | URL | Body | Respostas |
|---|---|---|---|
| POST | `/users` | `{ name, email, password, role, departmentId? }` | `201` · `400` (inclusive REQUESTER sem departamento) · `401` · `403` (inclusive acesso delegado tentando criar um ADMIN) · `404` depto inexistente · `409` email duplicado |
| GET | `/users?page=&pageSize=&sortBy=&sortOrder=` | — | `200` |
| GET | `/users/:id` | — | `200` · `404` |
| PATCH | `/users/:id` | campos acima, todos opcionais; `departmentId: null` desvincula o departamento | `200` · `400` (inclusive deixar um REQUESTER sem departamento) · `403` se o alvo é ADMIN (ou vai virar ADMIN) e quem chama só tem acesso delegado, ou se quem chama tenta mudar o próprio papel · `404` |
| PATCH | `/users/:id/admin-delegate` | `{ granted: boolean }` | Concede/revoga acesso ADMIN temporário a um APPROVER (ex: cobrir férias do admin) — `200` · `400` alvo não é APPROVER · `403` só um ADMIN real pode chamar isto (um delegado não pode criar outros delegados) · `404` |
| DELETE | `/users/:id` | — | `200` · `403` se o alvo é ADMIN e quem chama só tem acesso delegado, ou se é a própria conta de quem chama · `404` · `409` se houver vínculos |

> **Nota sobre `isAdminDelegate`:** um usuário com acesso ADMIN só por delegação passa em qualquer checagem de papel que exija `ADMIN`, mas **não** é tratado como ADMIN de verdade para duas ações: conceder/revogar uma delegação (evita uma cadeia de escalonamento de privilégio descontrolada) e alterar/remover a conta de outro ADMIN (evita que um delegado tranque o admin real fora do sistema).

### Departamentos (`/departments`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/departments` | ADMIN | `{ name }` | `201` · `403` · `409` nome duplicado |
| GET | `/departments` | - | — | `200` |
| GET | `/departments/:id` | - | — | `200` · `404` |
| PATCH | `/departments/:id` | ADMIN | `{ name }` | `200` · `404` |
| DELETE | `/departments/:id` | ADMIN | — | `200` · `404` · `409` se ainda houver usuários ou solicitações vinculados (transfira os usuários antes) |

### Fornecedores (`/suppliers`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/suppliers` | BUYER, ADMIN | `{ document, legalName?, tradeName?, email?, phone?, zipCode?, street?, city?, state? }` — `legalName`/endereço preenchidos automaticamente via CNPJ quando omitidos | `201` · `400` CNPJ inválido/serviço indisponível sem dados manuais · `403` · `409` CNPJ duplicado |
| GET | `/suppliers?page=&pageSize=&sortBy=&sortOrder=&isActive=` | - | — | `200` |
| GET | `/suppliers/:id` | - | — | `200` · `404` |
| PATCH | `/suppliers/:id` | BUYER, ADMIN | `{ legalName?, tradeName?, email?, phone?, zipCode?, street?, city?, state?, isActive? }` — **sem `document`**: o CNPJ é travado após o cadastro (é a identidade legal do fornecedor) | `200` · `400` se enviar `document` · `404` |
| DELETE | `/suppliers/:id` | ADMIN | — | `200` · `404` · `409` se houver cotações vinculadas |

### Solicitações de compra (`/purchase-requests`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests` | REQUESTER | `{ title, justification, items: [{ description, quantity, unit, estimatedUnitPrice? }] }` | `201` · `400` sem itens · `403` |
| GET | `/purchase-requests?page=&pageSize=&sortBy=&sortOrder=&status=` | - | — | `200` (REQUESTER vê só as próprias) |
| GET | `/purchase-requests/metrics` | BUYER, APPROVER, ADMIN | — | `200` · `403` |
| GET | `/purchase-requests/:id` | - | — | `200` · `403` recurso de terceiro · `404` |
| PATCH | `/purchase-requests/:id` | dono da solicitação, qualquer que seja o papel atual dele | `{ title?, justification? }` | `200` · `403` · `404` · `409` fora de DRAFT |
| POST | `/purchase-requests/:id/submit` | dono da solicitação, qualquer que seja o papel atual dele | — | `200` · `403` · `409` fora de DRAFT |
| POST | `/purchase-requests/:id/cancel` | REQUESTER dono (DRAFT/SUBMITTED), BUYER (a partir de IN_QUOTATION), ADMIN ou admin delegado (qualquer estado cancelável) | — | `200` · `403` papel/estado incompatível · `409` estado não cancelável |
| POST | `/purchase-requests/:id/complete` | BUYER, ADMIN | — | `200` · `409` fora de APPROVED |
| GET | `/purchase-requests/:id/history` | - | — | `200` · `403` · `404` |

### Cotações (`/purchase-requests/:id/quotes`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests/:id/quotes` | BUYER, ADMIN | `{ supplierId, totalValue, validUntil?, notes? }` (JSON) **ou** `multipart/form-data` com os mesmos campos + `file` opcional (PDF/PNG/JPEG, até 5MB) — anexa a proposta já na criação, sem precisar de uma segunda chamada | `201` · `400` dados/arquivo inválido, ou `validUntil` no passado · `404` solicitação/fornecedor · `409` fora de SUBMITTED/IN_QUOTATION, ou fornecedor inativo (`isActive: false`) · `413` arquivo maior que 5MB |
| GET | `/purchase-requests/:id/quotes` | - | — | `200` |
| POST | `/purchase-requests/:id/quotes/:quoteId/proposal` | BUYER, ADMIN | `multipart/form-data`, campo `file` (PDF/PNG/JPEG, até 5MB) | `201` · `400` arquivo ausente/tipo ou conteúdo não permitido · `409` fora de SUBMITTED/IN_QUOTATION · `413` arquivo maior que 5MB |
| GET | `/purchase-requests/:id/quotes/:quoteId/proposal` | - | — | `200` binário · `404` sem arquivo |
| POST | `/purchase-requests/:id/quotes/:quoteId/select` | BUYER, ADMIN | — | `200` · `409` fora de IN_QUOTATION, fornecedor da cotação inativo, ou cotação vencida |

### Aprovações (`/purchase-requests/:id/approval`)

| Método | URL | Auth | Body | Respostas |
|---|---|---|---|---|
| POST | `/purchase-requests/:id/approval` | APPROVER, ADMIN | `{ decision: "APPROVED" \| "REJECTED", comment? }` | `200` · `403` (inclusive quem criou a solicitação tentando decidir sobre ela) · `409` fora de PENDING_APPROVAL |
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
