import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { PurchaseRequestStatusService } from '../purchase-request-status.service';
import { PurchaseRequestsService } from '../purchase-requests.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: PurchaseRequestStatusService,
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  async create(
    purchaseRequestId: number,
    dto: CreateQuoteDto,
    user: AuthenticatedUser,
    file?: Express.Multer.File,
  ) {
    const pr = await this.purchaseRequestsService.findOne(
      purchaseRequestId,
      user,
    );

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }

    if (pr.status !== 'SUBMITTED' && pr.status !== 'IN_QUOTATION') {
      throw new ConflictException(
        'Só é possível registrar cotações enquanto a solicitação está SUBMITTED ou IN_QUOTATION.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (pr.status === 'SUBMITTED') {
        try {
          await this.statusService.transitionAndRecord(
            tx,
            pr.id,
            'SUBMITTED',
            'IN_QUOTATION',
            user.id,
          );
        } catch (err) {
          // Diferente de submit/cancel/select/decide, perder essa corrida
          // não invalida a ação em si: a transição SUBMITTED->IN_QUOTATION é
          // só um efeito colateral de "esta é a primeira cotação"; se outro
          // BUYER concorrente já disparou essa mesma transição primeiro, a
          // solicitação já está em IN_QUOTATION — um estado igualmente
          // válido para registrar esta cotação — então seguimos em frente
          // em vez de falhar a request inteira por causa de uma corrida
          // que já foi resolvida a favor de outra chamada.
          if (!(err instanceof ConflictException)) throw err;
        }
      }

      return tx.quote.create({
        data: {
          purchaseRequestId: pr.id,
          supplierId: dto.supplierId,
          createdByUserId: user.id,
          totalValue: dto.totalValue,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
          ...(file
            ? {
                proposalFileName: file.originalname,
                proposalFileMime: file.mimetype,
                proposalFileSize: file.size,
                // Ver comentário equivalente em uploadProposal() sobre o tipo
                // Bytes do Prisma exigir Uint8Array em vez de Buffer.
                proposalFileContent: Uint8Array.from(file.buffer),
              }
            : {}),
        },
      });
    });
  }

  async findAll(purchaseRequestId: number, user: AuthenticatedUser) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    return this.prisma.quote.findMany({
      where: { purchaseRequestId },
      include: { supplier: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findQuoteOrThrow(purchaseRequestId: number, quoteId: number) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
    });
    if (!quote || quote.purchaseRequestId !== purchaseRequestId) {
      throw new NotFoundException(
        'Cotação não encontrada para esta solicitação.',
      );
    }
    return quote;
  }

  async uploadProposal(
    purchaseRequestId: number,
    quoteId: number,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ) {
    const pr = await this.purchaseRequestsService.findOne(
      purchaseRequestId,
      user,
    );
    const quote = await this.findQuoteOrThrow(purchaseRequestId, quoteId);

    if (pr.status !== 'SUBMITTED' && pr.status !== 'IN_QUOTATION') {
      throw new ConflictException(
        'Só é possível anexar proposta enquanto a solicitação está SUBMITTED ou IN_QUOTATION.',
      );
    }

    return this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        proposalFileName: file.originalname,
        proposalFileMime: file.mimetype,
        proposalFileSize: file.size,
        // Prisma's Bytes field is typed as Uint8Array<ArrayBuffer>, stricter
        // than Node's Buffer<ArrayBufferLike> (which also covers
        // SharedArrayBuffer) — copy into a plain Uint8Array to satisfy it.
        proposalFileContent: Uint8Array.from(file.buffer),
      },
      select: {
        id: true,
        proposalFileName: true,
        proposalFileMime: true,
        proposalFileSize: true,
      },
    });
  }

  async downloadProposal(
    purchaseRequestId: number,
    quoteId: number,
    user: AuthenticatedUser,
  ) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    const quote = await this.findQuoteOrThrow(purchaseRequestId, quoteId);

    if (!quote.proposalFileContent) {
      throw new NotFoundException(
        'Esta cotação ainda não possui um arquivo de proposta anexado.',
      );
    }

    return {
      buffer: quote.proposalFileContent,
      filename: quote.proposalFileName ?? 'proposta',
      mimeType: quote.proposalFileMime ?? 'application/octet-stream',
    };
  }

  async select(
    purchaseRequestId: number,
    quoteId: number,
    user: AuthenticatedUser,
  ) {
    const pr = await this.purchaseRequestsService.findOne(
      purchaseRequestId,
      user,
    );
    const quote = await this.findQuoteOrThrow(purchaseRequestId, quoteId);

    if (pr.status !== 'IN_QUOTATION') {
      throw new ConflictException(
        'Só é possível selecionar uma cotação vencedora estando em IN_QUOTATION.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // A transição guiada por compare-and-swap roda PRIMEIRO, antes de
      // tocar nas cotações: se outra chamada concorrente já selecionou uma
      // vencedora pra esta mesma solicitação (movendo-a pra fora de
      // IN_QUOTATION), transitionAndRecord lança 409 aqui e a transação
      // inteira é desfeita — sem isso, esta chamada perdedora ainda assim
      // descartava as cotações da vencedora real e sobrescrevia
      // selectedQuoteId por cima, silenciosamente.
      const updatedPr = await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        'IN_QUOTATION',
        'PENDING_APPROVAL',
        user.id,
        { data: { selectedQuote: { connect: { id: quote.id } } } },
      );

      await tx.quote.updateMany({
        where: { purchaseRequestId, id: { not: quote.id } },
        data: { status: 'DISCARDED' },
      });
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'SELECTED' },
      });

      return updatedPr;
    });
  }
}
