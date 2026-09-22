import { Module } from '@nestjs/common';
import { PurchaseRequestsModule } from '../purchase-requests.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [PurchaseRequestsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
