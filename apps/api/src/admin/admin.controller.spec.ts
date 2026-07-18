import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const prismaMock = { campaign: { create: jest.fn() } };
const rankingMock = { upsertBid: jest.fn() };

describe("AdminController", () => {
  let ctrl: AdminController;
  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.ADMIN_API_KEY = "test-key";
    const mod = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingService, useValue: rankingMock },
      ],
    }).compile();
    ctrl = mod.get(AdminController);
  });

  it("rejects a wrong admin key", async () => {
    await expect(
      ctrl.createHouseAd("nope", { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("creates a house ad and ranks it at 0", async () => {
    prismaMock.campaign.create.mockResolvedValue({ id: "c1" });
    await ctrl.createHouseAd("test-key", { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" });
    expect(prismaMock.campaign.create).toHaveBeenCalled();
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 0);
  });

  it("accepts a real emoji house ad", async () => {
    prismaMock.campaign.create.mockResolvedValue({ id: "c2" });
    await ctrl.createHouseAd("test-key", { copy: "Hi there", emoji: "🍔", brandColor: "#E23744", url: "https://x.dev", surface: "codex-panel" });
    expect(prismaMock.campaign.create).toHaveBeenCalled();
  });

  it("rejects a non-emoji 'emoji' (same strict rule as the advertiser path)", async () => {
    await expect(
      ctrl.createHouseAd("test-key", { copy: "Hi there", emoji: "??", url: "https://x.dev", surface: "codex-panel" }),
    ).rejects.toBeTruthy(); // BadRequestException from zod
    expect(prismaMock.campaign.create).not.toHaveBeenCalled();
  });
});
