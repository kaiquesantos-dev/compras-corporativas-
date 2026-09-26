-- Regra de negócio: uma cotação por fornecedor por solicitação.
--
-- Antes de criar a restrição única, remove duplicados que possam existir de
-- antes da regra (senão o CREATE UNIQUE INDEX falharia). Para cada par
-- (solicitação, fornecedor) fica UMA cotação: a vencedora, se alguma foi
-- selecionada; senão, a mais recente — que é a proposta revisada que
-- substituiu as anteriores. Nenhuma cotação vencedora é removida.
WITH ranked AS (
  SELECT
    q."id",
    ROW_NUMBER() OVER (
      PARTITION BY q."purchaseRequestId", q."supplierId"
      ORDER BY (pr."id" IS NOT NULL) DESC, q."createdAt" DESC, q."id" DESC
    ) AS position
  FROM "Quote" q
  LEFT JOIN "PurchaseRequest" pr ON pr."selectedQuoteId" = q."id"
)
DELETE FROM "Quote" WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_purchaseRequestId_supplierId_key" ON "Quote"("purchaseRequestId", "supplierId");
