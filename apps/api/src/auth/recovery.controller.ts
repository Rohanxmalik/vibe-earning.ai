import { BadRequestException, Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { passwordResetRequestSchema, passwordResetSchema, verifyEmailSchema } from "@vibearning/shared";
import { AccountRecoveryService } from "./account-recovery.service";
import { AuthGuard } from "./auth.guard";

@Controller("auth")
export class RecoveryController {
  constructor(private readonly recovery: AccountRecoveryService) {}

  @Post("password-reset/request")
  async requestReset(@Body() raw: unknown) {
    const p = passwordResetRequestSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.recovery.requestPasswordReset(p.data.email, p.data.type);
  }

  @Post("password-reset")
  async reset(@Body() raw: unknown) {
    const p = passwordResetSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.recovery.resetPassword(p.data.token, p.data.password);
  }

  @UseGuards(AuthGuard)
  @Post("verify-email/request")
  async requestVerify(@Req() req: { account: { id: string } }) {
    return this.recovery.requestEmailVerification(req.account.id);
  }

  @Post("verify-email")
  async verify(@Body() raw: unknown) {
    const p = verifyEmailSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.recovery.verifyEmail(p.data.token);
  }
}
