import { Test } from "@nestjs/testing";
import { UsageService } from "./usage.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const prismaMock = { adEvent: { findFirst: jest.fn() } };
const redisMock = { get: jest.fn() };

const NOW = new Date("2026-06-24T10:30:00Z");

describe("UsageService", () => {
  let svc: UsageService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();
    svc = mod.get(UsageService);
  });

  it("reads the active install's counters and reports caps + reset times", async () => {
    prismaMock.adEvent.findFirst.mockResolvedValue({ installId: "i1" });
    redisMock.get.mockImplementation((k: string) => Promise.resolve(k.startsWith("cap:h:") ? "5" : "42"));

    const usage = await svc.currentUsage("acc1", NOW);
    expect(usage.hourly).toEqual({ count: 5, cap: 120, resetAt: "2026-06-24T11:00:00.000Z" });
    expect(usage.daily).toEqual({ count: 42, cap: 600, resetAt: "2026-06-25T00:00:00.000Z" });
    expect(redisMock.get).toHaveBeenCalledWith("cap:h:i1:2026-06-24T10");
    expect(redisMock.get).toHaveBeenCalledWith("cap:d:i1:2026-06-24");
  });

  it("reports zero usage when the account has no events", async () => {
    prismaMock.adEvent.findFirst.mockResolvedValue(null);
    const usage = await svc.currentUsage("acc1", NOW);
    expect(usage.hourly.count).toBe(0);
    expect(usage.daily.count).toBe(0);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("treats missing redis counters as zero", async () => {
    prismaMock.adEvent.findFirst.mockResolvedValue({ installId: "i1" });
    redisMock.get.mockResolvedValue(null);
    const usage = await svc.currentUsage("acc1", NOW);
    expect(usage.hourly.count).toBe(0);
    expect(usage.daily.count).toBe(0);
  });
});
