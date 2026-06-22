import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { eventIngestSchema } from "@kbi/shared";
import { MetricsService } from "./metrics.service";

@Controller("events")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post()
  async ingest(@Body() raw: unknown) {
    const parsed = eventIngestSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.metrics.ingest(parsed.data);
  }
}
