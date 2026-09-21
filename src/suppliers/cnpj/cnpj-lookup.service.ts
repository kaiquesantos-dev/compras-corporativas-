import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import { onlyDigits } from '../../common/validators/is-cnpj.validator';

export interface CnpjLookupResult {
  legalName: string;
  tradeName: string | null;
  zipCode: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  federalRegistrationStatus: string | null;
}

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

@Injectable()
export class CnpjLookupService {
  private readonly logger = new Logger(CnpjLookupService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns null on any failure (timeout, network error, CNPJ not found).
   * The caller decides whether to fall back to manually provided fields
   * or reject with 400 — this service never throws for external failures.
   */
  async lookup(rawCnpj: string): Promise<CnpjLookupResult | null> {
    const cnpj = onlyDigits(rawCnpj);
    const baseUrl = this.configService.getOrThrow<string>('CNPJ_API_BASE_URL');
    const timeoutMs = this.configService.getOrThrow<number>('CNPJ_API_TIMEOUT_MS');

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<BrasilApiCnpjResponse>(`${baseUrl}/${cnpj}`)
          .pipe(timeout(timeoutMs)),
      );
      const data = response.data;
      const street =
        [data.logradouro, data.numero, data.complemento].filter(Boolean).join(', ') || null;

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
      this.logger.warn(
        `Falha ao consultar CNPJ ${cnpj} na BrasilAPI: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
