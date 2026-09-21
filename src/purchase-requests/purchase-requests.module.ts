import { Module } from '@nestjs/common';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

@Module({
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService, PurchaseRequestStatusService],
  exports: [PurchaseRequestsService, PurchaseRequestStatusService],
})
export class PurchaseRequestsModule {}
