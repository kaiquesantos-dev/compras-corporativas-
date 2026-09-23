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
  @ApiOperation({
    summary: 'Registrar cotação',
    description:
      '**Papéis permitidos:** BUYER, ADMIN\n\nRegistra a cotação de um fornecedor para a solicitação. Move SUBMITTED → IN_QUOTATION automaticamente na primeira cotação registrada.',
  })
  @ApiResponse({ status: 201, description: 'Cotação registrada.' })
  @ApiResponse({
    status: 404,
    description: 'Solicitação ou fornecedor não encontrado.',
  })
  @ApiResponse({
    status: 409,
    description: 'Solicitação não está em um estado que aceite novas cotações.',
  })
  create(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.create(purchaseRequestId, dto, user);
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
  // No Multer-level `limits.fileSize` here on purpose: Multer would reject an
  // oversized file at the parsing layer with a raw 413, before our own
  // ParseFilePipeBuilder validator runs. Letting the pipe be the sole
  // gatekeeper keeps every "invalid upload" case consistently a 400.
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
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
    description: 'Arquivo ausente, tipo não permitido ou maior que 5MB.',
  })
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
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
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
    description: 'Solicitação não está em IN_QUOTATION.',
  })
  select(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotesService.select(purchaseRequestId, quoteId, user);
  }
}
