import { Test } from "@nestjs/testing";
import { ServeService } from "./serve.service";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { campaign: { findUnique: jest.fn() } };
const rankingMock = { topCampaign: jest.fn() };

describe("ServeService", () => {
  let service: ServeService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ServeService,
        { provide: RankingService, useValue: rankingMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = mod.get(ServeService);
  });

  it("returns the top-ranked campaign creative", async () => {
    rankingMock.topCampaign.mockResolvedValue("campB");
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: "campB", copy: "Ship faster with Acme", url: "https://acme.dev",
      iconUrl: null, isHouseAd: false, status: "active",
    });
    const ad = await service.pickAd("codex-panel");
    expect(ad).toMatchObject({ campaignId: "campB", copy: "Ship faster with Acme", isHouseAd: false });
  });

  it("returns null when nothing ranked", async () => {
    rankingMock.topCampaign.mockResolvedValue(null);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });
});
