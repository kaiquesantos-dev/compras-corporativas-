# Compras Corporativas — Frontend

Frontend em React + TypeScript + Vite para a API de Compras Corporativas, com a identidade visual da IT Lean (design system extraído de itlean.com.br).

## Stack

- React 19 + TypeScript + Vite
- React Router v6 (rotas protegidas por papel)
- TanStack Query (cache e chamadas à API)
- Zustand (sessão do usuário, guardada em `sessionStorage`)
- Tailwind CSS v4 (tokens do design system IT Lean: cores, fonte Exo, raios, sombras)

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Abre em `http://localhost:5173`. O Vite faz proxy de `/api/*` para `http://localhost:3000` (a API backend precisa estar rodando — ver README na raiz do projeto).

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | Base das chamadas à API. Padrão `/api` (usa o proxy do Vite em dev). |
| `VITE_API_KEY` | Mesmo valor de `API_KEY` no `.env` do backend — a API exige o header `X-API-KEY` em toda rota. |

## Autenticação

A API não tem refresh token — só um JWT simples (expira conforme `JWT_EXPIRES_IN` no backend, padrão 1 dia). O token fica em `sessionStorage` (sobrevive a um F5, mas some ao fechar a aba); um 401 da API desloga automaticamente.

## Estrutura

```
src/
  api/          # cliente axios + funções de chamada por domínio
  store/        # estado global (Zustand) — hoje só sessão do usuário
  components/
    ui/         # componentes de marca (Button, TextField, StatusBadge)
    layout/     # AppShell (sidebar + navegação por papel)
  pages/        # uma página por rota
  routes/       # ProtectedRoute (guarda de rota por papel)
  lib/          # utilitários (cn, decode de JWT)
```

## Estado atual

Implementado: login, painel com indicadores (BUYER/APPROVER/ADMIN), listagem e detalhe de solicitações de compra, criação de solicitação (REQUESTER), submeter/cancelar.

Pendente (telas placeholder no menu): Fornecedores, Aprovações, Usuários, Departamentos.
