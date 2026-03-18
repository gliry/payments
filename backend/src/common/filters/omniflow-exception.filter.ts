import { ExceptionFilter, Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { OmniFlowError } from '../exceptions/omniflow.error';

@Catch()
export class OmniFlowExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof OmniFlowError) {
      response.status(exception.getStatus()).json({
        error: exception.code,
        message: exception.message,
        details: exception.details,
        statusCode: exception.getStatus(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(typeof body === 'string' ? { message: body, statusCode: status } : body);
      return;
    }

    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error', statusCode: 500 });
  }
}
