import { Test } from "@nestjs/testing";
import type { Surface } from "@vibearning/shared";
import { CampaignService } from "./campaign.service";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const prismaMock = {
  campaign: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  bid: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
};
const rankingMock = { upsertBid: jest.fn(), removeBid: jest.fn() };

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

  it("creates a pending campaign + one bid per target surface but does NOT rank it until approved", async () => {
    const surfaces: Surface[] = ["claude-code-panel", "codex-panel"];
    const dto = { copy: "Hi there", url: "https://x.dev", surfaces, bidPerBlockPaise: 20000 };
    const c = await svc.create("adv1", dto);
    expect(prismaMock.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ advertiserId: "adv1", copy: "Hi there", isHouseAd: false, status: "pending" }) }),
    );
    expect(prismaMock.bid.createMany).toHaveBeenCalledWith({
      data: [
        { campaignId: "c1", surface: "claude-code-panel", amount: 20000, status: "active" },
        { campaignId: "c1", surface: "codex-panel", amount: 20000, status: "active" },
      ],
    });
    expect(rankingMock.upsertBid).not.toHaveBeenCalled(); // not servable while pending
    expect(c).toMatchObject({ id: "c1" });
  });

  it("still accepts the legacy single `surface` (one bid)", async () => {
    await svc.create("adv1", { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" as const, bidPerBlockPaise: 20000 });
    expect(prismaMock.bid.createMany).toHaveBeenCalledWith({
      data: [{ campaignId: "c1", surface: "codex-panel", amount: 20000, status: "active" }],
    });
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

  it("pause() removes an active campaign's bids from the ranking", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "active" });
    prismaMock.bid.findMany.mockResolvedValue([{ surface: "codex-panel", amount: 20000 }]);
    const r = await svc.pause("adv1", "c1");
    expect(prismaMock.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: { status: "paused" } }));
    expect(rankingMock.removeBid).toHaveBeenCalledWith("codex-panel", "c1");
    expect(r).toEqual({ ok: true });
  });

  it("resume() reactivates a paused campaign and re-ranks its bids", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "paused" });
    prismaMock.bid.findMany.mockResolvedValue([{ surface: "codex-panel", amount: 20000 }]);
    const r = await svc.resume("adv1", "c1");
    expect(prismaMock.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: { status: "active" } }));
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 20000);
    expect(r).toEqual({ ok: true });
  });

  it("pause()/resume() reject a campaign owned by someone else", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "other", status: "active" });
    await expect(svc.pause("adv1", "c1")).rejects.toThrow("not_your_campaign");
  });

  it("pause() rejects a campaign that isn't active", async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "pending" });
    await expect(svc.pause("adv1", "c1")).rejects.toThrow("not_active");
  });

  describe("edit()", () => {
    it("rejects editing a campaign owned by someone else", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "other", status: "active", copy: "Old", url: "https://a" });
      await expect(svc.edit("adv1", "c1", { copy: "New" })).rejects.toThrow("not_your_campaign");
    });

    it("editing only the bid on an active campaign updates the amount, re-ranks, and stays active", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "active", copy: "Same", url: "https://a", iconUrl: null });
      prismaMock.bid.findMany.mockResolvedValue([{ surface: "codex-panel", amount: 30000 }]);
      prismaMock.campaign.update.mockResolvedValue({ id: "c1", status: "active" });
      await svc.edit("adv1", "c1", { bidPerBlockPaise: 30000 });
      expect(prismaMock.bid.updateMany).toHaveBeenCalledWith({ where: { campaignId: "c1", status: "active" }, data: { amount: 30000 } });
      expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 30000);
      expect(prismaMock.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.not.objectContaining({ status: "pending" }) }));
      expect(rankingMock.removeBid).not.toHaveBeenCalled();
    });

    it("editing the creative on an active campaign sends it back to pending and unranks it", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "active", copy: "Old copy", url: "https://a", iconUrl: null });
      prismaMock.bid.findMany.mockResolvedValue([{ surface: "codex-panel", amount: 20000 }]);
      prismaMock.campaign.update.mockResolvedValue({ id: "c1", status: "pending" });
      await svc.edit("adv1", "c1", { copy: "Brand new copy" });
      expect(rankingMock.removeBid).toHaveBeenCalledWith("codex-panel", "c1");
      expect(prismaMock.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ copy: "Brand new copy", status: "pending" }) }));
      expect(rankingMock.upsertBid).not.toHaveBeenCalled();
    });

    it("editing a pending campaign updates fields without touching status or ranking", async () => {
      prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", status: "pending", copy: "Old", url: "https://a", iconUrl: null });
      prismaMock.campaign.update.mockResolvedValue({ id: "c1", status: "pending" });
      await svc.edit("adv1", "c1", { copy: "Newer", url: "https://b" });
      expect(prismaMock.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ copy: "Newer", url: "https://b" }) }));
      const data = prismaMock.campaign.update.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
      expect(rankingMock.removeBid).not.toHaveBeenCalled();
      expect(rankingMock.upsertBid).not.toHaveBeenCalled();
    });
  });
});
