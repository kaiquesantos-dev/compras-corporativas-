// Máscara e validação de CNPJ no frontend — dá feedback imediato ao usuário
// (limite de dígitos, formato, dígito verificador) em vez de deixar tudo
// pro backend, que só responde depois do submit. A regra dos dígitos
// verificadores espelha a mesma lógica de src/common/validators/is-cnpj.validator.ts.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// Aplica a máscara "00.000.000/0000-00" incrementalmente, conforme o
// usuário digita — nunca deixa passar de 14 dígitos.
export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 14) return false
  // CNPJs como "11111111111111" batem na conta mas não existem de verdade.
  if (/^(\d)\1{13}$/.test(digits)) return false

  const numbers = digits.split('').map(Number)
  const calcCheckDigit = (base: number[], weights: number[]): number => {
    const sum = base.reduce((acc, digit, index) => acc + digit * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstCheckDigit = calcCheckDigit(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondCheckDigit = calcCheckDigit(
    numbers.slice(0, 12).concat(firstCheckDigit),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )

  return numbers[12] === firstCheckDigit && numbers[13] === secondCheckDigit
}
