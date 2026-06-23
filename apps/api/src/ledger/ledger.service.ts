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

    // Anonymous impressions (no signed-in dev) forfeit the dev share to the platform —
    // the price still leaves the advertiser's escrow, but nothing is parked in limbo.
    const devShare = e.accountId ? Math.floor((price * devShareBps()) / 10000) : 0;
    const platformShare = price - devShare;
    const escrowKey = `escrow:campaign:${e.campaignId}`;
    const data: { eventId: string; account: string; direction: string; amount: number }[] = [
      { eventId: e.id, account: escrowKey, direction: "debit", amount: price },
      { eventId: e.id, account: "revenue:platform", direction: "credit", amount: platformShare },
    ];
    if (e.accountId && devShare > 0) {
      data.push({ eventId: e.id, account: `earnings:dev:${e.accountId}`, direction: "credit", amount: devShare });
    }

    // Atomic reserve-then-commit: take a per-campaign advisory lock so concurrent
    // impressions for the same campaign serialize, re-check escrow INSIDE the
    // transaction, and only then write the debit. Without this, two in-flight
    // impressions could each read a sufficient balance and both commit, driving
    // escrow negative (overspending the advertiser's budget).
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${escrowKey}))`;
      if ((await tx.ledgerEntry.count({ where: { eventId: e.id } })) > 0) return; // idempotent
      const entries = await tx.ledgerEntry.findMany({ where: { account: escrowKey } });
      const escrow = entries.reduce((sum, le) => sum + (le.direction === "credit" ? le.amount : -le.amount), 0);
      if (escrow < price) return; // budget exhausted
      await tx.ledgerEntry.createMany({ data, skipDuplicates: true });
    });
  }

  async balance(account: string): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { account } });
    return entries.reduce((sum, e) => sum + (e.direction === "credit" ? e.amount : -e.amount), 0);
  }

  async earningsBalance(accountId: string): Promise<number> {
    return this.balance(`earnings:dev:${accountId}`);
  }

  /**
   * Reverse every posting made for an event by writing opposite entries keyed
   * `void:<eventId>` (idempotent). Used to claw back earnings from confirmed fraud —
   * credits escrow back, debits the dev's earnings and platform revenue.
   */
  async reverseEvent(eventId: string): Promise<void> {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { eventId } });
    if (entries.length === 0) return;
    const voidId = `void:${eventId}`;
    const already = await this.prisma.ledgerEntry.count({ where: { eventId: voidId } });
    if (already > 0) return; // idempotent
    await this.prisma.ledgerEntry.createMany({
      data: entries.map((e) => ({
        eventId: voidId,
        account: e.account,
        direction: e.direction === "debit" ? "credit" : "debit",
        amount: e.amount,
        currency: e.currency,
      })),
      skipDuplicates: true,
    });
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
