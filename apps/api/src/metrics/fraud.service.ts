import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { ipClusterWindowSec } from "./constants";

const key = (ipHash: string) => `ipcluster:${ipHash}`;

@Injectable()
export class FraudService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Record an install under its source IP hash within a rolling window and return
   * the number of DISTINCT installs seen behind that IP. Adding a known install is
   * idempotent (Redis set), so retries never inflate the count.
   */
  async recordInstall(ipHash: string, installId: string): Promise<number> {
    const k = key(ipHash);
    await this.redis.sadd(k, installId);
    await this.redis.expire(k, ipClusterWindowSec());
    return this.redis.scard(k);
  }
}
