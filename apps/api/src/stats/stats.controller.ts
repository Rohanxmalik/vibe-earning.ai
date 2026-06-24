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
}
