import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Remove tudo que não é dígito (pontos, barra, traço) — assim aceitamos o
// CNPJ tanto formatado ("19.131.243/0001-97") quanto só números.
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Implementa o algoritmo oficial de validação de CNPJ (os "dígitos
// verificadores"): os dois últimos números do CNPJ são calculados a partir
// dos 12 primeiros usando uma fórmula de peso fixa. Se o CNPJ foi digitado
// errado ou inventado, esses dois últimos dígitos não vão bater.
export function isValidCnpj(rawValue: string): boolean {
  const cnpj = onlyDigits(rawValue);

  if (cnpj.length !== 14) return false;
  // CNPJs como "11111111111111" passariam na conta matematicamente, mas
  // não existem de verdade — por isso são rejeitados aqui antes de calcular.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map(Number);

  // Multiplica cada dígito por um peso, soma tudo e aplica o resto da
  // divisão por 11 — é a fórmula padrão usada tanto para o 1º quanto para
  // o 2º dígito verificador (só os pesos mudam).
  const calcCheckDigit = (base: number[], weights: number[]): number => {
    const sum = base.reduce(
      (acc, digit, index) => acc + digit * weights[index],
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstCheckDigit = calcCheckDigit(
    digits.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const secondCheckDigit = calcCheckDigit(
    digits.slice(0, 12).concat(firstCheckDigit),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );

  return digits[12] === firstCheckDigit && digits[13] === secondCheckDigit;
}

// "Cola" a função isValidCnpj no sistema de validação do class-validator,
// pra podermos usar o decorator @IsCnpj() direto num campo de DTO, igual
// usaríamos @IsEmail() ou @IsString().
@ValidatorConstraint({ name: 'isCnpj', async: false })
class IsCnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCnpj(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'CNPJ inválido (verifique os 14 dígitos e o dígito verificador).';
  }
}

// Decorator customizado: uso é @IsCnpj() em cima de um campo `document: string`.
export function IsCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCnpjConstraint,
    });
  };
}
