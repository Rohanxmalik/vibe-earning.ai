import { BadRequestException, Body, Controller, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignService } from "../advertiser/campaign.service";
import { KillswitchService } from "./killswitch.service";

function requireAdmin(key: string | undefined): void {
  if (!key || key !== process.env.ADMIN_API_KEY) throw new UnauthorizedException();
}

@Controller("admin")
export class AdminConfigController {
  constructor(
    private readonly killswitch: KillswitchService,
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignService,
  ) {}

  @Post("killswitch")
  async toggle(@Headers("x-admin-key") key: string, @Body() raw: unknown) {
    requireAdmin(key);
    const p = z.object({ active: z.boolean(), scope: z.string().default("global") }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.killswitch.set(p.data.scope, p.data.active);
    return { ok: true };
  }

  @Post("accounts/:id/suspend")
  async suspend(@Headers("x-admin-key") key: string, @Param("id") id: string, @Body() raw: unknown) {
    requireAdmin(key);
    const p = z.object({ suspended: z.boolean() }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.prisma.account.update({ where: { id }, data: { suspended: p.data.suspended } });
    return { ok: true };
  }

  @Post("campaigns/:id/approve")
  async approveCampaign(@Headers("x-admin-key") key: string, @Param("id") id: string) {
    requireAdmin(key);
    return this.campaigns.approve(id);
  }
}
