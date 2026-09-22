import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// DTO = "Data Transfer Object": define o formato esperado do body da
// requisição de login. O ValidationPipe global usa os decorators abaixo
// (@IsEmail, @MinLength etc.) para validar automaticamente antes mesmo de
// chegar no controller — se algo estiver errado, responde 400 sozinho.
export class LoginDto {
  @ApiProperty({
    description: 'Email cadastrado do usuário.',
    example: 'admin@compras.com',
  })
  @IsEmail({}, { message: 'Informe um email válido.' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'Senha do usuário.', example: 'senha123' })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  // bcrypt ignora silenciosamente qualquer byte além do 72º — sem este
  // limite, duas senhas diferentes que só divergem depois do byte 72
  // seriam tratadas como iguais.
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  password: string;
}
