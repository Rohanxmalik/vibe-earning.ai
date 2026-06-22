import { Test } from "@nestjs/testing";
import { ServeService } from "./serve.service";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const rankingMock = { topCampaigns: jest.fn() };
const prismaMock = { campaign: { findUnique: jest.fn() } };
const ledgerMock = { escrowBalance: jest.fn() };

const paid = (id: string) => ({ id, copy: `ad ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: false, status: "active" });
const house = (id: string) => ({ id, copy: `house ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: true, status: "active" });

describe("ServeService", () => {
  let service: ServeService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ServeService,
        { provide: RankingService, useValue: rankingMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
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
});
