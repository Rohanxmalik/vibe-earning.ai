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

    // Generalized second-price auction: the winner pays the NEXT-highest bid on the
    // surface, not their own. Fairer and the standard for ad auctions (advertisers
    // never pay more than they bid, and less when competition is thinner).
    const bids = await this.prisma.bid.findMany({
      where: { surface: e.surface, status: "active" },
      orderBy: { amount: "desc" },
    });
    const winnerBid = bids.find((b) => b.campaignId === e.campaignId)?.amount ?? 0;
    if (winnerBid <= 0) return; // house ad / no bid
    const runnerUp = bids.find((b) => b.campaignId !== e.campaignId && b.amount <= winnerBid);
    const blockBid = runnerUp ? runnerUp.amount : winnerBid; // fall back to own bid if no competition

    let price = Math.floor(blockBid / 1000); // paise per impression
    if (e.type === "click") price *= 50;
    if (price <= 0) return;

    const already = await this.prisma.ledgerEntry.count({ where: { eventId: e.id } });
    if (already > 0) return; // idempotent

    // Don't let concurrent in-flight impressions drive a campaign's escrow negative.
    if ((await this.escrowBalance(e.campaignId)) < price) return; // budget exhausted

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
