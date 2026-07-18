import { Module } from "@nestjs/common";
import { KillswitchService } from "./killswitch.service";

/**
 * Standalone module so the killswitch can be enforced everywhere it matters — the config
 * admin/read endpoints AND the serve + metrics hot paths (H5) — without a circular import
 * (ConfigModule already imports MetricsModule). KillswitchService only depends on the global
 * PrismaService, so this module needs no imports.
 */
@Module({ providers: [KillswitchService], exports: [KillswitchService] })
export class KillswitchModule {}
