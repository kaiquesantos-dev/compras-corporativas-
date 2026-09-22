import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/client';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário.',
    example: 'Maria Silva',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    description: 'Email único do usuário, usado para login.',
    example: 'maria.silva@empresa.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Senha inicial (mínimo 6 caracteres).',
    example: 'senha123',
  })
  @IsString()
  @MinLength(6)
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
  departmentId?: number;
}
