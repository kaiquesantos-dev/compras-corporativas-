import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Autenticar usuário',
    description:
      'Recebe email e senha, valida as credenciais e retorna um token JWT a ser usado no header Authorization das demais requisições.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login realizado com sucesso. Retorna o access_token.',
  })
  @ApiResponse({
    status: 400,
    description: 'Email ou senha em formato inválido.',
  })
  @ApiResponse({
    status: 401,
    description: 'Email não cadastrado ou senha incorreta.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
