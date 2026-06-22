import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PayoutService } from "./payout.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";

const prismaMock = { account: { findUnique: jest.fn() }, payout: { create: jest.fn() } };
const ledgerMock = { earningsBalance: jest.fn(), recordPayout: jest.fn() };
const provider = { name: "razorpay", payout: jest.fn(), collect: jest.fn() };
const routerMock = { forCountry: jest.fn().mockReturnValue(provider) };

describe("PayoutService", () => {
  let svc: PayoutService;
  beforeEach(async () => {
    jest.resetAllMocks();
    routerMock.forCountry.mockReturnValue(provider);
    prismaMock.account.findUnique.mockResolvedValue({ id: "acc1", country: "IN" });
    prismaMock.payout.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "pay1", ...a.data }));
    process.env.PAYOUT_MIN_PAISE = "10000";
    const mod = await Test.createTestingModule({
      providers: [
        PayoutService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
        { provide: PaymentRouter, useValue: routerMock },
      ],
    }).compile();
    svc = mod.get(PayoutService);
  });

  it("rejects a payout below the minimum threshold", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(5000);
    await expect(svc.requestPayout("acc1")).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.payout).not.toHaveBeenCalled();
  });

  it("pays out the full balance, records the payout, and debits the ledger", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(15000);
    provider.payout.mockResolvedValue({ providerRef: "rzp_1", status: "paid" });
    const payout = await svc.requestPayout("acc1");
    expect(routerMock.forCountry).toHaveBeenCalledWith("IN");
    expect(provider.payout).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 15000, currency: "INR" }));
    expect(prismaMock.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: "acc1", provider: "razorpay", amountPaise: 15000, status: "paid" }) }),
    );
    expect(ledgerMock.recordPayout).toHaveBeenCalledWith("pay1", "acc1", 15000);
    expect(payout).toMatchObject({ id: "pay1", status: "paid" });
  });

  it("records a failed payout without debiting the ledger", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(15000);
    provider.payout.mockResolvedValue({ providerRef: "rzp_2", status: "failed" });
    await svc.requestPayout("acc1");
    expect(prismaMock.payout.create).toHaveBeenCalled();
    expect(ledgerMock.recordPayout).not.toHaveBeenCalled();
  });
});
