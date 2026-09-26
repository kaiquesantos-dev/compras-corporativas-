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
  // Qualquer outro valor ("abc", "1", "sim") passa adiante sem conversão e
  // é recusado pelo @IsBoolean com 400. Antes, tudo que não fosse "true"
  // virava false em silêncio e a pessoa recebia uma lista vazia como se o
  // filtro fosse válido.
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean({ message: 'isActive deve ser "true" ou "false".' })
  isActive?: boolean;
}
