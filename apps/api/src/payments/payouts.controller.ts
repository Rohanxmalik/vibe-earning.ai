import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutService } from "./payout.service";

@Controller("payouts")
@UseGuards(AuthGuard)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async request(@Req() req: { account: { id: string } }) {
    return this.payouts.requestPayout(req.account.id);
  }

  @Get("me")
  async mine(@Req() req: { account: { id: string } }) {
    return this.prisma.payout.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: "desc" } });
  }
}
