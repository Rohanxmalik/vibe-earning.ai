import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { LedgerService } from "./ledger.service";
import { PrismaService } from "../prisma/prisma.service";

const WINDOWS = ["24h", "7d", "30d"] as const;
type Window = (typeof WINDOWS)[number];

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

  /** Today / this-month / lifetime credit + lifetime valid impressions. */
  @UseGuards(AuthGuard)
  @Get("me/stats")
  async myStats(@Req() req: { account: { id: string } }) {
    return this.ledger.earningsStats(req.account.id);
  }

  /** Earned + impressions time series over the chosen window (24h | 7d | 30d). */
  @UseGuards(AuthGuard)
  @Get("me/activity")
  async myActivity(@Req() req: { account: { id: string } }, @Query("window") window?: string) {
    const w: Window = (WINDOWS as readonly string[]).includes(window ?? "") ? (window as Window) : "7d";
    return this.ledger.earningsActivity(req.account.id, w);
  }

  /** Recent credited events for the activity ledger (most recent first). */
  @UseGuards(AuthGuard)
  @Get("me/events")
  async myEvents(@Req() req: { account: { id: string } }, @Query("limit") limit?: string) {
    const n = Number(limit);
    return this.ledger.recentEvents(req.account.id, Number.isFinite(n) && n > 0 ? n : 500);
  }
}
