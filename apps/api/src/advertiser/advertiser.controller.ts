import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { createCampaignSchema, editCampaignSchema, buyBlocksSchema } from "@vibearning/shared";
import { AuthGuard } from "../auth/auth.guard";
import { AccountTypes } from "../auth/account-types.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignService } from "./campaign.service";
import { BlockPurchaseService } from "./block-purchase.service";
import { CampaignStatsService } from "./campaign-stats.service";
import { InvoiceService } from "./invoice.service";

@Controller("advertiser/campaigns")
@UseGuards(AuthGuard)
@AccountTypes("advertiser") // only advertiser accounts can create/manage campaigns and spend (M2)
export class AdvertiserController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly purchases: BlockPurchaseService,
    private readonly prisma: PrismaService,
    private readonly stats: CampaignStatsService,
    private readonly invoices: InvoiceService,
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

  @Patch(":id")
  async edit(@Req() req: { account: { id: string } }, @Param("id") id: string, @Body() raw: unknown) {
    const p = editCampaignSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.campaigns.edit(req.account.id, id, p.data);
  }

  @Post(":id/blocks")
  async buy(@Req() req: { account: { id: string } }, @Param("id") id: string, @Body() raw: unknown) {
    const p = buyBlocksSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.purchases.buy(req.account.id, id, p.data.quantity);
  }

  /** Paid block purchases for one of the advertiser's campaigns (for the invoices list). */
  @Get(":id/purchases")
  async purchaseList(@Req() req: { account: { id: string } }, @Param("id") id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c || c.advertiserId !== req.account.id) throw new ForbiddenException("not_your_campaign");
    return this.prisma.blockPurchase.findMany({ where: { campaignId: id }, orderBy: { createdAt: "desc" } });
  }

  /** GST invoice (JSON) for a paid block purchase the advertiser owns. */
  @Get("invoices/:purchaseId")
  async invoice(@Req() req: { account: { id: string } }, @Param("purchaseId") purchaseId: string) {
    return this.invoices.forPurchase(req.account.id, purchaseId);
  }

  @Get(":id/stats")
  async campaignStats(@Req() req: { account: { id: string } }, @Param("id") id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c || c.advertiserId !== req.account.id) throw new ForbiddenException("not_your_campaign");
    return this.stats.forCampaign(id);
  }

  @Get(":id/spend-daily")
  async dailySpend(@Req() req: { account: { id: string } }, @Param("id") id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c || c.advertiserId !== req.account.id) throw new ForbiddenException("not_your_campaign");
    return this.stats.dailySpend(id);
  }

  @Post(":id/pause")
  async pause(@Req() req: { account: { id: string } }, @Param("id") id: string) {
    return this.campaigns.pause(req.account.id, id);
  }

  @Post(":id/resume")
  async resume(@Req() req: { account: { id: string } }, @Param("id") id: string) {
    return this.campaigns.resume(req.account.id, id);
  }
}
