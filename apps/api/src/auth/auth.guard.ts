import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service";
import { ACCOUNT_TYPES_KEY } from "./account-types.decorator";

export function bearer(req: { headers?: Record<string, unknown> }): string | undefined {
  const h = req.headers?.authorization;
  return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const account = await this.auth.accountFromToken(bearer(req));
    if (!account) throw new UnauthorizedException();

    // Role separation (M2): if the handler/controller declares @AccountTypes, the token's account
    // type must be in the allow-list. Endpoints without the decorator accept any authenticated user.
    const allowed = this.reflector.getAllAndOverride<string[] | undefined>(ACCOUNT_TYPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (allowed && allowed.length > 0 && !allowed.includes((account as { type?: string }).type ?? "")) {
      throw new ForbiddenException("wrong_account_type");
    }

    (req as { account?: unknown }).account = account;
    return true;
  }
}
