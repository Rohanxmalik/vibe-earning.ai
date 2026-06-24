import { BadRequestException, Body, Controller, Post, Req } from "@nestjs/common";
import { devRegisterSchema, devLoginSchema } from "@kbi/shared";
import { countryFromRequest } from "../me/geo";
import { DevAuthService } from "./dev-auth.service";

@Controller("dev")
export class DevAuthController {
  constructor(private readonly auth: DevAuthService) {}

  @Post("register")
  async register(@Body() raw: unknown, @Req() req: { headers: Record<string, unknown> }) {
    const p = devRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    const country = countryFromRequest({ headers: req.headers });
    return this.auth.register(p.data.email, p.data.password, country);
  }

  @Post("login")
  async login(@Body() raw: unknown) {
    const p = devLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
