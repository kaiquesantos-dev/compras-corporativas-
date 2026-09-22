import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(purchaseRequestId: number, dto: CreateQuoteDto, user: AuthenticatedUser) {
    const pr = await this.purchaseRequestsService.findOne(purchaseRequestId, user);

    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
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
        await this.statusService.transitionAndRecord(tx, pr.id, 'SUBMITTED', 'IN_QUOTATION', user.id);
        await tx.purchaseRequest.update({ where: { id: pr.id }, data: { status: 'IN_QUOTATION' } });
      }

      return tx.quote.create({
        data: {
          purchaseRequestId: pr.id,
          supplierId: dto.supplierId,
          createdByUserId: user.id,
          totalValue: dto.totalValue,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
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
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.purchaseRequestId !== purchaseRequestId) {
      throw new NotFoundException('Cotação não encontrada para esta solicitação.');
    }
    return quote;
  }

  async uploadProposal(
    purchaseRequestId: number,
    quoteId: number,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ) {
    const pr = await this.purchaseRequestsService.findOne(purchaseRequestId, user);
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
      select: { id: true, proposalFileName: true, proposalFileMime: true, proposalFileSize: true },
    });
  }

  async downloadProposal(purchaseRequestId: number, quoteId: number, user: AuthenticatedUser) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    const quote = await this.findQuoteOrThrow(purchaseRequestId, quoteId);

    if (!quote.proposalFileContent) {
      throw new NotFoundException('Esta cotação ainda não possui um arquivo de proposta anexado.');
    }

    return {
      buffer: quote.proposalFileContent,
      filename: quote.proposalFileName ?? 'proposta',
      mimeType: quote.proposalFileMime ?? 'application/octet-stream',
    };
  }

  async select(purchaseRequestId: number, quoteId: number, user: AuthenticatedUser) {
    const pr = await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    const quote = await this.findQuoteOrThrow(purchaseRequestId, quoteId);

    if (pr.status !== 'IN_QUOTATION') {
      throw new ConflictException(
        'Só é possível selecionar uma cotação vencedora estando em IN_QUOTATION.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({
        where: { purchaseRequestId, id: { not: quote.id } },
        data: { status: 'DISCARDED' },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'SELECTED' } });

      await this.statusService.transitionAndRecord(
        tx,
        pr.id,
        'IN_QUOTATION',
        'PENDING_APPROVAL',
        user.id,
      );

      return tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'PENDING_APPROVAL', selectedQuoteId: quote.id },
      });
    });
  }
}
