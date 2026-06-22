import { Test } from "@nestjs/testing";
import { CampaignService } from "./campaign.service";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const prismaMock = {
  campaign: { create: jest.fn(), update: jest.fn() },
  bid: { create: jest.fn(), findMany: jest.fn() },
};
const rankingMock = { upsertBid: jest.fn() };

describe("CampaignService", () => {
  let svc: CampaignService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.campaign.create.mockResolvedValue({ id: "c1" });
    const mod = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingService, useValue: rankingMock },
      ],
    }).compile();
    svc = mod.get(CampaignService);
  });

  it("creates a pending campaign + bid but does NOT rank it until approved", async () => {
    const dto = { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" as const, bidPerBlockPaise: 20000 };
    const c = await svc.create("adv1", dto);
    expect(prismaMock.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ advertiserId: "adv1", copy: "Hi there", isHouseAd: false, status: "pending" }) }),
    );
    expect(prismaMock.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ campaignId: "c1", surface: "codex-panel", amount: 20000 }) }),
    );
    expect(rankingMock.upsertBid).not.toHaveBeenCalled(); // not servable while pending
    expect(c).toMatchObject({ id: "c1" });
  });

  it("approve() activates the campaign and ranks each active bid", async () => {
    prismaMock.bid.findMany.mockResolvedValue([
      { surface: "codex-panel", amount: 20000 },
      { surface: "claude-spinner", amount: 5000 },
    ]);
    const r = await svc.approve("c1");
    expect(prismaMock.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1" }, data: { status: "active" } }),
    );
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 20000);
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("claude-spinner", "c1", 5000);
    expect(r).toEqual({ ok: true });
  });
});
