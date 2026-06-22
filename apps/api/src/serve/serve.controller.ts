import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { serveQuerySchema } from "@kbi/shared";
import { ServeService } from "./serve.service";

@Controller("serve")
export class ServeController {
  constructor(private readonly serveService: ServeService) {}

  @Get()
  async serve(@Query() raw: unknown) {
    const parsed = serveQuerySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const ad = await this.serveService.pickAd(parsed.data.surface);
    return { ad }; // ad is null when no inventory — extension renders nothing
  }
}
