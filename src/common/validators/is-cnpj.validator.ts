import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(rawValue: string): boolean {
  const cnpj = onlyDigits(rawValue);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map(Number);

  const calcCheckDigit = (base: number[], weights: number[]): number => {
    const sum = base.reduce((acc, digit, index) => acc + digit * weights[index], 0);
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

@ValidatorConstraint({ name: 'isCnpj', async: false })
class IsCnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCnpj(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'CNPJ inválido (verifique os 14 dígitos e o dígito verificador).';
  }
}

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
