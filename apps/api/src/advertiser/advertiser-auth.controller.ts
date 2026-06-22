import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { advertiserRegisterSchema, advertiserLoginSchema } from "@kbi/shared";
import { AdvertiserAuthService } from "./advertiser-auth.service";

@Controller("advertiser")
export class AdvertiserAuthController {
  constructor(private readonly auth: AdvertiserAuthService) {}

  @Post("register")
  async register(@Body() raw: unknown) {
    const p = advertiserRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.register(p.data.email, p.data.password);
  }

  @Post("login")
  async login(@Body() raw: unknown) {
    const p = advertiserLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
