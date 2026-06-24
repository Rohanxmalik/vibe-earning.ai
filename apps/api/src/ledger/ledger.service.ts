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

  // ---- Developer dashboard reads ----

  /** Credited earnings bucketed into today / this-month / lifetime (gross credit), plus lifetime valid impressions. */
  async earningsStats(accountId: string, now = new Date()) {
    const account = `earnings:dev:${accountId}`;
    const [credits, validImpressions] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { account, direction: "credit" }, select: { amount: true, createdAt: true } }),
      this.prisma.adEvent.count({ where: { accountId, type: "impression", valid: true } }),
    ]);
    const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    let todayPaise = 0, monthPaise = 0, lifetimePaise = 0;
    for (const e of credits) {
      const t = new Date(e.createdAt).getTime();
      lifetimePaise += e.amount;
      if (t >= startMonth) monthPaise += e.amount;
      if (t >= startToday) todayPaise += e.amount;
    }
    return { todayPaise, monthPaise, lifetimePaise, validImpressions, currency: "INR" as const };
  }

  /** Zero-filled earned+impressions time series: 24 hourly buckets (24h) or N daily buckets (7d/30d). */
  async earningsActivity(accountId: string, window: "24h" | "7d" | "30d", now = new Date()) {
    const hourly = window === "24h";
    const count = window === "24h" ? 24 : window === "7d" ? 7 : 30;
    const bucketMs = hourly ? 3_600_000 : 86_400_000;
    const currentStart = hourly
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())
      : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMs = currentStart - bucketMs * (count - 1);
    const since = new Date(startMs);
    const account = `earnings:dev:${accountId}`;
    const [credits, impressions] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { account, direction: "credit", createdAt: { gte: since } }, select: { amount: true, createdAt: true } }),
      this.prisma.adEvent.findMany({ where: { accountId, type: "impression", valid: true, createdAt: { gte: since } }, select: { createdAt: true } }),
    ]);
    const earned = new Array(count).fill(0);
    const imps = new Array(count).fill(0);
    const idx = (t: number) => Math.floor((t - startMs) / bucketMs);
    for (const e of credits) { const i = idx(new Date(e.createdAt).getTime()); if (i >= 0 && i < count) earned[i] += e.amount; }
    for (const e of impressions) { const i = idx(new Date(e.createdAt).getTime()); if (i >= 0 && i < count) imps[i] += 1; }
    const fmt = (ms: number) => {
      const d = new Date(ms);
      return hourly
        ? `${String(d.getUTCHours()).padStart(2, "0")}:00`
        : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    };
    return Array.from({ length: count }, (_, i) => ({ bucket: fmt(startMs + i * bucketMs), earnedPaise: earned[i], impressions: imps[i] }));
  }

  /** Most recent ad events for this developer with the credit each one earned (for the activity ledger). */
  async recentEvents(accountId: string, limit = 500) {
    const take = Math.min(Math.max(1, limit), 500);
    const events = await this.prisma.adEvent.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, type: true, campaignId: true, valid: true, createdAt: true },
    });
    if (events.length === 0) return [];
    const ids = events.map((e) => e.id);
    const campaignIds = [...new Set(events.map((e) => e.campaignId))];
    const account = `earnings:dev:${accountId}`;
    const [credits, campaigns] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { account, direction: "credit", eventId: { in: ids } }, select: { eventId: true, amount: true } }),
      this.prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, copy: true } }),
    ]);
    const creditByEvent = new Map<string, number>();
    for (const c of credits) creditByEvent.set(c.eventId, (creditByEvent.get(c.eventId) ?? 0) + c.amount);
    const copyById = new Map(campaigns.map((c) => [c.id, c.copy]));
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      campaign: copyById.get(e.campaignId) ?? null,
      amountPaise: creditByEvent.get(e.id) ?? 0,
      valid: e.valid,
      createdAt: e.createdAt,
    }));
  }
}
