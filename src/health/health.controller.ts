import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

// Controller próprio (em vez de um método a mais no AppController) para o
// @ApiTags('Health') da classe valer sozinho — colocado como método dentro
// de um controller sem @ApiTags de classe, o Swagger soma a tag do método
// com a tag implícita do controller (nome da classe), fazendo o endpoint
// aparecer duplicado em duas seções da documentação.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Endpoint padrão de mercado para orquestradores (Docker, Kubernetes, load
  // balancer) saberem se a aplicação está de pé E consegue falar com o
  // banco — não adianta o processo estar rodando se o Postgres está fora
  // do ar, então o health check testa os dois.
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Health check',
    description:
      '**Papéis permitidos:** Qualquer um (público, não exige X-API-KEY nem JWT)\n\nVerifica se a aplicação está de pé e consegue se conectar ao banco de dados. Endpoint pensado para orquestradores (Docker, Kubernetes, load balancer).',
  })
  async check() {
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
