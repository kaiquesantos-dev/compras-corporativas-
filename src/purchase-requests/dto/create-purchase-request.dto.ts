import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreatePurchaseItemDto } from './create-purchase-item.dto';

// Body para criar uma solicitação de compra. @ValidateNested + @Type fazem
// o class-validator "entrar" dentro de cada item da lista "items" e validar
// cada um deles também (não só a lista em si), usando as regras definidas
// em CreatePurchaseItemDto. @ArrayMinSize(1) garante que venha pelo menos
// um item — uma solicitação sem nenhum item não faz sentido.
export class CreatePurchaseRequestDto {
  @ApiProperty({
    description: 'Título curto da solicitação.',
    example: 'Renovação de notebooks do time de TI',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Justificativa da necessidade de compra.',
    example:
      'Equipamentos atuais têm mais de 5 anos e apresentam falhas recorrentes.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  justification: string;

  @ApiProperty({
    type: [CreatePurchaseItemDto],
    description: 'Itens da solicitação (pelo menos um, no máximo 50).',
  })
  // @IsArray() precisa vir antes de @ValidateNested: sem ele, um valor que
  // não seja array (ex: um objeto único) pode escapar da validação de
  // cada item antes do erro correto de "não é uma lista" ser reportado.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items: CreatePurchaseItemDto[];
}
