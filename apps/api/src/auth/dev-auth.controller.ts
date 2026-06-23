import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { devRegisterSchema, devLoginSchema } from "@kbi/shared";
import { DevAuthService } from "./dev-auth.service";

@Controller("dev")
export class DevAuthController {
  constructor(private readonly auth: DevAuthService) {}

  @Post("register")
  async register(@Body() raw: unknown) {
    const p = devRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.register(p.data.email, p.data.password);
  }

  @Post("login")
  async login(@Body() raw: unknown) {
    const p = devLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
