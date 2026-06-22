import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "../payments/payment-router";

@Injectable()
export class BlockPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly router: PaymentRouter,
  ) {}

  async buy(advertiserId: string, campaignId: string, quantity: number) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }, include: { bids: true } });
    if (!campaign) throw new NotFoundException("campaign_not_found");
    if (campaign.advertiserId !== advertiserId) throw new ForbiddenException("not_your_campaign");

    const bid = campaign.bids.find((b) => b.status === "active");
    if (!bid) throw new BadRequestException("campaign_has_no_active_bid");

    const amountPaise = quantity * bid.amount;
    const advertiser = await this.prisma.account.findUnique({ where: { id: advertiserId } });
    const provider = this.router.forCountry(advertiser?.country ?? null);
    const result = await provider.collect({ amountPaise, currency: "INR", description: `blocks:${campaignId}` });

    const purchase = await this.prisma.blockPurchase.create({
      data: { campaignId, quantity, amountPaise, currency: "INR", status: result.status, providerRef: result.providerRef },
    });
    if (result.status !== "failed") {
      await this.ledger.fundEscrow(purchase.id, campaignId, amountPaise);
    }
    return purchase;
  }
}
