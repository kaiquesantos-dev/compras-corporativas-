import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Controller padrão gerado pelo Nest (rota raiz "/"), usado aqui só como
// smoke test simples de que a aplicação está de pé.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
