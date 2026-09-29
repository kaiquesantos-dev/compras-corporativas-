import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/transforms/normalize-email.transform';
import { Role } from '../../generated/prisma/client';

// Igual ao CreateUserDto, mas todos os campos são opcionais — o cliente só
// envia o que realmente quer atualizar (atualização parcial via PATCH).
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'maria.silva@empresa.com' })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Nova senha, se estiver sendo alterada.',
    example: 'novaSenha123',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({ enum: Role, example: 'BUYER' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description:
      'Departamento do usuário. Envie null para desvincular (não permitido para REQUESTER).',
  })
  // @IsOptional deixa passar tanto undefined (campo ausente: não mexe no
  // departamento) quanto null (desvincular explicitamente).
  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number | null;

  @ApiPropertyOptional({
    example: false,
    description:
      'Soft delete: false desativa o usuário (não loga mais e perde a sessão na hora, mas continua como autor do histórico); true reativa. Ninguém desativa a própria conta.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
