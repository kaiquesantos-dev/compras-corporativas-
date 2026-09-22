import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import { onlyDigits } from '../../common/validators/is-cnpj.validator';

// Dados que a gente realmente usa depois de consultar o CNPJ — já traduzidos
// para os nomes de campo que usamos no nosso próprio Supplier.
export interface CnpjLookupResult {
  legalName: string;
  tradeName: string | null;
  zipCode: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  federalRegistrationStatus: string | null;
}

// Formato exato da resposta da BrasilAPI (em português e com nomes de
// campo diferentes dos nossos — por isso a "tradução" feita no método lookup).
interface BrasilApiCnpjResponse {
  razao_social: string;
  nome_fantasia: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  municipio: string | null;
  uf: string | null;
  descricao_situacao_cadastral: string | null;
}

// Esta é a nossa integração externa via HttpService: consulta o CNPJ na
// BrasilAPI (serviço público e gratuito) pra descobrir a razão social e o
// endereço do fornecedor automaticamente, sem o comprador precisar digitar
// tudo na mão.
@Injectable()
export class CnpjLookupService {
  private readonly logger = new Logger(CnpjLookupService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Devolve null em qualquer tipo de falha (timeout, sem internet, CNPJ não
   * encontrado). Quem chama este método (SuppliersService) decide o que
   * fazer com isso: usar dados digitados manualmente, ou responder 400.
   * Ou seja, este service NUNCA deixa um erro de rede virar um 500 — ele
   * sempre trata e devolve null de forma controlada.
   */
  async lookup(rawCnpj: string): Promise<CnpjLookupResult | null> {
    const cnpj = onlyDigits(rawCnpj);
    const baseUrl = this.configService.getOrThrow<string>('CNPJ_API_BASE_URL');
    const timeoutMs = this.configService.getOrThrow<number>(
      'CNPJ_API_TIMEOUT_MS',
    );

    try {
      // O operador "timeout" cancela a chamada se ela demorar mais que o
      // configurado em CNPJ_API_TIMEOUT_MS — assim um serviço externo lento
      // não trava a nossa API indefinidamente.
      const response = await firstValueFrom(
        this.httpService
          .get<BrasilApiCnpjResponse>(`${baseUrl}/${cnpj}`)
          .pipe(timeout(timeoutMs)),
      );
      const data = response.data;
      // Monta o endereço completo juntando rua + número + complemento,
      // ignorando os campos que vierem vazios.
      const street =
        [data.logradouro, data.numero, data.complemento]
          .filter(Boolean)
          .join(', ') || null;

      return {
        legalName: data.razao_social,
        tradeName: data.nome_fantasia,
        zipCode: data.cep,
        street,
        city: data.municipio,
        state: data.uf,
        federalRegistrationStatus: data.descricao_situacao_cadastral,
      };
    } catch (error) {
      // Qualquer problema (timeout, CNPJ inexistente, API fora do ar) cai
      // aqui. Só registramos um aviso no log e devolvemos null — quem
      // chamou decide o que fazer a seguir.
      this.logger.warn(
        `Falha ao consultar CNPJ ${cnpj} na BrasilAPI: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
