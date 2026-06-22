import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { LedgerService } from "./ledger.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("ledger")
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(AuthGuard)
  @Get("me/balance")
  async myBalance(@Req() req: { account: { id: string } }) {
    const balancePaise = await this.ledger.earningsBalance(req.account.id);
    return { balancePaise, currency: "INR" };
  }

  @UseGuards(AuthGuard)
  @Get("me/summary")
  async mySummary(@Req() req: { account: { id: string } }) {
    const [balancePaise, validImpressions] = await Promise.all([
      this.ledger.earningsBalance(req.account.id),
      this.prisma.adEvent.count({ where: { accountId: req.account.id, type: "impression", valid: true } }),
    ]);
    return { balancePaise, currency: "INR", validImpressions };
  }
}
