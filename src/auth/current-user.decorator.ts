import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './types/authenticated-user.type';

// Atalho para pegar o usuário logado dentro de um método de controller.
// Em vez de escrever `@Req() req` e depois `req.user`, usamos direto:
//   meuMetodo(@CurrentUser() user: AuthenticatedUser) { ... }
// O "request.user" só existe porque o JwtStrategy o colocou lá — este
// decorator apenas lê esse valor de um jeito mais limpo.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
