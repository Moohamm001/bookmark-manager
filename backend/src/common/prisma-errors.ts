import { NotFoundException } from '@nestjs/common';

/** Prisma: "An operation failed because it depends on one or more records that were required but not found." */
export const PRISMA_RECORD_NOT_FOUND = 'P2025';

export function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === PRISMA_RECORD_NOT_FOUND
  );
}

/**
 * The single place a "you can't have this" turns into an HTTP status.
 *
 * It is always 404 and never 403. Because every query is already scoped by ownerId, the
 * database cannot distinguish "no such row" from "someone else's row" — and neither can
 * the caller. That is the point: 403 would confirm the id exists, which is exactly the
 * "learn of the existence of another user's data" that §3 forbids.
 *
 * The message is generic and identical in both cases so the response body does not leak
 * what the status code refuses to.
 */
export function notFound(resource: 'Collection' | 'Bookmark'): never {
  throw new NotFoundException(`${resource} not found`);
}

export function rethrowAsNotFound(err: unknown, resource: 'Collection' | 'Bookmark'): never {
  if (isRecordNotFound(err)) notFound(resource);
  throw err;
}
