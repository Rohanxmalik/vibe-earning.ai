import { Test } from "@nestjs/testing";
import { PayoutDestinationService } from "./payout-destination.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { payoutDestination: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() } };

describe("PayoutDestinationService", () => {
  let svc: PayoutDestinationService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [PayoutDestinationService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(PayoutDestinationService);
  });

  it("creates a pending UPI destination", async () => {
    prismaMock.payoutDestination.create.mockResolvedValue({ id: "d1" });
    await svc.set("acc1", { method: "upi", vpa: "dev@okaxis" });
    expect(prismaMock.payoutDestination.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: "acc1", method: "upi", vpa: "dev@okaxis", status: "pending" }) }),
    );
  });

  it("current() returns the latest verified destination", async () => {
    prismaMock.payoutDestination.findFirst.mockResolvedValue({ id: "d2", status: "verified" });
    const d = await svc.current("acc1");
    expect(prismaMock.payoutDestination.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "acc1", status: "verified" } }),
    );
    expect(d).toMatchObject({ id: "d2" });
  });

  it("verify() marks verified and stores the provider ref", async () => {
    prismaMock.payoutDestination.update.mockResolvedValue({ id: "d1", status: "verified" });
    await svc.verify("d1", "fa_123");
    expect(prismaMock.payoutDestination.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { status: "verified", providerRef: "fa_123" } });
  });
});
