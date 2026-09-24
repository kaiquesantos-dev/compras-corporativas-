import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, PurchaseRequestStatus } from '../generated/prisma/client';

// Este é o "mapa" oficial da máquina de estados da solicitação de compra.
// Cada chave é um estado atual, e a lista é para quais estados ele pode ir.
// Um estado com lista vazia ([]) é um estado TERMINAL — não dá mais pra
// sair dele de jeito nenhum (é o caso de REJECTED, COMPLETED e CANCELLED).
//
//   DRAFT --submete--> SUBMITTED --1ª cotação--> IN_QUOTATION
//   IN_QUOTATION --seleciona vencedora--> PENDING_APPROVAL
//   PENDING_APPROVAL --aprova--> APPROVED --conclui--> COMPLETED
//   PENDING_APPROVAL --rejeita--> REJECTED (fim)
//   (de DRAFT/SUBMITTED/IN_QUOTATION dá pra cancelar a qualquer momento)
const ALLOWED_TRANSITIONS: Record<
  PurchaseRequestStatus,
  PurchaseRequestStatus[]
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['IN_QUOTATION', 'CANCELLED'],
  IN_QUOTATION: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

// Serviço central e ÚNICO responsável por decidir "essa mudança de status é
// permitida?" e por registrar o histórico de cada mudança. Os módulos de
// Solicitações, Cotações e Aprovações injetam este mesmo service em vez de
// cada um reimplementar sua própria versão da regra — assim a regra mais
// importante do sistema fica escrita em um lugar só.
@Injectable()
export class PurchaseRequestStatusService {
  // Confere se a transição de "from" para "to" é permitida pelo mapa acima.
  // Se não for, lança 409 (conflito de regra de negócio) — por exemplo,
  // tentar aprovar uma solicitação que ainda está em DRAFT.
  assertTransition(
    from: PurchaseRequestStatus,
    to: PurchaseRequestStatus,
  ): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Não é possível mudar o status de ${from} para ${to}.`,
      );
    }
  }

  // Valida a transição, aplica a mudança de status (compare-and-swap) e
  // grava uma linha no histórico — tudo dentro da mesma transação "tx" que
  // quem chama já abriu, então ou as três coisas acontecem, ou nenhuma.
  //
  // O "compare-and-swap" é o que faltava antes: o UPDATE só é aplicado se o
  // status da linha, NA HORA DA ESCRITA, ainda for exatamente "from" (usamos
  // o suporte do Prisma a filtros extras dentro do "where" de um update por
  // chave única). Sem isso, duas requisições concorrentes que leem o mesmo
  // "from" antes de qualquer uma commitar (ex: submit + cancel ao mesmo
  // tempo, ou dois BUYERs selecionando cotações diferentes) conseguiam as
  // duas passar pela validação e a segunda sobrescrevia o resultado da
  // primeira em silêncio, sem erro pra ninguém. Agora a segunda encontra
  // zero linhas casando o filtro, cai no catch abaixo e recebe um 409
  // claro em vez de corromper o estado sem avisar.
  async transitionAndRecord(
    tx: Prisma.TransactionClient,
    purchaseRequestId: number,
    from: PurchaseRequestStatus,
    to: PurchaseRequestStatus,
    changedByUserId: number,
    options?: { note?: string; data?: Prisma.PurchaseRequestUpdateInput },
  ) {
    this.assertTransition(from, to);

    let updated;
    try {
      updated = await tx.purchaseRequest.update({
        where: { id: purchaseRequestId, status: from },
        data: { status: to, ...options?.data },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new ConflictException(
          `Não é possível mudar o status de ${from} para ${to}: o status já foi alterado por outra operação concorrente.`,
        );
      }
      throw err;
    }

    await tx.purchaseRequestStatusHistory.create({
      data: {
        purchaseRequestId,
        fromStatus: from,
        toStatus: to,
        changedByUserId,
        note: options?.note,
      },
    });

    return updated;
  }
}
