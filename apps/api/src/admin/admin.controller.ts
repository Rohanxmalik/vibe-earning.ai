import { Body, Controller, Headers, Post, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { surfaceSchema, headlineSchema, taglineSchema, brandColorSchema, emojiSchema, logoUrlSchema } from "@vibearning/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

// Brand fields reuse the shared validators (same single-emoji / #RRGGBB rules as the advertiser path).
const bodySchema = z.object({
  copy: z.string().min(3).max(60),
  headline: headlineSchema.optional(),
  tagline: taglineSchema.optional(),
  brandColor: brandColorSchema.optional(),
  emoji: emojiSchema.optional(),
  url: z.string().url(),
  iconUrl: logoUrlSchema.optional(),
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
