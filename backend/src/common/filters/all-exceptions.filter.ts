import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * One error shape for every route, success or failure. Two reasons this is a security
 * control and not just tidiness:
 *
 * 1. A uniform body means a 404 for "does not exist" and a 404 for "belongs to someone
 *    else" are byte-for-byte identical. If one of them carried a distinctive message, the
 *    404-not-403 rule would leak existence through the response body instead of the status
 *    code, and we would have gained nothing.
 * 2. Unexpected errors are logged server-side but returned as a generic 500. Prisma errors
 *    in particular can echo table names, constraint names and even column values.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else {
        const body = res as { message?: string | string[]; error?: string };
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
    } else {
      // Never surface an unexpected error's details to the caller.
      this.logger.error(
        `Unhandled ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }
}
