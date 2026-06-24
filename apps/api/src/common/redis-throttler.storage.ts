import type { ThrottlerStorage } from "@nestjs/throttler";

/** Matches @nestjs/throttler's ThrottlerStorageRecord (not re-exported from the package root). */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Minimal Redis surface this storage needs (satisfied by ioredis / RedisService). */
interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
  set(key: string, value: string, mode: "PX", ms: number): Promise<unknown>;
}

const sec = (ms: number) => Math.ceil(Math.max(ms, 0) / 1000);

/**
 * Redis-backed throttler storage so rate limits are shared across ALL API instances
 * (the default storage is in-process and breaks the moment you run more than one pod).
 * Counts hits per (throttler, key) in a TTL window and blocks once the limit is exceeded.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisLike) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const counter = `thr:${throttlerName}:${key}`;
    const blockKey = `${counter}:blocked`;

    // If this key is already serving a block, short-circuit (don't count the hit).
    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      return { totalHits: limit + 1, timeToExpire: sec(blockTtl), isBlocked: true, timeToBlockExpire: sec(blockTtl) };
    }

    const totalHits = await this.redis.incr(counter);
    if (totalHits === 1) await this.redis.pexpire(counter, ttl); // open the window on first hit
    let windowTtl = await this.redis.pttl(counter);
    if (windowTtl < 0) {
      await this.redis.pexpire(counter, ttl); // counter without a TTL (shouldn't happen) — repair it
      windowTtl = ttl;
    }

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit) {
      isBlocked = true;
      if (blockDuration > 0) {
        await this.redis.set(blockKey, "1", "PX", blockDuration);
        timeToBlockExpire = sec(blockDuration);
      } else {
        timeToBlockExpire = sec(windowTtl);
      }
    }

    return { totalHits, timeToExpire: sec(windowTtl), isBlocked, timeToBlockExpire };
  }
}
