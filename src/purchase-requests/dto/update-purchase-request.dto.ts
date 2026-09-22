import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePurchaseRequestDto {
  @ApiPropertyOptional({
    example: 'Renovação de notebooks do time de TI (revisado)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional({ example: 'Justificativa revisada com mais detalhes.' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  justification?: string;
}
