import { Test } from "@nestjs/testing";
import { FraudService } from "./fraud.service";
import { RedisService } from "../redis/redis.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const redisMock = { sadd: jest.fn(), expire: jest.fn(), scard: jest.fn() };
const prismaMock = { adEvent: { findMany: jest.fn(), update: jest.fn() } };
const ledgerMock = { reverseEvent: jest.fn() };

describe("FraudService", () => {
  let svc: FraudService;
  beforeEach(async () => {
    jest.resetAllMocks();
    redisMock.scard.mockResolvedValue(3);
    const mod = await Test.createTestingModule({
      providers: [
        FraudService,
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
      ],
    }).compile();
    svc = mod.get(FraudService);
  });

  it("adds the install to the IP's set with a TTL and returns the distinct count", async () => {
    const n = await svc.recordInstall("iphash1", "inst1");
    expect(redisMock.sadd).toHaveBeenCalledWith("ipcluster:iphash1", "inst1");
    expect(redisMock.expire).toHaveBeenCalledWith("ipcluster:iphash1", 3600);
    expect(n).toBe(3);
  });

  it("voidCluster reverses each valid event's ledger and marks it voided", async () => {
    prismaMock.adEvent.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    const r = await svc.voidCluster("iphash_bad");
    expect(prismaMock.adEvent.findMany).toHaveBeenCalledWith({ where: { ipHash: "iphash_bad", valid: true } });
    expect(ledgerMock.reverseEvent).toHaveBeenCalledWith("e1");
    expect(ledgerMock.reverseEvent).toHaveBeenCalledWith("e2");
    expect(prismaMock.adEvent.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { valid: false, reason: "voided" } });
    expect(r).toEqual({ voided: 2 });
  });
});
