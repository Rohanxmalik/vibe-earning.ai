import { Test } from "@nestjs/testing";
import { WebhookService } from "./webhook.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const prismaMock = {
  blockPurchase: { findFirst: jest.fn(), update: jest.fn() },
  payout: { findFirst: jest.fn(), update: jest.fn() },
};
const ledgerMock = { fundEscrow: jest.fn(), recordPayout: jest.fn() };

describe("WebhookService", () => {
  let svc: WebhookService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
      ],
    }).compile();
    svc = mod.get(WebhookService);
  });

  it("marks a pending purchase paid and funds escrow", async () => {
    prismaMock.blockPurchase.findFirst.mockResolvedValue({ id: "bp1", campaignId: "c1", amountPaise: 50000, status: "pending" });
    const r = await svc.markPurchasePaid("order_1");
    expect(prismaMock.blockPurchase.update).toHaveBeenCalledWith({ where: { id: "bp1" }, data: { status: "paid" } });
    expect(ledgerMock.fundEscrow).toHaveBeenCalledWith("bp1", "c1", 50000);
    expect(r).toEqual({ matched: true, purchaseId: "bp1" });
  });

  it("is idempotent: already-paid purchase is not re-updated but escrow funding stays idempotent", async () => {
    prismaMock.blockPurchase.findFirst.mockResolvedValue({ id: "bp1", campaignId: "c1", amountPaise: 50000, status: "paid" });
    await svc.markPurchasePaid("order_1");
    expect(prismaMock.blockPurchase.update).not.toHaveBeenCalled();
    expect(ledgerMock.fundEscrow).toHaveBeenCalledWith("bp1", "c1", 50000); // fundEscrow itself dedupes
  });

  it("returns matched:false for an unknown providerRef", async () => {
    prismaMock.blockPurchase.findFirst.mockResolvedValue(null);
    expect(await svc.markPurchasePaid("nope")).toEqual({ matched: false });
    expect(ledgerMock.fundEscrow).not.toHaveBeenCalled();
  });

  it("marks a purchase failed", async () => {
    prismaMock.blockPurchase.findFirst.mockResolvedValue({ id: "bp2", campaignId: "c2", amountPaise: 1, status: "pending" });
    const r = await svc.markPurchaseFailed("order_2");
    expect(prismaMock.blockPurchase.update).toHaveBeenCalledWith({ where: { id: "bp2" }, data: { status: "failed" } });
    expect(r).toEqual({ matched: true });
  });

  it("settles a pending payout: marks paid and debits the ledger", async () => {
    prismaMock.payout.findFirst.mockResolvedValue({ id: "po1", accountId: "acc1", amountPaise: 15000, status: "pending" });
    const r = await svc.markPayoutSettled("pout_1");
    expect(prismaMock.payout.update).toHaveBeenCalledWith({ where: { id: "po1" }, data: { status: "paid" } });
    expect(ledgerMock.recordPayout).toHaveBeenCalledWith("po1", "acc1", 15000);
    expect(r).toEqual({ matched: true, payoutId: "po1" });
  });

  it("marks a payout failed (earnings stay intact)", async () => {
    prismaMock.payout.findFirst.mockResolvedValue({ id: "po2", accountId: "acc1", amountPaise: 15000, status: "pending" });
    const r = await svc.markPayoutFailed("pout_2");
    expect(prismaMock.payout.update).toHaveBeenCalledWith({ where: { id: "po2" }, data: { status: "failed" } });
    expect(ledgerMock.recordPayout).not.toHaveBeenCalled();
    expect(r).toEqual({ matched: true });
  });
});
