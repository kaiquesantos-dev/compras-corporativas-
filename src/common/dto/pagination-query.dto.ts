import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Query params compartilhados por todo endpoint de listagem (GET /users,
// GET /suppliers, GET /purchase-requests, etc.): página, tamanho da página
// e ordenação. Cada módulo usa (ou estende) este mesmo DTO em vez de
// reinventar a paginação a cada endpoint.
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Número da página (começa em 1).',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;

  @ApiPropertyOptional({
    description: 'Itens por página (máximo 100).',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'pageSize não pode ser maior que 100.' })
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Campo usado para ordenação.',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Direção da ordenação.',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
