import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

// Lista de todas as variáveis de ambiente que a aplicação precisa para
// funcionar, com os tipos e validações esperados. Isso é o "contrato" do
// .env — se faltar uma variável ou ela vier no formato errado, a aplicação
// nem chega a subir (falha rápido, com uma mensagem clara, em vez de dar
// erro estranho depois em algum lugar aleatório do código).
export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string;

  @IsString()
  @IsNotEmpty()
  API_KEY: string;

  @IsInt()
  PORT: number;

  @IsUrl({ require_tld: false })
  CNPJ_API_BASE_URL: string;

  @IsInt()
  CNPJ_API_TIMEOUT_MS: number;
}

// Função chamada automaticamente pelo ConfigModule assim que a aplicação
// sobe (veja app.module.ts). Ela pega o objeto "cru" com as variáveis de
// ambiente, transforma nos tipos certos (string vira número, por exemplo)
// e valida tudo de uma vez, usando as regras da classe acima.
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida: ${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }

  return validated;
}
