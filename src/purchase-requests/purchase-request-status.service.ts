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

  // Valida a transição e, se for permitida, grava uma linha no histórico
  // (PurchaseRequestStatusHistory) com quem fez a mudança e quando.
  // Recebe "tx" (uma transação do Prisma) porque quem chama este método
  // sempre quer que essa gravação de histórico aconteça JUNTO, na mesma
  // transação, com a atualização do status da solicitação — ou as duas
  // coisas acontecem, ou nenhuma (evita ficar com histórico sem o status
  // realmente ter mudado, ou vice-versa).
  async transitionAndRecord(
    tx: Prisma.TransactionClient,
    purchaseRequestId: number,
    from: PurchaseRequestStatus,
    to: PurchaseRequestStatus,
    changedByUserId: number,
    note?: string,
  ): Promise<void> {
    this.assertTransition(from, to);
    await tx.purchaseRequestStatusHistory.create({
      data: {
        purchaseRequestId,
        fromStatus: from,
        toStatus: to,
        changedByUserId,
        note,
      },
    });
  }
}
