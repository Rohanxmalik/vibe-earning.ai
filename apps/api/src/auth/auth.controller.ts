import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { googleLoginSchema } from "@vibearning/shared";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("google")
  async google(@Body() raw: unknown, @Req() req: { headers: Record<string, unknown> }) {
    const parsed = googleLoginSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.auth.loginWithGoogle(parsed.data.idToken, { headers: req.headers });
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() req: { account: { id: string; email: string | null; type: string } }) {
    const { id, email, type } = req.account;
    return { id, email, type };
  }
}
