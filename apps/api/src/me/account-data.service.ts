import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Data-subject access requests (DPDP/GDPR): export and erasure of a user's own data. */
@Injectable()
export class AccountDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything we hold for this account, for a user-initiated data export. */
  async export(accountId: string) {
    const [account, events, payouts, payoutDestinations, earnings] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, type: true, email: true, emailVerified: true, country: true, suspended: true, createdAt: true },
      }),
      this.prisma.adEvent.findMany({ where: { accountId } }),
      this.prisma.payout.findMany({ where: { accountId } }),
      this.prisma.payoutDestination.findMany({ where: { accountId } }),
      this.prisma.ledgerEntry.findMany({ where: { account: `earnings:dev:${accountId}` } }),
    ]);
    return { account, events, payouts, payoutDestinations, earnings };
  }

  /**
   * Erasure: strip PII from the account but keep financial rows (ledger, payouts,
   * purchases) which we must retain for tax/audit. The account can no longer log in.
   */
  async deleteAccount(accountId: string) {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { email: null, passwordHash: null, oauthSub: null, suspended: true },
    });
    return { ok: true };
  }
}
