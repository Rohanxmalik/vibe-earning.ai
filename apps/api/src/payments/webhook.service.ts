import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * A PSP confirmed a collection. Flip the matching purchase to paid and fund its
   * escrow. Both steps are idempotent, so duplicate webhook deliveries are safe.
   */
  async markPurchasePaid(providerRef: string): Promise<{ matched: boolean; purchaseId?: string }> {
    const purchase = await this.prisma.blockPurchase.findFirst({ where: { providerRef } });
    if (!purchase) return { matched: false };
    if (purchase.status !== "paid") {
      await this.prisma.blockPurchase.update({ where: { id: purchase.id }, data: { status: "paid" } });
    }
    await this.ledger.fundEscrow(purchase.id, purchase.campaignId, purchase.amountPaise);
    return { matched: true, purchaseId: purchase.id };
  }

  /** A PSP reported the collection failed. Mark the purchase failed (no escrow). */
  async markPurchaseFailed(providerRef: string): Promise<{ matched: boolean }> {
    const purchase = await this.prisma.blockPurchase.findFirst({ where: { providerRef } });
    if (!purchase) return { matched: false };
    await this.prisma.blockPurchase.update({ where: { id: purchase.id }, data: { status: "failed" } });
    return { matched: true };
  }
}
