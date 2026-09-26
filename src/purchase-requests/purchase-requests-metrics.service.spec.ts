import { PurchaseRequestsMetricsService } from './purchase-requests-metrics.service';

const ADMIN = { id: 1, email: 'a@a.com', role: 'ADMIN', isAdminDelegate: false } as any;
const BUYER = { id: 2, email: 'b@b.com', role: 'BUYER', isAdminDelegate: false } as any;

describe('PurchaseRequestsMetricsService', () => {
  let service: PurchaseRequestsMetricsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      purchaseRequest: { groupBy: jest.fn(), findMany: jest.fn() },
      quote: { aggregate: jest.fn() },
    };
    service = new PurchaseRequestsMetricsService(prisma);
  });

  it('aggregates count by status, total approved value, and average approval time', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 2 } },
      { status: 'APPROVED', _count: { _all: 1 } },
    ]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: 1500 } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([
      {
        submittedAt: new Date('2026-01-01T00:00:00Z'),
        decidedAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);

    const result = await service.getMetrics(ADMIN);

    expect(result.countByStatus).toEqual({ DRAFT: 2, APPROVED: 1 });
    expect(result.totalApprovedValue).toBe(1500);
    expect(result.averageApprovalTimeHours).toBe(24);
  });

  it('sums totalApprovedValue with the aggregate, filtering by APPROVED/COMPLETED via the selectedFor relation', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: 999.5 } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const result = await service.getMetrics(ADMIN);

    expect(prisma.quote.aggregate).toHaveBeenCalledWith({
      _sum: { totalValue: true },
      where: {
        selectedFor: { status: { in: ['APPROVED', 'COMPLETED'] } },
      },
    });
    expect(result.totalApprovedValue).toBe(999.5);
  });

  it('returns 0 for totalApprovedValue when no quote is selected yet (aggregate sum is null)', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const result = await service.getMetrics(ADMIN);

    expect(result.totalApprovedValue).toBe(0);
  });

  it('returns null averageApprovalTimeHours when no request has been decided yet', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const result = await service.getMetrics(ADMIN);

    expect(result.averageApprovalTimeHours).toBeNull();
  });

  it('filters by createdAt and returns periodStart/periodEnd when "from"/"to" are provided', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.999Z');
    const result = await service.getMetrics(ADMIN, from, to);

    const groupByWhere = prisma.purchaseRequest.groupBy.mock.calls[0][0].where;
    expect(groupByWhere.createdAt).toEqual({ gte: from, lte: to });
    const aggregateWhere = prisma.quote.aggregate.mock.calls[0][0].where;
    expect(aggregateWhere.selectedFor.createdAt).toEqual({ gte: from, lte: to });
    expect(result.periodStart).toBe(from.toISOString());
    expect(result.periodEnd).toBe(to.toISOString());
  });

  it('filters with only "from" (open-ended range)', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const from = new Date('2026-08-01T00:00:00.000Z');
    const result = await service.getMetrics(ADMIN, from);

    const groupByWhere = prisma.purchaseRequest.groupBy.mock.calls[0][0].where;
    expect(groupByWhere.createdAt).toEqual({ gte: from });
    expect(result.periodStart).toBe(from.toISOString());
    expect(result.periodEnd).toBeNull();
  });

  it('returns periodStart/periodEnd null when no filter is given', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    const result = await service.getMetrics(ADMIN);

    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
    expect(prisma.purchaseRequest.groupBy.mock.calls[0][0].where).toEqual({});
  });

  it('does not count drafts of other people for a BUYER (drafts are private until submitted)', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.quote.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]);

    await service.getMetrics(BUYER);

    expect(prisma.purchaseRequest.groupBy.mock.calls[0][0].where).toEqual({
      OR: [{ status: { not: 'DRAFT' } }, { requesterId: BUYER.id }],
    });
  });
});
