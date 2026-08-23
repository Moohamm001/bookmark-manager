import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  auth0Sub: string;
  email: string;
}

/** `user` is set by AuthGuard and by nothing else. */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
