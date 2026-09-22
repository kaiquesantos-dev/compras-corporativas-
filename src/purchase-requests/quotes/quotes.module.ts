import { Module } from '@nestjs/common';
import { PurchaseRequestsModule } from '../purchase-requests.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [PurchaseRequestsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
