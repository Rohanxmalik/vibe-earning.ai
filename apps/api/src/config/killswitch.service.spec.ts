import { Test } from "@nestjs/testing";
import { KillswitchService } from "./killswitch.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { killswitch: { findUnique: jest.fn(), upsert: jest.fn() } };

describe("KillswitchService", () => {
  let svc: KillswitchService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [KillswitchService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(KillswitchService);
  });

  it("defaults to inactive when no row exists", async () => {
    prismaMock.killswitch.findUnique.mockResolvedValue(null);
    expect(await svc.isActive("global")).toBe(false);
  });
  it("reads the stored active flag", async () => {
    prismaMock.killswitch.findUnique.mockResolvedValue({ active: true });
    expect(await svc.isActive("global")).toBe(true);
  });
  it("set upserts the scope", async () => {
    await svc.set("global", true);
    expect(prismaMock.killswitch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scope: "global" }, update: { active: true }, create: { scope: "global", active: true } }),
    );
  });
});
