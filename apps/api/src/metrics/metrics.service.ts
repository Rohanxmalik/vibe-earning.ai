import { Injectable } from "@nestjs/common";
import type { EventIngest, EventResult } from "@vibearning/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimitService } from "./rate-limit.service";
import { FraudService } from "./fraud.service";
import { LedgerService } from "../ledger/ledger.service";
import { KillswitchService } from "../config/killswitch.service";
import { minViewMs, maxInstallsPerIp } from "./constants";
import { verifyImpressionToken, eventsRequireToken } from "../serve/impression-token";

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly fraud: FraudService,
    private readonly ledger: LedgerService,
    private readonly killswitch: KillswitchService,
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

    // 2z. Global killswitch (H5): the emergency brake must stop SPEND, not just display. /serve
    // already returns nothing when the switch is on, but a pinned or offline client could still
    // POST /events — so we refuse to validate here too, and therefore never post to the ledger.
    if (await this.killswitch.isActive("global")) { valid = false; reason = "killswitch"; }

    // 2a. Impression-token check (C2/H2): the event must carry the server-issued token from the
    // /serve response that produced this ad. A present-but-invalid token is always rejected; a
    // missing token is rejected only when tokens are required (production default). This is what
    // stops fabricated /events (fake clicks worth 50x, or impressions draining a rival's escrow) —
    // the attacker can't forge an HMAC they don't hold the secret for.
    if (valid && e.token) {
      if (!verifyImpressionToken(e.token, e.campaignId, e.surface)) { valid = false; reason = "bad_token"; }
    } else if (valid && eventsRequireToken()) {
      valid = false; reason = "unverified";
    }

    // 2b. IP-hash clustering — many distinct installs behind one IP = likely one actor.
    // Applies to clicks and impressions alike, and takes precedence over view/cap checks.
    if (valid && ipHash) {
      const distinctInstalls = await this.fraud.recordInstall(ipHash, e.installId);
      if (distinctInstalls > maxInstallsPerIp()) { valid = false; reason = "ip_cluster"; }
    }

    // 2c. Spacing + hourly/daily caps. Impressions AND clicks are now both capped — clicks used to
    // skip every limit while being worth 50x, which is the core click-fraud vector. Clicks use a
    // SEPARATE rate-limit namespace so an impression and a genuine click in the same window don't
    // starve each other's spacing slot. The view-time floor applies to impressions only.
    if (valid && (e.type === "impression" || e.type === "click")) {
      const rlKey = e.type === "click" ? `click:${e.installId}` : e.installId;
      if (e.type === "impression" && e.visibleMs < minViewMs()) {
        valid = false; reason = "view_too_short";
      } else if (!(await this.rateLimit.takeSpacingSlot(rlKey))) {
        valid = false; reason = "spacing";
      } else {
        const caps = await this.rateLimit.incrCaps(rlKey);
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
