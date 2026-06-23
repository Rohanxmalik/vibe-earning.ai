import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevAuthService } from "./dev-auth.service";
import { DevAuthController } from "./dev-auth.controller";
import { TokenService } from "./token.service";
import { AuthGuard } from "./auth.guard";
import { GoogleVerifier, GoogleVerifierImpl } from "./google-verifier";

@Module({
  controllers: [AuthController, DevAuthController],
  providers: [
    AuthService,
    DevAuthService,
    TokenService,
    AuthGuard,
    { provide: GoogleVerifier, useClass: GoogleVerifierImpl },
  ],
  exports: [AuthService, TokenService, AuthGuard],
})
export class AuthModule {}
