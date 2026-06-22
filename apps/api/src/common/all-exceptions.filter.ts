import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

interface ErrorBody {
  statusCode: number;
  error: string;
  message: unknown;
}

/**
 * Converts every thrown error into a consistent JSON envelope. HttpExceptions keep
 * their status and (safe) payload; anything else becomes a generic 500 so we never
 * leak stack traces or internal messages (e.g. PSP "not_configured" details) to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<{ status(code: number): { json(body: ErrorBody): void } }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // Nest puts the useful detail under `message`/the string payload.
      const message = typeof payload === "string" ? payload : (payload as { message?: unknown }).message ?? payload;
      res.status(status).json({ statusCode: status, error: exception.name, message });
      return;
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    res.status(status).json({ statusCode: status, error: "InternalServerError", message: "internal_error" });
  }
}
