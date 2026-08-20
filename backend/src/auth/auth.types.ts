import type { Request } from 'express';

/** The authenticated user, resolved from the verified token `sub`. */
export interface AuthenticatedUser {
  id: string;
  auth0Sub: string;
  email: string;
}

/**
 * A request that has passed AuthGuard. `user` is set by the guard and by nothing else —
 * no middleware, no controller, no DTO may write it.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
