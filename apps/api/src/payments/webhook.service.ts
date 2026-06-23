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

  /**
   * An async payout settled. Flip the matching payout to paid and debit the ledger.
   * recordPayout is idempotent (keyed on payout id), so re-deliveries are safe.
   */
  async markPayoutSettled(providerRef: string): Promise<{ matched: boolean; payoutId?: string }> {
    const payout = await this.prisma.payout.findFirst({ where: { providerRef } });
    if (!payout) return { matched: false };
    if (payout.status !== "paid") {
      await this.prisma.payout.update({ where: { id: payout.id }, data: { status: "paid" } });
    }
    await this.ledger.recordPayout(payout.id, payout.accountId, payout.amountPaise);
    return { matched: true, payoutId: payout.id };
  }

  /** A payout failed/reversed. Mark it failed; the dev's earnings stay intact (never debited). */
  async markPayoutFailed(providerRef: string): Promise<{ matched: boolean }> {
    const payout = await this.prisma.payout.findFirst({ where: { providerRef } });
    if (!payout) return { matched: false };
    await this.prisma.payout.update({ where: { id: payout.id }, data: { status: "failed" } });
    return { matched: true };
  }
}
