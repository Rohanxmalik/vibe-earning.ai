import { Test } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("HealthController", () => {
  const prismaMock = { $queryRawUnsafe: jest.fn() };
  const redisMock = { ping: jest.fn() };
  let ctrl: HealthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();
    ctrl = mod.get(HealthController);
  });

  it("liveness returns ok without touching dependencies", () => {
    expect(ctrl.check()).toEqual({ status: "ok" });
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("readiness returns ready when DB and Redis respond", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ "1": 1 }]);
    redisMock.ping.mockResolvedValue("PONG");
    await expect(ctrl.ready()).resolves.toEqual({ status: "ready", db: "up", redis: "up" });
  });

  it("readiness throws 503 when the database is down", async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValue(new Error("no db"));
    redisMock.ping.mockResolvedValue("PONG");
    await expect(ctrl.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("readiness throws 503 when Redis is down", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ "1": 1 }]);
    redisMock.ping.mockRejectedValue(new Error("no redis"));
    await expect(ctrl.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
