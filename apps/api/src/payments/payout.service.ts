import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";
import { payoutMinPaise } from "./constants";

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly router: PaymentRouter,
  ) {}

  async requestPayout(accountId: string) {
    const balance = await this.ledger.earningsBalance(accountId);
    if (balance < payoutMinPaise()) {
      throw new BadRequestException(`balance_below_threshold:${balance}`);
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (account?.suspended) throw new ForbiddenException("account_suspended");
    const provider = this.router.forCountry(account?.country ?? null);
    const result = await provider.payout({ payeeRef: accountId, amountPaise: balance, currency: "INR" });

    const payout = await this.prisma.payout.create({
      data: {
        accountId, provider: provider.name, amountPaise: balance, currency: "INR",
        status: result.status, providerRef: result.providerRef,
      },
    });

    if (result.status !== "failed") {
      await this.ledger.recordPayout(payout.id, accountId, balance);
    }
    return payout;
  }
}
