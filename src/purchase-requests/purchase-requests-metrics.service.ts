import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchaseRequestsMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const [statusGroups, approvedRequests, decidedRequests] = await Promise.all([
      this.prisma.purchaseRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.purchaseRequest.findMany({
        where: { status: { in: ['APPROVED', 'COMPLETED'] }, selectedQuoteId: { not: null } },
        select: { selectedQuote: { select: { totalValue: true } } },
      }),
      this.prisma.purchaseRequest.findMany({
        where: { submittedAt: { not: null }, decidedAt: { not: null } },
        select: { submittedAt: true, decidedAt: true },
      }),
    ]);

    const countByStatus = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    );

    const totalApprovedValue = approvedRequests.reduce(
      (sum, pr) => sum + Number(pr.selectedQuote?.totalValue ?? 0),
      0,
    );

    const approvalDurationsHours = decidedRequests.map(
      (pr) => (pr.decidedAt!.getTime() - pr.submittedAt!.getTime()) / (1000 * 60 * 60),
    );
    const averageApprovalTimeHours =
      approvalDurationsHours.length > 0
        ? approvalDurationsHours.reduce((sum, hours) => sum + hours, 0) / approvalDurationsHours.length
        : null;

    return { countByStatus, totalApprovedValue, averageApprovalTimeHours };
  }
}
