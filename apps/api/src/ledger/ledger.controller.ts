import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { LedgerService } from "./ledger.service";

@Controller("ledger")
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @UseGuards(AuthGuard)
  @Get("me/balance")
  async myBalance(@Req() req: { account: { id: string } }) {
    const balancePaise = await this.ledger.earningsBalance(req.account.id);
    return { balancePaise, currency: "INR" };
  }
}
