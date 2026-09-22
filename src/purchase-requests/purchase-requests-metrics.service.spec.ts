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
        { submittedAt: new Date('2026-01-01T00:00:00Z'), decidedAt: new Date('2026-01-02T00:00:00Z') },
      ]);

    const result = await service.getMetrics();

    expect(result.countByStatus).toEqual({ DRAFT: 2, APPROVED: 1 });
    expect(result.totalApprovedValue).toBe(1500);
    expect(result.averageApprovalTimeHours).toBe(24);
  });

  it('returns null averageApprovalTimeHours when no request has been decided yet', async () => {
    prisma.purchaseRequest.groupBy.mockResolvedValue([]);
    prisma.purchaseRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.getMetrics();

    expect(result.averageApprovalTimeHours).toBeNull();
  });
});
