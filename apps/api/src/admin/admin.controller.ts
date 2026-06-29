import { Body, Controller, Headers, Post, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { surfaceSchema } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const bodySchema = z.object({
  copy: z.string().min(3).max(60),
  headline: z.string().trim().min(1).max(20).optional(),
  tagline: z.string().trim().max(40).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emoji: z.string().trim().min(1).max(8).optional(),
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
      data: {
        copy: b.copy,
        headline: b.headline ?? null,
        tagline: b.tagline ?? null,
        brandColor: b.brandColor ?? null,
        emoji: b.emoji ?? null,
        url: b.url,
        iconUrl: b.iconUrl ?? null,
        isHouseAd: true,
      },
    });
    await this.ranking.upsertBid(b.surface, c.id, 0);
    return { id: c.id };
  }
}
