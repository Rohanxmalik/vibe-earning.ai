import { Test } from "@nestjs/testing";
import { AccountDataService } from "./account-data.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = {
  account: { findUnique: jest.fn(), update: jest.fn() },
  adEvent: { findMany: jest.fn() },
  payout: { findMany: jest.fn() },
  payoutDestination: { findMany: jest.fn() },
  ledgerEntry: { findMany: jest.fn() },
};

describe("AccountDataService", () => {
  let svc: AccountDataService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [AccountDataService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(AccountDataService);
  });

  it("exports the account plus its events, payouts, destinations and earnings", async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: "a1", type: "dev", email: "a@b.com" });
    prismaMock.adEvent.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.payout.findMany.mockResolvedValue([{ id: "p1" }]);
    prismaMock.payoutDestination.findMany.mockResolvedValue([{ id: "d1" }]);
    prismaMock.ledgerEntry.findMany.mockResolvedValue([{ id: "l1" }]);

    const out = await svc.export("a1");
    expect(out).toMatchObject({ account: { id: "a1" }, events: [{ id: "e1" }], payouts: [{ id: "p1" }], payoutDestinations: [{ id: "d1" }], earnings: [{ id: "l1" }] });
    expect(prismaMock.ledgerEntry.findMany).toHaveBeenCalledWith({ where: { account: "earnings:dev:a1" } });
  });

  it("delete anonymizes PII and suspends, preserving financial rows", async () => {
    await svc.deleteAccount("a1");
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { email: null, passwordHash: null, oauthSub: null, suspended: true },
    });
  });
});
