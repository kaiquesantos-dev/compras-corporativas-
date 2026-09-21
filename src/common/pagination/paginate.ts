import { PaginationQueryDto } from '../dto/pagination-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [sortField]: sortOrder },
  };
}
