import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifierService } from './token-verifier.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

/**
 * Registered as an APP_GUARD, so every route is protected by default and forgetting to
 * think about auth on a new controller yields a 401 rather than an open door.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerifierService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    // Identity is resolved once, from the verified sub. Nothing downstream re-reads the token.
    request.user = await this.users.resolveFromToken(await this.tokenVerifier.verify(token));
    return true;
  }
}

/** Strict `Bearer <token>`. Lenient parsing here is how an empty token becomes valid. */
export function extractBearerToken(header: string | undefined): string | null {
  const parts = header?.split(' ') ?? [];
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  return scheme.toLowerCase() === 'bearer' && token.trim() ? token : null;
}
