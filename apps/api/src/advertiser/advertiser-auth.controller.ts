import { BadRequestException, Body, Controller, Post, Req } from "@nestjs/common";
import { advertiserRegisterSchema, advertiserLoginSchema } from "@kbi/shared";
import { countryFromRequest } from "../me/geo";
import { AdvertiserAuthService } from "./advertiser-auth.service";

@Controller("advertiser")
export class AdvertiserAuthController {
  constructor(private readonly auth: AdvertiserAuthService) {}

  @Post("register")
  async register(@Body() raw: unknown, @Req() req: { headers: Record<string, unknown> }) {
    const p = advertiserRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    const country = countryFromRequest({ headers: req.headers });
    return this.auth.register(p.data.email, p.data.password, country);
  }

  @Post("login")
  async login(@Body() raw: unknown) {
    const p = advertiserLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
