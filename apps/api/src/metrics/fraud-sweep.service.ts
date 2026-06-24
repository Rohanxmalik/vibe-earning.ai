import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FraudService } from "./fraud.service";
import { maxInstallsPerIp } from "./constants";

/**
 * Periodically claws back confirmed fraud clusters that IP-clustering flagged after the
 * fact (the first N installs behind an IP earn before the threshold trips). Finds IP
 * hashes with more than the allowed distinct installs and voids each (reversing earnings).
 * Runs on an interval only when FRAUD_SWEEP_INTERVAL_MS > 0; also callable on demand.
 */
@Injectable()
export class FraudSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("FraudSweep");
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudService,
  ) {}

  async sweep(): Promise<{ clustersVoided: number; eventsVoided: number }> {
    const threshold = maxInstallsPerIp();
    const rows = await this.prisma.$queryRaw<{ ipHash: string }[]>`
      SELECT "ipHash" FROM "AdEvent"
      WHERE "valid" = true AND "ipHash" IS NOT NULL
      GROUP BY "ipHash"
      HAVING COUNT(DISTINCT "installId") > ${threshold}`;
    let eventsVoided = 0;
    for (const r of rows) {
      const res = await this.fraud.voidCluster(r.ipHash);
      eventsVoided += res.voided;
    }
    return { clustersVoided: rows.length, eventsVoided };
  }

  onModuleInit(): void {
    const ms = Number(process.env.FRAUD_SWEEP_INTERVAL_MS ?? 0);
    if (ms > 0) {
      this.timer = setInterval(() => {
        void this.sweep().catch((e) => this.logger.error(`sweep failed: ${e}`));
      }, ms);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
