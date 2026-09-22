import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ApprovalsService } from './approvals.service';

@ApiTags('Aprovações')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtAuthGuard)
@Controller('purchase-requests/:purchaseRequestId/approval')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('APPROVER', 'ADMIN')
  @ApiOperation({
    summary: 'Decidir aprovação',
    description:
      'Aprova ou rejeita a solicitação que está em PENDING_APPROVAL. REJECTED é terminal: nenhuma ação futura é permitida sobre a solicitação.',
  })
  @ApiResponse({ status: 200, description: 'Decisão registrada.' })
  @ApiResponse({ status: 409, description: 'Solicitação não está em PENDING_APPROVAL.' })
  decide(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvalsService.decide(purchaseRequestId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Consultar decisão de aprovação' })
  @ApiResponse({ status: 404, description: 'Solicitação ainda não possui decisão.' })
  findOne(
    @Param('purchaseRequestId', ParseIntPipe) purchaseRequestId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvalsService.findOne(purchaseRequestId, user);
  }
}
