import { Controller, Get, Header } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Prometheus scrape target. Restrict at the network layer in prod (it exposes traffic shape).
  @Get()
  @Header("content-type", "text/plain; version=0.0.4")
  scrape(): string {
    return this.metrics.render();
  }
}
