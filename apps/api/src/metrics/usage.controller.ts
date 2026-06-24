import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { UsageService } from "./usage.service";

@Controller("metrics")
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  /** Current hourly + daily earning-limit usage for the signed-in developer. */
  @UseGuards(AuthGuard)
  @Get("me/usage")
  async myUsage(@Req() req: { account: { id: string } }) {
    return this.usage.currentUsage(req.account.id);
  }
}
