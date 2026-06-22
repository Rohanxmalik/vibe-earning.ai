import { BadRequestException, Body, Controller, Post, Req } from "@nestjs/common";
import { eventIngestSchema } from "@kbi/shared";
import { MetricsService } from "./metrics.service";
import { AuthService } from "../auth/auth.service";
import { bearer } from "../auth/auth.guard";
import { clientIpHash, type IpRequest } from "./ip";

@Controller("events")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  async ingest(@Body() raw: unknown, @Req() req: IpRequest & { headers?: Record<string, unknown> }) {
    const parsed = eventIngestSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const account = await this.auth.accountFromToken(bearer(req));
    return this.metrics.ingest(parsed.data, account?.id ?? null, clientIpHash(req));
  }
}
