import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { devShareBps } from "./constants";

export interface PostableEvent {
  id: string;
  campaignId: string;
  surface: string;
  type: string;
  valid: boolean;
  accountId: string | null;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postForEvent(e: PostableEvent): Promise<void> {
    if (!e.valid) return;

    const bid = await this.prisma.bid.findFirst({
      where: { campaignId: e.campaignId, surface: e.surface, status: "active" },
      orderBy: { amount: "desc" },
    });
    const blockBid = bid?.amount ?? 0;
    if (blockBid <= 0) return; // house ad / no bid

    let price = Math.floor(blockBid / 1000); // paise per impression
    if (e.type === "click") price *= 50;
    if (price <= 0) return;

    const already = await this.prisma.ledgerEntry.count({ where: { eventId: e.id } });
    if (already > 0) return; // idempotent

    const devShare = Math.floor((price * devShareBps()) / 10000);
    const platformShare = price - devShare;
    const earnings = e.accountId ? `earnings:dev:${e.accountId}` : "earnings:unattributed";

    await this.prisma.ledgerEntry.createMany({
      data: [
        { eventId: e.id, account: `escrow:campaign:${e.campaignId}`, direction: "debit", amount: price },
        { eventId: e.id, account: earnings, direction: "credit", amount: devShare },
        { eventId: e.id, account: "revenue:platform", direction: "credit", amount: platformShare },
      ],
      skipDuplicates: true,
    });
  }

  async balance(account: string): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { account } });
    return entries.reduce((sum, e) => sum + (e.direction === "credit" ? e.amount : -e.amount), 0);
  }

  async earningsBalance(accountId: string): Promise<number> {
    return this.balance(`earnings:dev:${accountId}`);
  }

  async recordPayout(payoutId: string, accountId: string, amountPaise: number): Promise<void> {
    if (amountPaise <= 0) return;
    const already = await this.prisma.ledgerEntry.count({ where: { eventId: payoutId } });
    if (already > 0) return;
    await this.prisma.ledgerEntry.createMany({
      data: [
        { eventId: payoutId, account: `earnings:dev:${accountId}`, direction: "debit", amount: amountPaise },
        { eventId: payoutId, account: `payouts:cleared:${accountId}`, direction: "credit", amount: amountPaise },
      ],
      skipDuplicates: true,
    });
  }

  async fundEscrow(sourceId: string, campaignId: string, amountPaise: number): Promise<void> {
    if (amountPaise <= 0) return;
    const already = await this.prisma.ledgerEntry.count({ where: { eventId: sourceId } });
    if (already > 0) return;
    await this.prisma.ledgerEntry.createMany({
      data: [
        { eventId: sourceId, account: "cash:platform", direction: "debit", amount: amountPaise },
        { eventId: sourceId, account: `escrow:campaign:${campaignId}`, direction: "credit", amount: amountPaise },
      ],
      skipDuplicates: true,
    });
  }

  async escrowBalance(campaignId: string): Promise<number> {
    return this.balance(`escrow:campaign:${campaignId}`);
  }
}
