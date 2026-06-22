import { BadRequestException, ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function fakeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  it("preserves HttpException status and message", () => {
    const { host, status, json } = fakeHost();
    filter.catch(new BadRequestException("bad_surface"), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: "bad_surface" }));
  });

  it("maps unknown errors to a sanitized 500 (no internal detail leaked)", () => {
    const { host, status, json } = fakeHost();
    filter.catch(new Error("stripe_not_configured: set STRIPE_SECRET_KEY"), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, error: "InternalServerError", message: "internal_error" });
  });
});
