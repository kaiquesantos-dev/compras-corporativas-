import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuotesService } from './quotes.service';
import { FileSignatureValidator } from '../../common/validators/file-signature.validator';

const MAX_PROPOSAL_SIZE_BYTES = 5 * 1024 * 1024;

@ApiTags('Cotações')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard)
@Controller('purchase-requests/:purchaseRequestId/quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  // "file" é opcional aqui: o multer só entra em ação quando a request é
  // multipart/form-data (o que permite anexar a proposta já na criação da
  // cotação); uma request application/json comum passa direto por ele sem
  // efeito nenhum, então os testes/integrações existentes continuam válidos.
  // limits.fileSize garante que o Multer pare de ler o stream assim que o
  // arquivo passar de 5MB, ANTES de bufferizar tudo em memória — sem isso,
  // um upload de vários GB era lido inteiro pra RAM antes do
  // ParseFilePipeBuilder abaixo sequer rodar (o 5MB dele só rejeitava
  // DEPOIS do estouro de memória já ter acontecido). O Nest converte esse
  // estouro automaticamente em 413 Payload Too Large (ver
  // transformException em @nestjs/platform-express) — não precisa de
  // tratamento manual.
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PROPOSAL_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['supplierId', 'totalValue'],
      properties: {
        supplierId: { type: 'number', example: 1 },
        totalValue: { type: 'number', example: 13500.0 },
        validUntil: { type: 'string', format: 'date', example: '2026-12-31' },
        notes: { type: 'string', example: 'Prazo de entrega de 15 dias úteis.' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Proposta (opcional, já na criação): PDF, PNG ou JPEG, até 5MB.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Registrar cotação',
    description:
      '**Papéis permitidos:** BUYER, ADMIN\n\nRegistra a cotação de um fornecedor para a solicitação. Move SUBMITTED → IN_QUOTATION automaticamente na primeira cotação registrada. Aceita anexar a proposta (PDF, PNG ou JPEG, até 5MB) já nesta mesma chamada, via multipart/form-data.',
  })
  @ApiResponse({ status: 201, description: 'Cotação registrada.' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos, ou arquivo de tipo/conteúdo não permitido.',
  })
  @ApiResponse({
    status: 404,
    description: 'Solicitação ou fornecedor não encontrado.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Solicitação não está em um estado que aceite novas cotações, ou o fornecedor está inativo (isActive: false).',
  })
  @ApiResponse({ status: 413, description: 'Arquivo maior que 5MB.' })
  create(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Body() dto: CreateQuoteDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(pdf|png|jpe?g)$/i })
        .addMaxSizeValidator({ maxSize: MAX_PROPOSAL_SIZE_BYTES })
        .addValidator(new FileSignatureValidator())
        .build({ fileIsRequired: false }),
    )
    file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.create(purchaseRequestId, dto, user, file);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar cotações da solicitação',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  findAll(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.findAll(purchaseRequestId, user);
  }

  @Post(':quoteId/proposal')
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  // limits.fileSize (mesmo motivo do create() acima): rejeita o upload
  // durante o parsing, antes de bufferizar o arquivo inteiro em memória.
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PROPOSAL_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Anexar proposta da cotação (upload)',
    description:
      '**Papéis permitidos:** BUYER, ADMIN\n\nAceita PDF, PNG ou JPEG, até 5MB. O arquivo é armazenado diretamente no banco.',
  })
  @ApiResponse({ status: 201, description: 'Proposta anexada.' })
  @ApiResponse({
    status: 400,
    description: 'Arquivo ausente ou tipo/conteúdo não permitido.',
  })
  @ApiResponse({ status: 413, description: 'Arquivo maior que 5MB.' })
  @ApiResponse({
    status: 409,
    description: 'Solicitação não está em um estado que aceite anexos.',
  })
  uploadProposal(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(pdf|png|jpe?g)$/i })
        .addMaxSizeValidator({ maxSize: MAX_PROPOSAL_SIZE_BYTES })
        .addValidator(new FileSignatureValidator())
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.uploadProposal(
      purchaseRequestId,
      quoteId,
      file,
      user,
    );
  }

  @Get(':quoteId/proposal')
  @ApiOperation({
    summary: 'Baixar proposta da cotação',
    description: '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN',
  })
  @ApiResponse({
    status: 404,
    description: 'Cotação ou arquivo de proposta não encontrado.',
  })
  async downloadProposal(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename, mimeType } =
      await this.quotesService.downloadProposal(
        purchaseRequestId,
        quoteId,
        user,
      );
    // res.attachment() monta o Content-Disposition no padrão RFC 6266/5987
    // (filename ASCII de fallback + filename*=UTF-8''...), então nomes com
    // acento ou aspas chegam intactos ao navegador. Antes o nome ia cru
    // entre aspas — acento virava lixo e uma aspa no nome quebrava o header.
    res.attachment(filename);
    res.set('Content-Type', mimeType);
    return new StreamableFile(buffer);
  }

  @Post(':quoteId/select')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  @ApiOperation({
    summary: 'Selecionar cotação vencedora',
    description:
      '**Papéis permitidos:** BUYER, ADMIN\n\nMarca a cotação como SELECTED, descarta automaticamente as demais cotações da mesma solicitação, e move a solicitação para PENDING_APPROVAL.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Solicitação não está em IN_QUOTATION, ou o fornecedor desta cotação está inativo (isActive: false).',
  })
  select(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.select(purchaseRequestId, quoteId, user);
  }
}
