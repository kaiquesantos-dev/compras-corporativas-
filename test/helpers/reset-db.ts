import { PrismaClient } from '../../src/generated/prisma/client';

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Order matters: clear the selectedQuoteId cross-reference before deleting
  // Quote rows, then delete children before parents, respecting every FK.
  await prisma.purchaseRequest.updateMany({ data: { selectedQuoteId: null } });
  await prisma.purchaseRequestStatusHistory.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}
