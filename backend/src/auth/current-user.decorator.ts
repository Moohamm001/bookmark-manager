import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types.js';

/**
 * The ONLY sanctioned way for a controller to learn who is calling.
 *
 * Controllers never read an owner from a body, query or header. Making that convenient is
 * the point: if the easy path is the safe one, the unsafe path does not get written.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
