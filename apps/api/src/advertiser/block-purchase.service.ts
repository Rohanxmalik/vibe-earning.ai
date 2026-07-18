import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { MAX_BLOCK_PURCHASE_PAISE } from "@vibearning/shared";
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
    // Cap a single purchase well under the ledger's int4 paise column so a huge quantity can't
    // overflow it into a Postgres out-of-range 500 (M1 pre-empt). Large advertisers split buys.
    if (amountPaise > MAX_BLOCK_PURCHASE_PAISE) throw new BadRequestException("purchase_too_large");
    const advertiser = await this.prisma.account.findUnique({ where: { id: advertiserId } });
    const provider = this.router.forCountry(advertiser?.country ?? null);
    const result = await provider.collect({ amountPaise, currency: "INR", description: `blocks:${campaignId}` });

    const purchase = await this.prisma.blockPurchase.create({
      data: { campaignId, quantity, amountPaise, currency: "INR", status: result.status, providerRef: result.providerRef },
    });
    // Fund escrow ONLY when the money is actually captured (C1). Razorpay `collect()` merely
    // creates an order and returns "pending"; Stripe pends until its webhook. Funding on anything
    // other than a synchronous "paid" would credit escrow — and start serving ads that pay
    // developers — before the advertiser has paid a rupee. Async "pending" collections are funded
    // later by the paid webhook (`WebhookService.markPurchasePaid`, idempotent on `purchase.id`).
    if (result.status === "paid") {
      await this.ledger.fundEscrow(purchase.id, campaignId, amountPaise);
    }
    return purchase;
  }
}
