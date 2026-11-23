import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { TenantContextMissingError, TenantViolationError } from '../../tenancy/tenant-context';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

/**
 * Maps persistence-layer failures to HTTP semantics. Anything unrecognised falls through to
 * Nest's default handler (500, logged).
 */
@Catch(QueryFailedError, TenantViolationError, TenantContextMissingError)
export class DatabaseExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  override catch(exception: Error, host: ArgumentsHost): void {
    super.catch(this.translate(exception), host);
  }

  private translate(exception: Error): Error | HttpException {
    if (exception instanceof TenantViolationError) {
      this.logger.warn(`tenant violation blocked: ${exception.message}`);
      return new NotFoundException();
    }
    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as PgDriverError;
      switch (driverError.code) {
        case '23505':
          return new ConflictException(
            `Resource already exists (${driverError.constraint ?? 'unique'})`,
          );
        case '42501':
          // RLS WITH CHECK violation: the app layer should have prevented this. Log loudly.
          this.logger.error(`row-level security rejected a write: ${exception.message}`);
          return new ForbiddenException();
        default:
          return exception;
      }
    }
    return exception;
  }
}
