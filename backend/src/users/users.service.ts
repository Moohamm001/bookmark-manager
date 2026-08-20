import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { VerifiedAccessToken } from '../auth/token-verifier.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Map a verified token to a User row, creating one on first login.
   *
   * `auth0Sub` is the join key and it is UNIQUE. It comes from the token's `sub`, which
   * has already been signature-verified — a caller cannot choose their own identity here.
   *
   * Email is best-effort: the API's audience-scoped access token is not guaranteed to
   * carry an `email` claim (it is an OIDC *ID token* claim, and only present in an access
   * token if the tenant adds it). We store what we can get and fall back to a synthetic
   * value rather than failing the request — email is display metadata here, never an
   * authorisation input.
   */
  async resolveFromToken(payload: VerifiedAccessToken): Promise<AuthenticatedUser> {
    const auth0Sub = payload.sub;
    const email =
      typeof payload['email'] === 'string' ? (payload['email'] as string) : `${auth0Sub}@unknown.local`;

    const user = await this.prisma.user.upsert({
      where: { auth0Sub },
      update: {},
      create: { auth0Sub, email },
      select: { id: true, auth0Sub: true, email: true },
    });

    return user;
  }
}
