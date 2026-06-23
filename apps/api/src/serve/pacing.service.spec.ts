import { Test } from "@nestjs/testing";
import { PacingService } from "./pacing.service";
import { RedisService } from "../redis/redis.service";

const redisMock = { incr: jest.fn(), expire: jest.fn() };

describe("PacingService", () => {
  let svc: PacingService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [PacingService, { provide: RedisService, useValue: redisMock }],
    }).compile();
    svc = mod.get(PacingService);
  });

  it("always allows when no cap is set", async () => {
    expect(await svc.allow("c1", null)).toBe(true);
    expect(await svc.allow("c1", 0)).toBe(true);
    expect(redisMock.incr).not.toHaveBeenCalled();
  });

  it("allows up to the cap, then denies within the same minute", async () => {
    redisMock.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    expect(await svc.allow("c1", 2)).toBe(true); // 1
    expect(await svc.allow("c1", 2)).toBe(true); // 2
    expect(await svc.allow("c1", 2)).toBe(false); // 3 > 2
    expect(redisMock.expire).toHaveBeenCalledTimes(1); // only on the first increment
  });
});
