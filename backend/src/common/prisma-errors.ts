import { NotFoundException } from '@nestjs/common';

const RECORD_NOT_FOUND = 'P2025';

/** Always 404, never 403: a 403 confirms the row exists. ADR-005. */
export function notFound(resource: 'Collection' | 'Bookmark'): never {
  throw new NotFoundException(`${resource} not found`);
}

export function rethrowAsNotFound(err: unknown, resource: 'Collection' | 'Bookmark'): never {
  if ((err as { code?: string })?.code === RECORD_NOT_FOUND) notFound(resource);
  throw err;
}
