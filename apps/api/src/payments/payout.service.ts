import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";
import { PayoutDestinationService } from "./payout-destination.service";
import { payoutMinPaise, payoutHoldDays, payoutDailyCapPaise, payoutRequireApproval } from "./constants";

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

        // Fast-launch guardrails (default off). Bound the blast radius of the not-yet-fully-
        // hardened earning path so a fabricated balance can't be drained instantly at scale.
        const holdDays = payoutHoldDays();
        if (holdDays > 0 && account?.createdAt && Date.now() - new Date(account.createdAt).getTime() < holdDays * 86_400_000) {
          throw new ForbiddenException("payout_hold_period");
        }
        const dailyCap = payoutDailyCapPaise();
        if (dailyCap > 0 && (await this.dispatchedTodayPaise(accountId)) + available > dailyCap) {
          throw new BadRequestException("daily_payout_cap_exceeded");
        }

        const dest = await this.destinations.current(accountId);
        if (!dest) throw new BadRequestException("no_verified_payout_destination");

        // Manual approval (default off): create the payout as "requested" and reserve it, but do
        // NOT dispatch to the PSP — an admin releases it via POST /admin/payouts/:id/approve. The
        // reserved amount is subtracted from `available` on the next request (pendingPayoutsSum
        // counts "requested" too), so it can't be double-requested.
        if (payoutRequireApproval()) {
          return this.prisma.payout.create({
            data: { accountId, provider: this.router.forCountry(account?.country ?? null).name, amountPaise: available, currency: "INR", status: "requested" },
          });
        }

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

  /**
   * Admin-triggered dispatch of an approval-gated payout. Validates it is still "requested",
   * re-checks suspension + a verified destination, sends it to the PSP, and (on synchronous
   * settlement) debits the ledger. Async providers stay "pending" and settle via the webhook.
   */
  async approveAndDispatch(payoutId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:approve:${payoutId}`}))`;
        const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
        if (!payout) throw new BadRequestException("payout_not_found");
        if (payout.status !== "requested") throw new BadRequestException("payout_not_awaiting_approval");

        const account = await this.prisma.account.findUnique({ where: { id: payout.accountId } });
        if (account?.suspended) throw new ForbiddenException("account_suspended");
        const dest = await this.destinations.current(payout.accountId);
        if (!dest) throw new BadRequestException("no_verified_payout_destination");

        const provider = this.router.forCountry(account?.country ?? null);
        const result = await provider.payout({
          payeeRef: dest.providerRef ?? dest.vpa ?? dest.accountNumber ?? payout.accountId,
          amountPaise: payout.amountPaise,
          currency: "INR",
          method: dest.method,
        });
        const updated = await this.prisma.payout.update({
          where: { id: payout.id },
          data: { status: result.status, providerRef: result.providerRef },
        });
        if (result.status === "paid") {
          await this.ledger.recordPayout(payout.id, payout.accountId, payout.amountPaise);
        }
        return updated;
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  /** Payouts awaiting admin approval (the release queue). */
  async pendingApproval() {
    return this.prisma.payout.findMany({ where: { status: "requested" }, orderBy: { createdAt: "asc" } });
  }

  /** Sum of amounts for this account's reserved payouts (in-flight `pending` OR `requested` but
   *  not yet dispatched) — reserved against the balance, not yet ledger-debited. */
  private async pendingPayoutsSum(accountId: string): Promise<number> {
    const reserved = await this.prisma.payout.findMany({
      where: { accountId, status: { in: ["pending", "requested"] } },
      select: { amountPaise: true },
    });
    return reserved.reduce((sum, p) => sum + p.amountPaise, 0);
  }

  /** Total paise dispatched (paid or in-flight) for this account since UTC midnight. */
  private async dispatchedTodayPaise(accountId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const today = await this.prisma.payout.findMany({
      where: { accountId, status: { in: ["pending", "paid"] }, createdAt: { gte: start } },
      select: { amountPaise: true },
    });
    return today.reduce((sum, p) => sum + p.amountPaise, 0);
  }
}
