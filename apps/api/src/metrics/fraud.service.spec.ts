import { Test } from "@nestjs/testing";
import { FraudService } from "./fraud.service";
import { RedisService } from "../redis/redis.service";

const redisMock = { sadd: jest.fn(), expire: jest.fn(), scard: jest.fn() };

describe("FraudService", () => {
  let svc: FraudService;
  beforeEach(async () => {
    jest.resetAllMocks();
    redisMock.scard.mockResolvedValue(3);
    const mod = await Test.createTestingModule({
      providers: [FraudService, { provide: RedisService, useValue: redisMock }],
    }).compile();
    svc = mod.get(FraudService);
  });

  it("adds the install to the IP's set with a TTL and returns the distinct count", async () => {
    const n = await svc.recordInstall("iphash1", "inst1");
    expect(redisMock.sadd).toHaveBeenCalledWith("ipcluster:iphash1", "inst1");
    expect(redisMock.expire).toHaveBeenCalledWith("ipcluster:iphash1", 3600);
    expect(n).toBe(3);
  });
});
