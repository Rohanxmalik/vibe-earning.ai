import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { createCampaignSchema, buyBlocksSchema } from "@kbi/shared";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignService } from "./campaign.service";
import { BlockPurchaseService } from "./block-purchase.service";

@Controller("advertiser/campaigns")
@UseGuards(AuthGuard)
export class AdvertiserController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly purchases: BlockPurchaseService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Req() req: { account: { id: string } }, @Body() raw: unknown) {
    const p = createCampaignSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.campaigns.create(req.account.id, p.data);
  }

  @Get()
  async list(@Req() req: { account: { id: string } }) {
    return this.prisma.campaign.findMany({ where: { advertiserId: req.account.id }, orderBy: { createdAt: "desc" } });
  }

  @Post(":id/blocks")
  async buy(@Req() req: { account: { id: string } }, @Param("id") id: string, @Body() raw: unknown) {
    const p = buyBlocksSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.purchases.buy(req.account.id, id, p.data.quantity);
  }
}
