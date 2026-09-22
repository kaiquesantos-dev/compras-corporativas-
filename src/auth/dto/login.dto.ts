import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email cadastrado do usuário.',
    example: 'admin@compras.com',
  })
  @IsEmail({}, { message: 'Informe um email válido.' })
  email: string;

  @ApiProperty({ description: 'Senha do usuário.', example: 'senha123' })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter pelo menos 6 caracteres.' })
  password: string;
}
