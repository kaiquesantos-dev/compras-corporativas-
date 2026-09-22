import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

// Controller padrão gerado pelo Nest (rota raiz "/"), usado aqui só como
// smoke test simples de que a aplicação está de pé.
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  getHello(): string {
    return this.appService.getHello();
  }

  // Endpoint padrão de mercado para orquestradores (Docker, Kubernetes, load
  // balancer) saberem se a aplicação está de pé E consegue falar com o
  // banco — não adianta o processo estar rodando se o Postgres está fora
  // do ar, então o health check testa os dois.
  @Get('health')
  @Public()
  @ApiTags('Health')
  @ApiOperation({
    summary: 'Health check',
    description:
      '**Papéis permitidos:** Qualquer um (público, não exige X-API-KEY nem JWT)\n\nVerifica se a aplicação está de pé e consegue se conectar ao banco de dados. Endpoint pensado para orquestradores (Docker, Kubernetes, load balancer).',
  })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException(
        'Aplicação de pé, mas sem conexão com o banco de dados.',
      );
    }
    return { status: 'ok', database: 'up' };
  }
}
