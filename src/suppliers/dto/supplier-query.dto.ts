import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Reaproveita a paginação padrão (PaginationQueryDto) e adiciona um filtro
// específico deste endpoint: isActive.
export class SupplierQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por fornecedores ativos/inativos.',
    example: true,
  })
  @IsOptional()
  // Query param sempre chega como string ("true"/"false"), nunca como
  // boolean de verdade — este Transform converte antes da validação.
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
