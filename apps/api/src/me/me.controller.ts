import { Controller, Delete, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AccountDataService } from "./account-data.service";
import { countryFromRequest, type GeoRequest } from "./geo";
import { payoutMinPaise } from "../payments/constants";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly data: AccountDataService) {}

  /** Export everything we hold about the signed-in account (DSAR). */
  @Get("export")
  export(@Req() req: { account: { id: string } }) {
    return this.data.export(req.account.id);
  }

  /**
   * Payout eligibility + geo. India is our home market (paid in INR over UPI);
   * other regions accrue credit but can't be paid out yet.
   */
  @Get("eligibility")
  eligibility(@Req() req: GeoRequest) {
    const country = countryFromRequest(req);
    const inIndia = country === "IN";
    return {
      country,
      inIndia,
      canPayout: inIndia,
      reason: inIndia ? undefined : "UPI payouts are available in India only for now — your balance keeps accruing.",
      method: "upi" as const,
      payoutMinPaise: payoutMinPaise(),
    };
  }

  /** Erase the signed-in account (anonymizes PII; financial records are retained). */
  @Delete()
  remove(@Req() req: { account: { id: string } }) {
    return this.data.deleteAccount(req.account.id);
  }
}
