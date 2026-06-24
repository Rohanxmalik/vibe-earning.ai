import { Test } from "@nestjs/testing";
import { StatsService } from "./stats.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = {
  ledgerEntry: { findMany: jest.fn() },
  bid: { findMany: jest.fn() },
  adEvent: { count: jest.fn() },
};

const NOW = new Date("2026-06-24T10:30:00Z");

describe("StatsService — public landing stats", () => {
  let svc: StatsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(StatsService);
  });

  it("aggregates earned total, leaderboard, market price, ticker and impressions/hour", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([{ amount: 100 }, { amount: 250 }, { amount: 50 }]);
    prismaMock.bid.findMany.mockResolvedValue([
      { amount: 800, campaign: { copy: "Ramp · save time", url: "https://ramp.com" } },
      { amount: 400, campaign: { copy: "Sentry — quit buggin'", url: "https://sentry.io" } },
    ]);
    prismaMock.adEvent.count.mockResolvedValue(42);

    const stats = await svc.publicStats(NOW);

    expect(stats.totalEarnedPaise).toBe(400);
    expect(stats.marketPricePaise).toBe(600); // round((800+400)/2)
    expect(stats.impressionsPerHour).toBe(42);
    expect(stats.leaderboard).toEqual([
      { name: "Ramp · save time", url: "https://ramp.com", cpmPaise: 800 },
      { name: "Sentry — quit buggin'", url: "https://sentry.io", cpmPaise: 400 },
    ]);
    expect(stats.ticker).toEqual([
      { name: "Ramp", copy: "Ramp · save time" },
      { name: "Sentry", copy: "Sentry — quit buggin'" },
    ]);
  });

  it("queries only dev earnings credits, active bids on active campaigns, and last-hour impressions", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
    prismaMock.bid.findMany.mockResolvedValue([]);
    prismaMock.adEvent.count.mockResolvedValue(0);

    await svc.publicStats(NOW);

    expect(prismaMock.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { account: { startsWith: "earnings:dev:" }, direction: "credit" } }),
    );
    expect(prismaMock.bid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active", campaign: { status: "active" } }, orderBy: { amount: "desc" } }),
    );
    expect(prismaMock.adEvent.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: "impression", valid: true, createdAt: { gte: new Date("2026-06-24T09:30:00Z") } },
      }),
    );
  });

  it("caps leaderboard at 12 and ticker at 10", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
    prismaMock.bid.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        amount: 1000 - i,
        campaign: { copy: `Brand${i} · do stuff`, url: `https://b${i}.com` },
      })),
    );
    prismaMock.adEvent.count.mockResolvedValue(0);

    const stats = await svc.publicStats(NOW);
    expect(stats.leaderboard).toHaveLength(12);
    expect(stats.ticker).toHaveLength(10);
  });

  it("falls back to a ~18-char brand when copy has no separator", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
    prismaMock.bid.findMany.mockResolvedValue([
      { amount: 500, campaign: { copy: "ThisIsAVeryLongBrandNameWithNoSeparator", url: "https://x.com" } },
    ]);
    prismaMock.adEvent.count.mockResolvedValue(0);

    const stats = await svc.publicStats(NOW);
    expect(stats.ticker[0].name).toBe("ThisIsAVeryLongBra"); // first 18 chars
  });

  it("returns zero/empty values when there is no data", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
    prismaMock.bid.findMany.mockResolvedValue([]);
    prismaMock.adEvent.count.mockResolvedValue(0);

    const stats = await svc.publicStats(NOW);
    expect(stats).toEqual({
      totalEarnedPaise: 0,
      marketPricePaise: 0,
      impressionsPerHour: 0,
      leaderboard: [],
      ticker: [],
    });
  });
});
