import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";
import { AuthGuard } from "./auth.guard";
import { GoogleVerifier, GoogleVerifierImpl } from "./google-verifier";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuthGuard,
    { provide: GoogleVerifier, useClass: GoogleVerifierImpl },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
