import { Test } from "@nestjs/testing";
import { CampaignStatsService } from "./campaign-stats.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const prismaMock = {
  adEvent: { count: jest.fn() },
  ledgerEntry: { findMany: jest.fn() },
};
const ledgerMock = { escrowBalance: jest.fn() };

describe("CampaignStatsService", () => {
  let svc: CampaignStatsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        CampaignStatsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
      ],
    }).compile();
    svc = mod.get(CampaignStatsService);
  });

  it("aggregates impressions, clicks, spend and remaining escrow", async () => {
    prismaMock.adEvent.count
      .mockResolvedValueOnce(7)  // impressions
      .mockResolvedValueOnce(2); // clicks
    ledgerMock.escrowBalance.mockResolvedValue(40000);
    prismaMock.ledgerEntry.findMany.mockResolvedValue([{ amount: 60 }, { amount: 40 }]); // escrow debits
    const s = await svc.forCampaign("c1");
    expect(s).toEqual({ impressions: 7, clicks: 2, spendPaise: 100, escrowRemainingPaise: 40000 });
    expect(prismaMock.adEvent.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ campaignId: "c1", type: "impression", valid: true }) }));
  });
});
