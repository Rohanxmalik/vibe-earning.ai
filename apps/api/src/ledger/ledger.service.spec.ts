import { Test } from "@nestjs/testing";
import { LedgerService } from "./ledger.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = {
  bid: { findMany: jest.fn() },
  ledgerEntry: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
};

const ev = (over: Record<string, unknown> = {}) => ({
  id: "ev1", campaignId: "c1", surface: "codex-panel", type: "impression", valid: true, accountId: "acc1", ...over,
});

describe("LedgerService", () => {
  let svc: LedgerService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.bid.findMany.mockResolvedValue([{ campaignId: "c1", amount: 20000 }]); // single bidder → pays own bid (20 paise/impr)
    prismaMock.ledgerEntry.count.mockResolvedValue(0);
    prismaMock.ledgerEntry.createMany.mockResolvedValue({ count: 3 });
    prismaMock.ledgerEntry.findMany.mockResolvedValue([{ direction: "credit", amount: 10_000_000 }]); // ample escrow by default
    const mod = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(LedgerService);
  });

  it("posts 3 balanced entries for a valid impression (50/50 split)", async () => {
    await svc.postForEvent(ev());
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ account: string; direction: string; amount: number }>;
    const debit = arg.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amount, 0);
    const credit = arg.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amount, 0);
    expect(debit).toBe(20);
    expect(credit).toBe(20); // 10 dev + 10 platform
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ account: "escrow:campaign:c1", direction: "debit", amount: 20 }),
      expect.objectContaining({ account: "earnings:dev:acc1", direction: "credit", amount: 10 }),
      expect.objectContaining({ account: "revenue:platform", direction: "credit", amount: 10 }),
    ]));
  });

  it("charges a click at 50x the impression price", async () => {
    await svc.postForEvent(ev({ type: "click", id: "ev2" }));
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ direction: string; amount: number }>;
    expect(arg.find((e) => e.direction === "debit")?.amount).toBe(1000); // 20 * 50
  });

  it("credits 'unattributed' when there is no account", async () => {
    await svc.postForEvent(ev({ accountId: null, id: "ev3" }));
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ account: string }>;
    expect(arg.some((e) => e.account === "earnings:unattributed")).toBe(true);
  });

  it("posts nothing for an invalid event", async () => {
    await svc.postForEvent(ev({ valid: false }));
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("posts nothing for a house ad / no bid", async () => {
    prismaMock.bid.findMany.mockResolvedValue([]);
    await svc.postForEvent(ev({ id: "ev4" }));
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("charges the runner-up's bid, not the winner's own (second-price)", async () => {
    prismaMock.bid.findMany.mockResolvedValue([
      { campaignId: "c1", amount: 30000 }, // winner (event is for c1)
      { campaignId: "c2", amount: 20000 }, // runner-up sets the price
    ]);
    await svc.postForEvent(ev({ id: "ev_gsp" }));
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ direction: string; amount: number }>;
    expect(arg.find((e) => e.direction === "debit")?.amount).toBe(20); // 20000/1000, NOT 30
  });

  it("posts nothing when escrow is below the price (no overspend into negative)", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([{ direction: "credit", amount: 5 }]); // escrow 5 < price 20
    await svc.postForEvent(ev({ id: "ev_low" }));
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("is idempotent: skips when entries already exist for the event", async () => {
    prismaMock.ledgerEntry.count.mockResolvedValue(3);
    await svc.postForEvent(ev({ id: "ev5" }));
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("balance() sums credits minus debits", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValue([
      { direction: "credit", amount: 10 }, { direction: "credit", amount: 5 }, { direction: "debit", amount: 3 },
    ]);
    expect(await svc.balance("earnings:dev:acc1")).toBe(12);
  });

  it("recordPayout posts a balanced debit(earnings)/credit(payouts) pair", async () => {
    await svc.recordPayout("pay1", "acc1", 15000);
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ eventId: string; account: string; direction: string; amount: number }>;
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "pay1", account: "earnings:dev:acc1", direction: "debit", amount: 15000 }),
      expect.objectContaining({ eventId: "pay1", account: "payouts:cleared:acc1", direction: "credit", amount: 15000 }),
    ]));
  });

  it("recordPayout is idempotent", async () => {
    prismaMock.ledgerEntry.count.mockResolvedValue(2);
    await svc.recordPayout("pay1", "acc1", 15000);
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("reverseEvent writes the opposite entries keyed void:<id> (idempotent)", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValueOnce([
      { eventId: "E", account: "escrow:campaign:c1", direction: "debit", amount: 20, currency: "INR" },
      { eventId: "E", account: "earnings:dev:acc1", direction: "credit", amount: 10, currency: "INR" },
      { eventId: "E", account: "revenue:platform", direction: "credit", amount: 10, currency: "INR" },
    ]);
    prismaMock.ledgerEntry.count.mockResolvedValue(0);
    await svc.reverseEvent("E");
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ eventId: string; account: string; direction: string; amount: number }>;
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "void:E", account: "escrow:campaign:c1", direction: "credit", amount: 20 }),
      expect.objectContaining({ eventId: "void:E", account: "earnings:dev:acc1", direction: "debit", amount: 10 }),
      expect.objectContaining({ eventId: "void:E", account: "revenue:platform", direction: "debit", amount: 10 }),
    ]));
  });

  it("reverseEvent is idempotent and a no-op for an unknown event", async () => {
    prismaMock.ledgerEntry.findMany.mockResolvedValueOnce([]);
    await svc.reverseEvent("nope");
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("fundEscrow debits cash and credits the campaign escrow", async () => {
    await svc.fundEscrow("buy1", "c1", 200000);
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ account: string; direction: string; amount: number }>;
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ account: "cash:platform", direction: "debit", amount: 200000 }),
      expect.objectContaining({ account: "escrow:campaign:c1", direction: "credit", amount: 200000 }),
    ]));
  });
});
