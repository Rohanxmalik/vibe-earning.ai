import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { ipClusterWindowSec } from "./constants";

const key = (ipHash: string) => `ipcluster:${ipHash}`;

@Injectable()
export class FraudService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

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

  /**
   * Claw back a confirmed fraud cluster: invalidate every still-valid event from an IP
   * hash and reverse its ledger postings (refunds the advertiser, debits the dev).
   */
  async voidCluster(ipHash: string): Promise<{ voided: number }> {
    const events = await this.prisma.adEvent.findMany({ where: { ipHash, valid: true } });
    for (const ev of events) {
      await this.ledger.reverseEvent(ev.id);
      await this.prisma.adEvent.update({ where: { id: ev.id }, data: { valid: false, reason: "voided" } });
    }
    return { voided: events.length };
  }
}
