import { buildPaginationParams } from './paginate';

describe('buildPaginationParams', () => {
  it('applies default page 1 and pageSize 20 when nothing is provided', () => {
    const result = buildPaginationParams(
      {},
      ['createdAt', 'name'],
      'createdAt',
    );
    expect(result).toEqual({
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('computes skip from page and pageSize', () => {
    const result = buildPaginationParams(
      { page: 3, pageSize: 10 },
      ['createdAt'],
      'createdAt',
    );
    expect(result.skip).toBe(20);
    expect(result.take).toBe(10);
  });

  it('falls back to the default sort field when sortBy is not allowed', () => {
    const result = buildPaginationParams(
      { sortBy: 'password', sortOrder: 'asc' },
      ['createdAt', 'name'],
      'createdAt',
    );
    expect(result.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('caps pageSize at 100 to avoid unbounded queries', () => {
    const result = buildPaginationParams(
      { pageSize: 500 },
      ['createdAt'],
      'createdAt',
    );
    expect(result.take).toBe(100);
  });
});
