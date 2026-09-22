import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ description: 'ID do fornecedor que enviou a cotação.', example: 1 })
  @IsInt()
  supplierId: number;

  @ApiProperty({ description: 'Valor total da cotação.', example: 13500.0 })
  @IsNumber()
  @Min(0)
  totalValue: number;

  @ApiPropertyOptional({ description: 'Data de validade da cotação.', example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ example: 'Prazo de entrega de 15 dias úteis.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
