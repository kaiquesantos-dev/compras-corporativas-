import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CnpjLookupService } from './cnpj/cnpj-lookup.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [HttpModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, CnpjLookupService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
