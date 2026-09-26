import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { PurchaseRequestStatusService } from '../purchase-request-status.service';
import { PurchaseRequestsService } from '../purchase-requests.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { OMIT_PROPOSAL_CONTENT } from './omit-proposal-content';

// A validade de uma cotação é uma data (ex: "2026-12-31"), e o fornecedor
// garante o preço até o fim desse dia — então ela só está vencida a partir
// do dia seguinte. Comparamos só a parte da data (UTC), sem hora.
// O multer (busboy) lê o nome do arquivo do multipart como latin1, mas o
// navegador envia em UTF-8 — sem isto, "orçamento.pdf" era gravado como
// "orÃ§amento.pdf". Reinterpretamos os bytes como UTF-8; se isso gerar
// caracteres inválidos (cliente que mandou latin1 de verdade), mantemos o
// nome original.
function decodeUploadFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

function isExpired(validUntil: Date): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return validUntil.toISOString().slice(0, 10) < today;
}

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

    // Uma cotação que já nasce vencida é um preço que o fornecedor não
    // garante mais — não faz sentido registrá-la.
    if (dto.validUntil && isExpired(new Date(dto.validUntil))) {
      throw new BadRequestException(
        'A data de validade da cotação já passou. Informe uma validade de hoje em diante.',
      );
    }

    if (pr.status !== 'SUBMITTED' && pr.status !== 'IN_QUOTATION') {
      throw new ConflictException(
        'Só é possível registrar cotações enquanto a solicitação está SUBMITTED ou IN_QUOTATION.',
      );
    }
    // Um fornecedor é desativado (isActive: false) tipicamente por ter sido
    // cadastrado com dado errado (ex: CNPJ) ou por ter deixado de operar com
    // a empresa — em nenhum dos dois casos faz sentido começar uma cotação
    // nova com ele. Cotações já existentes contra este fornecedor (feitas
    // antes da desativação) continuam intactas; isto só bloqueia registrar
    // uma cotação NOVA.
    if (!supplier.isActive) {
      throw new ConflictException(
        'Este fornecedor está inativo. Não é possível registrar novas cotações para ele — cadastre ou selecione um fornecedor ativo.',
      );
    }
    // Uma cotação por fornecedor por solicitação: é isso que torna a
    // comparação justa entre fornecedores diferentes. Com duas cotações do
    // mesmo fornecedor, ele "concorria com ele mesmo" e a lista deixava de
    // representar propostas de empresas distintas.
    const existingFromSupplier = await this.prisma.quote.findFirst({
      where: { purchaseRequestId: pr.id, supplierId: dto.supplierId },
      select: { id: true },
    });
    if (existingFromSupplier) {
      throw new ConflictException(
        'Este fornecedor já tem uma cotação registrada nesta solicitação. Cada fornecedor participa com uma única cotação.',
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
          // ...mas só se quem ganhou a corrida foi mesmo outra cotação.
          // SUBMITTED também pode sair para CANCELLED (o dono cancelou no
          // mesmo instante) — aí a cotação não pode ser criada.
          const current = await tx.purchaseRequest.findUnique({
            where: { id: pr.id },
            select: { status: true },
          });
          if (current?.status !== 'IN_QUOTATION') {
            throw new ConflictException(
              'A solicitação mudou de estado enquanto a cotação era registrada e não aceita mais cotações.',
            );
          }
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
                proposalFileName: decodeUploadFilename(file.originalname),
                proposalFileMime: file.mimetype,
                proposalFileSize: file.size,
                // Ver comentário equivalente em uploadProposal() sobre o tipo
                // Bytes do Prisma exigir Uint8Array em vez de Buffer.
                proposalFileContent: Uint8Array.from(file.buffer),
              }
            : {}),
        },
        omit: OMIT_PROPOSAL_CONTENT,
      });
    });
  }

  async findAll(purchaseRequestId: number, user: AuthenticatedUser) {
    await this.purchaseRequestsService.findOne(purchaseRequestId, user);
    return this.prisma.quote.findMany({
      where: { purchaseRequestId },
      include: { supplier: true },
      orderBy: { createdAt: 'asc' },
      omit: OMIT_PROPOSAL_CONTENT,
    });
  }

  private async findQuoteOrThrow(purchaseRequestId: number, quoteId: number) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      omit: OMIT_PROPOSAL_CONTENT,
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
        proposalFileName: decodeUploadFilename(file.originalname),
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
    await this.findQuoteOrThrow(purchaseRequestId, quoteId);
    // Único lugar que lê o conteúdo do arquivo (ver OMIT_PROPOSAL_CONTENT).
    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: {
        proposalFileContent: true,
        proposalFileName: true,
        proposalFileMime: true,
      },
    });

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
    // Mesma regra do create(): não faz sentido fechar negócio (mover a
    // solicitação pra aprovação) com um fornecedor que foi desativado
    // depois que a cotação já tinha sido registrada — ex: descobriram que o
    // CNPJ estava errado entre o registro da cotação e a seleção da
    // vencedora. A cotação em si continua no histórico, só não pode ser
    // escolhida como a vencedora.
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: quote.supplierId },
    });
    if (!supplier?.isActive) {
      throw new ConflictException(
        'O fornecedor desta cotação está inativo. Não é possível selecioná-la como vencedora.',
      );
    }
    // A cotação era válida quando foi registrada, mas venceu antes de alguém
    // escolhê-la: aprovar a compra em cima dela seria aprovar um preço que o
    // fornecedor não garante mais.
    if (quote.validUntil && isExpired(quote.validUntil)) {
      throw new ConflictException(
        'Esta cotação está vencida (a validade já passou). Peça uma cotação atualizada ao fornecedor antes de selecioná-la.',
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
        omit: OMIT_PROPOSAL_CONTENT,
      });

      return updatedPr;
    });
  }
}
