import { Injectable } from "@nestjs/common";
import type { EventIngest, EventResult } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimitService } from "./rate-limit.service";
import { FraudService } from "./fraud.service";
import { LedgerService } from "../ledger/ledger.service";
import { minViewMs, maxInstallsPerIp } from "./constants";

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly fraud: FraudService,
    private readonly ledger: LedgerService,
  ) {}

  async ingest(e: EventIngest, accountId: string | null = null, ipHash: string | null = null): Promise<EventResult> {
    // 1. Dedupe first — retries (extension offline queue) must not spend spacing/caps.
    const existing = await this.prisma.adEvent.findUnique({
      where: { installId_nonce: { installId: e.installId, nonce: e.nonce } },
    });
    if (existing) return { deduped: true, valid: existing.valid, reason: existing.reason ?? null };

    // 2. Validate.
    let valid = true;
    let reason: string | null = null;

    // 2a. IP-hash clustering — many distinct installs behind one IP = likely one actor.
    // Applies to clicks and impressions alike, and takes precedence over view/cap checks.
    if (ipHash) {
      const distinctInstalls = await this.fraud.recordInstall(ipHash, e.installId);
      if (distinctInstalls > maxInstallsPerIp()) { valid = false; reason = "ip_cluster"; }
    }

    // 2b. Impression-only checks (clicks count directly).
    if (valid && e.type === "impression") {
      if (e.visibleMs < minViewMs()) {
        valid = false; reason = "view_too_short";
      } else if (!(await this.rateLimit.takeSpacingSlot(e.installId))) {
        valid = false; reason = "spacing";
      } else {
        const caps = await this.rateLimit.incrCaps(e.installId);
        if (!caps.withinHourly) { valid = false; reason = "hourly_cap"; }
        else if (!caps.withinDaily) { valid = false; reason = "daily_cap"; }
      }
    }

    // 3. Persist; tolerate the rare concurrent-duplicate race via the unique constraint.
    let created: { id: string; valid: boolean } | null = null;
    try {
      created = await this.prisma.adEvent.create({
        data: {
          installId: e.installId, campaignId: e.campaignId, surface: e.surface,
          type: e.type, nonce: e.nonce, visibleMs: e.visibleMs, valid, reason, accountId, ipHash,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "P2002") {
        const dup = await this.prisma.adEvent.findUnique({
          where: { installId_nonce: { installId: e.installId, nonce: e.nonce } },
        });
        return { deduped: true, valid: dup?.valid ?? false, reason: dup?.reason ?? null };
      }
      throw err;
    }

    if (created.valid) {
      await this.ledger.postForEvent({
        id: created.id, campaignId: e.campaignId, surface: e.surface,
        type: e.type, valid: true, accountId,
      });
    }
    return { deduped: false, valid, reason };
  }
}
