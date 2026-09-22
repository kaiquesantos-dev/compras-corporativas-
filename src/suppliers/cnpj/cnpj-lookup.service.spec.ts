import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { CnpjLookupService } from './cnpj-lookup.service';

describe('CnpjLookupService', () => {
  let service: CnpjLookupService;
  let httpService: { get: jest.Mock };
  let configService: ConfigService;

  beforeEach(() => {
    httpService = { get: jest.fn() };
    configService = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CNPJ_API_BASE_URL'
          ? 'https://brasilapi.com.br/api/cnpj/v1'
          : 3000,
      ),
    } as unknown as ConfigService;
    service = new CnpjLookupService(httpService as any, configService);
  });

  it('maps a successful BrasilAPI response to a CnpjLookupResult', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          razao_social: 'OPEN KNOWLEDGE BRASIL',
          nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
          cep: '01311902',
          logradouro: 'PAULISTA',
          numero: '37',
          complemento: 'ANDAR 4',
          municipio: 'SAO PAULO',
          uf: 'SP',
          descricao_situacao_cadastral: 'ATIVA',
        },
      }),
    );

    const result = await service.lookup('19.131.243/0001-97');

    expect(result).toEqual({
      legalName: 'OPEN KNOWLEDGE BRASIL',
      tradeName: 'REDE PELO CONHECIMENTO LIVRE',
      zipCode: '01311902',
      street: 'PAULISTA, 37, ANDAR 4',
      city: 'SAO PAULO',
      state: 'SP',
      federalRegistrationStatus: 'ATIVA',
    });
    expect(httpService.get).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/cnpj/v1/19131243000197',
    );
  });

  it('returns null when the external call fails (network error/timeout)', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

    const result = await service.lookup('19131243000197');

    expect(result).toBeNull();
  });
});
