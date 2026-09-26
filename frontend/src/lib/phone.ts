// Máscara de telefone brasileiro (fixo: 10 dígitos, celular: 11 dígitos).
// O backend não valida o formato do telefone (é um campo livre até 20
// caracteres), então esta máscara é só UX — não bloqueia o submit.
import { onlyDigits } from './cnpj'

export { onlyDigits }

export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}
