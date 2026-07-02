import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { payoutDestinationSchema } from "@vibearning/shared";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutService } from "./payout.service";
import { PayoutDestinationService } from "./payout-destination.service";

@Controller("payouts")
@UseGuards(AuthGuard)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutService,
    private readonly prisma: PrismaService,
    private readonly destinations: PayoutDestinationService,
  ) {}

  @Post()
  async request(@Req() req: { account: { id: string } }) {
    return this.payouts.requestPayout(req.account.id);
  }

  @Get("me")
  async mine(@Req() req: { account: { id: string } }) {
    return this.prisma.payout.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: "desc" } });
  }

  @Post("destination")
  async setDestination(@Req() req: { account: { id: string } }, @Body() raw: unknown) {
    const p = payoutDestinationSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.destinations.set(req.account.id, p.data);
  }

  @Get("destination")
  async myDestinations(@Req() req: { account: { id: string } }) {
    return this.destinations.mine(req.account.id);
  }
}
