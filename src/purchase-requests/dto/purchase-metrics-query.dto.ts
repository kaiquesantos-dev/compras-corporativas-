import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class PurchaseMetricsQueryDto {
  @ApiPropertyOptional({
    description: 'Início do período (data ISO 8601). Omitido: sem limite inferior.',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fim do período (data ISO 8601, inclusive). Omitido: sem limite superior.',
    example: '2026-08-31',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
