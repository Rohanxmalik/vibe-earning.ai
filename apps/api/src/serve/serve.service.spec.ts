import { Test } from "@nestjs/testing";
import { ServeService } from "./serve.service";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PacingService } from "./pacing.service";

const rankingMock = { topCampaigns: jest.fn() };
const prismaMock = { campaign: { findUnique: jest.fn() } };
const ledgerMock = { escrowBalance: jest.fn() };
const pacingMock = { allow: jest.fn() };

const paid = (id: string) => ({ id, copy: `ad ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: false, status: "active", pacePerMinute: null });
const house = (id: string) => ({ id, copy: `house ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: true, status: "active", pacePerMinute: null });

describe("ServeService", () => {
  let service: ServeService;
  beforeEach(async () => {
    jest.resetAllMocks();
    pacingMock.allow.mockResolvedValue(true);
    const mod = await Test.createTestingModule({
      providers: [
        ServeService,
        { provide: RankingService, useValue: rankingMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
        { provide: PacingService, useValue: pacingMock },
      ],
    }).compile();
    service = mod.get(ServeService);
  });

  it("serves the top paid campaign when it has escrow", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A"]);
    prismaMock.campaign.findUnique.mockResolvedValue(paid("A"));
    ledgerMock.escrowBalance.mockResolvedValue(5000);
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "A", isHouseAd: false });
  });

  it("skips an out-of-budget paid campaign and serves the next funded one", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A", "B"]);
    prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => (id === "A" ? paid("A") : paid("B")));
    ledgerMock.escrowBalance.mockImplementation(async (id: string) => (id === "A" ? 0 : 5000));
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "B" });
  });

  it("serves a house ad regardless of escrow", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["H"]);
    prismaMock.campaign.findUnique.mockResolvedValue(house("H"));
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "H", isHouseAd: true });
    expect(ledgerMock.escrowBalance).not.toHaveBeenCalled();
  });

  it("returns null when nothing is servable", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A"]);
    prismaMock.campaign.findUnique.mockResolvedValue(paid("A"));
    ledgerMock.escrowBalance.mockResolvedValue(0);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });

  it("returns null when nothing ranked", async () => {
    rankingMock.topCampaigns.mockResolvedValue([]);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });

  it("skips a funded campaign that is paced out and serves the next", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A", "B"]);
    prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => paid(id));
    ledgerMock.escrowBalance.mockResolvedValue(5000);
    pacingMock.allow.mockImplementation(async (id: string) => id !== "A"); // A paced out
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "B" });
  });

  describe("pickAds (top-N rotation)", () => {
    it("returns up to N eligible ads in rank order", async () => {
      rankingMock.topCampaigns.mockResolvedValue(["A", "B", "C", "D"]);
      prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => paid(id));
      ledgerMock.escrowBalance.mockResolvedValue(5000);
      const ads = await service.pickAds("codex-panel", 3);
      expect(ads.map((a) => a.campaignId)).toEqual(["A", "B", "C"]);
    });

    it("skips out-of-budget / paced campaigns and fills the slots from the next eligible", async () => {
      rankingMock.topCampaigns.mockResolvedValue(["A", "B", "C", "D"]);
      prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => paid(id));
      ledgerMock.escrowBalance.mockImplementation(async (id: string) => (id === "B" ? 0 : 5000)); // B unfunded
      pacingMock.allow.mockImplementation(async (id: string) => id !== "C"); // C paced out
      const ads = await service.pickAds("codex-panel", 2);
      expect(ads.map((a) => a.campaignId)).toEqual(["A", "D"]);
    });

    it("returns fewer than N when inventory runs out, and always includes house ads", async () => {
      rankingMock.topCampaigns.mockResolvedValue(["A", "H"]);
      prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => (id === "H" ? house("H") : paid("A")));
      ledgerMock.escrowBalance.mockResolvedValue(0); // A unfunded; H is a house ad (no escrow needed)
      const ads = await service.pickAds("codex-panel", 3);
      expect(ads.map((a) => a.campaignId)).toEqual(["H"]);
    });
  });
});
