import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Normalizes every thrown exception -- expected (HttpException) or not -- into one response
 * envelope, and logs an unexpected one exactly once server-side. Without this, a bug that throws
 * a plain Error would otherwise leak its real message (stack details, library internals) to the
 * client as-is via Nest's default handler. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      response.status(status).json({ statusCode: status, message });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'INTERNAL_SERVER_ERROR',
    });
  }
}
