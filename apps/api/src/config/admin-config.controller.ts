import { BadRequestException, Body, Controller, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignService } from "../advertiser/campaign.service";
import { PayoutDestinationService } from "../payments/payout-destination.service";
import { FraudService } from "../metrics/fraud.service";
import { AuthService } from "../auth/auth.service";
import { TokenService } from "../auth/token.service";
import { bearer } from "../auth/auth.guard";
import { KillswitchService } from "./killswitch.service";

type AdminReq = { headers?: Record<string, unknown> };

@Controller("admin")
export class AdminConfigController {
  constructor(
    private readonly killswitch: KillswitchService,
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignService,
    private readonly destinations: PayoutDestinationService,
    private readonly fraud: FraudService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  /** Authorise via EITHER the static x-admin-key OR a logged-in admin's Bearer token. */
  private async requireAdmin(req: AdminReq): Promise<void> {
    const key = req.headers?.["x-admin-key"];
    if (typeof key === "string" && process.env.ADMIN_API_KEY && key === process.env.ADMIN_API_KEY) return;
    const account = await this.auth.accountFromToken(bearer(req));
    if (account?.type === "admin") return;
    throw new UnauthorizedException();
  }

  /** Admin email/password login → JWT (admin accounts are created out-of-band / seeded). */
  @Post("login")
  async login(@Body() raw: unknown) {
    const p = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    const account = await this.prisma.account.findFirst({ where: { email: p.data.email, type: "admin" } });
    if (!account?.passwordHash || !(await bcrypt.compare(p.data.password, account.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return { token: this.tokens.issue(account.id), account: { id: account.id, type: account.type } };
  }

  @Post("killswitch")
  async toggle(@Req() req: AdminReq, @Body() raw: unknown) {
    await this.requireAdmin(req);
    const p = z.object({ active: z.boolean(), scope: z.string().default("global") }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.killswitch.set(p.data.scope, p.data.active);
    return { ok: true };
  }

  @Post("accounts/:id/suspend")
  async suspend(@Req() req: AdminReq, @Param("id") id: string, @Body() raw: unknown) {
    await this.requireAdmin(req);
    const p = z.object({ suspended: z.boolean() }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.prisma.account.update({ where: { id }, data: { suspended: p.data.suspended } });
    return { ok: true };
  }

  @Get("campaigns/pending")
  async pendingCampaigns(@Req() req: AdminReq) {
    await this.requireAdmin(req);
    return this.prisma.campaign.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" } });
  }

  @Post("campaigns/:id/approve")
  async approveCampaign(@Req() req: AdminReq, @Param("id") id: string) {
    await this.requireAdmin(req);
    return this.campaigns.approve(id);
  }

  @Get("payout-destinations/pending")
  async pendingDestinations(@Req() req: AdminReq) {
    await this.requireAdmin(req);
    return this.prisma.payoutDestination.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" } });
  }

  @Post("payout-destinations/:id/verify")
  async verifyDestination(@Req() req: AdminReq, @Param("id") id: string, @Body() raw: unknown) {
    await this.requireAdmin(req);
    const p = z.object({ providerRef: z.string().optional() }).safeParse(raw ?? {});
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.destinations.verify(id, p.data.providerRef);
    return { ok: true };
  }

  @Post("fraud/void-cluster")
  async voidCluster(@Req() req: AdminReq, @Body() raw: unknown) {
    await this.requireAdmin(req);
    const p = z.object({ ipHash: z.string().min(1) }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.fraud.voidCluster(p.data.ipHash);
  }
}
