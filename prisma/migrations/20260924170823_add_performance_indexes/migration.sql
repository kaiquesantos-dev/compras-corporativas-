-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseRequestId_idx" ON "PurchaseItem"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requesterId_idx" ON "PurchaseRequest"("requesterId");

-- CreateIndex
CREATE INDEX "PurchaseRequestStatusHistory_purchaseRequestId_idx" ON "PurchaseRequestStatusHistory"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "Quote_purchaseRequestId_idx" ON "Quote"("purchaseRequestId");
