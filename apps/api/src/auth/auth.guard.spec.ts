import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";
import { ACCOUNT_TYPES_KEY } from "./account-types.decorator";

function ctxFor(authorization?: string) {
  const req: { headers: Record<string, unknown>; account?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never,
  };
}

describe("AuthGuard (role separation, M2)", () => {
  const authOf = (type: string) => ({ accountFromToken: jest.fn().mockResolvedValue({ id: "a1", type }) }) as never;
  const reflectorReturning = (types?: string[]) => {
    const r = new Reflector();
    jest.spyOn(r, "getAllAndOverride").mockReturnValue(types);
    return r;
  };

  it("rejects a missing/invalid token with 401", async () => {
    const guard = new AuthGuard({ accountFromToken: jest.fn().mockResolvedValue(null) } as never, reflectorReturning());
    const { ctx } = ctxFor();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows any authenticated type when no @AccountTypes is declared", async () => {
    const guard = new AuthGuard(authOf("dev"), reflectorReturning(undefined));
    const { ctx, req } = ctxFor("Bearer x");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.account as { type: string }).type).toBe("dev");
  });

  it("forbids the wrong account type when @AccountTypes is declared", async () => {
    const guard = new AuthGuard(authOf("dev"), reflectorReturning(["advertiser"]));
    const { ctx } = ctxFor("Bearer x");
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows the matching account type", async () => {
    const guard = new AuthGuard(authOf("advertiser"), reflectorReturning(["advertiser"]));
    const { ctx } = ctxFor("Bearer x");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("ACCOUNT_TYPES_KEY is the metadata key the decorator sets", () => {
    expect(ACCOUNT_TYPES_KEY).toBe("accountTypes");
  });
});
