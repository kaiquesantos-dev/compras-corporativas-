import { PaginationQueryDto } from '../dto/pagination-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
// Limite de segurança: mesmo que alguém peça pageSize=999999, nunca
// devolvemos mais que 100 registros de uma vez (evita sobrecarregar o banco).
const MAX_PAGE_SIZE = 100;

// Transforma os query params "humanos" (page, pageSize, sortBy, sortOrder)
// nos parâmetros que o Prisma realmente entende (skip, take, orderBy).
// "allowedSortFields" existe para não deixar o usuário ordenar por um campo
// qualquer que ele inventou na URL (ex: ordenar por "password") — só os
// campos da lista são aceitos, senão cai no campo padrão.
export function buildPaginationParams(
  query: PaginationQueryDto,
  allowedSortFields: string[],
  defaultSortField: string,
): { skip: number; take: number; orderBy: Record<string, 'asc' | 'desc'> } {
  const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
  const pageSize = Math.min(
    query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  const sortField = allowedSortFields.includes(query.sortBy ?? '')
    ? (query.sortBy as string)
    : defaultSortField;
  const sortOrder = query.sortOrder ?? 'desc';

  // "skip" é quantos registros pular antes de começar a trazer resultados.
  // Página 1 pula 0, página 2 pula "pageSize" registros, e assim por diante.
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [sortField]: sortOrder },
  };
}
