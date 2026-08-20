import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifierService } from './token-verifier.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

/**
 * Registered as an APP_GUARD in AppModule, so it protects EVERY route by default.
 *
 * Per-controller guards were rejected deliberately: they make "unprotected" the default
 * for any new controller, and the mistake is silent. Here, forgetting to think about auth
 * yields a 401, which is a loud, safe failure.
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
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.tokenVerifier.verify(token);

    // Identity is resolved here, once, from the verified `sub`. Everything downstream
    // reads request.user; nothing downstream reads the token again or trusts the body.
    request.user = await this.users.resolveFromToken(payload);
    return true;
  }
}

/**
 * Strict parse of `Authorization: Bearer <token>`.
 *
 * Case-insensitive on the scheme (RFC 7235 says the scheme is case-insensitive) but
 * otherwise unforgiving: exactly two parts, non-empty token. Lenient parsing here is a
 * classic source of "empty token is treated as valid".
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== 'bearer') return null;
  if (!token || token.trim().length === 0) return null;
  return token;
}
