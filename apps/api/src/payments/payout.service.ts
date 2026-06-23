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

  async requestPayout(accountId: string) {
    const balance = await this.ledger.earningsBalance(accountId);
    if (balance < payoutMinPaise()) {
      throw new BadRequestException(`balance_below_threshold:${balance}`);
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (account?.suspended) throw new ForbiddenException("account_suspended");

    const dest = await this.destinations.current(accountId);
    if (!dest) throw new BadRequestException("no_verified_payout_destination");

    const provider = this.router.forCountry(account?.country ?? null);
    const result = await provider.payout({
      payeeRef: dest.providerRef ?? dest.vpa ?? dest.accountNumber ?? accountId,
      amountPaise: balance,
      currency: "INR",
      method: dest.method,
    });

    const payout = await this.prisma.payout.create({
      data: {
        accountId, provider: provider.name, amountPaise: balance, currency: "INR",
        status: result.status, providerRef: result.providerRef,
      },
    });

    // Debit the ledger only once the payout has actually settled. Async providers
    // return "pending"; the payout webhook calls recordPayout on settlement.
    if (result.status === "paid") {
      await this.ledger.recordPayout(payout.id, accountId, balance);
    }
    return payout;
  }
}
