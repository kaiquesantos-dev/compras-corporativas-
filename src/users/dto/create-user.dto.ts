import { ApiProperty } from '@nestjs/swagger';
import {
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

// Body esperado para criar um usuário. Note que o cliente escolhe o "role"
// livremente aqui — isso só é seguro porque este endpoint inteiro já é
// restrito a ADMIN (ver UsersController).
export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário.',
    example: 'Maria Silva',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Email único do usuário, usado para login.',
    example: 'maria.silva@empresa.com',
  })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'Senha inicial (mínimo 6 caracteres).',
    // Fictícia de propósito: "senha123" é a senha real dos usuários do seed.
    example: 'SuaSenha@2026',
  })
  @IsString()
  @MinLength(6)
  // bcrypt ignora silenciosamente qualquer byte além do 72º.
  @MaxLength(72)
  password: string;

  @ApiProperty({
    description: 'Papel do usuário no sistema.',
    enum: Role,
    example: 'REQUESTER',
  })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({
    description: 'ID do departamento ao qual o usuário pertence.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;
}
