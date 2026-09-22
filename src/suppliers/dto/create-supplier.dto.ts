import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';

// Só o "document" (CNPJ) é obrigatório de verdade — todo o resto é
// opcional porque o SuppliersService tenta preencher automaticamente via
// consulta de CNPJ (BrasilAPI). Ver SuppliersService.create.
export class CreateSupplierDto {
  @ApiProperty({
    description: 'CNPJ do fornecedor, com ou sem máscara.',
    example: '19.131.243/0001-97',
  })
  @IsString()
  @IsCnpj()
  document: string;

  @ApiPropertyOptional({
    description:
      'Razão social. Se omitido, é preenchido automaticamente pela consulta de CNPJ; obrigatório manualmente apenas se a consulta externa falhar.',
    example: 'Fornecedor Exemplo LTDA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ example: 'Fornecedor Exemplo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @ApiPropertyOptional({ example: 'contato@fornecedor.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '(11) 4002-8922' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: '01311902',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: 'Avenida Paulista, 37',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: 'São Paulo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description:
      'Sigla do estado (UF), 2 letras. Preenchido automaticamente via CNPJ se omitido.',
    example: 'SP',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'state deve ser a sigla da UF com 2 letras.' })
  state?: string;
}
