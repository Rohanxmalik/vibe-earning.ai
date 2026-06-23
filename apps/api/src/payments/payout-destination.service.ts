import { Injectable } from "@nestjs/common";
import type { PayoutDestinationInput } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PayoutDestinationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Add a new destination for a dev. Starts `pending` until an admin verifies (KYC). */
  async set(accountId: string, dto: PayoutDestinationInput) {
    return this.prisma.payoutDestination.create({
      data: {
        accountId,
        method: dto.method,
        vpa: dto.vpa ?? null,
        accountNumber: dto.accountNumber ?? null,
        ifsc: dto.ifsc ?? null,
        status: "pending",
      },
    });
  }

  async mine(accountId: string) {
    return this.prisma.payoutDestination.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } });
  }

  /** The destination a real payout should use: the latest verified one, or null. */
  async current(accountId: string) {
    return this.prisma.payoutDestination.findFirst({
      where: { accountId, status: "verified" },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Admin KYC step: mark verified and (optionally) store the PSP fund-account ref. */
  async verify(id: string, providerRef?: string) {
    return this.prisma.payoutDestination.update({
      where: { id },
      data: { status: "verified", providerRef: providerRef ?? undefined },
    });
  }
}
