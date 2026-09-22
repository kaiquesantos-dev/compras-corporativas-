import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
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
  legalName?: string;

  @ApiPropertyOptional({ example: 'Fornecedor Exemplo' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ example: 'contato@fornecedor.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '(11) 4002-8922' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: '01311902',
  })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: 'Avenida Paulista, 37',
  })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: 'São Paulo',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Preenchido automaticamente via CNPJ se omitido.',
    example: 'SP',
  })
  @IsOptional()
  @IsString()
  state?: string;
}
