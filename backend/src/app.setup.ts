import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

/**
 * Shared between main.ts and the e2e tests, on purpose.
 *
 * If tests built their app differently from production, they would be testing a different
 * application — and the pipe configured here is a security control, not a convenience. A
 * suite that skipped it would "prove" ownerId-stripping that the real server never does.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // Drop any property not declared on the DTO...
      whitelist: true,
      // ...and reject the request rather than silently accepting it. A body carrying
      // `ownerId` is either a broken client or a mass-assignment attempt; both deserve to
      // be visible instead of quietly discarded. See DECISIONS.md ADR-005.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
