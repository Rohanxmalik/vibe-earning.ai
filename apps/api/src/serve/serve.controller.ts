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
    const ads = await this.serveService.pickAds(parsed.data.surface, parsed.data.count);
    // `ad` (the top one, or null) stays for backward compatibility; `ads` is the
    // rotation list the extension cycles through during a wait-state.
    return { ad: ads[0] ?? null, ads };
  }
}
