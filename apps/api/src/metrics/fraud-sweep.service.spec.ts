import { Test } from "@nestjs/testing";
import { FraudSweepService } from "./fraud-sweep.service";
import { PrismaService } from "../prisma/prisma.service";
import { FraudService } from "./fraud.service";

const prismaMock = { $queryRaw: jest.fn() };
const fraudMock = { voidCluster: jest.fn() };

describe("FraudSweepService", () => {
  let svc: FraudSweepService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        FraudSweepService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FraudService, useValue: fraudMock },
      ],
    }).compile();
    svc = mod.get(FraudSweepService);
  });

  it("voids every over-threshold cluster and totals the result", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ ipHash: "a" }, { ipHash: "b" }]);
    fraudMock.voidCluster.mockResolvedValueOnce({ voided: 3 }).mockResolvedValueOnce({ voided: 2 });
    const r = await svc.sweep();
    expect(fraudMock.voidCluster).toHaveBeenCalledWith("a");
    expect(fraudMock.voidCluster).toHaveBeenCalledWith("b");
    expect(r).toEqual({ clustersVoided: 2, eventsVoided: 5 });
  });

  it("is a no-op when no cluster is over the threshold", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const r = await svc.sweep();
    expect(fraudMock.voidCluster).not.toHaveBeenCalled();
    expect(r).toEqual({ clustersVoided: 0, eventsVoided: 0 });
  });
});
