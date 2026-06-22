import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class KillswitchService {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(scope = "global"): Promise<boolean> {
    const row = await this.prisma.killswitch.findUnique({ where: { scope } });
    return row?.active ?? false;
  }

  async set(scope: string, active: boolean): Promise<void> {
    await this.prisma.killswitch.upsert({
      where: { scope },
      update: { active },
      create: { scope, active },
    });
  }
}
