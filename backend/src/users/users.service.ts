import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { VerifiedAccessToken } from '../auth/token-verifier.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Maps a verified token to a User row, creating one on first login. `auth0Sub` comes from
   * the signature-verified `sub`, so a caller cannot choose their own identity.
   *
   * Email is best-effort — an audience-scoped access token is not guaranteed to carry it —
   * and is display metadata only, never an authorisation input.
   */
  async resolveFromToken(payload: VerifiedAccessToken): Promise<AuthenticatedUser> {
    const auth0Sub = payload.sub;
    const email =
      typeof payload['email'] === 'string' ? payload['email'] : `${auth0Sub}@unknown.local`;

    return this.prisma.user.upsert({
      where: { auth0Sub },
      update: {},
      create: { auth0Sub, email },
      select: { id: true, auth0Sub: true, email: true },
    });
  }
}
