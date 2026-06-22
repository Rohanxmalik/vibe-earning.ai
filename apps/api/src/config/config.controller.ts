import { Controller, Get } from "@nestjs/common";
import { KillswitchService } from "./killswitch.service";

@Controller("config")
export class ConfigController {
  constructor(private readonly killswitch: KillswitchService) {}

  @Get()
  async config() {
    return { active: await this.killswitch.isActive("global") };
  }
}
