import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchaseRequestsMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // "from"/"to" opcionais: sem eles, considera todo o histórico. Com eles,
  // restringe a contagem a solicitações CRIADAS dentro do intervalo — sem
  // isso, o painel não deixava claro se "2 aguardando aprovação" era de
  // hoje ou acumulado desde o início do sistema. Quem monta o intervalo
  // (presets como "últimos 7 dias" ou um range escolhido à mão) é o
  // frontend; aqui só aplicamos o filtro que vier.
  async getMetrics(from?: Date, to?: Date) {
    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const [statusGroups, approvedRequests, decidedRequests] = await Promise.all(
      [
        this.prisma.purchaseRequest.groupBy({
          by: ['status'],
          _count: { _all: true },
          where: createdAtFilter,
        }),
        this.prisma.purchaseRequest.findMany({
          where: {
            status: { in: ['APPROVED', 'COMPLETED'] },
            selectedQuoteId: { not: null },
            ...createdAtFilter,
          },
          select: { selectedQuote: { select: { totalValue: true } } },
        }),
        this.prisma.purchaseRequest.findMany({
          where: {
            submittedAt: { not: null },
            decidedAt: { not: null },
            ...createdAtFilter,
          },
          select: { submittedAt: true, decidedAt: true },
        }),
      ],
    );

    const countByStatus = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    );

    // Soma como Decimal (não Number) até o fim: converter cada totalValue
    // pra float antes de somar acumula erro de arredondamento binário em
    // valores que não têm representação exata (ex: 0.10 + 0.20 + 0.30
    // repetidos muitas vezes) — inaceitável num total que é literalmente o
    // KPI financeiro do painel. Só vira Number() no final, para a resposta.
    const totalApprovedValue = approvedRequests
      .reduce(
        (sum, pr) => sum.plus(pr.selectedQuote?.totalValue ?? 0),
        new Prisma.Decimal(0),
      )
      .toNumber();

    const approvalDurationsHours = decidedRequests.map(
      (pr) =>
        (pr.decidedAt!.getTime() - pr.submittedAt!.getTime()) /
        (1000 * 60 * 60),
    );
    const averageApprovalTimeHours =
      approvalDurationsHours.length > 0
        ? approvalDurationsHours.reduce((sum, hours) => sum + hours, 0) /
          approvalDurationsHours.length
        : null;

    return {
      countByStatus,
      totalApprovedValue,
      averageApprovalTimeHours,
      periodStart: from?.toISOString() ?? null,
      periodEnd: to?.toISOString() ?? null,
    };
  }
}
