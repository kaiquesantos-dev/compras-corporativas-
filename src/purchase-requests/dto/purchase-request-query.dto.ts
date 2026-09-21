import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PurchaseRequestStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PurchaseRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PurchaseRequestStatus, example: 'SUBMITTED' })
  @IsOptional()
  @IsEnum(PurchaseRequestStatus)
  status?: PurchaseRequestStatus;
}
