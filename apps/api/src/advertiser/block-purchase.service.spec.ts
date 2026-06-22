import { Test } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { BlockPurchaseService } from "./block-purchase.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "../payments/payment-router";

const prismaMock = {
  campaign: { findUnique: jest.fn() },
  account: { findUnique: jest.fn() },
  blockPurchase: { create: jest.fn() },
};
const ledgerMock = { fundEscrow: jest.fn() };
const provider = { name: "razorpay", collect: jest.fn(), payout: jest.fn() };
const routerMock = { forCountry: jest.fn().mockReturnValue(provider) };

describe("BlockPurchaseService", () => {
  let svc: BlockPurchaseService;
  beforeEach(async () => {
    jest.resetAllMocks();
    routerMock.forCountry.mockReturnValue(provider);
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", bids: [{ surface: "codex-panel", amount: 20000, status: "active" }] });
    prismaMock.account.findUnique.mockResolvedValue({ id: "adv1", country: "IN" });
    prismaMock.blockPurchase.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "buy1", ...a.data }));
    const mod = await Test.createTestingModule({
      providers: [
        BlockPurchaseService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
        { provide: PaymentRouter, useValue: routerMock },
      ],
    }).compile();
    svc = mod.get(BlockPurchaseService);
  });

  it("collects quantity×bid and funds escrow", async () => {
    provider.collect.mockResolvedValue({ providerRef: "rzp_c1", status: "paid" });
    const purchase = await svc.buy("adv1", "c1", 5); // 5 × 20000 = 100000
    expect(provider.collect).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 100000, currency: "INR" }));
    expect(prismaMock.blockPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ campaignId: "c1", quantity: 5, amountPaise: 100000, status: "paid" }) }),
    );
    expect(ledgerMock.fundEscrow).toHaveBeenCalledWith("buy1", "c1", 100000);
    expect(purchase).toMatchObject({ id: "buy1", status: "paid" });
  });

  it("rejects buying for a campaign you don't own", async () => {
    await expect(svc.buy("someone_else", "c1", 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it("does not fund escrow on a failed collect", async () => {
    provider.collect.mockResolvedValue({ providerRef: "rzp_c2", status: "failed" });
    await svc.buy("adv1", "c1", 5);
    expect(ledgerMock.fundEscrow).not.toHaveBeenCalled();
  });
});
