import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Append-only log of privileged admin actions (who did what, when) for money operations. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(actor: string, action: string, target?: string, detail?: unknown): Promise<void> {
    await this.prisma.adminAudit.create({
      data: { actor, action, target: target ?? null, detail: detail !== undefined ? JSON.stringify(detail) : null },
    });
  }

  recent(limit = 100) {
    return this.prisma.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
}
