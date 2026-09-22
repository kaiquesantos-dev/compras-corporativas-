import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard "porteiro": colocado em um controller/rota com @UseGuards(JwtAuthGuard),
// ele exige um token JWT válido no header Authorization. Sem token válido,
// a requisição nem chega no controller — o Nest já responde 401 sozinho.
// Toda a lógica de verificar o token está no JwtStrategy; esta classe só
// "liga" essa estratégia (chamada 'jwt') ao mecanismo de Guards do Nest.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
