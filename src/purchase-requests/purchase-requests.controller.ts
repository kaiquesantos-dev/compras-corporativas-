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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { PurchaseRequestQueryDto } from './dto/purchase-request-query.dto';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestsMetricsService } from './purchase-requests-metrics.service';

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
    description: 'Cria uma solicitação em DRAFT com seus itens. Restrito a REQUESTER.',
  })
  @ApiResponse({ status: 201, description: 'Solicitação criada em DRAFT.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (ex: nenhum item informado).' })
  create(@Body() dto: CreatePurchaseRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar solicitações de compra',
    description: 'REQUESTER vê apenas as próprias; BUYER/APPROVER/ADMIN veem todas.',
  })
  findAll(@Query() query: PurchaseRequestQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  // Must stay registered before `@Get(':id')` — Nest/Express match routes
  // in declaration order, so a literal "metrics" route needs priority over
  // the ":id" parameter route to avoid being swallowed by it.
  @Get('metrics')
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'APPROVER', 'ADMIN')
  @ApiOperation({
    summary: 'Indicadores de compras',
    description:
      'Contagem de solicitações por status, valor total aprovado e tempo médio de aprovação (em horas).',
  })
  metrics() {
    return this.metricsService.getMetrics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar solicitação por ID' })
  @ApiResponse({ status: 403, description: 'REQUESTER tentando acessar solicitação de outro usuário.' })
  @ApiResponse({ status: 404, description: 'Solicitação não encontrada.' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('REQUESTER')
  @ApiOperation({ summary: 'Editar solicitação', description: 'Somente o dono, e somente em DRAFT.' })
  @ApiResponse({ status: 409, description: 'Solicitação não está mais em DRAFT.' })
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
  @ApiOperation({ summary: 'Submeter solicitação para cotação', description: 'DRAFT -> SUBMITTED.' })
  @ApiResponse({ status: 409, description: 'Solicitação não está em DRAFT.' })
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submit(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('REQUESTER', 'ADMIN')
  @ApiOperation({
    summary: 'Cancelar solicitação',
    description: 'Permitido a partir de DRAFT, SUBMITTED ou IN_QUOTATION.',
  })
  @ApiResponse({ status: 409, description: 'Estado atual não permite cancelamento.' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cancel(id, user);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('BUYER', 'ADMIN')
  @ApiOperation({ summary: 'Concluir solicitação', description: 'APPROVED -> COMPLETED.' })
  @ApiResponse({ status: 409, description: 'Solicitação não está em APPROVED.' })
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.complete(id, user);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Histórico de mudanças de status',
    description: 'Lista cada transição de estado registrada para a solicitação.',
  })
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.history(id, user);
  }
}
