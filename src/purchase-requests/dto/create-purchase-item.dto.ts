import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Representa um item dentro da lista "items" de CreatePurchaseRequestDto
// (ex: "5 notebooks"). Nunca é usado sozinho — sempre vem aninhado dentro
// de uma solicitação de compra.
export class CreatePurchaseItemDto {
  @ApiProperty({
    description: 'Descrição do item.',
    example: 'Notebook Dell Inspiron 15',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Quantidade solicitada.', example: 3 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unidade de medida.', example: 'unidade' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional({
    description: 'Preço unitário estimado, se conhecido.',
    example: 4500.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedUnitPrice?: number;
}
