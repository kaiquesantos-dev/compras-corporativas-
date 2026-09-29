-- Soft delete de usuário: todo usuário existente continua ativo.
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
