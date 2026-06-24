import { Test } from "@nestjs/testing";
import { LedgerService } from "./ledger.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = {
  ledgerEntry: { findMany: jest.fn() },
  adEvent: { count: jest.fn(), findMany: jest.fn() },
  campaign: { findMany: jest.fn() },
};

const NOW = new Date("2026-06-24T10:30:00Z");

describe("LedgerService — developer dashboard reads", () => {
  let svc: LedgerService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(LedgerService);
  });

  describe("earningsStats", () => {
    it("buckets credit into today / month / lifetime and counts impressions", async () => {
      prismaMock.ledgerEntry.findMany.mockResolvedValue([
        { amount: 100, createdAt: new Date("2026-06-24T09:00:00Z") }, // today
        { amount: 50, createdAt: new Date("2026-06-10T12:00:00Z") },  // this month
        { amount: 30, createdAt: new Date("2026-05-20T12:00:00Z") },  // last month
      ]);
      prismaMock.adEvent.count.mockResolvedValue(7);

      const stats = await svc.earningsStats("acc1", NOW);
      expect(stats).toEqual({ todayPaise: 100, monthPaise: 150, lifetimePaise: 180, validImpressions: 7, currency: "INR" });
      expect(prismaMock.ledgerEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { account: "earnings:dev:acc1", direction: "credit" } }));
    });

    it("returns zeros for an account with no credit", async () => {
      prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
      prismaMock.adEvent.count.mockResolvedValue(0);
      const stats = await svc.earningsStats("acc1", NOW);
      expect(stats).toMatchObject({ todayPaise: 0, monthPaise: 0, lifetimePaise: 0, validImpressions: 0 });
    });
  });

  describe("earningsActivity", () => {
    it("returns 24 zero-filled hourly buckets for 24h, crediting the right bucket", async () => {
      prismaMock.ledgerEntry.findMany.mockResolvedValue([{ amount: 250, createdAt: new Date("2026-06-24T10:00:00Z") }]);
      prismaMock.adEvent.findMany.mockResolvedValue([{ createdAt: new Date("2026-06-24T10:05:00Z") }]);

      const series = await svc.earningsActivity("acc1", "24h", NOW);
      expect(series).toHaveLength(24);
      const last = series[series.length - 1];
      expect(last).toEqual({ bucket: "10:00", earnedPaise: 250, impressions: 1 });
      expect(series.slice(0, 23).every((p) => p.earnedPaise === 0 && p.impressions === 0)).toBe(true);
    });

    it("returns 7 daily buckets for 7d and 30 for 30d", async () => {
      prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
      prismaMock.adEvent.findMany.mockResolvedValue([]);
      expect(await svc.earningsActivity("acc1", "7d", NOW)).toHaveLength(7);
      expect(await svc.earningsActivity("acc1", "30d", NOW)).toHaveLength(30);
    });
  });

  describe("recentEvents", () => {
    it("joins events with campaign copy and credited amount", async () => {
      prismaMock.adEvent.findMany.mockResolvedValue([
        { id: "e1", type: "impression", campaignId: "c1", valid: true, createdAt: new Date("2026-06-24T10:00:00Z") },
        { id: "e2", type: "click", campaignId: "c2", valid: true, createdAt: new Date("2026-06-24T09:00:00Z") },
        { id: "e3", type: "impression", campaignId: "c1", valid: false, createdAt: new Date("2026-06-24T08:00:00Z") },
      ]);
      prismaMock.ledgerEntry.findMany.mockResolvedValue([
        { eventId: "e1", amount: 10 },
        { eventId: "e2", amount: 500 },
      ]);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: "c1", copy: "Ramp · save time" },
        { id: "c2", copy: "Sentry · quit buggin'" },
      ]);

      const rows = await svc.recentEvents("acc1", 100);
      expect(rows).toEqual([
        { id: "e1", type: "impression", campaign: "Ramp · save time", amountPaise: 10, valid: true, createdAt: new Date("2026-06-24T10:00:00Z") },
        { id: "e2", type: "click", campaign: "Sentry · quit buggin'", amountPaise: 500, valid: true, createdAt: new Date("2026-06-24T09:00:00Z") },
        { id: "e3", type: "impression", campaign: "Ramp · save time", amountPaise: 0, valid: false, createdAt: new Date("2026-06-24T08:00:00Z") },
      ]);
    });

    it("returns [] when there are no events", async () => {
      prismaMock.adEvent.findMany.mockResolvedValue([]);
      const rows = await svc.recentEvents("acc1");
      expect(rows).toEqual([]);
      expect(prismaMock.campaign.findMany).not.toHaveBeenCalled();
    });
  });
});
