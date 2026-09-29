import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

// Único endpoint público da API (não exige token JWT, mas exige X-API-KEY
// como todas as rotas). É por aqui que o usuário troca email+senha por um
// token, que será usado como "Authorization: Bearer <token>" no resto da API.
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @HttpCode(200): por padrão o Nest responderia 201 (Created) para um
  // POST, mas login não cria nenhum recurso novo, então 200 é o correto.
  @Post('login')
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  @ApiOperation({
    summary: 'Autenticar usuário',
    description:
      '**Papéis permitidos:** Qualquer um (público)\n\nRecebe email e senha, valida as credenciais e retorna um token JWT a ser usado no header Authorization das demais requisições.',
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
  @ApiResponse({
    status: 403,
    description:
      'Senha correta, mas a conta foi desativada pelo administrador (soft delete).',
  })
  @ApiResponse({
    status: 429,
    description:
      'Muitas tentativas seguidas para o mesmo e-mail a partir da mesma origem (padrão: 5 por minuto, configurável em LOGIN_MAX_ATTEMPTS_PER_MINUTE). Proteção contra tentativa de adivinhar senha.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // O JWT é decodificado no cliente logo após o login pra popular o estado
  // de sessão do frontend (id/email/role) — mas isso é só uma "foto" do
  // momento do login, e nunca muda enquanto o token for válido (até 1 dia).
  // Esta rota permite ao frontend buscar o estado ATUAL (ex: depois de um
  // admin conceder/revogar isAdminDelegate) sem precisar de um novo login,
  // já que o próprio JwtStrategy já revalida o usuário no banco a cada
  // requisição — aqui só devolvemos o resultado disso.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @ApiOperation({
    summary: 'Dados do usuário autenticado',
    description:
      '**Papéis permitidos:** Qualquer usuário autenticado\n\nDevolve id/email/role/isAdminDelegate atuais (revalidados no banco a cada chamada) — útil pro frontend atualizar o estado da sessão sem precisar de um novo login, por exemplo depois de uma delegação de acesso de administrador ser concedida ou revogada.',
  })
  @ApiResponse({ status: 200, description: 'Dados do usuário autenticado.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
