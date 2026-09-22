import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreatePurchaseItemDto } from './create-purchase-item.dto';

export class CreatePurchaseRequestDto {
  @ApiProperty({
    description: 'Título curto da solicitação.',
    example: 'Renovação de notebooks do time de TI',
  })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({
    description: 'Justificativa da necessidade de compra.',
    example:
      'Equipamentos atuais têm mais de 5 anos e apresentam falhas recorrentes.',
  })
  @IsString()
  @MinLength(10)
  justification: string;

  @ApiProperty({
    type: [CreatePurchaseItemDto],
    description: 'Itens da solicitação (pelo menos um).',
  })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  @ArrayMinSize(1)
  items: CreatePurchaseItemDto[];
}
