import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { PurchaseRequestQueryDto } from './dto/purchase-request-query.dto';
import { PurchaseMetricsQueryDto } from './dto/purchase-metrics-query.dto';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestsMetricsService } from './purchase-requests-metrics.service';

// Controller "fininho" de propósito: cada método só valida os parâmetros
// da URL (@Param, @Query) e repassa pro service — nenhuma regra de negócio
// mora aqui, só roteamento HTTP e documentação Swagger.
@ApiTags('Solicitações de Compra')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard)
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(
    private readonly service: PurchaseRequestsService,
    private readonly metricsService: PurchaseRequestsMetricsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('REQUESTER')
  @ApiOperation({
    summary: 'Criar solicitação de compra',
    description:
      '**Papéis permitidos:** REQUESTER\n\nCria uma solicitação em DRAFT com seus itens.',
  })
  @ApiResponse({ status: 201, description: 'Solicitação criada em DRAFT.' })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (ex: nenhum item informado).',
  })
  create(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar solicitações de compra',
    description:
      '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN\n\n*(REQUESTER vê apenas as próprias; BUYER/APPROVER/ADMIN veem todas)*',
  })
  findAll(
    @Query() query: PurchaseRequestQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, user);
  }

  // Atenção à ordem: esta rota precisa vir ANTES de @Get(':id') aqui embaixo.
  // O Nest registra as rotas na ordem em que aparecem no código, então se
  // ":id" viesse primeiro, uma chamada para "/purchase-requests/metrics"
  // seria capturada por ela, tratando "metrics" como se fosse um ID.
  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'APPROVER', 'ADMIN')
  @ApiOperation({
    summary: 'Indicadores de compras',
    description:
      '**Papéis permitidos:** BUYER, APPROVER, ADMIN\n\nContagem de solicitações por status, valor total aprovado e tempo médio de aprovação (em horas). Aceita "from"/"to" para restringir o período às solicitações criadas nesse intervalo.',
  })
  metrics(@Query() query: PurchaseMetricsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    // "to" chega como uma data pura (ex: "2026-08-31"), que o JS interpreta
    // como meia-noite — sem levar até o fim do dia, o próprio dia final
    // ficaria de fora do filtro (23:59:59 daquele dia é "depois" da meia-noite).
    const to = query.to ? new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`) : undefined;
    return this.metricsService.getMetrics(from, to);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar solicitação por ID',
    description:
      '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN\n\n*(REQUESTER vê apenas as próprias)*',
  })
  @ApiResponse({
    status: 403,
    description: 'REQUESTER tentando acessar solicitação de outro usuário.',
  })
  @ApiResponse({ status: 404, description: 'Solicitação não encontrada.' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('REQUESTER')
  @ApiOperation({
    summary: 'Editar solicitação',
    description:
      '**Papéis permitidos:** REQUESTER\n\nSomente o dono, e somente em DRAFT.',
  })
  @ApiResponse({
    status: 409,
    description: 'Solicitação não está mais em DRAFT.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('REQUESTER')
  @ApiOperation({
    summary: 'Submeter solicitação para cotação',
    description: '**Papéis permitidos:** REQUESTER\n\nDRAFT → SUBMITTED',
  })
  @ApiResponse({ status: 409, description: 'Solicitação não está em DRAFT.' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.submit(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('REQUESTER', 'ADMIN')
  @ApiOperation({
    summary: 'Cancelar solicitação',
    description:
      '**Papéis permitidos:** REQUESTER, ADMIN\n\nPermitido a partir de DRAFT, SUBMITTED ou IN_QUOTATION.',
  })
  @ApiResponse({
    status: 409,
    description: 'Estado atual não permite cancelamento.',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancel(id, user);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  @ApiOperation({
    summary: 'Concluir solicitação',
    description: '**Papéis permitidos:** BUYER, ADMIN\n\nAPPROVED → COMPLETED',
  })
  @ApiResponse({
    status: 409,
    description: 'Solicitação não está em APPROVED.',
  })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.complete(id, user);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Histórico de mudanças de status',
    description:
      '**Papéis permitidos:** REQUESTER, BUYER, APPROVER, ADMIN\n\nLista cada transição de estado registrada para a solicitação.',
  })
  history(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.history(id, user);
  }
}
