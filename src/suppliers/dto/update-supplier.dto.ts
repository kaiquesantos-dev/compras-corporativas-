import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

// Igual ao CreateSupplierDto, mas tudo opcional (atualização parcial), com
// o campo extra "isActive" pra ativar/desativar o fornecedor sem apagá-lo.
//
// "document" (CNPJ) propositalmente NÃO existe aqui: é a identidade legal do
// fornecedor (@unique no schema) e trava depois do cadastro. Editá-lo
// silenciosamente reescreveria de qual empresa são as cotações já
// registradas para este fornecedor — se o CNPJ foi cadastrado errado, o
// certo é desativar este registro (isActive: false, mantém o histórico) e
// cadastrar um fornecedor novo com o CNPJ correto, nunca "corrigir" o
// existente. Como o ValidationPipe global usa forbidNonWhitelisted: true,
// omitir o campo aqui faz o backend REJEITAR (400) qualquer tentativa de
// mandar "document" neste endpoint, não apenas ignorá-lo.
export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Fornecedor Exemplo LTDA' })
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

  @ApiPropertyOptional({ example: '01311902' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional({ example: 'Avenida Paulista, 37' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'state deve ser a sigla da UF com 2 letras.' })
  state?: string;

  @ApiPropertyOptional({
    description: 'Ativa ou inativa o fornecedor.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
