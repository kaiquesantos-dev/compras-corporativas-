import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { IsCnpj } from '../../common/validators/is-cnpj.validator';

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: '19.131.243/0001-97' })
  @IsOptional()
  @IsCnpj()
  document?: string;

  @ApiPropertyOptional({ example: 'Fornecedor Exemplo LTDA' })
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

  @ApiPropertyOptional({ example: '01311902' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ example: 'Avenida Paulista, 37' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Ativa ou inativa o fornecedor.', example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
