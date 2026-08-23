import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface VerifiedAccessToken extends JWTPayload {
  sub: string;
}

/**
 * Validates Auth0 access tokens: RS256 signature via JWKS, plus iss, aud and exp.
 *
 * Two of those are load-bearing in ways that are easy to miss:
 * - `algorithms` is pinned, or a token could nominate its own (alg=none, HS256 confusion).
 * - `aud` must be checked, or every token this tenant ever issued opens this API.
 *
 * The tenant publishes two signing keys, so jose selects by `kid` and refetches on rotation.
 * Reasoning and evidence: transcripts/phase-0-auth0/FINDINGS.md.
 */
@Injectable()
export class TokenVerifierService {
  private readonly logger = new Logger(TokenVerifierService.name);
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: JWTVerifyGetKey;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('AUTH0_ISSUER');
    this.audience = config.getOrThrow<string>('AUTH0_AUDIENCE');

    this.jwks = createRemoteJWKSet(new URL(config.getOrThrow<string>('AUTH0_JWKS_URI')), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    });
  }

  async verify(token: string): Promise<VerifiedAccessToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });

      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedException('Token has no subject');
      }
      return payload as VerifiedAccessToken;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Log the real reason, return a generic one: "expired" vs "wrong audience" is free
      // reconnaissance for a caller.
      this.logger.debug(`Token rejected: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
