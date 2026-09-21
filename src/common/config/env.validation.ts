import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUrl, validateSync } from 'class-validator';

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
