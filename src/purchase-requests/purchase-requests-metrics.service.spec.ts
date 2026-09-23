import { PurchaseRequestsMetricsService } from './purchase-requests-metrics.service';

describe('PurchaseRequestsMetricsService', () => {
  let service: PurchaseRequestsMetricsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      purchaseRequest: { groupBy: jest.fn(), findMany: jest.fn() },
    };
    service = new PurchaseRequestsMetricsService(prisma);
  });

  it('aggregates count by status, total approved value, and average approval time', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 2 } },
      { status: 'APPROVED', _count: { _all: 1 } },
    ]);
    prisma.purchaseRequest.findMany
      .mockResolvedValueOnce([
        { selectedQuote: { totalValue: 1000 } },
        { selectedQuote: { totalValue: 500 } },
      ])
      .mockResolvedValueOnce([
        {
          submittedAt: new Date('2026-01-01T00:00:00Z'),
          decidedAt: new Date('2026-01-02T00:00:00Z'),
        },
      ]);

    const result = await service.getMetrics();

    expect(result.countByStatus).toEqual({ DRAFT: 2, APPROVED: 1 });
    expect(result.totalApprovedValue).toBe(1500);
    expect(result.averageApprovalTimeHours).toBe(24);
  });

  it('returns null averageApprovalTimeHours when no request has been decided yet', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.purchaseRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getMetrics();

    expect(result.averageApprovalTimeHours).toBeNull();
  });

  it('filters by createdAt and returns periodStart/periodEnd when "from"/"to" are provided', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.purchaseRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.999Z');
    const result = await service.getMetrics(from, to);

    const groupByWhere = prisma.purchaseRequest.groupBy.mock.calls[0][0].where;
    expect(groupByWhere.createdAt).toEqual({ gte: from, lte: to });
    expect(result.periodStart).toBe(from.toISOString());
    expect(result.periodEnd).toBe(to.toISOString());
  });

  it('filters with only "from" (open-ended range)', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.purchaseRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const from = new Date('2026-08-01T00:00:00.000Z');
    const result = await service.getMetrics(from);

    const groupByWhere = prisma.purchaseRequest.groupBy.mock.calls[0][0].where;
    expect(groupByWhere.createdAt).toEqual({ gte: from });
    expect(result.periodStart).toBe(from.toISOString());
    expect(result.periodEnd).toBeNull();
  });

  it('returns periodStart/periodEnd null when no filter is given', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.purchaseRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getMetrics();

    expect(result.periodStart).toBeNull();
    expect(result.periodEnd).toBeNull();
    expect(prisma.purchaseRequest.groupBy.mock.calls[0][0].where).toEqual({});
  });
});
