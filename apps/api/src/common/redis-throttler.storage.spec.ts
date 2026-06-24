import { RedisThrottlerStorage } from "./redis-throttler.storage";

function mockRedis() {
  return {
    incr: jest.fn(),
    pexpire: jest.fn().mockResolvedValue(1),
    pttl: jest.fn(),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

describe("RedisThrottlerStorage", () => {
  it("sets the window TTL on the first hit and reports not blocked", async () => {
    const redis = mockRedis();
    redis.incr.mockResolvedValue(1);
    redis.pttl.mockImplementation(async (k: string) => (k.endsWith(":blocked") ? -2 : 60000));
    const storage = new RedisThrottlerStorage(redis as never);

    const r = await storage.increment("ip1", 60000, 5, 60000, "default");
    expect(redis.incr).toHaveBeenCalledWith("thr:default:ip1");
    expect(redis.pexpire).toHaveBeenCalledWith("thr:default:ip1", 60000);
    expect(r).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(r.timeToExpire).toBe(60); // seconds
  });

  it("does not re-set the TTL on subsequent hits within the window", async () => {
    const redis = mockRedis();
    redis.incr.mockResolvedValue(3);
    redis.pttl.mockImplementation(async (k: string) => (k.endsWith(":blocked") ? -2 : 40000));
    const storage = new RedisThrottlerStorage(redis as never);

    const r = await storage.increment("ip1", 60000, 5, 60000, "default");
    expect(redis.pexpire).not.toHaveBeenCalled(); // only first hit sets it
    expect(r.isBlocked).toBe(false);
    expect(r.totalHits).toBe(3);
  });

  it("blocks once hits exceed the limit", async () => {
    const redis = mockRedis();
    redis.incr.mockResolvedValue(6); // limit 5
    redis.pttl.mockImplementation(async (k: string) => (k.endsWith(":blocked") ? -2 : 30000));
    const storage = new RedisThrottlerStorage(redis as never);

    const r = await storage.increment("ip1", 60000, 5, 60000, "default");
    expect(r.isBlocked).toBe(true);
    expect(redis.set).toHaveBeenCalledWith("thr:default:ip1:blocked", "1", "PX", 60000);
  });

  it("short-circuits while a key is already blocked (without incrementing)", async () => {
    const redis = mockRedis();
    redis.pttl.mockImplementation(async (k: string) => (k.endsWith(":blocked") ? 12000 : 0));
    const storage = new RedisThrottlerStorage(redis as never);

    const r = await storage.increment("ip1", 60000, 5, 60000, "default");
    expect(r.isBlocked).toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
    expect(r.timeToBlockExpire).toBe(12); // seconds
  });
});
