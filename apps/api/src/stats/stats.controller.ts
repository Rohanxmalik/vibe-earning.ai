import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** Public landing-page aggregates. No auth guard. */
  @Get("public")
  publicStats() {
    return this.stats.publicStats();
  }

  /** Public transparency figures: real earned/paid totals + a masked payout-proof feed. */
  @Get("transparency")
  transparency() {
    return this.stats.transparency();
  }
}
