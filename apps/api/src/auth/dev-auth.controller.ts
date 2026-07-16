import { BadRequestException, Body, Controller, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { devRegisterSchema, devLoginSchema } from "@vibearning/shared";
import { countryFromRequest } from "../me/geo";
import { DevAuthService } from "./dev-auth.service";

// Tight per-IP limit on credential endpoints (on top of the global request throttle).
const AUTH_THROTTLE = { auth: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60000 } };

@Controller("dev")
export class DevAuthController {
  constructor(private readonly auth: DevAuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post("register")
  async register(@Body() raw: unknown, @Req() req: { headers: Record<string, unknown> }) {
    const p = devRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    const country = countryFromRequest({ headers: req.headers });
    return this.auth.register(p.data.email, p.data.password, country, p.data.ref);
  }

  @Throttle(AUTH_THROTTLE)
  @Post("login")
  async login(@Body() raw: unknown) {
    const p = devLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
