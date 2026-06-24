import { Controller, Delete, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AccountDataService } from "./account-data.service";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly data: AccountDataService) {}

  /** Export everything we hold about the signed-in account (DSAR). */
  @Get("export")
  export(@Req() req: { account: { id: string } }) {
    return this.data.export(req.account.id);
  }

  /** Erase the signed-in account (anonymizes PII; financial records are retained). */
  @Delete()
  remove(@Req() req: { account: { id: string } }) {
    return this.data.deleteAccount(req.account.id);
  }
}
