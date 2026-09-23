import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({
    description: 'ID do fornecedor que enviou a cotação.',
    example: 1,
  })
  // O create() agora também aceita multipart/form-data (pra permitir anexar
  // a proposta na mesma request) — nesse formato todo campo chega como
  // string, então precisa de @Type pra virar number antes do @IsInt validar.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId: number;

  @ApiProperty({ description: 'Valor total da cotação.', example: 13500.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'totalValue deve ser maior que zero.' })
  @Max(1000000000)
  totalValue: number;

  @ApiPropertyOptional({
    description: 'Data de validade da cotação.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ example: 'Prazo de entrega de 15 dias úteis.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // O arquivo em si é lido via @UploadedFile() no controller, não daqui —
  // esta propriedade só existe pra não deixar o ValidationPipe (com
  // forbidNonWhitelisted) rejeitar a request. O FileInterceptor normalmente
  // tira o campo "file" do body antes da validação quando é um arquivo de
  // verdade, mas quando o cliente manda o campo vazio (ex: Swagger "Try it
  // out" sem escolher nenhum arquivo), ele chega como um campo de texto
  // comum — sem isso aqui, a request inteira era rejeitada com "property
  // file should not exist", dando a falsa impressão de que o anexo é
  // obrigatório mesmo estando marcado como opcional.
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Proposta (opcional): PDF, PNG ou JPEG, até 5MB.',
  })
  @IsOptional()
  file?: unknown;
}
