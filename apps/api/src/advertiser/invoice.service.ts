import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Ad services in India fall under SAC 998365 ("sale of internet advertising space"), GST 18%.
const SAC_CODE = "998365";
const GST_RATE_BPS = () => Number(process.env.GST_RATE_BPS ?? 1800); // 18.00%

export interface GstInvoice {
  invoiceNo: string;
  invoiceDate: string; // ISO date (day)
  seller: { legalName: string; gstin: string | null; state: string | null; address: string | null };
  buyer: { name: string; country: string | null; gstin: string | null };
  item: { description: string; sac: string; quantity: number };
  placeOfSupply: string | null;
  // All amounts in paise. The charged total is GST-INCLUSIVE, so taxable + gst == amountPaise.
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  currency: "INR";
  note: string;
}

/** Indian financial year label for a date, e.g. 2026-04-10 → "2026-27". */
function financialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // FY starts in April (month index 3)
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the GST invoice for a paid block purchase the advertiser owns. Allocates a sequential
   * invoice number on first view (idempotent). Returns null-safe errors for unauthorized/unpaid.
   */
  async forPurchase(advertiserId: string, purchaseId: string): Promise<GstInvoice> {
    const purchase = await this.prisma.blockPurchase.findUnique({
      where: { id: purchaseId },
      include: { campaign: { select: { advertiserId: true, copy: true } } },
    });
    if (!purchase) throw new NotFoundException("purchase_not_found");
    if (purchase.campaign.advertiserId !== advertiserId) throw new ForbiddenException("not_your_purchase");
    if (purchase.status !== "paid") throw new NotFoundException("invoice_not_available_until_paid");

    const invoiceNo = await this.ensureInvoiceNo(purchaseId);
    const advertiser = await this.prisma.account.findUnique({
      where: { id: advertiserId },
      select: { email: true, country: true },
    });

    const gross = purchase.amountPaise; // GST-inclusive (what the advertiser actually paid)
    const divisor = 1 + GST_RATE_BPS() / 10000;
    const taxableValuePaise = Math.round(gross / divisor);
    const totalGst = gross - taxableValuePaise;

    const sellerState = process.env.SELLER_STATE ?? null;
    const buyerState = null; // we don't collect buyer state yet — treated as inter-state (IGST)
    const intraState = Boolean(sellerState && buyerState && sellerState === buyerState);

    const cgstPaise = intraState ? Math.floor(totalGst / 2) : 0;
    const sgstPaise = intraState ? totalGst - cgstPaise : 0;
    const igstPaise = intraState ? 0 : totalGst;

    return {
      invoiceNo,
      invoiceDate: purchase.createdAt.toISOString().slice(0, 10),
      seller: {
        legalName: process.env.SELLER_LEGAL_NAME ?? "vibearning",
        gstin: process.env.SELLER_GSTIN ?? null,
        state: sellerState,
        address: process.env.SELLER_ADDRESS ?? null,
      },
      buyer: { name: advertiser?.email ?? "Advertiser", country: advertiser?.country ?? null, gstin: null },
      item: {
        description: `Sponsored impressions — ${purchase.campaign.copy}`,
        sac: SAC_CODE,
        quantity: purchase.quantity,
      },
      placeOfSupply: advertiser?.country ?? null,
      taxableValuePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalPaise: gross,
      currency: "INR",
      note:
        (process.env.SELLER_GSTIN ? "" : "Draft — seller GSTIN not yet configured. ") +
        "Amounts are GST-inclusive. To claim input tax credit, share your GSTIN with support.",
    };
  }

  /**
   * Allocate (once) a sequential, per-financial-year invoice number for a paid purchase. A
   * per-purchase advisory lock makes concurrent views idempotent; the FY counter row increments
   * atomically so numbers never collide or skip.
   */
  async ensureInvoiceNo(purchaseId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice:purchase:${purchaseId}`}))`;
      const purchase = await tx.blockPurchase.findUnique({ where: { id: purchaseId } });
      if (!purchase) throw new NotFoundException("purchase_not_found");
      if (purchase.invoiceNo) return purchase.invoiceNo;

      const fy = financialYear(purchase.createdAt);
      const counter = await tx.counter.upsert({
        where: { id: `invoice:${fy}` },
        create: { id: `invoice:${fy}`, value: 1 },
        update: { value: { increment: 1 } },
      });
      const invoiceNo = `VIB-${fy}-${String(counter.value).padStart(5, "0")}`;
      await tx.blockPurchase.update({ where: { id: purchaseId }, data: { invoiceNo } });
      return invoiceNo;
    });
  }
}
