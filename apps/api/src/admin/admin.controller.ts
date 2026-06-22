import { Body, Controller, Headers, Post, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { surfaceSchema } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const bodySchema = z.object({
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().optional(),
  surface: surfaceSchema,
});
type Body = z.infer<typeof bodySchema>;

@Controller("admin/house-ads")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  @Post()
  async createHouseAd(@Headers("x-admin-key") key: string, @Body() raw: unknown) {
    if (!key || key !== process.env.ADMIN_API_KEY) throw new UnauthorizedException();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const b: Body = parsed.data;
    const c = await this.prisma.campaign.create({
      data: { copy: b.copy, url: b.url, iconUrl: b.iconUrl ?? null, isHouseAd: true },
    });
    await this.ranking.upsertBid(b.surface, c.id, 0);
    return { id: c.id };
  }
}
