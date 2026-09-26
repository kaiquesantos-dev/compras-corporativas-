import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { actsAsAdmin } from '../auth/acts-as-admin';

@Injectable()
export class PurchaseRequestsMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // "from"/"to" opcionais: sem eles, considera todo o histórico. Com eles,
  // restringe a contagem a solicitações CRIADAS dentro do intervalo — sem
  // isso, o painel não deixava claro se "2 aguardando aprovação" era de
  // hoje ou acumulado desde o início do sistema. Quem monta o intervalo
  // (presets como "últimos 7 dias" ou um range escolhido à mão) é o
  // frontend; aqui só aplicamos o filtro que vier.
  async getMetrics(user: AuthenticatedUser, from?: Date, to?: Date) {
    // Rascunho é privado até ser submetido: comprador/aprovador não contam
    // os rascunhos de outras pessoas (só o admin, inclusive o delegado, vê
    // todos). Os demais indicadores (valor aprovado, tempo de decisão) só
    // envolvem solicitações já submetidas, então não mudam.
    const draftPrivacyFilter: Prisma.PurchaseRequestWhereInput = actsAsAdmin(
      user,
    )
      ? {}
      : { OR: [{ status: { not: 'DRAFT' } }, { requesterId: user.id }] };

    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const [statusGroups, approvedValueAggregate, decidedRequests] =
      await Promise.all([
        this.prisma.purchaseRequest.groupBy({
          by: ['status'],
          _count: { _all: true },
          where: { ...createdAtFilter, ...draftPrivacyFilter },
        }),
        // Soma feita no banco (SUM), não carregando cada linha pra somar em
        // JS: antes disso era um findMany() sem limite trazendo TODAS as
        // solicitações aprovadas/concluídas (com a cotação selecionada
        // aninhada) pra memória do Node só pra somar um campo — cresce
        // linearmente com o histórico inteiro em vez de custar uma soma
        // agregada do Postgres. selectedFor é a relação inversa de
        // PurchaseRequest.selectedQuote (1:1), então filtramos a Quote pela
        // solicitação a que ela está vinculada como vencedora.
        this.prisma.quote.aggregate({
          _sum: { totalValue: true },
          where: {
            selectedFor: {
              status: { in: ['APPROVED', 'COMPLETED'] },
              ...createdAtFilter,
            },
          },
        }),
        this.prisma.purchaseRequest.findMany({
          where: {
            submittedAt: { not: null },
            decidedAt: { not: null },
            ...createdAtFilter,
          },
          select: { submittedAt: true, decidedAt: true },
        }),
      ]);

    const countByStatus = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    );

    // .toNumber() só no final, sobre o Decimal que o próprio Postgres já
    // somou — não perde a precisão que somar em JS (float) perderia.
    // new Prisma.Decimal(...) em vez de usar o valor direto: normaliza o
    // que veio do _sum (Decimal de verdade em runtime, mas nos testes
    // unitários o prisma é mockado e pode devolver um number cru) antes de
    // chamar .toNumber() nele.
    const totalApprovedValue = new Prisma.Decimal(
      approvedValueAggregate._sum.totalValue ?? 0,
    ).toNumber();

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
