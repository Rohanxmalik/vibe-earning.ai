import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";
import { PayoutDestinationService } from "./payout-destination.service";
import { payoutMinPaise } from "./constants";

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly router: PaymentRouter,
    private readonly destinations: PayoutDestinationService,
  ) {}

  /**
   * Request a payout of the developer's whole available balance.
   *
   * Race-safety (C1 fix): the entire read-balance → check-threshold → dispatch → create-row
   * sequence runs inside a transaction that first takes a per-ACCOUNT Postgres advisory lock, so
   * two concurrent requests for the same developer serialize instead of both reading the same
   * undebited balance and each dispatching a full payout (double-spend). Different accounts hash to
   * different lock keys and never contend. "available" also subtracts already-in-flight PENDING
   * payouts (async providers debit the ledger only on the settlement webhook), so a second request
   * fired before the first settles sees a balance that already accounts for the reserved amount.
   */
  async requestPayout(accountId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize concurrent payouts for THIS account (released at txn end).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:account:${accountId}`}))`;

        const [balance, pending] = await Promise.all([
          this.ledger.earningsBalance(accountId),
          this.pendingPayoutsSum(accountId),
        ]);
        const available = balance - pending;
        if (available < payoutMinPaise()) {
          throw new BadRequestException(`balance_below_threshold:${available}`);
        }

        const account = await this.prisma.account.findUnique({ where: { id: accountId } });
        if (account?.suspended) throw new ForbiddenException("account_suspended");

        const dest = await this.destinations.current(accountId);
        if (!dest) throw new BadRequestException("no_verified_payout_destination");

        const provider = this.router.forCountry(account?.country ?? null);
        const result = await provider.payout({
          payeeRef: dest.providerRef ?? dest.vpa ?? dest.accountNumber ?? accountId,
          amountPaise: available,
          currency: "INR",
          method: dest.method,
        });

        const payout = await this.prisma.payout.create({
          data: {
            accountId, provider: provider.name, amountPaise: available, currency: "INR",
            status: result.status, providerRef: result.providerRef,
          },
        });

        // Debit the ledger only once the payout has actually settled. Async providers return
        // "pending"; the payout webhook calls recordPayout on settlement. Until then the row's
        // "pending" status keeps its amount reserved via pendingPayoutsSum above.
        if (result.status === "paid") {
          await this.ledger.recordPayout(payout.id, accountId, available);
        }
        return payout;
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  /** Sum of amounts for this account's in-flight (pending) payouts — reserved, not yet ledger-debited. */
  private async pendingPayoutsSum(accountId: string): Promise<number> {
    const pending = await this.prisma.payout.findMany({
      where: { accountId, status: "pending" },
      select: { amountPaise: true },
    });
    return pending.reduce((sum, p) => sum + p.amountPaise, 0);
  }
}
