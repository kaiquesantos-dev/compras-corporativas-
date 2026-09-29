import { Transform } from 'class-transformer';

// E-mail não diferencia maiúsculas de minúsculas. Sem esta normalização,
// o índice único do Postgres (que diferencia) aceitava
// "COMPRADOR@compras.com" como um usuário NOVO, mesmo já existindo
// "comprador@compras.com" — e o login com outra caixa dava "senha
// incorreta". Aplicado no cadastro, na edição e no login, antes da
// validação (o ValidationPipe roda com transform: true): o e-mail sempre
// chega ao service já sem espaços nas pontas e em minúsculas.
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
